import { useEffect, useState, useSyncExternalStore, useMemo } from 'react';
import MapView from './components/MapView';
import TopBar from './components/TopBar';
import NavSidebar from './components/NavSidebar';
import TriageQueue from './components/TriageQueue';
import BlockDetail from './components/BlockDetail';
import Legend from './components/Legend';
import InspectedLog from './components/views/InspectedLog';
import ScheduleView from './components/views/ScheduleView';
import DataView from './components/views/DataView';
import SettingsView from './components/views/SettingsView';
import AccountView from './components/views/AccountView';
import LoginScreen from './components/auth/LoginScreen';
import DataLoadingScreen from './components/DataLoadingScreen';
import { getBlocks, subscribe, getBlockById, resetBlocksCache, getLoadProgress, BLOCK_STATUSES } from './data/blocks';
import type { BlockStatus } from './data/blocks';
import { BAND_ORDER } from './lib/constants';
import type { RiskBand } from './lib/constants';
import { getAuth, subscribeAuth, initAuth, signOut } from './lib/auth';
import { initDbStatus } from './lib/dbStatus';
import type { ViewKey } from './lib/views';

export default function App() {
  const auth = useSyncExternalStore(subscribeAuth, getAuth, getAuth);

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

  return <Dashboard onSignOut={() => void signOut()} />;
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
    }
  }

  function jumpToBlock(id: string) {
    setView('risk-monitor');
    handleSelect(id);
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
          />
          <TriageQueue
            blocks={filteredBlocks}
            totalCount={blocks.length}
            selectedId={selectedId}
            onSelect={handleSelect}
            onHover={setHoveredId}
            open={triageOpen}
            onToggle={() => setTriageOpen(o => !o)}
            bandFilter={bandFilter}
            statusFilter={statusFilter}
            onToggleBand={toggleBand}
            onToggleStatus={toggleStatus}
          />
          <BlockDetail block={selected} onClose={() => setSelectedId(null)} />
          <Legend triageOpen={triageOpen} />
        </>
      )}

      {view === 'inspected-log' && <InspectedLog blocks={blocks} onJump={jumpToBlock} />}
      {view === 'schedule'      && <ScheduleView blocks={blocks} onJump={jumpToBlock} />}
      {view === 'data'          && <DataView blocks={blocks} />}
      {view === 'settings'      && <SettingsView />}
      {view === 'account'       && <AccountView onSignOut={onSignOut} />}

      <TopBar
        blocks={blocks}
        view={view}
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
