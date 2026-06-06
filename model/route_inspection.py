"""Daily inspection route planner for HK building-risk data.

Problem shape (see README / discussion):
  * One inspector, starts and ends the day at a fixed depot (closed tour).
  * Picks the highest-risk buildings that fit in a workday (Orienteering Problem,
    a.k.a. prize-collecting TSP with a time budget), capped at a stop count.
  * Travel time is approximated offline: haversine distance x road-detour factor
    / assumed average speed. Swap `travel_matrix` for an OSRM/ORS matrix later.

Why not ACO / OR-Tools:
  * Ordering <= ~6 stops is trivial (brute-forced exactly here), so ACO buys
    nothing. The real work is *selection*, handled by a GRASP + local-search
    heuristic that is effectively optimal at this scale.
  * OR-Tools is the natural production solver but has no Python 3.14 wheel yet,
    and would be overkill for a single 6-stop tour. This file has no deps beyond
    numpy/pandas.

Usage:
    uv run python model/route_inspection.py --district "Sham Shui Po"
    uv run python model/route_inspection.py --district "Kowloon City" --max-stops 6 --service-min 45
"""

from __future__ import annotations

import argparse
import itertools
import json
import random
from dataclasses import dataclass, asdict
from pathlib import Path

import numpy as np
import pandas as pd

# Default depot: Central Government Offices (Tamar), Admiralty. Configurable via CLI.
DEFAULT_DEPOT = ("Central Government Offices (Tamar)", 22.28095, 114.16548)

EARTH_R_KM = 6371.0088


# --------------------------------------------------------------------------- #
# Geometry / travel matrix
# --------------------------------------------------------------------------- #
def haversine_matrix(lat: np.ndarray, lng: np.ndarray) -> np.ndarray:
    """Pairwise great-circle distance (km) for arrays of coordinates."""
    rlat = np.radians(lat)
    rlng = np.radians(lng)
    dlat = rlat[:, None] - rlat[None, :]
    dlng = rlng[:, None] - rlng[None, :]
    a = np.sin(dlat / 2) ** 2 + np.cos(rlat)[:, None] * np.cos(rlat)[None, :] * np.sin(dlng / 2) ** 2
    return 2 * EARTH_R_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def travel_matrix(lat: np.ndarray, lng: np.ndarray, speed_kmh: float, detour: float) -> np.ndarray:
    """Approximate door-to-door travel time in minutes.

    time = haversine_km * detour / speed_km_per_min
    Index 0 is the depot, 1..n the candidate buildings.
    """
    km = haversine_matrix(lat, lng) * detour
    km_per_min = speed_kmh / 60.0
    return km / km_per_min


# --------------------------------------------------------------------------- #
# Route evaluation
# --------------------------------------------------------------------------- #
@dataclass
class Route:
    order: list[int]          # candidate indices (1-based into the matrix), depot implicit at both ends
    travel_min: float         # driving time only
    service_min: float        # total inspection time
    total_min: float          # travel + service (the workday consumption)
    prize: float              # sum of risk scores collected


def route_travel_minutes(order: list[int], T: np.ndarray) -> float:
    """Driving minutes for depot -> order -> depot."""
    if not order:
        return 0.0
    legs = T[0, order[0]] + T[order[-1], 0]
    for a, b in zip(order, order[1:]):
        legs += T[a, b]
    return float(legs)


def best_order(nodes: list[int], T: np.ndarray) -> tuple[list[int], float]:
    """Return the minimum-travel ordering of `nodes` (depot fixed at both ends).

    Exact brute force for small sets; nearest-neighbour + 2-opt above the cap.
    """
    k = len(nodes)
    if k <= 1:
        return list(nodes), route_travel_minutes(list(nodes), T)
    if k <= 8:  # 8! = 40320, instant
        best, best_t = None, np.inf
        for perm in itertools.permutations(nodes):
            t = route_travel_minutes(list(perm), T)
            if t < best_t:
                best, best_t = list(perm), t
        return best, best_t
    return _nn_two_opt(nodes, T)


