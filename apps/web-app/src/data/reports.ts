// ─── Resident reports data layer ─────────────────────────────────────────────
// Reports are submitted anonymously by residents via the resident PWA. The
// operator dashboard reads them here and tracks two pieces of triage state:
//   read_at   — operator has seen it (no longer "new")
//   solved_at — the underlying issue is resolved
// We keep this module thin: a one-shot fetch plus two persistence helpers. The
// view owns the in-memory list and applies optimistic updates, so there is no
// global store to keep in sync (the dataset is small — one row per submission).
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

// Pull every report, newest first. Paginated to respect PostgREST's max_rows
// cap (advance by what actually came back, not by the requested size).
export async function fetchReports(): Promise<ResidentReport[]> {
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
  return out;
}

// Mark read / unread. Stamps read_at to now (or clears it) and returns the
// stored value so the caller can patch its local copy without a refetch.
export async function setReportRead(id: string, read: boolean): Promise<string | null> {
  const value = read ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from('resident_reports')
    .update({ read_at: value })
    .eq('id', id)
    .select('read_at')
    .single();
  if (error) throw error;
  return (data as { read_at: string | null }).read_at;
}

// Mark solved / reopened. Solving also counts as read (an unread report can't
// have been solved), so we stamp read_at too when it isn't already set.
export async function setReportSolved(id: string, solved: boolean): Promise<{ solvedAt: string | null; readAt: string | null }> {
  const now = new Date().toISOString();
  const patch: { solved_at: string | null; read_at?: string } = {
    solved_at: solved ? now : null,
  };
  if (solved) patch.read_at = now;
  const { data, error } = await supabase
    .from('resident_reports')
    .update(patch)
    .eq('id', id)
    .select('solved_at, read_at')
    .single();
  if (error) throw error;
  const row = data as { solved_at: string | null; read_at: string | null };
  return { solvedAt: row.solved_at, readAt: row.read_at };
}
