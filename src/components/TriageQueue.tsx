import { useMemo, useState } from 'react';
import { Search, ArrowDownUp, Clock4, ChevronLeft, ChevronRight, ListFilter } from 'lucide-react';
import type { Block, BlockStatus } from '../data/blocks';
import { colorForBand, isStale, type RiskBand } from '../lib/constants';

interface Props {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  open: boolean;
  onToggle: () => void;
}

type SortKey = 'score' | 'name' | 'district';

const BANDS: RiskBand[] = ['Critical', 'High', 'Moderate', 'Low'];
const STATUSES: BlockStatus[] = ['Not scheduled', 'Scheduled', 'Inspected'];

export default function TriageQueue({
  blocks, selectedId, onSelect, onHover, open, onToggle,
}: Props) {
  const [query, setQuery] = useState('');
  const [bandFilter, setBandFilter] = useState<Set<RiskBand>>(new Set(BANDS));
  const [statusFilter, setStatusFilter] = useState<Set<BlockStatus>>(new Set(STATUSES));
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortAsc, setSortAsc] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = blocks.filter(b => {
      if (!bandFilter.has(b.riskBand)) return false;
      if (!statusFilter.has(b.status)) return false;
      if (q && !(b.name.toLowerCase().includes(q) || b.district.toLowerCase().includes(q))) return false;
      return true;
    });
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'score') cmp = a.riskScore - b.riskScore;
      else if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else cmp = a.district.localeCompare(b.district);
      return sortAsc ? cmp : -cmp;
    });
    return filtered;
  }, [blocks, query, bandFilter, statusFilter, sortKey, sortAsc]);

  function toggleBand(b: RiskBand) {
    setBandFilter(prev => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b); else next.add(b);
      return next;
    });
  }
  function toggleStatus(s: BlockStatus) {
    setStatusFilter(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }
  function setSort(k: SortKey) {
    if (k === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(k); setSortAsc(k !== 'score'); }
  }

  return (
    <>
      <aside className={`triage glass side-panel side-left ${open ? 'open' : 'collapsed'}`}>
        <div className="panel-inner">
          <div className="triage-header">
            <div>
              <div className="panel-label">TRIAGE QUEUE</div>
              <div className="panel-sub">{rows.length} / {blocks.length} blocks</div>
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
              {BANDS.map(b => (
                <button
                  key={b}
                  className={`chip ${bandFilter.has(b) ? 'on' : ''}`}
                  onClick={() => toggleBand(b)}
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
              {STATUSES.map(s => (
                <button
                  key={s}
                  className={`chip neutral ${statusFilter.has(s) ? 'on' : ''}`}
                  onClick={() => toggleStatus(s)}
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

          <div className="triage-list">
            {rows.map(b => {
              const color = colorForBand(b.riskBand);
              const stale = isStale(b.scoreUpdatedAt);
              const isSel = selectedId === b.id;
              return (
                <div
                  key={b.id}
                  className={`row ${isSel ? 'selected' : ''}`}
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
                      {stale && (
                        <>
                          <span className="dot-sep" />
                          <span className="row-stale"><Clock4 size={10} /> STALE</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="row-score mono" style={{ color }}>{b.riskScore}</div>
                </div>
              );
            })}
            {rows.length === 0 && (
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
