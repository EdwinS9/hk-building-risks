// ─── Data layer ────────────────────────────────────────────────────────────
// All access to blocks/scores/inspections/schedule goes through this module
// so the rest of the app never depends on Supabase directly. The exported
// store API (getBlocks / subscribe / getBlockById / updateBlockStatus) is
// intentionally identical to the previous in-memory version so consumers
// don't need to change.
import { supabase } from '../lib/supabase';
import { bandForScore, type RiskBand } from '../lib/constants';

export type BlockStatus = 'Not scheduled' | 'Scheduled' | 'Inspected';

// Status filter order for the triage queue chips.
export const BLOCK_STATUSES: BlockStatus[] = ['Not scheduled', 'Scheduled', 'Inspected'];

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
  /** Shared free-text note. Editable by any authenticated user. */
  note: string | null;
  noteUpdatedAt: string | null;
}

// ─── In-memory cache (single source of truth for the UI) ───────────────────
// Tuned for tens-of-thousands of rows: we keep a flat array AND an index by
// id so getBlockById is O(1), and we never copy the whole array on hover /
// selection (those flow through React state, not through this store).
let _blocks: Block[] = [];
// Snapshot handed to consumers. `_blocks` is mutated in place while loading
// (cheap), but useSyncExternalStore + downstream useMemo detect change via
// reference identity — so we MUST publish a fresh reference on every emit,
// otherwise React never re-derives from freshly loaded rows and the UI stays
// empty until some unrelated state change forces a recompute.
let _snapshot: Block[] = [];
let _byId = new Map<string, Block>();
let _loaded = false;
let _loadPromise: Promise<void> | null = null;
let _total: number | null = null;
let _loadedCount = 0;
let _error: string | null = null;

export interface LoadProgress {
  loaded: number;
  total: number | null;
  done: boolean;
  error: string | null;
}

// Cached snapshot so useSyncExternalStore gets a stable reference between
// emits (returning a fresh object every call would loop infinitely).
let _progress: LoadProgress = { loaded: 0, total: null, done: false, error: null };
function refreshProgress() {
  _progress = { loaded: _loadedCount, total: _total, done: _loaded, error: _error };
}

const listeners = new Set<() => void>();

function emit() {
  // Publish a new reference so useSyncExternalStore sees the change. This runs
  // only on emit (a handful of times per load / per mutation), not per row, so
  // the in-place ingest stays cheap while consumers still react to new data.
  _snapshot = _blocks.slice();
  listeners.forEach(l => l());
}

export function getBlocks(): Block[] { return _snapshot; }
export function getBlockById(id: string): Block | undefined { return _byId.get(id); }
export function getLoadProgress(): LoadProgress { return _progress; }
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
  note: string | null;
  note_updated_at: string | null;
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
    note: row.note ?? null,
    noteUpdatedAt: row.note_updated_at ?? null,
  };
}

// Page size for the paginated fetch. Must be <= server `max_rows`.
// Larger pages = fewer round trips but each parse is heavier; this is a
// good balance for 60k-row datasets over a typical broadband link.
const PAGE_SIZE = 5000;

const BLOCK_COLUMNS =
  'id, object_id, address, district, latitude, longitude, risk_score, risk_score_updated_at, last_inspected, status, note, note_updated_at';

