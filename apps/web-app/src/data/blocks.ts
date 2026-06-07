// ─── Data layer ────────────────────────────────────────────────────────────
// All access to blocks/scores/inspections goes through this module
// so the rest of the app never depends on Supabase directly. The exported
// store API (getBlocks / subscribe / getBlockById) keeps consumers away from
// direct Supabase calls.
import { supabase } from '../lib/supabase';
import { bandForScore, type RiskBand } from '../lib/constants';
import { getScoreParams, loadScoreParams } from '../lib/scoreParams';

export type BlockStatus = 'Not scheduled' | 'Inspected';

// Status filter order for the triage queue chips.
export const BLOCK_STATUSES: BlockStatus[] = ['Not scheduled', 'Inspected'];

export interface RiskFactor {
  label: string;
  contribution: number;
}

export interface ScoreImportRow {
  objectId: string;
  scoreName: string;
  scoreValue: number;
}

export type ScoreMatchMode = 'object_id' | 'building_record_number';
export type ScoreValueScale = 'zero_to_one' | 'zero_to_hundred';

export interface ScoreMatchPreview {
  objectId: {
    matchedRows: number;
    matchedBlocks: number;
  };
  buildingRecordNumber: {
    matchedRows: number;
    matchedBlocks: number;
  };
}

export interface ScoreImportResult {
  totalRows: number;
  upserted: number;
  matchedRows: number;
  matchedBlocks: number;
  unmatched: number;
  invalidValues: number;
  unmatchedSamples: string[];
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
  completionDate: string | null;
  lastInspected: string | null;
  status: BlockStatus;
  /** Shared free-text note. Editable by any authenticated user. */
  note: string | null;
  noteUpdatedAt: string | null;
  reportCount: number;
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
  completion_date: string | null;
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

interface ScoreImportBlockRow {
  id: string;
  object_id: string;
  building_record_number: string | null;
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
    completionDate: row.completion_date,
    lastInspected: row.last_inspected,
    status: (row.status as BlockStatus) ?? 'Not scheduled',
    note: row.note ?? null,
    noteUpdatedAt: row.note_updated_at ?? null,
    reportCount: 0,
  };
}

// Requested page size for paginated fetches. PostgREST may clamp responses to
// the server max_rows setting, so full-table readers must advance by the number
// of rows actually returned, not by this requested size.
const PAGE_SIZE = 5000;

