import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  MessageSquareWarning,
  Search,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Image as ImageIcon,
  Check,
  CheckCheck,
  CircleCheck,
  RotateCcw,
  MapPin,
  X,
  Building2,
  Inbox,
  SlidersHorizontal,
  Archive,
  ArchiveRestore,
} from 'lucide-react';
import type { Block } from '../../data/blocks';
import {
  getReports,
  getReportsStatus,
  subscribeReports,
  loadReports,
  markReportRead,
  markReportSolved,
  markReportArchived,
  type ResidentReport,
} from '../../data/reports';
import { colorForBand, relativeTime } from '../../lib/constants';
import MapView from '../MapView';

interface Props {
  blocks: Block[];
  /** Jump to this building on the main Risk Monitor map. */
  onJump: (id: string) => void;
  /** When set (with a changing token), open this building's reports. */
  focusBlockId?: string | null;
  focusToken?: number;
}

// Triage state of a report, derived from its read_at / solved_at stamps.
type StatusFilter = 'new' | 'read' | 'solved';
const STATUS_DEFS: { key: StatusFilter; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'read', label: 'Read' },
  { key: 'solved', label: 'Solved' },
];

type SortKey = 'recent' | 'oldest' | 'risk';

function statusOf(r: ResidentReport): StatusFilter {
  if (r.solvedAt) return 'solved';
  if (r.readAt) return 'read';
  return 'new';
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function ResidentReports({ blocks, onJump, focusBlockId, focusToken }: Props) {
  const reports = useSyncExternalStore(subscribeReports, getReports, getReports);
  const status = useSyncExternalStore(subscribeReports, getReportsStatus, getReportsStatus);
  const loading = status.loading && reports.length === 0;
  const error = status.error;
  const [busyId, setBusyId] = useState<string | null>(null);

  // Filters / search.
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<StatusFilter>>(
    () => new Set<StatusFilter>(['new', 'read', 'solved']),
  );
  const [districtFilter, setDistrictFilter] = useState<string>('all');
  const [photoOnly, setPhotoOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Archive view: shows ONLY archived reports; the default view hides them.
  const [archivedView, setArchivedView] = useState(false);

  // Draggable split between the list (left) and the map (right).
  const splitRef = useRef<HTMLDivElement>(null);
  const [listWidth, setListWidth] = useState(440);
  const draggingRef = useRef(false);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const w = e.clientX - rect.left;
      const min = 300;
      const max = rect.width - 320;
      setListWidth(Math.max(min, Math.min(max, w)));
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Selection: a building filter (one building's reports) and the active report.
  const [buildingFilter, setBuildingFilter] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null); // lightbox
  const [flyToken, setFlyToken] = useState(0);

  // Fast block lookup for enriching reports with building metadata.
  const blockById = useMemo(() => {
    const m = new Map<string, Block>();
    for (const b of blocks) m.set(b.id, b);
    return m;
  }, [blocks]);

  // Open a specific building's reports when navigated here from the block
  // detail. Reset list filters so the building's reports are guaranteed visible.
  useEffect(() => {
    if (!focusBlockId) return;
    setArchivedView(false);
    setStatusFilter(new Set<StatusFilter>(['new', 'read', 'solved']));
    setQuery('');
    setPhotoOnly(false);
    setDistrictFilter('all');
    setBuildingFilter(focusBlockId);
    setSelectedReportId(null);
    setFiltersOpen(false);
    setFlyToken(t => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBlockId, focusToken]);

  // Districts present among reports (for the district dropdown).
  const districts = useMemo(() => {
    const set = new Set<string>();
    for (const r of reports) {
      const b = blockById.get(r.blockId);
      if (b?.district) set.add(b.district);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [reports, blockById]);

  // Reports passing search + status + district + photo filters (NOT the
  // building selection — that only narrows the list, while the map keeps
  // showing every building in this set).
  const searchFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter(r => {
      // Archive view shows only archived reports; default view hides them.
      if (archivedView ? !r.archivedAt : !!r.archivedAt) return false;
      if (!statusFilter.has(statusOf(r))) return false;
      if (photoOnly && !r.photoUrl) return false;
      const b = blockById.get(r.blockId);
      if (districtFilter !== 'all' && b?.district !== districtFilter) return false;
      if (q) {
        const hay = `${r.description} ${b?.name ?? ''} ${b?.district ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reports, query, statusFilter, photoOnly, districtFilter, blockById, archivedView]);

  // Buildings (deduped) that have at least one matching report — these are the
  // only points the map draws.
  const reportBlocks = useMemo(() => {
    const seen = new Set<string>();
    const out: Block[] = [];
    for (const r of searchFiltered) {
      if (seen.has(r.blockId)) continue;
      const b = blockById.get(r.blockId);
      if (!b) continue;
      seen.add(r.blockId);
      out.push(b);
    }
    return out;
  }, [searchFiltered, blockById]);

  // Count of open (unsolved, non-archived) reports per building — list badges.
  const openCountByBlock = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reports) {
      if (r.solvedAt || r.archivedAt) continue;
      m.set(r.blockId, (m.get(r.blockId) ?? 0) + 1);
    }
    return m;
  }, [reports]);

  // The list applies the building filter on top of the search filter, then sorts.
  const listReports = useMemo(() => {
    const base = buildingFilter
      ? searchFiltered.filter(r => r.blockId === buildingFilter)
      : searchFiltered;
    const arr = base.slice();
    arr.sort((a, b) => {
      if (sortKey === 'recent') return b.submittedAt.localeCompare(a.submittedAt);
      if (sortKey === 'oldest') return a.submittedAt.localeCompare(b.submittedAt);
      const ra = blockById.get(a.blockId)?.riskScore ?? 0;
      const rb = blockById.get(b.blockId)?.riskScore ?? 0;
      return rb - ra;
    });
    return arr;
  }, [searchFiltered, buildingFilter, sortKey, blockById]);

  // Headline counts over the ACTIVE (non-archived) set, plus the archive size.
  const stats = useMemo(() => {
    let neu = 0, solved = 0, active = 0, archived = 0;
    for (const r of reports) {
      if (r.archivedAt) { archived++; continue; }
      active++;
      if (r.solvedAt) solved++;
      else if (!r.readAt) neu++;
    }
    return { total: active, neu, open: active - solved, solved, archived };
  }, [reports]);

  // If the selected building drops out of the current filter set, clear it.
  useEffect(() => {
    if (buildingFilter && !reportBlocks.some(b => b.id === buildingFilter)) {
      setBuildingFilter(null);
    }
  }, [reportBlocks, buildingFilter]);

  // Map highlight follows the building filter, else the selected report.
  const selectedReport = selectedReportId
    ? reports.find(r => r.id === selectedReportId) ?? null
    : null;
  const mapSelectedId = buildingFilter ?? selectedReport?.blockId ?? null;

  function toggleStatus(s: StatusFilter) {
    setStatusFilter(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }

  // Map point click → filter the list to that building.
  function handleMapSelect(id: string | null) {
    setBuildingFilter(id);
    setSelectedReportId(null);
    if (id) setFlyToken(t => t + 1);
  }

  // Report row click → highlight + fly to its building (without filtering).
  function handleReportClick(r: ResidentReport) {
    setSelectedReportId(cur => (cur === r.id ? null : r.id));
    setFlyToken(t => t + 1);
  }

  async function onToggleRead(r: ResidentReport) {
    setBusyId(r.id);
    try { await markReportRead(r.id, !r.readAt); }
    catch { /* store reverts the optimistic patch */ }
    finally { setBusyId(null); }
  }

  async function onToggleSolved(r: ResidentReport) {
    setBusyId(r.id);
    try { await markReportSolved(r.id, !r.solvedAt); }
    catch { /* store reverts the optimistic patch */ }
    finally { setBusyId(null); }
  }

  async function onToggleArchived(r: ResidentReport) {
    setBusyId(r.id);
    // Archiving removes the row from the current (non-archive) list, so drop
    // any expanded selection on it.
    if (selectedReportId === r.id) setSelectedReportId(null);
    try { await markReportArchived(r.id, !r.archivedAt); }
    catch { /* store reverts the optimistic patch */ }
    finally { setBusyId(null); }
  }

  function toggleArchivedView() {
    setArchivedView(v => !v);
    setBuildingFilter(null);
    setSelectedReportId(null);
  }

  const filterBuilding = buildingFilter ? blockById.get(buildingFilter) ?? null : null;

  // How many filters differ from their defaults (drives the button badge).
  const activeFilterCount =
    (statusFilter.size < STATUS_DEFS.length ? 1 : 0) +
    (photoOnly ? 1 : 0) +
    (districtFilter !== 'all' ? 1 : 0) +
    (sortKey !== 'recent' ? 1 : 0);

  function resetFilters() {
    setStatusFilter(new Set<StatusFilter>(['new', 'read', 'solved']));
    setPhotoOnly(false);
    setDistrictFilter('all');
    setSortKey('recent');
  }

  return (
    <main className="page reports-page">
      <header className="page-header">
        <div className="page-title">
          {archivedView ? <Archive size={16} /> : <MessageSquareWarning size={16} />}
          <h1>{archivedView ? 'Archived Reports' : 'Resident Reports'}</h1>
          <span className="page-count mono">{archivedView ? stats.archived : stats.total}</span>
          <div className="page-title-actions">
            <button
              className={`action-btn tiny reports-archive-toggle ${archivedView ? 'on' : ''}`}
              onClick={toggleArchivedView}
              title={archivedView ? 'Back to active reports' : 'View archived reports'}
            >
              {archivedView ? <ArchiveRestore size={11} /> : <Archive size={11} />}
              {archivedView ? 'Active' : 'Archive'}
              {!archivedView && stats.archived > 0 && (
                <span className="archive-count mono">{stats.archived}</span>
              )}
            </button>
            <button
              className="action-btn tiny"
              onClick={() => void loadReports(true)}
              disabled={status.loading}
              title="Reload reports"
            >
              {status.loading ? <Loader2 size={11} className="spin" /> : <RefreshCw size={11} />}
              Refresh
            </button>
          </div>
        </div>
        <div className="page-sub">
          {archivedView
            ? 'Archived reports are hidden from the active list. Restore one to bring it back.'
            : <>Issues submitted by residents. Mark a report <em>read</em> once seen, and{' '}
                <em>solved</em> when the problem no longer exists.</>}
        </div>
        {!archivedView && (
          <div className="reports-stats">
            <span className="rstat"><b className="mono">{stats.neu}</b> new</span>
            <span className="dot-sep" />
            <span className="rstat"><b className="mono">{stats.open}</b> open</span>
            <span className="dot-sep" />
            <span className="rstat dim"><b className="mono">{stats.solved}</b> solved</span>
          </div>
        )}
      </header>

      <section className="page-body reports-split" ref={splitRef}>
        {/* ── Left: list + filters ─────────────────────────────────────── */}
        <div className="reports-list-col" style={{ width: listWidth }}>
          <div className="reports-toolbar">
            <div className="reports-search-row">
              <div className="triage-search reports-search">
                <Search size={13} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search description, building or district…"
                />
                {query && (
                  <button className="search-clear" onClick={() => setQuery('')} title="Clear">
                    <X size={12} />
                  </button>
                )}
              </div>
              <button
                className={`filter-toggle-btn ${filtersOpen ? 'open' : ''} ${activeFilterCount ? 'has-active' : ''}`}
                onClick={() => setFiltersOpen(v => !v)}
                title="Filters & sort"
              >
                <SlidersHorizontal size={14} />
                {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
              </button>
            </div>

            {filtersOpen && (
              <div className="reports-filter-panel">
                <div className="filter-panel-group">
                  <div className="filter-label">STATUS</div>
                  <div className="chips">
                    {STATUS_DEFS.map(s => (
                      <button
                        key={s.key}
                        className={`chip neutral ${statusFilter.has(s.key) ? 'on' : ''}`}
                        onClick={() => toggleStatus(s.key)}
                      >
                        {s.label}
                      </button>
                    ))}
                    <button
                      className={`chip neutral ${photoOnly ? 'on' : ''}`}
                      onClick={() => setPhotoOnly(v => !v)}
                      title="Only reports that include a photo"
                    >
                      <ImageIcon size={11} /> Photo
                    </button>
                  </div>
                </div>

                <div className="filter-panel-group">
                  <div className="filter-label">DISTRICT &amp; SORT</div>
                  <div className="reports-filter-row">
                    <select
                      className="reports-select"
                      value={districtFilter}
                      onChange={e => setDistrictFilter(e.target.value)}
                    >
                      <option value="all">All districts</option>
                      {districts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select
                      className="reports-select"
                      value={sortKey}
                      onChange={e => setSortKey(e.target.value as SortKey)}
                    >
                      <option value="recent">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="risk">Highest risk</option>
                    </select>
                  </div>
                </div>

                {activeFilterCount > 0 && (
                  <button className="filter-reset-btn" onClick={resetFilters}>
                    <RotateCcw size={11} /> Reset filters
                  </button>
                )}
              </div>
            )}

            {filterBuilding && (
              <div className="building-filter-bar">
                <Building2 size={12} />
                <span className="bf-name">{filterBuilding.name}</span>
                <button
                  className="bf-clear"
                  onClick={() => setBuildingFilter(null)}
                  title="Show all buildings"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            <div className="reports-count-line">
              {listReports.length} {listReports.length === 1 ? 'report' : 'reports'}
              {!buildingFilter && reportBlocks.length > 0 && (
                <> · {reportBlocks.length} {reportBlocks.length === 1 ? 'building' : 'buildings'}</>
              )}
            </div>
          </div>

          <div className="reports-list">
            {loading ? (
              <div className="reports-empty">
                <Loader2 size={22} className="spin" />
                <span>Loading reports…</span>
              </div>
            ) : error ? (
              <div className="reports-empty error">
                <AlertTriangle size={22} />
                <span>{error}</span>
                <button className="action-btn tiny" onClick={() => void loadReports(true)}>Retry</button>
              </div>
            ) : listReports.length === 0 ? (
              <div className="reports-empty">
                {archivedView ? <Archive size={26} /> : <Inbox size={26} />}
                <span>
                  {archivedView
                    ? (stats.archived === 0 ? 'No archived reports.' : 'No archived reports match these filters.')
                    : (stats.total === 0 ? 'No resident reports yet.' : 'No reports match these filters.')}
                </span>
              </div>
            ) : (
              listReports.map(r => {
                const b = blockById.get(r.blockId);
                const color = b ? colorForBand(b.riskBand) : '#888';
                const st = statusOf(r);
                const isSel = selectedReportId === r.id;
                const open = openCountByBlock.get(r.blockId) ?? 0;
                return (
                  <article
                    key={r.id}
                    className={`report-card ${isSel ? 'selected' : ''} st-${st}`}
                    onClick={() => handleReportClick(r)}
                  >
                    <div className="report-card-bar" style={{ background: color }} />
                    <div className="report-card-body">
                      <div className="report-card-top">
                        <span className="report-dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                        <span className="report-building" title={b?.name}>
                          {b?.name ?? 'Unknown building'}
                        </span>
                        <StatusBadge status={st} />
                      </div>

                      <p className="report-desc">{r.description}</p>

                      <div className="report-meta">
                        <span>{b?.district ?? '—'}</span>
                        <span className="dot-sep" />
                        <span className="mono" title={formatDateTime(r.submittedAt)}>
                          {relativeTime(r.submittedAt)}
                        </span>
                        {r.photoUrl && (
                          <>
                            <span className="dot-sep" />
                            <span className="report-has-photo"><ImageIcon size={11} /> photo</span>
                          </>
                        )}
                        {open > 1 && (
                          <>
                            <span className="dot-sep" />
                            <span className="report-open-count">{open} open here</span>
                          </>
                        )}
                      </div>

                      {isSel && (
                        <div className="report-detail" onClick={e => e.stopPropagation()}>
                          {r.photoUrl && (
                            <button className="report-photo" onClick={() => setPhotoUrl(r.photoUrl)}>
                              <img src={r.photoUrl} alt="Reported issue" loading="lazy" />
                            </button>
                          )}
                          <div className="report-detail-meta mono">
                            Submitted {formatDateTime(r.submittedAt)}
                            {r.readAt && <> · Read {formatDateTime(r.readAt)}</>}
                            {r.solvedAt && <> · Solved {formatDateTime(r.solvedAt)}</>}
                            {r.archivedAt && <> · Archived {formatDateTime(r.archivedAt)}</>}
                          </div>
                          <div className="report-actions">
                            {!r.archivedAt && (
                              <>
                                <button
                                  className={`action-btn tiny ${r.readAt ? '' : 'primary'}`}
                                  onClick={() => void onToggleRead(r)}
                                  disabled={busyId === r.id}
                                >
                                  {busyId === r.id ? <Loader2 size={11} className="spin" />
                                    : r.readAt ? <RotateCcw size={11} /> : <Check size={11} />}
                                  {r.readAt ? 'Mark unread' : 'Mark read'}
                                </button>
                                <button
                                  className={`action-btn tiny ${r.solvedAt ? 'solved-on' : 'solve'}`}
                                  onClick={() => void onToggleSolved(r)}
                                  disabled={busyId === r.id}
                                >
                                  {r.solvedAt ? <RotateCcw size={11} /> : <CircleCheck size={11} />}
                                  {r.solvedAt ? 'Reopen' : 'Mark solved'}
                                </button>
                              </>
                            )}
                            <button
                              className="action-btn tiny"
                              onClick={() => void onToggleArchived(r)}
                              disabled={busyId === r.id}
                              title={r.archivedAt ? 'Restore to active reports' : 'Archive this report'}
                            >
                              {r.archivedAt ? <ArchiveRestore size={11} /> : <Archive size={11} />}
                              {r.archivedAt ? 'Unarchive' : 'Archive'}
                            </button>
                            {b && (
                              <button
                                className="action-btn tiny"
                                onClick={() => onJump(b.id)}
                                title="Open this building on the Risk Monitor"
                              >
                                <MapPin size={11} /> Risk Monitor
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        {/* Draggable divider to resize the two panes. */}
        <div
          className="reports-resizer"
          onMouseDown={startDrag}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize"
        >
          <span className="reports-resizer-grip" />
        </div>

        {/* ── Right: map of buildings with reports ──────────────────────── */}
        <div className="reports-map-col">
          <MapView
            blocks={reportBlocks}
            selectedId={mapSelectedId}
            hoveredId={null}
            onSelect={handleMapSelect}
            onHover={() => {}}
            flyToken={flyToken}
          />
          <div className="reports-map-hint glass">
            <MapPin size={12} />
            Click a building to filter its reports
          </div>
        </div>
      </section>

      {photoUrl && (
        <div className="report-lightbox" onClick={() => setPhotoUrl(null)}>
          <button className="report-lightbox-close" onClick={() => setPhotoUrl(null)}>
            <X size={18} />
          </button>
          <img src={photoUrl} alt="Reported issue" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: StatusFilter }) {
  if (status === 'solved') {
    return <span className="status-badge solved"><CheckCheck size={10} /> Solved</span>;
  }
  if (status === 'read') {
    return <span className="status-badge read"><Check size={10} /> Read</span>;
  }
  return <span className="status-badge new">New</span>;
}