export async function loadBlocks(): Promise<void> {
  // De-dupe concurrent loads.
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    // Reset cache for this load. We rebuild progressively as pages arrive.
    _blocks = [];
    _byId = new Map();
    _loadedCount = 0;
    _total = null;
    _loaded = false;
    _error = null;
    refreshProgress();
    emit();

    // Pre-fetch scores in parallel — small dataset (one row per factor per
    // block, capped well under PAGE_SIZE * a few). Paginate if it grows.
    const scoresPromise = fetchAllScores();

    // First page: ask for the exact total via head/count so we know how
    // many more pages to request.
    const first = await supabase
      .from('blocks_with_status')
      .select(BLOCK_COLUMNS, { count: 'exact' })
      .order('risk_score', { ascending: false })
      .order('id', { ascending: true })
      .range(0, PAGE_SIZE - 1);

    if (first.error) throw first.error;

    _total = first.count ?? (first.data?.length ?? 0);
    const firstRows = (first.data ?? []) as BlockRow[];

    // CRITICAL: the server enforces its own max-rows cap, so a request for
    // `PAGE_SIZE` rows may return fewer. Step by the number of rows ACTUALLY
    // returned, not by what we asked for — otherwise every gap between
    // (returned count) and PAGE_SIZE is silently skipped.
    const step = firstRows.length || PAGE_SIZE;

    // Ingest first page immediately.
    ingestRows(firstRows);
    refreshProgress();
    emit();

    // Walk remaining pages in parallel (bounded concurrency to stay
    // friendly to PostgREST). Most setups easily handle 4-way concurrency.
    const remaining: Array<[number, number]> = [];
    if (step > 0) {
      for (let start = step; start < _total; start += step) {
        const end = start + step - 1; // server clamps the upper bound itself
        remaining.push([start, end]);
      }
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
          .order('id', { ascending: true })
          .range(start, end);
        if (res.error) throw res.error;
        ingestRows((res.data ?? []) as BlockRow[]);
        refreshProgress();
        emit();
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, remaining.length) }, worker));

    // Safety net: if the server cap left us short of the reported total
    // (e.g. count was approximate, or a page returned unexpectedly few rows),
    // keep pulling sequentially from where we are until fully drained.
    while (_loadedCount < (_total ?? 0)) {
      const res = await supabase
        .from('blocks_with_status')
        .select(BLOCK_COLUMNS)
        .order('risk_score', { ascending: false })
        .order('id', { ascending: true })
        .range(_loadedCount, _loadedCount + (step || PAGE_SIZE) - 1);
      if (res.error) throw res.error;
      const rows = (res.data ?? []) as BlockRow[];
      if (rows.length === 0) break; // drained — stop even if count was wrong
      ingestRows(rows);
      refreshProgress();
      emit();
    }

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
    refreshProgress();
    emit();
  })();

  try {
    await _loadPromise;
  } catch (err) {
    _error = err instanceof Error ? err.message : 'Failed to load data';
    refreshProgress();
    emit();
  } finally {
    _loadPromise = null;
  }
}

