import { useState } from 'react';
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

  return (
    <div className="app-shell">
      <main className="app-content">
        {page === 'home' && <HomePage onNavigate={setPage} />}
        {page === 'report' && <ReportPage onNavigate={setPage} />}
        {page === 'settings' && <SettingsPage onNavigate={setPage} />}
      </main>
      <BottomNav current={page} onNavigate={setPage} />
    </div>
  );
}
