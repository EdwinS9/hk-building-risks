export const HK_CENTER: [number, number] = [114.1694, 22.3193];
export const HK_DEFAULT_ZOOM = 11.5;
export const HK_DEFAULT_PITCH = 0;
export const HK_DEFAULT_BEARING = 0;

export type RiskBand = 'Low' | 'Moderate' | 'High' | 'Critical';

// Display order for band filters / chips (worst first).
export const BAND_ORDER: RiskBand[] = ['Critical', 'High', 'Moderate', 'Low'];

export const RISK_BANDS: { band: RiskBand; min: number; max: number; color: string; glow: string }[] = [
  { band: 'Low',      min: 0,  max: 39,  color: '#3FB6B0', glow: 'rgba(63, 182, 176, 0.45)' },
  { band: 'Moderate', min: 40, max: 69,  color: '#F5B642', glow: 'rgba(245, 182, 66, 0.45)' },
  { band: 'High',     min: 70, max: 89,  color: '#F37735', glow: 'rgba(243, 119, 53, 0.6)'  },
  { band: 'Critical', min: 90, max: 100, color: '#E84545', glow: 'rgba(232, 69, 69, 0.7)'   },
];

export function bandForScore(score: number): RiskBand {
  for (const b of RISK_BANDS) {
    if (score >= b.min && score <= b.max) return b.band;
  }
  return 'Low';
}

export function colorForBand(band: RiskBand): string {
  return RISK_BANDS.find(b => b.band === band)!.color;
}

export function colorForScore(score: number): string {
  return colorForBand(bandForScore(score));
}

// Sentinel "factor" key for the inspection-age score so it can be heat-mapped
// like a real breakdown factor even though it's derived, not stored.
export const LAST_INSPECTED_FACTOR = '__last_inspected__';

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

// Score the inspection age as a risk factor (0–100):
//   • 0 points until the inspection is 1 year in the past
//   • linear climb from there, reaching 100 at 30 years
//   • never inspected ⇒ treated as fully overdue (100)
export function inspectionAgeScore(lastInspected: string | null): number {
  if (!lastInspected) return 100;
  const then = new Date(lastInspected).getTime();
  if (Number.isNaN(then)) return 0;
  const years = (Date.now() - then) / MS_PER_YEAR;
  if (years <= 1) return 0;
  if (years >= 30) return 100;
  return Math.round(((years - 1) / (30 - 1)) * 100);
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} yr ago`;
}
