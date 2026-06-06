// ─── Database connection status ────────────────────────────────────────────
// A tiny external store that tracks live connectivity to Supabase. It runs a
// cheap HEAD/count ping against a known table and re-checks on an interval so
// the UI can show an honest "connected / degraded / offline" indicator.
import { supabase } from './supabase';

export type DbState = 'checking' | 'connected' | 'error';

export interface DbStatus {
  state: DbState;
  /** Round-trip latency of the last successful ping, in ms. */
  latencyMs: number | null;
  /** Error message from the last failed ping, if any. */
  error: string | null;
  /** Timestamp (ms) of the last completed check. */
  checkedAt: number | null;
}

let _status: DbStatus = {
  state: 'checking',
  latencyMs: null,
  error: null,
  checkedAt: null,
};

const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }

function setStatus(next: DbStatus) {
  _status = next;
  emit();
}

export function getDbStatus(): DbStatus { return _status; }

export function subscribeDbStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function ping(): Promise<void> {
  const started = performance.now();
  try {
    // Lightweight: ask only for the row count, no payload.
    const { error } = await supabase
      .from('blocks_with_status')
      .select('id', { count: 'exact', head: true });
    const latencyMs = Math.round(performance.now() - started);
    if (error) {
      setStatus({ state: 'error', latencyMs: null, error: error.message, checkedAt: Date.now() });
    } else {
      setStatus({ state: 'connected', latencyMs, error: null, checkedAt: Date.now() });
    }
  } catch (err) {
    setStatus({
      state: 'error',
      latencyMs: null,
      error: err instanceof Error ? err.message : 'Connection failed',
      checkedAt: Date.now(),
    });
  }
}

let _started = false;
let _timer: ReturnType<typeof setInterval> | null = null;

// Re-check every 20s — frequent enough to catch a dropped connection, light
// enough to be invisible against the database.
const POLL_MS = 20_000;

export function initDbStatus() {
  if (_started) return;
  _started = true;
  void ping();
  _timer = setInterval(() => void ping(), POLL_MS);
}

export function stopDbStatus() {
  if (_timer) clearInterval(_timer);
  _timer = null;
  _started = false;
}
