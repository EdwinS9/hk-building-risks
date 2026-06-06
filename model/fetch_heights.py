"""
Attach building height to each DS1 building from the CSDI Lands Dept "Building"
footprint layer (no auth), via tiled ArcGIS REST queries + local point-in-polygon.

No GDAL/geopandas: pulls GeoJSON tiles, ray-casts each DS1 point into its
footprint. Height above ground = TopHeight - BaseHeight (mPD), Storeys fallback.

    python3 model/fetch_heights.py --test     # one small tile, prints, no write
    python3 model/fetch_heights.py            # full DS1 extent

Outputs:
    model/height_features.csv       OBJECTID, top_height_m, base_height_m, storeys, building_height_m
    model/building_footprints.geojson   matched footprints (for the map)
"""
import argparse, json, sys, time
import pandas as pd
import requests

DS1 = "Data Analysis/DS1_all.csv"
BASE = ("https://portal.csdi.gov.hk/server/rest/services/common/"
        "landsd_rcd_1637211194312_35158/MapServer/0/query")
CELL = 0.04          # ~4.4 km tiles
BUF = 0.003          # ~300 m query buffer so edge polygons are caught
PAGE = 3000          # ArcGIS maxRecordCount
NEAR_FALLBACK_DEG = 0.0008   # ~85 m nearest-centroid fallback if no container


def query_tile(xmin, ymin, xmax, ymax):
    """All building polygons intersecting a bbox, paginated."""
    feats, offset = [], 0
    while True:
        params = {
            "where": "1=1",
            "geometry": f"{xmin},{ymin},{xmax},{ymax}",
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326", "outSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "OBJECTID,TopHeight,BaseHeight,Storeys",
            "returnGeometry": "true", "f": "geojson",
            "resultOffset": offset, "resultRecordCount": PAGE,
        }
        for attempt in range(4):
            try:
                r = requests.get(BASE, params=params, timeout=60)
                r.raise_for_status()
                fc = r.json()
                break
            except Exception as e:
                if attempt == 3:
                    raise
                time.sleep(2 * (attempt + 1))
        batch = fc.get("features", [])
        feats.extend(batch)
        if len(batch) < PAGE:
            return feats
        offset += PAGE


def outer_rings(geom):
    """Yield outer rings for Polygon / MultiPolygon."""
    if not geom:
        return
    t, c = geom.get("type"), geom.get("coordinates")
    if t == "Polygon":
        yield c[0]
    elif t == "MultiPolygon":
        for poly in c:
            yield poly[0]


def in_ring(x, y, ring):
    inside = False
    n = len(ring); j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def ring_centroid(ring):
    xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def height_of(props):
    top, base = props.get("TopHeight"), props.get("BaseHeight")
    st = props.get("Storeys")
    if top is not None and base is not None and top > base:
        h = top - base
    elif top is not None:
        h = top
    elif st:
        h = st * 3.0
    else:
        h = None
    return top, base, st, h


def match_points(points, feats):
    """points: list of (oid, lon, lat). Returns {oid: (props, geom)}."""
    out = {}
    # containment first
    unmatched = []
    for oid, lon, lat in points:
        hit = None
        for f in feats:
            for ring in outer_rings(f["geometry"]):
                if in_ring(lon, lat, ring):
                    hit = f
                    break
            if hit:
                break
        if hit:
            out[oid] = hit
        else:
            unmatched.append((oid, lon, lat))
    # nearest-centroid fallback for points just outside their footprint
    cents = [(f, *ring_centroid(next(outer_rings(f["geometry"]))))
             for f in feats if f.get("geometry")]
    for oid, lon, lat in unmatched:
        best, bd = None, NEAR_FALLBACK_DEG ** 2
        for f, cx, cy in cents:
            d = (cx - lon) ** 2 + (cy - lat) ** 2
            if d < bd:
                bd, best = d, f
        if best:
            out[oid] = best
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true")
    args = ap.parse_args()

    df = pd.read_csv(DS1, usecols=["OBJECTID", "LATITUDE", "LONGITUDE"]).dropna()

    if args.test:
        feats = query_tile(114.16, 22.31, 114.18, 22.33)
        print(f"test tile returned {len(feats)} footprints")
        pts = [(int(o), ln, lt) for o, lt, ln in
               df[(df.LONGITUDE.between(114.16, 114.18)) &
                  (df.LATITUDE.between(22.31, 22.33))]
               [["OBJECTID", "LATITUDE", "LONGITUDE"]].values][:200]
        m = match_points(pts, feats)
        print(f"matched {len(m)}/{len(pts)} DS1 points in test area")
        for oid in list(m)[:5]:
            top, base, st, h = height_of(m[oid]["properties"])
            print(f"  OBJECTID {oid}: top={top} base={base} storeys={st} height_m={h}")
        return

    # full run: tile the DS1 extent
    minlon, maxlon = df.LONGITUDE.min(), df.LONGITUDE.max()
    minlat, maxlat = df.LATITUDE.min(), df.LATITUDE.max()
    cells = {}
    for o, lt, ln in df[["OBJECTID", "LATITUDE", "LONGITUDE"]].values:
        key = (int((ln - minlon) / CELL), int((lt - minlat) / CELL))
        cells.setdefault(key, []).append((int(o), ln, lt))

    rows, fcoll = [], []
    print(f"{len(df)} buildings across {len(cells)} tiles")
    for n, (key, pts) in enumerate(sorted(cells.items()), 1):
        cx0 = minlon + key[0] * CELL
        cy0 = minlat + key[1] * CELL
        feats = query_tile(cx0 - BUF, cy0 - BUF, cx0 + CELL + BUF, cy0 + CELL + BUF)
        m = match_points(pts, feats)
        for oid, f in m.items():
            top, base, st, h = height_of(f["properties"])
            rows.append((oid, top, base, st, h))
            fcoll.append({"type": "Feature", "geometry": f["geometry"],
                          "properties": {"OBJECTID": oid, "building_height_m": h,
                                         "storeys": st}})
        print(f"  tile {n}/{len(cells)} {key}: {len(feats)} footprints, "
              f"matched {len(m)}/{len(pts)}", flush=True)

    out = pd.DataFrame(rows, columns=["OBJECTID", "top_height_m", "base_height_m",
                                      "storeys", "building_height_m"])
    out.to_csv("model/height_features.csv", index=False)
    with open("model/building_footprints.geojson", "w") as fh:
        json.dump({"type": "FeatureCollection", "features": fcoll}, fh)
    print(f"\nwrote model/height_features.csv: {len(out)}/{len(df)} buildings got a height "
          f"({out.building_height_m.notna().mean()*100:.0f}% non-null)")
    print("wrote model/building_footprints.geojson")


if __name__ == "__main__":
    main()
