import { useState, type FormEvent } from 'react';
import { ShieldCheck, AtSign, Lock, Loader2, AlertCircle } from 'lucide-react';
import { signIn } from '../../lib/auth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      // onAuthStateChange will flip the gate to authenticated.
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed';
      setError(humanize(msg));
      setBusy(false);
    }
  }

  return (
    <div className="login-root">
      <div className="bg-grid" aria-hidden />
      <div className="bg-vignette" aria-hidden />
      <div className="bg-scanline" aria-hidden />

      <main className="login-card">
        <div className="login-brand">
          <ShieldCheck size={20} />
          <div>
            <div className="login-brand-title">Hong Kong Building Risk Monitor</div>
            <div className="login-brand-sub">Restricted access · Authorized inspectors only</div>
          </div>
        </div>

        <form className="login-form" onSubmit={onSubmit} noValidate>
          <label className="field">
            <span className="field-label">Email</span>
            <div className="field-input">
              <AtSign size={13} />
              <input
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@agency.gov.hk"
              />
            </div>
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <div className="field-input">
              <Lock size={13} />
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </label>

          {error && (
            <div className="login-error" role="alert">
              <AlertCircle size={12} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="login-submit" disabled={busy || !email || !password}>
            {busy ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
            <span>{busy ? 'Signing in…' : 'Sign in'}</span>
          </button>
        </form>

        <div className="login-foot">
          Need access? Contact your administrator. Accounts are issued by invitation only.
        </div>
      </main>
    </div>
  );
}

function humanize(msg: string): string {
  // Strip Supabase prefixes / make a couple common errors friendlier.
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (m.includes('email not confirmed'))       return 'Your account is not yet activated. Contact your administrator.';
  if (m.includes('rate limit'))                return 'Too many attempts. Wait a minute and try again.';
  return msg;
}
