// ─── Resident reports data layer ─────────────────────────────────────────────
// Reports are submitted anonymously by residents via the resident PWA. The
// operator dashboard reads them here and tracks two pieces of triage state:
//   read_at   — operator has seen it (no longer "new")
//   solved_at — the underlying issue is resolved
//
// This is an external store (à la data/blocks.ts) so multiple views can share
// one source of truth: the Resident Reports page lists/triages them, while the
// Risk Monitor's block detail shows a live open-report count for a block. Both
// subscribe here, so marking a report solved in one place updates the other.
import { supabase } from '../lib/supabase';

export interface ResidentReport {
  id: string;
  blockId: string;
  description: string;
  photoUrl: string | null;
  submittedAt: string;
  /** null = unread / new. */
  readAt: string | null;
  /** null = unsolved / still open. */
  solvedAt: string | null;
}

interface ReportRow {
  id: string;
  block_id: string;
  description: string;
  photo_url: string | null;
  submitted_at: string;
  read_at: string | null;
  solved_at: string | null;
}

function rowToReport(r: ReportRow): ResidentReport {
  return {
    id: r.id,
    blockId: r.block_id,
    description: r.description,
    photoUrl: r.photo_url,
    submittedAt: r.submitted_at,
    readAt: r.read_at,
    solvedAt: r.solved_at,
  };
}

const REPORT_COLUMNS =
  'id, block_id, description, photo_url, submitted_at, read_at, solved_at';

const PAGE_SIZE = 1000;

// ─── Store state ─────────────────────────────────────────────────────────────
let _reports: ResidentReport[] = [];
let _snapshot: ResidentReport[] = [];
let _byId = new Map<string, ResidentReport>();
let _loadPromise: Promise<void> | null = null;
let _loaded = false;

export interface ReportsStatus {
  loading: boolean;
  loaded: boolean;
  error: string | null;
}
let _status: ReportsStatus = { loading: false, loaded: false, error: null };

const listeners = new Set<() => void>();

function emit() {
  _snapshot = _reports.slice();
  listeners.forEach(l => l());
}
function setStatus(next: Partial<ReportsStatus>) {
  _status = { ..._status, ...next };
}

export function getReports(): ResidentReport[] { return _snapshot; }
export function getReportsStatus(): ReportsStatus { return _status; }

export function subscribeReports(listener: () => void): () => void {
  listeners.add(listener);
  // Lazy first load on first subscriber.
  if (!_loaded && !_loadPromise) void loadReports();
  return () => listeners.delete(listener);
}

// Number of OPEN (unsolved) reports for a block — what the block detail shows.
export function getOpenReportCount(blockId: string): number {
  let n = 0;
  for (const r of _reports) {
    if (r.blockId === blockId && !r.solvedAt) n++;
  }
  return n;
}

function index() {
  _byId = new Map(_reports.map(r => [r.id, r]));
}

// Pull every report, newest first. Paginated to respect PostgREST's max_rows
// cap (advance by what actually came back, not by the requested size).
export async function loadReports(force = false): Promise<void> {
  if (_loadPromise) return _loadPromise;
  if (_loaded && !force) return;

  _loadPromise = (async () => {
    setStatus({ loading: true, error: null });
    emit();
    try {
      const out: ResidentReport[] = [];
      let start = 0;
      while (true) {
        const { data, error } = await supabase
          .from('resident_reports')
          .select(REPORT_COLUMNS)
          .order('submitted_at', { ascending: false })
          .range(start, start + PAGE_SIZE - 1);
        if (error) throw error;
        const batch = (data ?? []) as ReportRow[];
        out.push(...batch.map(rowToReport));
        if (batch.length === 0) break;
        start += batch.length;
      }
      _reports = out;
      index();
      _loaded = true;
      setStatus({ loading: false, loaded: true, error: null });
      emit();
    } catch (err) {
      setStatus({ loading: false, error: err instanceof Error ? err.message : 'Failed to load reports.' });
      emit();
    } finally {
      _loadPromise = null;
    }
  })();

  return _loadPromise;
}

function patchLocal(id: string, fields: Partial<ResidentReport>) {
  const idx = _reports.findIndex(r => r.id === id);
  if (idx < 0) return;
  const next = { ..._reports[idx], ...fields };
  _reports[idx] = next;
  _byId.set(id, next);
  emit();
}

// ─── Mutations (optimistic, with rollback) ──────────────────────────────────

// Mark read / unread. Stamps read_at to now (or clears it).
export async function markReportRead(id: string, read: boolean): Promise<void> {
  const prev = _byId.get(id);
  patchLocal(id, { readAt: read ? new Date().toISOString() : null });
  try {
    const { data, error } = await supabase
      .from('resident_reports')
      .update({ read_at: read ? new Date().toISOString() : null })
      .eq('id', id)
      .select('read_at')
      .single();
    if (error) throw error;
    patchLocal(id, { readAt: (data as { read_at: string | null }).read_at });
  } catch (err) {
    if (prev) patchLocal(id, { readAt: prev.readAt }); // revert
    throw err;
  }
}

// Mark solved / reopened. Solving also counts as read (an unread report can't
// have been solved), so we stamp read_at too when it isn't already set.
export async function markReportSolved(id: string, solved: boolean): Promise<void> {
  const prev = _byId.get(id);
  const now = new Date().toISOString();
  patchLocal(id, {
    solvedAt: solved ? now : null,
    readAt: solved ? prev?.readAt ?? now : prev?.readAt ?? null,
  });
  try {
    const patch: { solved_at: string | null; read_at?: string } = { solved_at: solved ? now : null };
    if (solved) patch.read_at = now;
    const { data, error } = await supabase
      .from('resident_reports')
      .update(patch)
      .eq('id', id)
      .select('solved_at, read_at')
      .single();
    if (error) throw error;
    const row = data as { solved_at: string | null; read_at: string | null };
    patchLocal(id, { solvedAt: row.solved_at, readAt: row.read_at });
  } catch (err) {
    if (prev) patchLocal(id, { solvedAt: prev.solvedAt, readAt: prev.readAt }); // revert
    throw err;
  }
}
