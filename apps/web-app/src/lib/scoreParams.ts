// Tunable sigmoid risk model parameters, persisted to localStorage.
// risk = 100 × sigmoid(a1(BA−30) + a2(LI−10) + a3×SAR + a4×n_reports)

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

function read(): ScoreParams {
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

let _cached: ScoreParams = read();

export function getScoreParams(): ScoreParams { return _cached; }

export function setScoreParams(next: ScoreParams): void {
  _cached = { ...next };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_cached));
  listeners.forEach(l => l());
}

export function resetScoreParams(): void {
  setScoreParams({ ...SCORE_PARAM_DEFAULTS });
}

export function subscribeScoreParams(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
