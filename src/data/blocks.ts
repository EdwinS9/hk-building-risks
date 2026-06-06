// ─── Data layer ────────────────────────────────────────────────────────────
// All access to blocks/scores/inspections/schedule goes through this module
// so the rest of the app never depends on Supabase directly. The exported
// store API (getBlocks / subscribe / getBlockById / updateBlockStatus) is
// intentionally identical to the previous in-memory version so consumers
// don't need to change.
import { supabase } from '../lib/supabase';
import { bandForScore, type RiskBand } from '../lib/constants';

export type BlockStatus = 'Not scheduled' | 'Scheduled' | 'Inspected';

export interface RiskFactor {
  label: string;
  contribution: number;
}

export interface Block {
  id: string;
  name: string;
  district: string;
  coordinate: { lng: number; lat: number };
  riskScore: number;
  riskBand: RiskBand;
  scoreUpdatedAt: string;
  factors?: RiskFactor[];
  lastInspected: string | null;
  status: BlockStatus;
}

// ─── In-memory cache (single source of truth for the UI) ───────────────────
// Tuned for tens-of-thousands of rows: we keep a flat array AND an index by
// id so getBlockById is O(1), and we never copy the whole array on hover /
// selection (those flow through React state, not through this store).
let _blocks: Block[] = [];
let _byId = new Map<string, Block>();
let _loaded = false;
let _loadPromise: Promise<void> | null = null;
let _total: number | null = null;
let _loadedCount = 0;

const listeners = new Set<() => void>();

function emit() { listeners.forEach(l => l()); }

export function getBlocks(): Block[] { return _blocks; }
export function getBlockById(id: string): Block | undefined { return _byId.get(id); }
export function getLoadProgress(): { loaded: number; total: number | null; done: boolean } {
  return { loaded: _loadedCount, total: _total, done: _loaded };
}
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Lazy first load — fires on first subscriber (the React hook).
  if (!_loaded && !_loadPromise) void loadBlocks();
  return () => listeners.delete(listener);
}

// ─── Loading ───────────────────────────────────────────────────────────────
interface BlockRow {
  id: string;
  object_id: string;
  address: string;
  district: string;
  latitude: number | string;
  longitude: number | string;
  risk_score: number | string;
  risk_score_updated_at: string;
  last_inspected: string | null;
  status: string;
}

interface ScoreRow {
  block_id: string;
  score_name: string;
  score_value: number | string;
}

function toNumber(v: number | string): number {
  return typeof v === 'string' ? parseFloat(v) : v;
}

function rowToBlock(row: BlockRow, factors?: RiskFactor[]): Block {
  const score = toNumber(row.risk_score);
  return {
    id: row.id,
    name: row.address,
    district: row.district,
    coordinate: { lng: toNumber(row.longitude), lat: toNumber(row.latitude) },
    riskScore: score,
    riskBand: bandForScore(score),
    scoreUpdatedAt: row.risk_score_updated_at,
    factors,
    lastInspected: row.last_inspected,
    status: (row.status as BlockStatus) ?? 'Not scheduled',
  };
}

// Page size for the paginated fetch. Must be <= server `max_rows`.
// Larger pages = fewer round trips but each parse is heavier; this is a
// good balance for 60k-row datasets over a typical broadband link.
const PAGE_SIZE = 5000;

const BLOCK_COLUMNS =
  'id, object_id, address, district, latitude, longitude, risk_score, risk_score_updated_at, last_inspected, status';

