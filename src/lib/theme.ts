export type ThemePref = 'system' | 'dark' | 'light' | 'high-contrast';
export type ResolvedTheme = 'dark' | 'light' | 'high-contrast';

const STORAGE_KEY = 'hk-brm.theme';

function readStored(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'system' || v === 'dark' || v === 'light' || v === 'high-contrast') return v;
  } catch {
    /* private mode */
  }
  return 'system';
}

function systemDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(pref: ThemePref): ResolvedTheme {
  if (pref === 'system') return systemDark() ? 'dark' : 'light';
  return pref;
}

let _pref: ThemePref = readStored();
let _resolved: ResolvedTheme = resolve(_pref);

const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }

function apply(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved === 'light' ? 'light' : 'dark';
}

export function initTheme() {
  apply(_resolved);
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (_pref === 'system') {
        _resolved = resolve(_pref);
        apply(_resolved);
        emit();
      }
    };
    mq.addEventListener?.('change', onChange);
  }
}

export function getThemePref(): ThemePref { return _pref; }
export function getResolvedTheme(): ResolvedTheme { return _resolved; }

export function setThemePref(p: ThemePref) {
  _pref = p;
  _resolved = resolve(p);
  try { localStorage.setItem(STORAGE_KEY, p); } catch { /* ignore */ }
  apply(_resolved);
  emit();
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
