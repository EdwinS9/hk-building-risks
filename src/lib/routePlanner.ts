// ─── Inspection route planner ──────────────────────────────────────────────
// Plans a single inspector's day as an Orienteering Problem (prize-collecting
// TSP with a time budget): start and end at a fixed depot, visit the highest-
// risk buildings that fit in a workday. Runs entirely client-side over the
// blocks already in memory.
//
// Solver: GRASP (greedy-randomized construction + local search) with restarts.
// The chosen stop set is then ordered EXACTLY by brute force (<= ~8 stops), so
// the sequence is optimal; only the selection is heuristic, which at ~6 stops
// is effectively optimal too. See model/route_inspection.py for the reference
// Python implementation and the "why not ACO / OR-Tools" rationale.
//
// Travel time is approximated offline: haversine distance x road-detour factor
// / assumed average speed. Swap `travelMatrix` for an OSRM/ORS matrix for real
// driving times (the only place geometry enters the solver).

import type { Block } from '../data/blocks';

export const DEFAULT_DEPOT = {
  name: 'Central Government Offices (Tamar)',
  lat: 22.28095,
  lng: 114.16548,
};

export interface Depot {
  name: string;
  lat: number;
  lng: number;
}

export interface PlanOptions {
  workdayMin: number;   // usable minutes in a workday
  serviceMin: number;   // minutes per inspection
  maxStops: number;     // hard cap on visits
  speedKmh: number;     // assumed average driving speed
  detour: number;       // road distance / straight-line factor
  topK: number;         // candidate pool size (highest risk in district)
  starts: number;       // GRASP restarts
  rclSize: number;      // restricted candidate list size
  seed: number;         // PRNG seed (deterministic output)
  startMin: number;     // day start, minutes since midnight (09:00 = 540)
  depot: Depot;
  skipInspected: boolean;
}

export const DEFAULT_OPTIONS: PlanOptions = {
  workdayMin: 480,
  serviceMin: 45,
  maxStops: 6,
  speedKmh: 25,
  detour: 1.4,
  topK: 100,
  starts: 50,
  rclSize: 4,
  seed: 42,
  startMin: 9 * 60,
  depot: DEFAULT_DEPOT,
  skipInspected: true,
};

export interface RouteStop {
  block: Block;
  order: number;      // 1-based position in the day
  driveMin: number;   // drive from the previous stop (depot for the first)
  arriveMin: number;  // minutes since midnight
  departMin: number;
}

export interface RouteResult {
  district: string;
  depot: Depot;
  stops: RouteStop[];
  driveMin: number;       // total driving, including the return leg
  serviceMin: number;     // total inspection time
  totalMin: number;       // workday consumed (drive + service)
  prize: number;          // total risk collected
  startMin: number;
  candidatePool: number;  // how many buildings were considered
  /** [lng, lat] path: depot -> stops -> depot, for a map line layer. */
  line: [number, number][];
}

// ─── Geometry ──────────────────────────────────────────────────────────────
const EARTH_R_KM = 6371.0088;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const la1 = aLat * rad;
  const la2 = bLat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

// Travel-time matrix in minutes. Index 0 is the depot, 1..n the candidates.
function travelMatrix(
  pts: { lat: number; lng: number }[],
  speedKmh: number,
  detour: number,
): number[][] {
  const kmPerMin = speedKmh / 60;
  const n = pts.length;
  const T: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const min = (haversineKm(pts[i].lat, pts[i].lng, pts[j].lat, pts[j].lng) * detour) / kmPerMin;
      T[i][j] = min;
      T[j][i] = min;
    }
  }
  return T;
}

// ─── Route evaluation ────────────────────────────────────────────────────────
// `order` holds candidate matrix indices (1..n); the depot (0) bookends it.
function routeTravel(order: number[], T: number[][]): number {
  if (order.length === 0) return 0;
  let t = T[0][order[0]] + T[order[order.length - 1]][0];
  for (let i = 0; i < order.length - 1; i++) t += T[order[i]][order[i + 1]];
  return t;
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr.slice()];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

