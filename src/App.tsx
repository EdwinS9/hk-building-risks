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
import LoginScreen from './components/auth/LoginScreen';
import { getBlocks, subscribe, getBlockById, resetBlocksCache } from './data/blocks';
import { getAuth, subscribeAuth, initAuth, signOut } from './lib/auth';
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [flyToken, setFlyToken] = useState(0);
  const [view, setView] = useState<ViewKey>('risk-monitor');
  const [triageOpen, setTriageOpen] = useState(true);
  const [navOpen, setNavOpen] = useState(false);

  const selected = useMemo(
    () => (selectedId ? getBlockById(selectedId) ?? null : null),
    [selectedId, blocks],
  );

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

  return (
    <div className="app-root">
      <div className="bg-grid" aria-hidden />
      <div className="bg-vignette" aria-hidden />
      <div className="bg-scanline" aria-hidden />

      {isMap && (
        <>
          <MapView
            blocks={blocks}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={handleSelect}
            onHover={setHoveredId}
            flyToken={flyToken}
          />
          <TriageQueue
            blocks={blocks}
            selectedId={selectedId}
            onSelect={handleSelect}
            onHover={setHoveredId}
            open={triageOpen}
            onToggle={() => setTriageOpen(o => !o)}
          />
          <BlockDetail block={selected} onClose={() => setSelectedId(null)} />
          <Legend triageOpen={triageOpen} />
        </>
      )}

      {view === 'inspected-log' && <InspectedLog blocks={blocks} onJump={jumpToBlock} />}
      {view === 'schedule'      && <ScheduleView blocks={blocks} onJump={jumpToBlock} />}
      {view === 'data'          && <DataView blocks={blocks} />}
      {view === 'settings'      && <SettingsView />}

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
