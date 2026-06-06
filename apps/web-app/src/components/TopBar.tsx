import { AlertTriangle, ShieldAlert, ClipboardList, Menu } from 'lucide-react';
import type { Block } from '../data/blocks';

interface Props {
  blocks: Block[];
  navOpen: boolean;
  onMenuToggle: () => void;
}

export default function TopBar({ blocks, navOpen, onMenuToggle }: Props) {
  const total = blocks.length;
  const critical = blocks.filter(b => b.riskBand === 'Critical').length;
  const high = blocks.filter(b => b.riskBand === 'High').length;

  return (
    <header className="topbar glass">
      <div className="topbar-left">
        <button
          className={`menu-trigger ${navOpen ? 'open' : ''}`}
          onClick={onMenuToggle}
          aria-expanded={navOpen}
          aria-haspopup="menu"
          title="Menu"
        >
          <Menu size={16} />
        </button>

        <div className="brand-text">
          <div className="brand-title">Hong Kong Building Risk Monitor</div>
        </div>
      </div>

      <div className="topbar-stats">
        <Stat icon={<ClipboardList size={12} />} label="Blocks"   value={total}    tone="neutral"  />
        <Stat icon={<ShieldAlert size={12} />}   label="Critical" value={critical} tone="critical" share={total ? critical / total : 0} />
        <Stat icon={<AlertTriangle size={12} />} label="High"     value={high}     tone="high"     share={total ? high / total : 0} />
      </div>
    </header>
  );
}

type StatTone = 'neutral' | 'critical' | 'high' | 'awaiting';

function Stat({
  icon, label, value, tone, share,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: StatTone;
  share?: number;
}) {
  const isActive = value > 0;
  const pct = share != null ? Math.round(share * 100) : null;
  return (
    <div className={`stat stat-${tone} ${isActive ? 'is-active' : 'is-zero'}`}>
      <div className="stat-head">
        <span className="stat-icon">{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-body">
        <span className="stat-value mono">{value}</span>
        {pct != null && isActive && (
          <span className="stat-share mono">{pct}%</span>
        )}
      </div>
      <span className="stat-rail" aria-hidden />
    </div>
  );
}