// Minimum-travel ordering of `nodes` with the depot fixed at both ends.
// Exact brute force for small sets; nearest-neighbour + 2-opt above the cap.
function bestOrder(nodes: number[], T: number[][]): number[] {
  if (nodes.length <= 1) return nodes.slice();
  if (nodes.length <= 8) {
    let best = nodes, bt = Infinity;
    for (const p of permutations(nodes)) {
      const t = routeTravel(p, T);
      if (t < bt) { bt = t; best = p; }
    }
    return best;
  }
  // Nearest-neighbour seed.
  const remaining = new Set(nodes);
  let cur = 0;
  const order: number[] = [];
  while (remaining.size) {
    let nxt = -1, nd = Infinity;
    for (const j of remaining) if (T[cur][j] < nd) { nd = T[cur][j]; nxt = j; }
    order.push(nxt); remaining.delete(nxt); cur = nxt;
  }
  // 2-opt.
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const cand = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
        if (routeTravel(cand, T) + 1e-9 < routeTravel(order, T)) {
          order.splice(0, order.length, ...cand);
          improved = true;
        }
      }
    }
  }
  return order;
}

// ─── PRNG (deterministic) ────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Solver ──────────────────────────────────────────────────────────────────
function solve(T: number[][], prize: number[], opts: PlanOptions): number[] {
  const n = T.length - 1;
  const all: number[] = [];
  for (let j = 1; j <= n; j++) all.push(j);
  const rnd = mulberry32(opts.seed);

  const fits = (order: number[]) =>
    order.length <= opts.maxStops &&
    routeTravel(order, T) + opts.serviceMin * order.length <= opts.workdayMin + 1e-6;

  const prizeOf = (order: number[]) => order.reduce((s, j) => s + prize[j], 0);

  function cheapestExtra(order: number[], j: number): { pos: number; extra: number } {
    if (order.length === 0) return { pos: 0, extra: T[0][j] + T[j][0] };
    let pos = 0, extra = Infinity;
    for (let p = 0; p <= order.length; p++) {
      const prev = p === 0 ? 0 : order[p - 1];
      const next = p === order.length ? 0 : order[p];
      const delta = T[prev][j] + T[j][next] - T[prev][next];
      if (delta < extra) { extra = delta; pos = p; }
    }
    return { pos, extra };
  }

  function greedyBuild(rcl: number): number[] {
    const order: number[] = [];
    const used = new Set<number>();
    while (order.length < opts.maxStops) {
      const scored: [number, number, number][] = []; // [ratio, node, pos]
      for (const j of all) {
        if (used.has(j)) continue;
        const { pos, extra } = cheapestExtra(order, j);
        const cand = order.slice(); cand.splice(pos, 0, j);
        if (routeTravel(cand, T) + opts.serviceMin * cand.length > opts.workdayMin + 1e-6) continue;
        scored.push([prize[j] / (extra + opts.serviceMin + 1e-6), j, pos]);
      }
      if (!scored.length) break;
      scored.sort((a, b) => b[0] - a[0]);
      const pick = scored[Math.floor(rnd() * Math.min(rcl, scored.length))];
      order.splice(pick[2], 0, pick[1]);
      used.add(pick[1]);
    }
    return order;
  }

  function localSearch(seed: number[]): number[] {
    let order = bestOrder(seed, T);
    let improving = true;
    while (improving) {
      improving = false;
      const used = new Set(order);
      const unused = all.filter(j => !used.has(j)).sort((a, b) => prize[b] - prize[a]);
      const cur = prizeOf(order);

      // 1) add the most valuable unused node that still fits.
      if (order.length < opts.maxStops) {
        for (const j of unused) {
          const cand = bestOrder(order.concat(j), T);
          if (fits(cand)) { order = cand; improving = true; break; }
        }
        if (improving) continue;
      }
      // 2) swap an in-route node for a higher-prize unused one.
      for (const out of order) {
        let did = false;
        for (const j of unused) {
          if (prize[j] <= prize[out] + 1e-9) continue;
          const cand = bestOrder(order.filter(x => x !== out).concat(j), T);
          if (fits(cand) && prizeOf(cand) > cur + 1e-9) { order = cand; improving = true; did = true; break; }
        }
        if (did) break;
      }
    }
    return order;
  }

  const score = (order: number[]) => ({ order, prize: prizeOf(order), travel: routeTravel(order, T) });
  const better = (a: ReturnType<typeof score>, b: ReturnType<typeof score>) =>
    a.prize !== b.prize ? a.prize > b.prize : a.travel < b.travel;

  let best = score(localSearch(greedyBuild(1)));
  for (let s = 0; s < opts.starts; s++) {
    const cand = score(localSearch(greedyBuild(opts.rclSize)));
    if (better(cand, best)) best = cand;
  }
  return best.order;
}

