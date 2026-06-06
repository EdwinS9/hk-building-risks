/**
 * Playful, hand-drawn style SVG illustrations.
 * Strokes use currentColor; fills use the app's themeable CSS variables so the
 * doodles look right in both light and dark mode.
 */

type Props = { size?: number; className?: string };

const line = {
  stroke: 'currentColor',
  strokeWidth: 5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** A friendly little apartment building. */
export function BuildingDoodle({ size = 120, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} aria-hidden>
      <circle cx="96" cy="24" r="11" fill="var(--accent-soft)" />
      <rect x="20" y="34" width="54" height="74" rx="8" {...line} fill="var(--accent-soft)" />
      <rect x="68" y="58" width="34" height="50" rx="7" {...line} fill="var(--secondary-soft)" />
      <rect x="31" y="46" width="13" height="13" rx="3" {...line} strokeWidth={3.5} fill="var(--surface)" />
      <rect x="50" y="46" width="13" height="13" rx="3" {...line} strokeWidth={3.5} fill="var(--surface)" />
      <rect x="31" y="68" width="13" height="13" rx="3" {...line} strokeWidth={3.5} fill="var(--surface)" />
      <rect x="50" y="68" width="13" height="13" rx="3" {...line} strokeWidth={3.5} fill="var(--surface)" />
      <rect x="78" y="70" width="13" height="13" rx="3" {...line} strokeWidth={3.5} fill="var(--surface)" />
      <path d="M40 108v-12a7 7 0 0 1 14 0v12" {...line} strokeWidth={3.5} fill="none" />
      <path d="M10 108h100" {...line} fill="none" />
    </svg>
  );
}

/** A magnifying glass over a tiny map pin — for empty search state. */
export function SearchDoodle({ size = 120, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} aria-hidden>
      <circle cx="52" cy="52" r="30" {...line} fill="var(--accent-soft)" />
      <path d="M74 74l24 24" {...line} strokeWidth={7} fill="none" />
      <path d="M52 38c-7 0-12 5-12 12 0 8 12 18 12 18s12-10 12-18c0-7-5-12-12-12z" {...line} strokeWidth={3.5} fill="var(--secondary-soft)" />
      <circle cx="52" cy="50" r="4" fill="var(--surface)" />
      <path d="M92 30l0 8M88 34l8 0" {...line} strokeWidth={3.5} fill="none" />
    </svg>
  );
}

/** A megaphone — for the report action. */
export function MegaphoneDoodle({ size = 120, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} aria-hidden>
      <path d="M28 50v20l10 4 6 22h10l-4-20 38 14V32L50 46H34a6 6 0 0 0-6 6z" {...line} fill="var(--secondary-soft)" />
      <path d="M88 46c8 2 8 26 0 28" {...line} strokeWidth={4} fill="none" />
      <path d="M100 40c10 6 10 34 0 40" {...line} strokeWidth={4} fill="none" />
    </svg>
  );
}

/** A big happy checkmark in a circle — success. */
export function SuccessDoodle({ size = 120, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} aria-hidden>
      <circle cx="60" cy="60" r="40" {...line} fill="var(--success-soft)" />
      <path d="M42 62l13 13 24-28" stroke="var(--success)" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M18 40l0 8M14 44l8 0" {...line} strokeWidth={3.5} fill="none" />
      <path d="M100 74l0 7M96 77l8 0" {...line} strokeWidth={3.5} fill="none" />
      <circle cx="98" cy="34" r="3.5" fill="var(--secondary)" />
      <circle cx="24" cy="84" r="3.5" fill="var(--accent)" />
    </svg>
  );
}

/** A small shield — trust / safety footnote mark. */
export function ShieldDoodle({ size = 32, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M24 6l16 6v12c0 11-8 16-16 18-8-2-16-7-16-18V12z" {...line} strokeWidth={3.5} fill="var(--accent-soft)" />
      <path d="M16 24l6 6 11-12" stroke="var(--accent)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
