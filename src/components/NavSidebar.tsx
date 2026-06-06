import { useEffect, useSyncExternalStore } from 'react';
import { X, Check, Lock } from 'lucide-react';
import { VIEWS, type ViewKey, type ViewDef } from '../lib/views';
import { getDbStatus, subscribeDbStatus } from '../lib/dbStatus';

interface Props {
  open: boolean;
  view: ViewKey;
  onView: (v: ViewKey) => void;
  onClose: () => void;
}

export default function NavSidebar({ open, view, onView, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function pick(v: ViewDef) {
    if (v.comingSoon) return;
    // Close first; let the sidebar start its exit transition.
    // Switch the view on the next frame so the new overlay's
    // enter animation doesn't race the sidebar's exit on the
    // same composited regions. This is the difference between
    // a smooth handoff and a 1-frame jitter.
    onClose();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => onView(v.key));
    });
  }

  return (
    <>
      <div
        className={`nav-backdrop ${open ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`nav-sidebar ${open ? 'open' : ''}`}
        aria-hidden={!open}
        role="navigation"
      >
        <div className="nav-header">
          <div className="nav-brand">
            <div className="nav-brand-title">Menu</div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close menu">
            <X size={14} />
          </button>
        </div>

        <div className="nav-body">
          <div className="nav-section">
            <div className="nav-section-label">NAVIGATION</div>
            {VIEWS.filter(v => v.group === 'main').map(v => (
              <NavItem key={v.key} v={v} active={view === v.key} onClick={() => pick(v)} />
            ))}
          </div>

          <div className="nav-section">
            <div className="nav-section-label">SYSTEM</div>
            {VIEWS.filter(v => v.group === 'system').map(v => (
              <NavItem key={v.key} v={v} active={view === v.key} onClick={() => pick(v)} />
            ))}
          </div>
        </div>

        <DbStatusFoot />
      </aside>
    </>
  );
}

function DbStatusFoot() {
  const status = useSyncExternalStore(subscribeDbStatus, getDbStatus, getDbStatus);

  const label =
    status.state === 'connected' ? 'Database connected'
    : status.state === 'error'   ? 'Database unreachable'
    : 'Connecting to database…';

  const detail =
    status.state === 'connected' ? `Live data · ${status.latencyMs ?? '—'} ms`
    : status.state === 'error'   ? (status.error ?? 'Connection failed')
    : 'Checking connection…';

  return (
    <div className="nav-foot">
      <div className="nav-foot-row">
        <span className={`nav-dot db-${status.state}`} />
        <span>{label}</span>
      </div>
      <div className="nav-foot-row dim">{detail}</div>
    </div>
  );
}

function NavItem({ v, active, onClick }: { v: ViewDef; active: boolean; onClick: () => void }) {
  const Icon = v.icon;
  return (
    <button
      className={`nav-item ${active ? 'active' : ''} ${v.comingSoon ? 'disabled' : ''}`}
      onClick={onClick}
      disabled={v.comingSoon}
    >
      <Icon size={15} className="nav-item-icon" />
      <span className="nav-item-label">{v.label}</span>
      {active && <Check size={13} className="nav-item-flag" />}
      {v.comingSoon && <Lock size={11} className="nav-item-flag dim" />}
      <span className="nav-item-rail" aria-hidden />
    </button>
  );
}