def _nn_two_opt(nodes: list[int], T: np.ndarray) -> tuple[list[int], float]:
    remaining = set(nodes)
    cur, order = 0, []
    while remaining:
        nxt = min(remaining, key=lambda j: T[cur, j])
        order.append(nxt)
        remaining.remove(nxt)
        cur = nxt
    improved = True
    while improved:
        improved = False
        for i in range(len(order) - 1):
            for j in range(i + 1, len(order)):
                cand = order[:i] + order[i:j + 1][::-1] + order[j + 1:]
                if route_travel_minutes(cand, T) + 1e-9 < route_travel_minutes(order, T):
                    order, improved = cand, True
    return order, route_travel_minutes(order, T)


def make_route(order: list[int], T: np.ndarray, prize_arr: np.ndarray, service_min: float) -> Route:
    travel = route_travel_minutes(order, T)
    service = service_min * len(order)
    prize = float(prize_arr[order].sum()) if order else 0.0
    return Route(order, travel, service, travel + service, prize)


# --------------------------------------------------------------------------- #
# Solver: GRASP (randomized greedy insertion) + local search
# --------------------------------------------------------------------------- #
def solve(
    T: np.ndarray,
    prize_arr: np.ndarray,
    workday_min: float,
    service_min: float,
    max_stops: int,
    starts: int,
    rcl_size: int,
    rng: random.Random,
) -> Route:
    n = T.shape[0] - 1  # number of candidates (excluding depot)
    all_nodes = list(range(1, n + 1))

    def feasible(order: list[int]) -> bool:
        if len(order) > max_stops:
            return False
        return make_route(order, T, prize_arr, service_min).total_min <= workday_min + 1e-6

    def greedy_build(greedy_rcl: int) -> list[int]:
        order: list[int] = []
        used: set[int] = set()
        while len(order) < max_stops:
            scored = []
            for j in all_nodes:
                if j in used:
                    continue
                # cheapest insertion position for j
                best_pos, best_extra = None, np.inf
                for pos in range(len(order) + 1):
                    cand = order[:pos] + [j] + order[pos:]
                    extra = route_travel_minutes(cand, T) - route_travel_minutes(order, T)
                    if extra < best_extra:
                        best_pos, best_extra = pos, extra
                cand = order[:best_pos] + [j] + order[best_pos:]
                if make_route(cand, T, prize_arr, service_min).total_min > workday_min + 1e-6:
                    continue
                # value density: prize gained per extra minute spent
                ratio = prize_arr[j] / (best_extra + service_min + 1e-6)
                scored.append((ratio, j, best_pos))
            if not scored:
                break
            scored.sort(reverse=True)
            pick = rng.choice(scored[:max(1, greedy_rcl)])
            _, j, pos = pick
            order = order[:pos] + [j] + order[pos:]
            used.add(j)
        return order

    def local_search(order: list[int]) -> list[int]:
        order, _ = best_order(order, T)
        improving = True
        while improving:
            improving = False
            cur = make_route(order, T, prize_arr, service_min)
            used = set(order)
            unused = [j for j in all_nodes if j not in used]

            # 1) add any unused node that fits and raises prize
            if len(order) < max_stops:
                for j in unused:
                    cand, _ = best_order(order + [j], T)
                    r = make_route(cand, T, prize_arr, service_min)
                    if r.total_min <= workday_min + 1e-6 and r.prize > cur.prize + 1e-9:
                        order, improving = cand, True
                        break
                if improving:
                    continue

            # 2) swap an in-route node for a higher-prize unused node
            for out in list(order):
                for j in unused:
                    if prize_arr[j] <= prize_arr[out] + 1e-9:
                        continue
                    trial = [x for x in order if x != out] + [j]
                    cand, _ = best_order(trial, T)
                    r = make_route(cand, T, prize_arr, service_min)
                    if r.total_min <= workday_min + 1e-6 and r.prize > cur.prize + 1e-9:
                        order, improving = cand, True
                        break
                if improving:
                    break
        return order

    def better(a: Route, b: Route) -> bool:
        # maximize prize, then minimize total time
        if a.prize != b.prize:
            return a.prize > b.prize
        return a.total_min < b.total_min

    # deterministic pure-greedy start + randomized restarts
    best = make_route(local_search(greedy_build(1)), T, prize_arr, service_min)
    for _ in range(starts):
        cand = make_route(local_search(greedy_build(rcl_size)), T, prize_arr, service_min)
        if better(cand, best):
            best = cand
    return best


