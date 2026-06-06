import { useSyncExternalStore } from 'react';
import { Settings, Monitor, Moon, Sun, Contrast, Check } from 'lucide-react';
import {
  getThemePref,
  getResolvedTheme,
  setThemePref,
  subscribeTheme,
  type ThemePref,
} from '../../lib/theme';

interface Option {
  key: ThemePref;
  label: string;
  description: string;
  icon: typeof Settings;
}

const OPTIONS: Option[] = [
  { key: 'system',        label: 'System',         description: 'Follow your OS appearance setting.', icon: Monitor },
  { key: 'dark',          label: 'Dark',           description: 'Default operations look. Best for low-light rooms and long sessions.', icon: Moon },
  { key: 'light',         label: 'Light',          description: 'Bright surfaces and dark text. Good for daytime use on bright screens.', icon: Sun },
  { key: 'high-contrast', label: 'High Contrast',  description: 'Maximum legibility. Heavier borders, stronger color separation, no decorative noise.', icon: Contrast },
];

export default function SettingsView() {
  const pref = useSyncExternalStore(subscribeTheme, getThemePref, getThemePref);
  const resolved = useSyncExternalStore(subscribeTheme, getResolvedTheme, getResolvedTheme);

  return (
    <main className="page">
      <header className="page-header">
        <div className="page-title">
          <Settings size={16} />
          <h1>Settings</h1>
        </div>
        <div className="page-sub">
          Customize the look and feel of the dashboard. More options will arrive as the prototype grows.
        </div>
      </header>

      <section className="page-body settings-body">
        <div className="settings-section">
          <div className="settings-section-head">
            <div className="settings-section-title">Appearance</div>
            <div className="settings-section-desc">
              Theme controls the entire interface. Active theme:
              <span className="settings-resolved">{resolved}</span>
            </div>
          </div>

          <div className="theme-grid">
            {OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = pref === opt.key;
              return (
                <button
                  key={opt.key}
                  className={`theme-card ${active ? 'active' : ''}`}
                  onClick={() => setThemePref(opt.key)}
                  aria-pressed={active}
                >
                  <div className={`theme-preview preview-${opt.key}`}>
                    <span className="tp-bar" />
                    <span className="tp-cards">
                      <span className="tp-card" />
                      <span className="tp-card" />
                      <span className="tp-card" />
                    </span>
                    <span className="tp-dots">
                      <span style={{ background: 'var(--low)' }} />
                      <span style={{ background: 'var(--moderate)' }} />
                      <span style={{ background: 'var(--high)' }} />
                      <span style={{ background: 'var(--critical)' }} />
                    </span>
                  </div>
                  <div className="theme-card-body">
                    <div className="theme-card-head">
                      <Icon size={14} />
                      <span className="theme-card-label">{opt.label}</span>
                      {active && <Check size={13} className="theme-card-check" />}
                    </div>
                    <div className="theme-card-desc">{opt.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="settings-section coming-soon">
          <div className="settings-section-head">
            <div className="settings-section-title">Notifications</div>
            <div className="settings-section-desc">Alerts and reminders for inspections.</div>
          </div>
          <div className="settings-placeholder">Not yet available in the prototype.</div>
        </div>

        <div className="settings-section coming-soon">
          <div className="settings-section-head">
            <div className="settings-section-title">Data &amp; Privacy</div>
            <div className="settings-section-desc">Export, retention, and inspector accountability.</div>
          </div>
          <div className="settings-placeholder">Not yet available in the prototype.</div>
        </div>

        <div className="settings-section">
          <div className="settings-section-head">
            <div className="settings-section-title">Data sources</div>
            <div className="settings-section-desc">Map tiles and geographic data licensing.</div>
          </div>
          <ul className="attrib-list">
            <li>
              Map data ©{' '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">
                OpenStreetMap
              </a>{' '}
              contributors, licensed under the{' '}
              <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer noopener">
                ODbL
              </a>.
            </li>
            <li>
              Basemap tiles ©{' '}
              <a href="https://carto.com/attributions" target="_blank" rel="noreferrer noopener">
                CARTO
              </a>
              {' '}— used when no MapTiler key is configured.
            </li>
            <li>
              Optional vector basemap ©{' '}
              <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer noopener">
                MapTiler
              </a>
              {' '}— used when <code className="mono">VITE_MAPTILER_KEY</code> is set.
            </li>
            <li>
              Rendering by{' '}
              <a href="https://maplibre.org/" target="_blank" rel="noreferrer noopener">
                MapLibre GL JS
              </a>.
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