// ─── Public API ──────────────────────────────────────────────────────────────
export interface DistrictOption {
  district: string;
  count: number;     // routable buildings (valid coords + finite risk)
  uninspected: number; // how many of those have no inspection yet
}

function routable(b: Block): boolean {
  return (
    !!b.district &&
    Number.isFinite(b.riskScore) &&
    Number.isFinite(b.coordinate?.lat) &&
    Number.isFinite(b.coordinate?.lng)
  );
}

/**
 * Districts that have at least one routable building, busiest first. Inspected
 * buildings are NOT excluded here (so the picker is never empty just because a
 * dataset has been fully backfilled with inspections); `uninspected` reports
 * how many remain un-inspected, which is what planning prefers.
 */
export function listDistricts(blocks: Block[]): DistrictOption[] {
  const total = new Map<string, number>();
  const fresh = new Map<string, number>();
  for (const b of blocks) {
    if (!routable(b)) continue;
    total.set(b.district, (total.get(b.district) ?? 0) + 1);
    if (b.status !== 'Inspected') fresh.set(b.district, (fresh.get(b.district) ?? 0) + 1);
  }
  return [...total.entries()]
    .map(([district, count]) => ({ district, count, uninspected: fresh.get(district) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.district.localeCompare(b.district));
}

/**
 * Plan one day's route across a district. Returns null if the district has no
 * routable candidates.
 */
export function planRoute(
  blocks: Block[],
  district: string,
  overrides: Partial<PlanOptions> = {},
): RouteResult | null {
  const opts: PlanOptions = { ...DEFAULT_OPTIONS, ...overrides };

  const inDistrict = blocks.filter(b => b.district === district && routable(b));
  // Prefer un-inspected buildings, but if a district has none left (e.g. the
  // dataset is fully backfilled with inspections) fall back to all of them so
  // the planner still returns a useful route.
  let candidates = opts.skipInspected
    ? inDistrict.filter(b => b.status !== 'Inspected')
    : inDistrict;
  if (candidates.length === 0) candidates = inDistrict;

  const pool = candidates.sort((a, b) => b.riskScore - a.riskScore).slice(0, opts.topK);

  if (pool.length === 0) return null;

  const pts = [{ lat: opts.depot.lat, lng: opts.depot.lng }, ...pool.map(b => b.coordinate)];
  const T = travelMatrix(pts, opts.speedKmh, opts.detour);
  const prize = [0, ...pool.map(b => b.riskScore)]; // depot prize = 0

  const order = solve(T, prize, opts);

  const stops: RouteStop[] = [];
  let clock = opts.startMin;
  let prev = 0;
  let drive = 0;
  for (let k = 0; k < order.length; k++) {
    const idx = order[k];
    const leg = T[prev][idx];
    drive += leg;
    clock += leg;
    const arriveMin = clock;
    clock += opts.serviceMin;
    stops.push({ block: pool[idx - 1], order: k + 1, driveMin: leg, arriveMin, departMin: clock });
    prev = idx;
  }
  drive += T[prev][0]; // return to depot

  const serviceMin = opts.serviceMin * order.length;
  const line: [number, number][] = [
    [opts.depot.lng, opts.depot.lat],
    ...stops.map(s => [s.block.coordinate.lng, s.block.coordinate.lat] as [number, number]),
    [opts.depot.lng, opts.depot.lat],
  ];

  return {
    district,
    depot: opts.depot,
    stops,
    driveMin: drive,
    serviceMin,
    totalMin: drive + serviceMin,
    prize: order.reduce((s, j) => s + prize[j], 0),
    startMin: opts.startMin,
    candidatePool: pool.length,
    line,
  };
}

// ─── Formatting helpers (shared by the panel) ────────────────────────────────
export function formatDuration(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

export function formatClock(minutesSinceMidnight: number): string {
  const m = Math.round(minutesSinceMidnight);
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