const BLOCK_COLUMNS =
  'id, object_id, address, district, latitude, longitude, completion_date, risk_score, risk_score_updated_at, last_inspected, status, note, note_updated_at';

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

    // Pre-fetch scores and report counts in parallel.
    const scoresPromise = fetchAllScores();
    const reportCountsPromise = fetchAllReportCounts();

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

    // Apply per-factor breakdowns and report counts once pre-fetches finish.
    const [factorsByBlock, reportCounts] = await Promise.all([scoresPromise, reportCountsPromise]);
    if (factorsByBlock.size > 0) {
      for (const b of _blocks) {
        const f = factorsByBlock.get(b.id);
        if (f) b.factors = f;
      }
    }
    if (reportCounts.size > 0) {
      for (const b of _blocks) {
        const n = reportCounts.get(b.id);
        if (n) b.reportCount = n;
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

async function fetchAllReportCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let start = 0;
  while (true) {
    const { data, error } = await supabase
      .from('resident_reports')
      .select('block_id')
      .order('block_id', { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as { block_id: string }[];
    for (const r of batch) {
      counts.set(r.block_id, (counts.get(r.block_id) ?? 0) + 1);
    }
    if (batch.length === 0) break;
    start += batch.length;
  }
  return counts;
}

async function fetchAllScores(): Promise<Map<string, RiskFactor[]>> {
  const factorsByBlock = new Map<string, RiskFactor[]>();
  let start = 0;
  // Loop until the server returns no rows. Supabase/PostgREST may clamp a
  // larger requested range to max_rows (often 1000), so a "partial" response
  // does not necessarily mean the table is drained.
  while (true) {
    const { data, error } = await supabase
      .from('scores')
      .select('block_id, score_name, score_value')
      .order('block_id', { ascending: true })
      .order('score_name', { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as ScoreRow[];
    for (const s of batch) {
      const arr = factorsByBlock.get(s.block_id) ?? [];
      arr.push({ label: s.score_name, contribution: toNumber(s.score_value) });
      factorsByBlock.set(s.block_id, arr);
    }
    if (batch.length === 0) break;
    start += batch.length;
  }
  return factorsByBlock;
}

async function fetchScoreImportBlocks(objectIds: string[]): Promise<ScoreImportBlockRow[]> {
  const unique = [...new Set(objectIds.filter(Boolean))];
  const out: ScoreImportBlockRow[] = [];
  const CHUNK = 500;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const [objectRes, recordRes] = await Promise.all([
      supabase
        .from('blocks')
        .select('id, object_id, building_record_number')
        .in('object_id', chunk),
      supabase
        .from('blocks')
        .select('id, object_id, building_record_number')
        .in('building_record_number', chunk),
    ]);
    if (objectRes.error) throw objectRes.error;
    if (recordRes.error) throw recordRes.error;
    out.push(...((objectRes.data ?? []) as ScoreImportBlockRow[]));
    out.push(...((recordRes.data ?? []) as ScoreImportBlockRow[]));
  }
  return out;
}

function scoreMatchMaps(blocks: ScoreImportBlockRow[]) {
  const byObjectId = new Map<string, string>();
  const byRecordNumber = new Map<string, string>();
  for (const b of blocks) {
    byObjectId.set(b.object_id, b.id);
    if (b.building_record_number) byRecordNumber.set(b.building_record_number, b.id);
  }
  return { byObjectId, byRecordNumber };
}

export async function previewScoreImport(rows: ScoreImportRow[]): Promise<ScoreMatchPreview> {
  const blocks = await fetchScoreImportBlocks(rows.map(r => r.objectId));
  const { byObjectId, byRecordNumber } = scoreMatchMaps(blocks);
  const objectBlockIds = new Set<string>();
  const recordBlockIds = new Set<string>();
  let objectRows = 0;
  let recordRows = 0;

  for (const row of rows) {
    const objectBlockId = byObjectId.get(row.objectId);
    if (objectBlockId) {
      objectRows++;
      objectBlockIds.add(objectBlockId);
    }

    const recordBlockId = byRecordNumber.get(row.objectId);
    if (recordBlockId) {
      recordRows++;
      recordBlockIds.add(recordBlockId);
    }
  }

  return {
    objectId: { matchedRows: objectRows, matchedBlocks: objectBlockIds.size },
    buildingRecordNumber: { matchedRows: recordRows, matchedBlocks: recordBlockIds.size },
  };
}

async function refreshScoreFactors(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const unique = [...new Set(ids)];
  const factorsByBlock = new Map<string, RiskFactor[]>();
  const CHUNK = 300;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('scores')
      .select('block_id, score_name, score_value')
      .in('block_id', chunk);
    if (error) throw error;
    for (const s of (data ?? []) as ScoreRow[]) {
      const arr = factorsByBlock.get(s.block_id) ?? [];
      arr.push({ label: s.score_name, contribution: toNumber(s.score_value) });
      factorsByBlock.set(s.block_id, arr);
    }
  }

  for (let i = 0; i < _blocks.length; i++) {
    const factors = factorsByBlock.get(_blocks[i].id);
    if (factors) _blocks[i] = { ..._blocks[i], factors };
  }
  for (const b of _blocks) _byId.set(b.id, b);
  emit();
}

function normalizeScoreValue(value: number, scale: ScoreValueScale): number | null {
  if (scale === 'zero_to_hundred') {
    if (value < 0 || value > 100) return null;
    return Math.round((value / 100) * 10000) / 10000;
  }
  if (value < 0 || value > 1) return null;
  return Math.round(value * 10000) / 10000;
}

export async function importScores(
  rows: ScoreImportRow[],
  mode: ScoreMatchMode,
  scale: ScoreValueScale,
  onProgress?: (done: number, total: number) => void,
): Promise<ScoreImportResult> {
  const blocks = await fetchScoreImportBlocks(rows.map(r => r.objectId));
  const { byObjectId, byRecordNumber } = scoreMatchMaps(blocks);
  const idMap = mode === 'object_id' ? byObjectId : byRecordNumber;

  const unmatched = new Set<string>();
  const affected = new Set<string>();
  const upsertByKey = new Map<string, { block_id: string; score_name: string; score_value: number }>();
  let matchedRows = 0;
  let invalidValues = 0;

  for (const row of rows) {
    const blockId = idMap.get(row.objectId);
    if (!blockId) {
      unmatched.add(row.objectId);
      continue;
    }
    matchedRows++;

    const scoreValue = normalizeScoreValue(row.scoreValue, scale);
    if (scoreValue == null) {
      invalidValues++;
      continue;
    }

    affected.add(blockId);
    upsertByKey.set(`${blockId}\u0000${row.scoreName}`, {
      block_id: blockId,
      score_name: row.scoreName,
      score_value: scoreValue,
    });
  }

  const items = [...upsertByKey.values()];
  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const { data, error } = await supabase.rpc('import_score_rows', { p_rows: chunk });
    if (error) throw error;
    upserted += typeof data === 'number' ? data : Number(data ?? chunk.length);
    onProgress?.(upserted, items.length);
  }

  await refreshScoreFactors([...affected]);

  return {
    totalRows: rows.length,
    upserted,
    matchedRows,
    matchedBlocks: affected.size,
    unmatched: rows.length - matchedRows,
    invalidValues,
    unmatchedSamples: [...unmatched].slice(0, 8),
  };
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

export interface InspectionBackfillImportResult extends InspectionImportResult {
  realInserted: number;
  mockInserted: number;
  totalBlocks: number;
}

interface InspectionImportBlockRow {
  id: string;
  building_record_number: string | null;
}

async function fetchAllInspectionImportBlocks(): Promise<InspectionImportBlockRow[]> {
  const out: InspectionImportBlockRow[] = [];
  let start = 0;
  // Same max_rows caveat as fetchAllScores: advance by what came back.
  while (true) {
    const { data, error } = await supabase
      .from('blocks')
      .select('id, building_record_number')
      .order('id', { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as InspectionImportBlockRow[];
    if (batch.length === 0) break;
    out.push(...batch);
    start += batch.length;
  }
  return out;
}

function randomInspectionDate(): string {
  const start = new Date('2022-01-01T00:00:00Z').getTime();
  const end = new Date('2026-05-01T00:00:00Z').getTime();
  const ts = start + Math.floor(Math.random() * (end - start + 1));
  return new Date(ts).toISOString().slice(0, 10);
}

function maxIsoDate(a: string | null, b: string): string {
  if (!a) return b;
  return a > b ? a : b;
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

export async function importInspectionsWithMockFallback(
  rows: InspectionImportRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<InspectionBackfillImportResult> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not authenticated');

  const blocks = await fetchAllInspectionImportBlocks();
  const idMap = new Map<string, string>();
  for (const block of blocks) {
    if (block.building_record_number) idMap.set(block.building_record_number, block.id);
  }

  const matchedBlocks = new Set<string>();
  const unmatched = new Set<string>();
  const inserts: { block_id: string; inspected_at: string; created_by: string }[] = [];
  const latestById = new Map<string, string>();

  for (const row of rows) {
    const blockId = idMap.get(row.objectId);
    if (!blockId) {
      unmatched.add(row.objectId);
      continue;
    }

    matchedBlocks.add(blockId);
    inserts.push({ block_id: blockId, inspected_at: row.date, created_by: uid });
    latestById.set(blockId, maxIsoDate(latestById.get(blockId) ?? null, row.date));
  }

  let mockInserted = 0;
  for (const block of blocks) {
    if (matchedBlocks.has(block.id)) continue;
    const date = randomInspectionDate();
    inserts.push({ block_id: block.id, inspected_at: date, created_by: uid });
    latestById.set(block.id, date);
    mockInserted++;
  }

  const INSERT_CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += INSERT_CHUNK) {
    const chunk = inserts.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase.from('inspections').insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
    onProgress?.(inserted, inserts.length);
  }

  for (let i = 0; i < _blocks.length; i++) {
    const date = latestById.get(_blocks[i].id);
    if (!date) continue;
    _blocks[i] = {
      ..._blocks[i],
      lastInspected: maxIsoDate(_blocks[i].lastInspected, date),
      status: 'Inspected',
    };
  }
  for (const b of _blocks) _byId.set(b.id, b);
  emit();

  return {
    totalRows: rows.length,
    inserted,
    realInserted: inserted - mockInserted,
    mockInserted,
    totalBlocks: blocks.length,
    matchedBlocks: matchedBlocks.size,
    unmatched: rows.length - (inserted - mockInserted),
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


function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-700, Math.min(700, x))));
}

function calculateRiskScore(block: Block): number {
  const { a1, a2, a3, a4 } = getScoreParams();

  const ba = block.completionDate
    ? (Date.now() - new Date(block.completionDate).getTime()) / MS_PER_YEAR
    : 0;

  const li = block.lastInspected
    ? (Date.now() - new Date(block.lastInspected).getTime()) / MS_PER_YEAR
    : 100;

  const factors = block.factors ?? [];
  const sar = factors.length > 0
    ? factors.reduce((sum, f) => sum + f.contribution, 0) / factors.length
    : 0;

  const x = a1 * (ba - 30) + a2 * (li - 10) + a3 * sar + a4 * block.reportCount;
  return Math.round(sigmoid(x) * 10000) / 100; // 2 dp, 0–100
}

export async function recalculateRiskScores(): Promise<{ updated: number; total: number }> {
  // Pull the authoritative parameters from the database first so both the
  // server RPC and the client-side compute below use the saved values. This
  // also refreshes the local cache that calculateRiskScore() reads.
  const { a1, a2, a3, a4 } = await loadScoreParams();
  const now = new Date().toISOString();

  // Compute sigmoid scores client-side for all blocks upfront — needed both
  // for the in-memory patch and as the fallback DB write if the RPC fails.
  const computed = _blocks.map(b => ({ id: b.id, score: calculateRiskScore(b) }));

  // Primary path: server-side RPC computes + writes all rows in one statement.
  const rpcResult = await supabase.rpc('recalculate_block_risk_scores', {
    p_a1: a1, p_a2: a2, p_a3: a3, p_a4: a4,
  });

  let dbUpdated: number;

  if (!rpcResult.error) {
    dbUpdated = typeof rpcResult.data === 'number' ? rpcResult.data : Number(rpcResult.data ?? 0);
  } else {
    // Fallback: RPC unavailable (function ambiguity, not yet migrated, etc.).
    // Write the client-computed sigmoid scores directly to the blocks table so
    // the correct values survive a page reload.
    const CHUNK = 500;
    dbUpdated = 0;
    for (let i = 0; i < computed.length; i += CHUNK) {
      const chunk = computed.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('blocks')
        .upsert(
          chunk.map(({ id, score }) => ({
            id,
            risk_score: score,
            risk_score_updated_at: now,
          })),
          { onConflict: 'id' },
        );
      if (error) throw error;
      dbUpdated += chunk.length;
    }
  }

  // Patch the in-memory store so the UI reflects the new scores immediately.
  for (let i = 0; i < _blocks.length; i++) {
    const score = computed[i].score;
    _blocks[i] = {
      ..._blocks[i],
      riskScore: score,
      riskBand: bandForScore(score),
      scoreUpdatedAt: now,
    };
  }
  _blocks.sort((a, b) => b.riskScore - a.riskScore);
  for (const b of _blocks) _byId.set(b.id, b);
  emit();

  return { updated: dbUpdated, total: _blocks.length };
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