export async function loadBlocks(): Promise<void> {
  // De-dupe concurrent loads.
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    // Reset cache for this load. We rebuild progressively as pages arrive.
    _blocks = [];
    _byId = new Map();
    _loadedCount = 0;
    _total = null;

    // Pre-fetch scores in parallel — small dataset (one row per factor per
    // block, capped well under PAGE_SIZE * a few). Paginate if it grows.
    const scoresPromise = fetchAllScores();

    // First page: ask for the exact total via head/count so we know how
    // many more pages to request.
    const first = await supabase
      .from('blocks_with_status')
      .select(BLOCK_COLUMNS, { count: 'exact' })
      .order('risk_score', { ascending: false })
      .range(0, PAGE_SIZE - 1);

    if (first.error) throw first.error;

    _total = first.count ?? (first.data?.length ?? 0);

    // Ingest first page immediately.
    ingestRows((first.data ?? []) as BlockRow[]);
    emit();

    // Walk remaining pages in parallel (bounded concurrency to stay
    // friendly to PostgREST). Most setups easily handle 4-way concurrency.
    const remaining: Array<[number, number]> = [];
    for (let start = PAGE_SIZE; start < _total; start += PAGE_SIZE) {
      const end = Math.min(start + PAGE_SIZE, _total) - 1;
      remaining.push([start, end]);
    }

    const CONCURRENCY = 4;
    let cursor = 0;
    async function worker() {
      while (cursor < remaining.length) {
        const myIdx = cursor++;
        const [start, end] = remaining[myIdx];
        const res = await supabase
          .from('blocks_with_status')
          .select(BLOCK_COLUMNS)
          .order('risk_score', { ascending: false })
          .range(start, end);
        if (res.error) throw res.error;
        ingestRows((res.data ?? []) as BlockRow[]);
        // Re-sort once at the end (each page is already ordered, but pages
        // interleave when concurrent) — see post-loop sort below.
        emit();
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, remaining.length) }, worker));

    // Apply per-factor breakdowns once scores finish (often quicker than
    // blocks paging, but await here to be sure).
    const factorsByBlock = await scoresPromise;
    if (factorsByBlock.size > 0) {
      for (const b of _blocks) {
        const f = factorsByBlock.get(b.id);
        if (f) b.factors = f;
      }
    }

    // Concurrent paging interleaves rows. Final sort by score desc keeps
    // the array consumer-friendly (matches initial order, makes triage
    // queue's default sort cheap).
    _blocks.sort((a, b) => b.riskScore - a.riskScore);
    _loaded = true;
    emit();
  })();

  try {
    await _loadPromise;
  } finally {
    _loadPromise = null;
  }
}

function ingestRows(rows: BlockRow[]) {
  // Mutate in place — much faster than creating a fresh array for each
  // batch (which would churn 60k allocations). Consumers re-read via
  // getBlocks() on emit and never depend on reference equality.
  for (const r of rows) {
    const b = rowToBlock(r);
    _blocks.push(b);
    _byId.set(b.id, b);
    _loadedCount++;
  }
}

async function fetchAllScores(): Promise<Map<string, RiskFactor[]>> {
  const factorsByBlock = new Map<string, RiskFactor[]>();
  let start = 0;
  // Loop until a partial page is returned (= end of data).
  while (true) {
    const { data, error } = await supabase
      .from('scores')
      .select('block_id, score_name, score_value')
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as ScoreRow[];
    for (const s of batch) {
      const arr = factorsByBlock.get(s.block_id) ?? [];
      arr.push({ label: s.score_name, contribution: toNumber(s.score_value) });
      factorsByBlock.set(s.block_id, arr);
    }
    if (batch.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }
  return factorsByBlock;
}

export function resetBlocksCache(): void {
  _blocks = [];
  _byId = new Map();
  _loadedCount = 0;
  _total = null;
  _loaded = false;
  emit();
}

// ─── Mutations ─────────────────────────────────────────────────────────────
// updateBlockStatus is the same external surface as before, but routes
// through the inspections / schedule tables. The DB derives status via
// the blocks_with_status view, so we refetch the affected block.

async function refreshOne(blockId: string): Promise<void> {
  const [bRes, sRes] = await Promise.all([
    supabase
      .from('blocks_with_status')
      .select(
        'id, object_id, address, district, latitude, longitude, risk_score, risk_score_updated_at, last_inspected, status',
      )
      .eq('id', blockId)
      .single(),
    supabase
      .from('scores')
      .select('score_name, score_value')
      .eq('block_id', blockId),
  ]);

  if (bRes.error || !bRes.data) return;
  const factors = (sRes.data ?? []).map(s => ({
    label: s.score_name as string,
    contribution: toNumber(s.score_value as number | string),
  }));
  const next = rowToBlock(bRes.data as BlockRow, factors.length ? factors : undefined);
  // In-place swap — much faster than rebuilding the array for one change.
  const idx = _blocks.findIndex(b => b.id === blockId);
  if (idx >= 0) _blocks[idx] = next;
  _byId.set(blockId, next);
  emit();
}

export async function updateBlockStatus(id: string, status: BlockStatus): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  // For both inserts, created_by is set server-side by a BEFORE INSERT trigger
  // to auth.uid(). Sending it from the client would be ignored anyway.
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not authenticated');

  if (status === 'Scheduled') {
    // Schedule one week out by default.
    const inAWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const { error } = await supabase
      .from('schedule')
      .insert({ block_id: id, scheduled_for: inAWeek, created_by: uid });
    if (error) throw error;
  } else if (status === 'Inspected') {
    const { error } = await supabase
      .from('inspections')
      .insert({ block_id: id, inspected_at: today, created_by: uid });
    if (error) throw error;
  } else {
    // 'Not scheduled' isn't a manual transition in the current UI; ignore.
    return;
  }
  await refreshOne(id);
}

export async function setBlockNote(id: string, note: string): Promise<void> {
  const { error } = await supabase.from('blocks').update({ note }).eq('id', id);
  if (error) throw error;
}
