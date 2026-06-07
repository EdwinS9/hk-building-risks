import { useEffect, useState, useSyncExternalStore, useMemo, useRef } from 'react';
import MapView from './components/MapView';
import TopBar from './components/TopBar';
import NavSidebar from './components/NavSidebar';
import TriageQueue from './components/TriageQueue';
import BlockDetail from './components/BlockDetail';
import RoutePanel from './components/RoutePanel';
import Legend from './components/Legend';
import InspectedLog from './components/views/InspectedLog';
import ResidentReports from './components/views/ResidentReports';
import SettingsView from './components/views/SettingsView';
import AccountView from './components/views/AccountView';
import LoginScreen from './components/auth/LoginScreen';
import AdminConsole from './components/views/AdminConsole';
import DataLoadingScreen from './components/DataLoadingScreen';
import { getBlocks, subscribe, getBlockById, resetBlocksCache, getLoadProgress, BLOCK_STATUSES } from './data/blocks';
import type { BlockStatus } from './data/blocks';
import { Flame, X } from 'lucide-react';
import { BAND_ORDER, LAST_INSPECTED_FACTOR, BUILDING_AGE_FACTOR } from './lib/constants';
import type { RiskBand } from './lib/constants';
import { getAuth, subscribeAuth, initAuth, signOut } from './lib/auth';
import { initDbStatus } from './lib/dbStatus';
import type { ViewKey } from './lib/views';
import { planRoute, attachRoadGeometry, type RouteResult } from './lib/routePlanner';

// Minimal path-based routing without a router dependency. The admin console
// lives at /data — reachable only by typing the URL (no nav button links to
// it) and still gated behind authentication.
function usePathname(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return path;
}

function isAdminPath(path: string): boolean {
  return path === '/data' || path === '/data/';
}

export default function App() {
  const auth = useSyncExternalStore(subscribeAuth, getAuth, getAuth);
  const path = usePathname();

  useEffect(() => {
    document.body.classList.add('app-body');
    void initAuth();
    return () => document.body.classList.remove('app-body');
  }, []);

  // Whenever the user signs out, blow away the cached data so the next
  // sign-in starts from a fresh fetch.
  useEffect(() => {
    if (auth.status === 'unauthenticated') resetBlocksCache();
  }, [auth.status]);

  if (auth.status === 'loading') {
    return <BootSplash />;
  }

  if (auth.status === 'unauthenticated') {
    return <LoginScreen />;
  }

  // Authenticated admin console — only served when the URL is /data.
  if (isAdminPath(path)) {
    return <AdminConsole />;
  }

  return <Dashboard onSignOut={() => void signOut()} />;
}

// Floating control shown while a single-score heatmap is active on the map.
// Explains the gradient and offers a one-click way back to the normal view.
function HeatmapBar({ factor, onClear }: { factor: string; onClear: () => void }) {
  const name =
    factor === LAST_INSPECTED_FACTOR ? 'Last inspected'
    : factor === BUILDING_AGE_FACTOR ? 'Building age'
    : factor;
  return (
    <div className="heatmap-bar glass">
      <Flame size={13} className="heatmap-bar-icon" />
      <div className="heatmap-bar-text">
        <span className="heatmap-bar-label">HEATMAP</span>
        <span className="heatmap-bar-factor">{name}</span>
      </div>
      <div className="heatmap-scale" aria-hidden>
        <span className="heatmap-scale-cap">low</span>
        <span className="heatmap-scale-grad" />
        <span className="heatmap-scale-cap">high</span>
      </div>
      <button className="heatmap-bar-close" onClick={onClear} title="Exit heatmap">
        <X size={13} />
      </button>
    </div>
  );
}

