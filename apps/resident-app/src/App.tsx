import { useState } from 'react';
import { Settings, ChevronLeft, Building2 } from 'lucide-react';
import type { Page } from './types';
import { getHomeBuilding } from './lib/storage';
import BottomNav from './components/BottomNav';
import HomePage from './pages/HomePage';
import ReportPage from './pages/ReportPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const [page, setPage] = useState<Page>(() =>
    getHomeBuilding() ? 'home' : 'settings'
  );

  const isSettings = page === 'settings';

  return (
    <div className="app-shell">
      <header className="app-header">
        {isSettings ? (
          <button className="back-btn" onClick={() => setPage('home')}>
            <ChevronLeft size={20} />
            Back
          </button>
        ) : (
          <div className="brand">
            <span className="brand-mark">
              <Building2 size={20} />
            </span>
            <span>
              SafeBlock
              <small>HK Building Reporter</small>
            </span>
          </div>
        )}

        {!isSettings && (
          <button
            className="gear-btn"
            onClick={() => setPage('settings')}
            aria-label="Settings"
          >
            <Settings size={20} />
          </button>
        )}
      </header>

      <main className="app-content">
        {page === 'home' && <HomePage onNavigate={setPage} />}
        {page === 'report' && <ReportPage onNavigate={setPage} />}
        {page === 'settings' && <SettingsPage onNavigate={setPage} />}
      </main>

      {!isSettings && <BottomNav current={page} onNavigate={setPage} />}
    </div>
  );
}
