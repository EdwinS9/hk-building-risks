import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Calculator,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { Block, BlockStatus } from '../data/blocks';
import { BLOCK_STATUSES, recalculateRiskScores } from '../data/blocks';
import { colorForBand, bandForScore, BAND_ORDER, type RiskBand } from '../lib/constants';

interface Props {
  blocks: Block[];        // already band/status filtered by the parent
  allBlocks: Block[];     // full unfiltered dataset — used for the score histogram
  totalCount: number;     // size of the full dataset (for the "X / Y" label)
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  open: boolean;
  onToggle: () => void;
  bandFilter: Set<RiskBand>;
  statusFilter: Set<BlockStatus>;
  onToggleBand: (b: RiskBand) => void;
  onToggleStatus: (s: BlockStatus) => void;
}

type SortKey = 'score' | 'name' | 'district';
type RecalcState =
  | { phase: 'idle'; message: string }
  | { phase: 'working'; message: string }
  | { phase: 'done'; message: string }
  | { phase: 'error'; message: string };

// `lastInspected` is a plain YYYY-MM-DD date. Render it compactly, e.g. "12 Mar 2026".
function formatInspectedDate(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TriageQueue({
  blocks, allBlocks, totalCount, selectedId, onSelect, onHover, open, onToggle,
  bandFilter, statusFilter, onToggleBand, onToggleStatus,
}: Props) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [recalc, setRecalc] = useState<RecalcState>({ phase: 'idle', message: '' });

  // ── Virtualized list ──────────────────────────────────────────────────────
  // Rendering 60k DOM rows is what made the list scroll janky. We only mount
  // the rows in (or near) the viewport and pad the scroll height with a spacer.
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () => setViewportH(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // `blocks` is already band/status filtered upstream; here we only apply the
  // free-text query and sort (those stay list-only and don't touch the map).
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? blocks.filter(b => b.name.toLowerCase().includes(q) || b.district.toLowerCase().includes(q))
      : blocks.slice();
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'score') cmp = a.riskScore - b.riskScore;
      else if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else cmp = a.district.localeCompare(b.district);
      return sortAsc ? cmp : -cmp;
    });
    return filtered;
  }, [blocks, query, sortKey, sortAsc]);

  function setSort(k: SortKey) {
    if (k === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(k); setSortAsc(k !== 'score'); }
  }

  async function handleRecalculate() {
    const ok = window.confirm(
      `Calculate risk scores for all ${totalCount.toLocaleString()} blocks?\n\n` +
      `This saves the average of every risk breakdown score plus Last inspected and Building age to the blocks table.`,
    );
    if (!ok) return;

    setRecalc({ phase: 'working', message: 'Calculating risk scores…' });
    try {
      const result = await recalculateRiskScores();
      setRecalc({
        phase: 'done',
        message: `${result.updated.toLocaleString()} / ${result.total.toLocaleString()} blocks updated`,
      });
    } catch (err) {
      setRecalc({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Could not calculate scores',
      });
    }
  }

  const ROW_H = 52; // fixed row height (border-box) — keep in sync with .row CSS
  const OVERSCAN = 8;
  const total = rows.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleCount = Math.ceil((viewportH || 800) / ROW_H) + OVERSCAN * 2;
  const end = Math.min(total, start + visibleCount);
  const visible = rows.slice(start, end);

  return (
    <>
      <aside className={`triage glass side-panel side-left ${open ? 'open' : 'collapsed'}`}>
        <div className="panel-inner">
          <div className="triage-header">
            <div>
              <div className="panel-label">TRIAGE QUEUE</div>
              <div className="panel-sub">{rows.length} / {totalCount} blocks</div>
            </div>
            <div className="triage-header-actions">
              <button
                className="action-btn tiny risk-calc-btn"
                onClick={handleRecalculate}
                disabled={recalc.phase === 'working'}
                title="Calculate and save the aggregate risk score for every block"
              >
                {recalc.phase === 'working'
                  ? <Loader2 size={11} className="spin" />
                  : <Calculator size={11} />}
                Calculate
              </button>
              <button className="collapse-btn" onClick={onToggle} title="Collapse panel">
                <ChevronLeft size={14} />
              </button>
            </div>
          </div>

          {recalc.phase !== 'idle' && (
            <div className={`risk-calc-status risk-calc-${recalc.phase}`}>
              {recalc.phase === 'working' && <Loader2 size={12} className="spin" />}
              {recalc.phase === 'done' && <CheckCircle2 size={12} />}
              {recalc.phase === 'error' && <AlertTriangle size={12} />}
              <span>{recalc.message}</span>
            </div>
          )}

          <div className="triage-search">
            <Search size={13} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name or district…"
            />
          </div>

          <div className="filter-group">
            <div className="filter-label">BAND</div>
            <div className="chips">
              {BAND_ORDER.map(b => (
                <button
                  key={b}
                  className={`chip ${bandFilter.has(b) ? 'on' : ''}`}
                  onClick={() => onToggleBand(b)}
                  style={{ ['--chip-color' as any]: colorForBand(b) }}
                >
                  <span className="chip-dot" />
                  {b}
                </button>
              ))}
            </div>
          </div>

          <ScoreHistogram allBlocks={allBlocks} />

          <div className="filter-group">
            <div className="filter-label">STATUS</div>
            <div className="chips">
              {BLOCK_STATUSES.map(s => (
                <button
                  key={s}
                  className={`chip neutral ${statusFilter.has(s) ? 'on' : ''}`}
                  onClick={() => onToggleStatus(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="triage-sort">
            <ArrowDownUp size={12} />
            <span>SORT</span>
            <SortBtn k="score" label="SCORE" cur={sortKey} asc={sortAsc} onClick={setSort} />
            <SortBtn k="name" label="NAME" cur={sortKey} asc={sortAsc} onClick={setSort} />
            <SortBtn k="district" label="DISTRICT" cur={sortKey} asc={sortAsc} onClick={setSort} />
          </div>

          <div
            className="triage-list"
            ref={listRef}
            onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
          >
            {total > 0 ? (
              <div style={{ height: total * ROW_H, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${start * ROW_H}px)` }}>
                  {visible.map(b => {
                    const color = colorForBand(b.riskBand);
                    const isSel = selectedId === b.id;
                    return (
                      <div
                        key={b.id}
                        className={`row ${isSel ? 'selected' : ''}`}
                        style={{ height: ROW_H }}
                        onClick={() => onSelect(b.id)}
                        onMouseEnter={() => onHover(b.id)}
                        onMouseLeave={() => onHover(null)}
                      >
                        <div className="row-dot" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
                        <div className="row-main">
                          <div className="row-name">{b.name}</div>
                          <div className="row-meta">
                            <span>{b.district}</span>
                            {b.lastInspected && (
                              <>
                                <span className="dot-sep" />
                                <span className="row-inspected">
                                  Inspected {formatInspectedDate(b.lastInspected)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="row-score mono" style={{ color }}>{b.riskScore}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="row-empty">No blocks match the current filters.</div>
            )}
          </div>
        </div>
      </aside>

      {!open && (
        <button
          className="reveal-tab reveal-left glass"
          onClick={onToggle}
          title="Open triage queue"
        >
          <ListFilter size={13} />
          <span className="reveal-label">TRIAGE</span>
          <ChevronRight size={12} />
        </button>
      )}
    </>
  );
}

const HIST_BINS = 20;
const BIN_W = 5;
const SVG_W = 200;
const SVG_H = 44;
const PLOT_T = 4; // top padding inside SVG

// Catmull-Rom → cubic bezier control-point segments (returns "C …" commands).
function crSegments(pts: [number, number][]): string {
  return pts.slice(0, -1).map((_, i) => {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = (p1[0] + (p2[0] - p0[0]) / 6).toFixed(2);
    const cp1y = (p1[1] + (p2[1] - p0[1]) / 6).toFixed(2);
    const cp2x = (p2[0] - (p3[0] - p1[0]) / 6).toFixed(2);
    const cp2y = (p2[1] - (p3[1] - p1[1]) / 6).toFixed(2);
    return `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }).join(' ');
}

function ScoreHistogram({ allBlocks }: { allBlocks: Block[] }) {
  const counts = useMemo(() => {
    const arr = new Array(HIST_BINS).fill(0);
    for (const b of allBlocks) {
      if (b.riskScore == null) continue;
      arr[Math.min(HIST_BINS - 1, Math.floor(b.riskScore / BIN_W))]++;
    }
    return arr;
  }, [allBlocks]);

  const logCounts = counts.map(c => Math.log1p(c));
  const logMax = Math.max(1, ...logCounts);

  // One point per bin, x at bin center, y inverted (0 = top of SVG).
  const pts: [number, number][] = logCounts.map((lc, i) => [
    i * (SVG_W / HIST_BINS) + SVG_W / HIST_BINS / 2,
    SVG_H - PLOT_T - (lc / logMax) * (SVG_H - PLOT_T - 2),
  ]);

  const segs = crSegments(pts);
  const strokeD = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)} ${segs}`;
  const fillD   = `M 0 ${SVG_H} L ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)} ${segs} L ${SVG_W} ${SVG_H} Z`;

  return (
    <div className="score-histogram">
      <svg
        className="score-histogram-svg"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="hist-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={SVG_W} y2="0">
            <stop offset="0%"   stopColor="#3FB6B0" />
            <stop offset="40%"  stopColor="#F5B642" />
            <stop offset="70%"  stopColor="#F37735" />
            <stop offset="90%"  stopColor="#E84545" />
            <stop offset="100%" stopColor="#E84545" />
          </linearGradient>
        </defs>
        <path d={fillD}   fill="url(#hist-grad)" opacity={0.18} />
        <path d={strokeD} fill="none" stroke="url(#hist-grad)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <div className="score-histogram-axis">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

function SortBtn({
  k, label, cur, asc, onClick,
}: { k: SortKey; label: string; cur: SortKey; asc: boolean; onClick: (k: SortKey) => void }) {
  const active = cur === k;
  return (
    <button className={`sort-btn ${active ? 'on' : ''}`} onClick={() => onClick(k)}>
      {label}{active ? (asc ? ' ↑' : ' ↓') : ''}
    </button>
  );
}