# --------------------------------------------------------------------------- #
# Output: itinerary + standalone Leaflet map
# --------------------------------------------------------------------------- #
def build_itinerary(route: Route, df: pd.DataFrame, T: np.ndarray, depot, service_min: float) -> list[dict]:
    """Stop-by-stop schedule with cumulative clock (assumes 09:00 start)."""
    rows, clock = [], 9 * 60  # minutes since midnight
    prev = 0
    for stop_no, idx in enumerate(route.order, start=1):
        drive = float(T[prev, idx])
        clock += drive
        b = df.iloc[idx - 1]
        rows.append({
            "stop": stop_no,
            "objectid": int(b["OBJECTID"]),
            "district": b["district"],
            "use_class": b["use_class"],
            "structure": b["structure"],
            "age": None if pd.isna(b["age"]) else float(b["age"]),
            "risk": float(b["risk_score"]),
            "lat": float(b["LATITUDE"]),
            "lng": float(b["LONGITUDE"]),
            "drive_min": round(drive, 1),
            "arrive": _hhmm(clock),
            "depart": _hhmm(clock + service_min),
        })
        clock += service_min
        prev = idx
    return rows


def _hhmm(minutes: float) -> str:
    m = int(round(minutes))
    return f"{m // 60:02d}:{m % 60:02d}"


def write_map(path: Path, route: Route, df: pd.DataFrame, depot, itinerary: list[dict]) -> None:
    pts = [{"name": depot[0], "lat": depot[1], "lng": depot[2], "depot": True}]
    for r in itinerary:
        pts.append({**r, "depot": False})
    line = [[depot[1], depot[2]]] + [[r["lat"], r["lng"]] for r in itinerary] + [[depot[1], depot[2]]]
    payload = {"points": pts, "line": line, "depot": {"lat": depot[1], "lng": depot[2]}}
    html = _MAP_TEMPLATE.replace("__DATA__", json.dumps(payload))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding="utf-8")


