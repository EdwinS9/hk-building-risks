import { Megaphone, Settings } from 'lucide-react';
import type { Page } from '../types';
import { getHomeBuilding } from '../lib/storage';
import { BuildingDoodle, MegaphoneDoodle, ShieldDoodle } from '../components/Illustrations';

interface Props {
  onNavigate: (page: Page) => void;
}

export default function HomePage({ onNavigate }: Props) {
  const home = getHomeBuilding();

  if (!home) {
    return (
      <div className="page center-content">
        <BuildingDoodle size={150} />
        <h2>Let's find your home</h2>
        <p className="muted">
          Pick the building you live in so your reports go to the right place.
        </p>
        <button className="btn-primary" onClick={() => onNavigate('settings')}>
          <Settings size={18} />
          Choose your building
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="hero">
        <BuildingDoodle size={120} className="hero-illustration" />
        <span className="eyebrow">Your building</span>
        <h1 className="hero-address">{home.address}</h1>
        <p className="hero-district">{home.district}</p>
      </div>

      <div className="action-card">
        <MegaphoneDoodle size={92} className="doodle-corner" />
        <h2>See something wrong?</h2>
        <p>
          Spotted a structural crack, water damage, or a dangerous corridor?
          Speak up — it takes less than a minute.
        </p>
        <button className="btn-primary" onClick={() => onNavigate('report')}>
          <Megaphone size={18} />
          Submit a Report
        </button>
      </div>

      <p className="home-footnote">
        <ShieldDoodle size={34} />
        Reports are reviewed by the Hong Kong Buildings Department. No personal
        information is collected.
      </p>
    </div>
  );
}
