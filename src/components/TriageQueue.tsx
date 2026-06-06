import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ArrowDownUp, ChevronLeft, ChevronRight, ListFilter } from 'lucide-react';
import type { Block, BlockStatus } from '../data/blocks';
import { BLOCK_STATUSES } from '../data/blocks';
import { colorForBand, BAND_ORDER, type RiskBand } from '../lib/constants';

interface Props {
  blocks: Block[];        // already band/status filtered by the parent
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

export default function TriageQueue({
  blocks, totalCount, selectedId, onSelect, onHover, open, onToggle,
  bandFilter, statusFilter, onToggleBand, onToggleStatus,
}: Props) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortAsc, setSortAsc] = useState(false);

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
            <button className="collapse-btn" onClick={onToggle} title="Collapse panel">
              <ChevronLeft size={14} />
            </button>
          </div>

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
                            <span className="dot-sep" />
                            <span className={`row-status status-${b.status.replace(' ', '-').toLowerCase()}`}>
                              {b.status}
                            </span>
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