_MAP_TEMPLATE = """<!doctype html><html><head><meta charset="utf-8">
<title>Inspection route</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0}.lbl{font:600 12px sans-serif;color:#b00}</style>
</head><body><div id="map"></div><script>
const D = __DATA__;
const map = L.map('map');
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {attribution:'&copy; OpenStreetMap'}).addTo(map);
L.polyline(D.line, {color:'#1565c0', weight:3, opacity:.7, dashArray:'6 6'}).addTo(map);
const bounds = [];
D.points.forEach(p => {
  bounds.push([p.lat, p.lng]);
  if (p.depot) {
    L.marker([p.lat,p.lng]).addTo(map).bindPopup('<b>DEPOT</b><br>'+p.name);
  } else {
    L.circleMarker([p.lat,p.lng],{radius:11,color:'#b00',fillColor:'#e53935',fillOpacity:.9})
      .addTo(map)
      .bindPopup(`<b>Stop ${p.stop}</b> &middot; risk ${p.risk}<br>OBJECTID ${p.objectid}`
        +`<br>${p.use_class} / ${p.structure}`
        +`<br>arrive ${p.arrive}, depart ${p.depart}`);
    L.marker([p.lat,p.lng],{icon:L.divIcon({className:'lbl',html:p.stop,iconSize:[16,16]})}).addTo(map);
  }
});
map.fitBounds(bounds, {padding:[40,40]});
</script></body></html>"""


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main() -> None:
    ap = argparse.ArgumentParser(description="Plan a one-day building-inspection route (Orienteering).")
    ap.add_argument("--csv", default="model/scored.csv")
    ap.add_argument("--district", default="Sham Shui Po")
    ap.add_argument("--workday-min", type=float, default=480.0, help="usable minutes in a workday")
    ap.add_argument("--service-min", type=float, default=45.0, help="minutes per inspection")
    ap.add_argument("--max-stops", type=int, default=6)
    ap.add_argument("--speed-kmh", type=float, default=25.0, help="assumed average driving speed")
    ap.add_argument("--detour", type=float, default=1.4, help="road distance / straight-line factor")
    ap.add_argument("--top-k", type=int, default=120, help="candidate pool size (highest risk in district)")
    ap.add_argument("--min-risk", type=float, default=0.0)
    ap.add_argument("--starts", type=int, default=200, help="GRASP restarts")
    ap.add_argument("--rcl", type=int, default=4, help="restricted candidate list size")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--depot-name", default=DEFAULT_DEPOT[0])
    ap.add_argument("--depot-lat", type=float, default=DEFAULT_DEPOT[1])
    ap.add_argument("--depot-lng", type=float, default=DEFAULT_DEPOT[2])
    ap.add_argument("--out", default=None, help="map HTML path (default out/route_<district>.html)")
    args = ap.parse_args()

    df = pd.read_csv(args.csv)
    df = df[(df["district"] == args.district) & (df["risk_score"] >= args.min_risk)].copy()
    df = df.dropna(subset=["LATITUDE", "LONGITUDE", "risk_score"])
    if df.empty:
        raise SystemExit(f"No buildings for district {args.district!r} above risk {args.min_risk}.")

    # candidate pool: highest-risk buildings in the district
    df = df.sort_values("risk_score", ascending=False).head(args.top_k).reset_index(drop=True)

    depot = (args.depot_name, args.depot_lat, args.depot_lng)
    lat = np.concatenate([[depot[1]], df["LATITUDE"].to_numpy(float)])
    lng = np.concatenate([[depot[2]], df["LONGITUDE"].to_numpy(float)])
    T = travel_matrix(lat, lng, args.speed_kmh, args.detour)
    prize = np.concatenate([[0.0], df["risk_score"].to_numpy(float)])  # depot prize = 0

    rng = random.Random(args.seed)
    route = solve(
        T, prize,
        workday_min=args.workday_min,
        service_min=args.service_min,
        max_stops=args.max_stops,
        starts=args.starts,
        rcl_size=args.rcl,
        rng=rng,
    )

    itinerary = build_itinerary(route, df, T, depot, args.service_min)
    out = Path(args.out) if args.out else Path("out") / f"route_{args.district.replace(' ', '_').replace('&', 'and')}.html"
    write_map(out, route, df, depot, itinerary)

    # ----- report -----
    print(f"\nDistrict      : {args.district}")
    print(f"Candidate pool: {len(df)} buildings (top {args.top_k} by risk, min risk {args.min_risk})")
    print(f"Depot         : {depot[0]} ({depot[1]:.5f}, {depot[2]:.5f})")
    print(f"Workday budget: {args.workday_min:.0f} min | service {args.service_min:.0f} min/stop "
          f"| max {args.max_stops} stops | {args.speed_kmh:.0f} km/h x{args.detour}")
    print(f"\nSelected {len(route.order)} stops | risk collected {route.prize:.1f} "
          f"| drive {route.travel_min:.0f} min | inspect {route.service_min:.0f} min "
          f"| total {route.total_min:.0f}/{args.workday_min:.0f} min "
          f"({route.total_min / args.workday_min * 100:.0f}%)\n")
    print(f"{'stop':>4} {'arrive':>6} {'depart':>6} {'drive':>6} {'risk':>6} {'objectid':>9}  use / structure")
    print("-" * 86)
    for r in itinerary:
        print(f"{r['stop']:>4} {r['arrive']:>6} {r['depart']:>6} {r['drive_min']:>5.0f}m "
              f"{r['risk']:>6.1f} {r['objectid']:>9}  {r['use_class']} / {r['structure']}")
    print(f"\nMap written to: {out}")

    # machine-readable sidecar
    json_out = out.with_suffix(".json")
    json_out.write_text(json.dumps({
        "district": args.district,
        "depot": {"name": depot[0], "lat": depot[1], "lng": depot[2]},
        "summary": asdict(route) | {"stops": len(route.order)},
        "itinerary": itinerary,
    }, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