function ingestRows(rows: BlockRow[]) {
  // Mutate in place — much faster than creating a fresh array for each
  // batch (which would churn 60k allocations). Consumers re-read via
  // getBlocks() on emit and never depend on reference equality.
  // Dedup by id so overlapping pages / safety-net re-fetches can't create
  // duplicate rows or inflate _loadedCount (which gates the loading screen).
  for (const r of rows) {
    if (_byId.has(r.id)) continue;
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
  _error = null;
  refreshProgress();
  emit();
}

// Allow the UI to retry after a load error.
export function retryLoad(): void {
  if (_loadPromise) return;
  void loadBlocks();
}

// ─── Mutations ─────────────────────────────────────────────────────────────
// updateBlockStatus is the same external surface as before, but routes
// through the inspections / schedule tables. The DB derives status via
// the blocks_with_status view, so we refetch the affected block.

async function refreshOne(blockId: string): Promise<void> {
  const [bRes, sRes] = await Promise.all([
    supabase
      .from('blocks_with_status')
      .select(BLOCK_COLUMNS)
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

// Refetch a set of blocks (by id) and patch them into the cache in place,
// emitting once at the end. Used after a bulk import so derived fields
// (status, last_inspected) reflect the new inspection rows without a full
// 60k-row reload.
async function refreshBlocks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const nextById = new Map<string, Block>();
  const CHUNK = 300;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('blocks_with_status')
      .select(BLOCK_COLUMNS)
      .in('id', chunk);
    if (error) throw error;
    for (const row of (data ?? []) as BlockRow[]) {
      // Preserve already-loaded factor breakdowns; they aren't on this view fetch.
      nextById.set(row.id, rowToBlock(row, _byId.get(row.id)?.factors));
    }
  }
  if (nextById.size === 0) return;
  for (let i = 0; i < _blocks.length; i++) {
    const n = nextById.get(_blocks[i].id);
    if (n) _blocks[i] = n;
  }
  for (const [id, b] of nextById) _byId.set(id, b);
  emit();
}

export interface InspectionImportRow {
  objectId: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
}

export interface InspectionImportResult {
  totalRows: number;          // valid rows handed in
  inserted: number;           // rows written to inspections
  matchedBlocks: number;      // distinct blocks that got at least one row
  unmatched: number;          // rows whose object_id had no matching block
  unmatchedSamples: string[]; // a few example unmatched object_ids
}

// Bulk-load inspection events from a parsed CSV. Each row is linked to its
// block by matching object_id. Runs entirely as the signed-in user, so the
// inspections RLS policy + created_by trigger are satisfied (no privileged
// access needed). Rows with no matching block are skipped and reported back.
export async function importInspections(
  rows: InspectionImportRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<InspectionImportResult> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not authenticated');

  // 1) Resolve the CSV's id → block uuid. Despite the column being labelled
  //    "object_id" in the CSV, it actually matches blocks.building_record_number.
  //    Query only the ids we need, chunked to keep the URL within PostgREST limits.
  const uniqueObjectIds = [...new Set(rows.map(r => r.objectId))];
  const idMap = new Map<string, string>();
  const LOOKUP_CHUNK = 500;
  for (let i = 0; i < uniqueObjectIds.length; i += LOOKUP_CHUNK) {
    const chunk = uniqueObjectIds.slice(i, i + LOOKUP_CHUNK);
    const { data, error } = await supabase
      .from('blocks')
      .select('id, building_record_number')
      .in('building_record_number', chunk);
    if (error) throw error;
    for (const row of (data ?? []) as { id: string; building_record_number: string }[]) {
      idMap.set(row.building_record_number, row.id);
    }
  }

  // 2) Build insert payloads for matched rows; collect unmatched object_ids.
  const inserts: { block_id: string; inspected_at: string; created_by: string }[] = [];
  const unmatched = new Set<string>();
  for (const r of rows) {
    const blockId = idMap.get(r.objectId);
    if (!blockId) { unmatched.add(r.objectId); continue; }
    inserts.push({ block_id: blockId, inspected_at: r.date, created_by: uid });
  }

  // 3) Insert in batches.
  const INSERT_CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += INSERT_CHUNK) {
    const chunk = inserts.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase.from('inspections').insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
    onProgress?.(inserted, inserts.length);
  }

  // 4) Refresh affected blocks so the UI reflects new statuses/dates.
  const affected = [...new Set(inserts.map(x => x.block_id))];
  await refreshBlocks(affected);

  return {
    totalRows: rows.length,
    inserted,
    matchedBlocks: affected.length,
    unmatched: rows.length - inserts.length,
    unmatchedSamples: [...unmatched].slice(0, 8),
  };
}

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

// Inverse of inspectionAgeScore: pick the last-inspection date that would
// reproduce a given risk score on the linear 1yr→30yr scale.
//   score 0   → 1 year ago
//   score 100 → 30 years ago
function dateForScore(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  const yearsAgo = 1 + (clamped / 100) * (30 - 1);
  return new Date(Date.now() - yearsAgo * MS_PER_YEAR).toISOString().slice(0, 10);
}

// Generate one mock inspection per block, dated so its age maps back to the
// block's current risk score. Inserts in batches, then patches the in-memory
// cache so the UI reflects the new dates/status without a full reload.
export async function generateMockInspections(
  onProgress?: (done: number, total: number) => void,
): Promise<{ inserted: number }> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not authenticated');

  const items = _blocks.map(b => ({ id: b.id, date: dateForScore(b.riskScore) }));

  const INSERT_CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < items.length; i += INSERT_CHUNK) {
    const chunk = items.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase
      .from('inspections')
      .insert(chunk.map(x => ({ block_id: x.id, inspected_at: x.date, created_by: uid })));
    if (error) throw error;
    inserted += chunk.length;
    onProgress?.(inserted, items.length);
  }

  // Patch the cache in place: these inserts are the most-recent event per block,
  // so each block's derived status becomes 'Inspected' with this date.
  const dateById = new Map(items.map(x => [x.id, x.date]));
  for (let i = 0; i < _blocks.length; i++) {
    const date = dateById.get(_blocks[i].id);
    if (date) _blocks[i] = { ..._blocks[i], lastInspected: date, status: 'Inspected' };
  }
  for (const b of _blocks) _byId.set(b.id, b);
  emit();

  return { inserted };
}

export async function setBlockNote(id: string, note: string): Promise<void> {
  // Store empty input as NULL so "no note" is unambiguous. note_updated_by /
  // note_updated_at are stamped server-side by a trigger.
  const value = note.trim() === '' ? null : note;
  const { error } = await supabase.from('blocks').update({ note: value }).eq('id', id);
  if (error) throw error;
  // Refetch the affected block so the freshly-stamped note + timestamp flow
  // back into the cache and every open view re-renders.
  await refreshOne(id);
}
