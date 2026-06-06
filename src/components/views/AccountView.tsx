import { useSyncExternalStore } from 'react';
import { UserCircle2, Mail, Shield, Clock, LogOut, Database, Activity } from 'lucide-react';
import { getAuth, subscribeAuth } from '../../lib/auth';
import { getDbStatus, subscribeDbStatus } from '../../lib/dbStatus';

interface Props {
  onSignOut: () => void;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AccountView({ onSignOut }: Props) {
  const auth = useSyncExternalStore(subscribeAuth, getAuth, getAuth);
  const db = useSyncExternalStore(subscribeDbStatus, getDbStatus, getDbStatus);

  const user = auth.user;
  const email = user?.email ?? 'Unknown';
  const initial = email.charAt(0).toUpperCase();

  const dbLabel =
    db.state === 'connected' ? 'Connected'
    : db.state === 'error'   ? 'Unreachable'
    : 'Connecting…';

  return (
    <main className="page">
      <header className="page-header">
        <div className="page-title">
          <UserCircle2 size={16} />
          <h1>Account</h1>
        </div>
        <div className="page-sub">
          Your signed-in identity and the live connection backing this session.
        </div>
      </header>

      <section className="page-body account-body">
        <div className="account-card">
          <div className="account-id">
            <div className="account-avatar" aria-hidden>{initial}</div>
            <div className="account-id-text">
              <div className="account-email">{email}</div>
              <div className="account-role">
                <span className="account-online-dot" /> Authenticated · Inspector
              </div>
            </div>
            <button className="action-btn account-signout" onClick={onSignOut}>
              <LogOut size={13} /> Sign out
            </button>
          </div>

          <div className="account-grid">
            <AccountField icon={<Mail size={13} />}   label="Email"        value={email} />
            <AccountField icon={<Shield size={13} />} label="User ID"      value={user?.id ?? '—'} mono />
            <AccountField icon={<Clock size={13} />}  label="Last sign-in" value={formatDate(user?.last_sign_in_at)} />
            <AccountField icon={<Clock size={13} />}  label="Account since" value={formatDate(user?.created_at)} />
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-head">
            <div className="settings-section-title">Database connection</div>
            <div className="settings-section-desc">
              Live status of the Supabase backend serving block data.
            </div>
          </div>
          <div className="account-grid">
            <AccountField
              icon={<Database size={13} />}
              label="Status"
              value={dbLabel}
              tone={db.state === 'connected' ? 'ok' : db.state === 'error' ? 'bad' : 'warn'}
            />
            <AccountField
              icon={<Activity size={13} />}
              label="Latency"
              value={db.latencyMs != null ? `${db.latencyMs} ms` : '—'}
              mono
            />
            <AccountField
              icon={<Clock size={13} />}
              label="Last checked"
              value={db.checkedAt ? formatDate(new Date(db.checkedAt).toISOString()) : '—'}
            />
            <AccountField
              icon={<Shield size={13} />}
              label="Mode"
              value="Live data"
              tone="ok"
            />
          </div>
          {db.error && <div className="account-db-error">{db.error}</div>}
        </div>
      </section>
    </main>
  );
}

function AccountField({
  icon, label, value, mono, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'ok' | 'warn' | 'bad';
}) {
  return (
    <div className="account-field">
      <div className="account-field-label">
        <span className="account-field-icon">{icon}</span>
        {label}
      </div>
      <div className={`account-field-value ${mono ? 'mono' : ''} ${tone ? `tone-${tone}` : ''}`}>
        {value}
      </div>
    </div>
  );
}
