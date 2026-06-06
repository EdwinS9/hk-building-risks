import { Building2, AlertTriangle, Settings } from 'lucide-react';
import type { Page } from '../types';
import { getHomeBuilding } from '../lib/storage';

interface Props {
  onNavigate: (page: Page) => void;
}

export default function HomePage({ onNavigate }: Props) {
  const home = getHomeBuilding();

  if (!home) {
    return (
      <div className="page center-content">
        <Building2 size={56} className="muted-icon" />
        <h2>No building selected</h2>
        <p className="muted">Go to Settings to choose your home building.</p>
        <button className="btn-primary" onClick={() => onNavigate('settings')}>
          <Settings size={18} />
          Open Settings
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="home-header">
        <Building2 size={32} />
        <div>
          <p className="label">Your building</p>
          <h1 className="building-address">{home.address}</h1>
          <p className="district">{home.district}</p>
        </div>
      </div>

      <div className="home-card">
        <h2>See something wrong?</h2>
        <p>
          Report structural cracks, water damage, dangerous corridors, or any
          other issue in your building.
        </p>
        <button className="btn-primary" onClick={() => onNavigate('report')}>
          <AlertTriangle size={18} />
          Submit a Report
        </button>
      </div>

      <p className="home-footnote">
        Reports are reviewed by the Hong Kong Building Department. No personal
        information is collected.
      </p>
    </div>
  );
}
