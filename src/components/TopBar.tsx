import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ShieldAlert, ClipboardList, Menu } from 'lucide-react';
import type { Block } from '../data/blocks';
import { VIEWS, type ViewKey } from '../lib/views';

interface Props {
  blocks: Block[];
  view: ViewKey;
  navOpen: boolean;
  onMenuToggle: () => void;
}

export default function TopBar({ blocks, view, navOpen, onMenuToggle }: Props) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const total = blocks.length;
  const critical = blocks.filter(b => b.riskBand === 'Critical').length;
  const high = blocks.filter(b => b.riskBand === 'High').length;
  const awaiting = blocks.filter(b => b.status !== 'Inspected').length;

  const clock = now.toISOString().slice(11, 19) + ' UTC';
  const current = VIEWS.find(v => v.key === view) ?? VIEWS[0];

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

        <div className="view-chip">
          <current.icon size={11} />
          <span>{current.label.toUpperCase()}</span>
        </div>
      </div>

      <div className="topbar-stats">
        <Stat icon={<ClipboardList size={12} />} label="Blocks"   value={total}    tone="neutral"  />
        <Stat icon={<ShieldAlert size={12} />}   label="Critical" value={critical} tone="critical" share={total ? critical / total : 0} />
        <Stat icon={<AlertTriangle size={12} />} label="High"     value={high}     tone="high"     share={total ? high / total : 0} />
        <Stat icon={<Activity size={12} />}      label="Awaiting" value={awaiting} tone="awaiting" share={total ? awaiting / total : 0} />
      </div>

      <div className="topbar-right">
        <div className="clock">{clock}</div>
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
