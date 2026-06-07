// Tunable sigmoid risk model parameters. a1–a3 are persisted to the database
// (public.score_params, single row) and mirrored to localStorage. a4 is
// localStorage-only until a DB migration adds the column.
// risk = 100 × sigmoid(a1(BA−30) + a2(LI−10) + a3×SAR + a4×n_reports)

import { supabase } from './supabase';

export interface ScoreParams {
  a1: number; // age steepness      — sensitivity of building age (yrs above 30)
  a2: number; // LI steepness       — sensitivity of inspection lag (yrs above 10)
  a3: number; // SAR relevance      — weight of the averaged SAR factor score (0–1)
  a4: number; // reports weight     — fictional years added per resident report
}

export const SCORE_PARAM_DEFAULTS: ScoreParams = {
  a1: 0.05,
  a2: 0.10,
  a3: 3.00,
  a4: 5.00,
};

export const SCORE_PARAM_META: {
  key: keyof ScoreParams;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
}[] = [
  {
    key: 'a1',
    label: 'a₁ — Age steepness',
    description: 'How sharply building age drives risk. Higher values make old buildings score dramatically worse.',
    min: 0, max: 0.3, step: 0.005,
  },
  {
    key: 'a2',
    label: 'a₂ — LI steepness',
    description: 'How sharply inspection lag drives risk. Higher values penalise long-uninspected buildings more.',
    min: 0, max: 0.5, step: 0.005,
  },
  {
    key: 'a3',
    label: 'a₃ — SAR relevance',
    description: 'Weight given to the averaged SAR score (0–1 range). Set to 0 to ignore SAR entirely.',
    min: 0, max: 10, step: 0.1,
  },
  {
    key: 'a4',
    label: 'a₄ — Report weight',
    description: 'Fictional years added to the sigmoid argument per resident report. Higher values make reported buildings score worse.',
    min: 0, max: 20, step: 0.5,
  },
];

const STORAGE_KEY = 'hk-brm.score-params';
const listeners = new Set<() => void>();

function readLocal(): ScoreParams {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...SCORE_PARAM_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ScoreParams>;
    return {
      a1: parsed.a1 ?? SCORE_PARAM_DEFAULTS.a1,
      a2: parsed.a2 ?? SCORE_PARAM_DEFAULTS.a2,
      a3: parsed.a3 ?? SCORE_PARAM_DEFAULTS.a3,
      a4: parsed.a4 ?? SCORE_PARAM_DEFAULTS.a4,
    };
  } catch {
    return { ...SCORE_PARAM_DEFAULTS };
  }
}

function writeLocal(p: ScoreParams): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota / disabled storage */
  }
}

// Seed the cache from localStorage for an instant first paint; the DB load
// (loadScoreParams) reconciles it shortly after sign-in.
let _cached: ScoreParams = readLocal();

export function getScoreParams(): ScoreParams { return _cached; }

// Update the in-memory cache + localStorage and notify subscribers, WITHOUT
// touching the database. Use this for high-frequency UI updates (slider drags)
// and persist to the DB separately/debounced via setScoreParams.
export function setScoreParamsLocal(next: ScoreParams): void {
  _cached = { ...next };
  writeLocal(_cached);
  listeners.forEach(l => l());
}

const setCache = setScoreParamsLocal;

// Fetch the authoritative parameters from the database, update the cache, and
// return them. Falls back to the cached/local values if the row is missing or
// the request fails (e.g. offline) so callers always get usable numbers.
export async function loadScoreParams(): Promise<ScoreParams> {
  try {
    const { data, error } = await supabase
      .from('score_params')
      .select('a1, a2, a3')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const next: ScoreParams = {
        a1: Number(data.a1),
        a2: Number(data.a2),
        a3: Number(data.a3),
        a4: _cached.a4, // not in DB yet; preserve from local cache
      };
      setCache(next);
      return next;
    }
  } catch {
    /* keep cached values on failure */
  }
  return _cached;
}

// Persist the parameters to the database. Updates the cache immediately so the
// UI reflects the change without waiting for the round-trip.
export async function setScoreParams(next: ScoreParams): Promise<void> {
  setCache(next);
  const { error } = await supabase
    .from('score_params')
    .upsert({ id: 1, a1: next.a1, a2: next.a2, a3: next.a3 }, { onConflict: 'id' });
  if (error) throw error;
}

export async function resetScoreParams(): Promise<void> {
  await setScoreParams({ ...SCORE_PARAM_DEFAULTS });
}

export function subscribeScoreParams(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