function BootSplash() {
  return (
    <div className="login-root" aria-busy="true">
      <div className="bg-grid" aria-hidden />
      <div className="bg-vignette" aria-hidden />
      <div className="boot-splash">
        <div className="boot-dot" />
        <span>Checking session…</span>
      </div>
    </div>
  );
}

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const blocks = useSyncExternalStore(subscribe, getBlocks, getBlocks);
  const progress = useSyncExternalStore(subscribe, getLoadProgress, getLoadProgress);

  // Start polling the database connection once we're inside the authenticated
  // dashboard so the sidebar + account page can show live status.
  useEffect(() => { initDbStatus(); }, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [flyToken, setFlyToken] = useState(0);
  const [view, setView] = useState<ViewKey>('risk-monitor');
  const [triageOpen, setTriageOpen] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  // When set, the map recolors every dot by this breakdown factor (a temporary
  // single-score heatmap). Toggled from the block detail breakdown rows.
  const [heatmapFactor, setHeatmapFactor] = useState<string | null>(null);
  // Building whose resident reports should open when navigating to that page.
  // The token forces the effect to re-run even if the same block is chosen.
  const [reportsFocusId, setReportsFocusId] = useState<string | null>(null);
  const [reportsFocusToken, setReportsFocusToken] = useState(0);

  const toggleHeatmap = (label: string) =>
    setHeatmapFactor(cur => (cur === label ? null : label));

  // Recommended inspection route (Orienteering Problem, solved client-side).
  const [routeOpen, setRouteOpen] = useState(false);
  const [route, setRoute] = useState<RouteResult | null>(null);
  // District the current route/empty-result was computed for (drives the panel's
  // "no candidates" message vs. the initial hint).
  const [routeDistrict, setRouteDistrict] = useState<string | null>(null);
  // Guards against a stale OSRM response overwriting a newer plan.
  const planSeqRef = useRef(0);

  const handlePlanRoute = (district: string) => {
    setRouteDistrict(district);
    const base = planRoute(blocks, district);
    setRoute(base); // show the straight-line plan instantly
    const seq = ++planSeqRef.current;
    if (base) {
      // Upgrade to a real-road path + real drive time in the background.
      void attachRoadGeometry(base).then(upgraded => {
        if (planSeqRef.current === seq) setRoute(upgraded);
      });
    }
  };

  // Band/status filters are lifted here so they drive BOTH the triage list
  // AND the map points. (Free-text search stays inside the list — filtering
  // the map per keystroke would re-cluster 60k points on every character.)
  const [bandFilter, setBandFilter] = useState<Set<RiskBand>>(() => new Set(BAND_ORDER));
  const [statusFilter, setStatusFilter] = useState<Set<BlockStatus>>(() => new Set(BLOCK_STATUSES));

  const toggleBand = (b: RiskBand) => setBandFilter(prev => {
    const next = new Set(prev);
    if (next.has(b)) next.delete(b); else next.add(b);
    return next;
  });
  const toggleStatus = (s: BlockStatus) => setStatusFilter(prev => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });

  const filteredBlocks = useMemo(
    () => blocks.filter(b => bandFilter.has(b.riskBand) && statusFilter.has(b.status)),
    [blocks, bandFilter, statusFilter],
  );

  const selected = useMemo(
    () => (selectedId ? getBlockById(selectedId) ?? null : null),
    [selectedId, blocks],
  );

  // Keep the selected block visible on the map even if the current filters
  // would otherwise hide it, so its highlight never vanishes mid-inspection.
  const mapBlocks = useMemo(() => {
    if (!selected) return filteredBlocks;
    return filteredBlocks.some(b => b.id === selected.id)
      ? filteredBlocks
      : [...filteredBlocks, selected];
  }, [filteredBlocks, selected]);

  function handleSelect(id: string | null) {
    setSelectedId(id);
    if (id !== null) setFlyToken(t => t + 1);
  }

  function handleView(v: ViewKey) {
    if (v === 'logout') {
      onSignOut();
      return;
    }
    setView(v);
    if (v !== 'risk-monitor') {
      setSelectedId(null);
      setHeatmapFactor(null); // leaving the map clears any active heatmap
    }
  }

  function jumpToBlock(id: string) {
    setView('risk-monitor');
    handleSelect(id);
  }

  // From the block detail: switch to Resident Reports with this building open.
  function showReportsForBlock(id: string) {
    setReportsFocusId(id);
    setReportsFocusToken(t => t + 1);
    setView('resident-reports');
    setSelectedId(null);
    setHeatmapFactor(null);
  }

  const isMap = view === 'risk-monitor';

  // Gate the whole dashboard behind a loading screen until ALL rows are in
  // (or an error surfaces). Avoids rendering a half-populated map/list.
  if (!progress.done || progress.error) {
    return <DataLoadingScreen progress={progress} />;
  }

  return (
    <div className="app-root">
      <div className="bg-grid" aria-hidden />
      <div className="bg-vignette" aria-hidden />
      <div className="bg-scanline" aria-hidden />

      {isMap && (
        <>
          <MapView
            blocks={mapBlocks}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={handleSelect}
            onHover={setHoveredId}
            flyToken={flyToken}
            heatmapFactor={heatmapFactor}
            route={routeOpen ? route : null}
            routeOpen={routeOpen}
            onToggleRoute={() => setRouteOpen(o => !o)}
          />
          <TriageQueue
            blocks={filteredBlocks}
            allBlocks={blocks}
            totalCount={blocks.length}
            selectedId={selectedId}
            onSelect={handleSelect}
            onHover={setHoveredId}
            open={triageOpen}
            onToggle={() => setTriageOpen(o => !o)}
            bandFilter={bandFilter}
            onToggleBand={toggleBand}
          />
          <BlockDetail
            block={selected}
            onClose={() => setSelectedId(null)}
            heatmapFactor={heatmapFactor}
            onToggleHeatmap={toggleHeatmap}
            onShowReports={showReportsForBlock}
          />
          <RoutePanel
            open={routeOpen}
            blocks={blocks}
            route={route}
            plannedDistrict={routeDistrict}
            onClose={() => setRouteOpen(false)}
            onPlan={handlePlanRoute}
            onSelectStop={handleSelect}
          />
          <Legend triageOpen={triageOpen} />
          {heatmapFactor && (
            <HeatmapBar
              factor={heatmapFactor}
              onClear={() => setHeatmapFactor(null)}
            />
          )}
        </>
      )}

      {view === 'inspected-log' && <InspectedLog blocks={blocks} onJump={jumpToBlock} />}
      {view === 'resident-reports' && (
        <ResidentReports
          blocks={blocks}
          onJump={jumpToBlock}
          focusBlockId={reportsFocusId}
          focusToken={reportsFocusToken}
        />
      )}
      {view === 'settings'      && <SettingsView />}
      {view === 'account'       && <AccountView onSignOut={onSignOut} />}

      <TopBar
        blocks={blocks}
        navOpen={navOpen}
        onMenuToggle={() => setNavOpen(o => !o)}
      />

      <NavSidebar
        open={navOpen}
        view={view}
        onView={handleView}
        onClose={() => setNavOpen(false)}
      />
    </div>
  );
}
