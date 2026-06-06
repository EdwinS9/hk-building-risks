import { useState, useEffect, useRef } from 'react';
import { Search, CheckCircle, Building2, MapPin, X, Sun, Moon, Monitor, AlertTriangle } from 'lucide-react';
import type { Block, Page } from '../types';
import { supabase } from '../lib/supabase';
import { getHomeBuilding, setHomeBuilding, clearHomeBuilding } from '../lib/storage';
import { useTheme, type ThemeMode } from '../lib/theme';
import { SearchDoodle, ShieldDoodle } from '../components/Illustrations';

interface Props {
  onNavigate: (page: Page) => void;
}

const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

const themeOptions: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'system', label: 'System', Icon: Monitor },
];

export default function SettingsPage({ onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Block[]>([]);
  const [allBlocks, setAllBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);
  const [home, setHome] = useState(getHomeBuilding);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { mode, setMode } = useTheme();

  useEffect(() => {
    async function fetchBlocks() {
      const { data, error } = await supabase
        .from('resident_buildings')
        .select('id, address, district, object_id')
        .order('address');
      if (error) {
        setLoadError(true);
      } else if (data) {
        setAllBlocks(data as Block[]);
      }
      setLoading(false);
    }
    fetchBlocks();
  }, []);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setResults([]);
      return;
    }
    setResults(
      allBlocks
        .filter((b) => {
          const haystack = `${s(b.address)} ${s(b.district)} ${s(b.object_id)}`.toLowerCase();
          return haystack.includes(q);
        })
        .slice(0, 30)
    );
  }, [query, allBlocks]);

  function selectBuilding(block: Block) {
    setHomeBuilding({ id: block.id, address: block.address, district: block.district });
    setHome({ id: block.id, address: block.address, district: block.district });
    setSaved(true);
    setOpen(false);
    setQuery('');
    setTimeout(() => setSaved(false), 3000);
  }

  function handleClear() {
    clearHomeBuilding();
    setHome(null);
  }

  return (
    <div className="page">
      <div className="page-header">
        <span className="eyebrow">Settings</span>
        <h1 style={{ marginTop: 12 }}>Make it yours</h1>
        <p className="muted">Choose your building and pick a look.</p>
      </div>

      {saved && (
        <div className="success-banner">
          <CheckCircle size={18} />
          Building saved!
        </div>
      )}

      {home && (
        <div className="current-building-card">
          <span className="pin">
            <Building2 size={22} />
          </span>
          <div className="current-building-info">
            <p className="label">Your building</p>
            <p className="building-address">{home.address}</p>
            <p className="district">{home.district}</p>
          </div>
          <button className="icon-btn" onClick={handleClear} aria-label="Remove selection">
            <X size={18} />
          </button>
        </div>
      )}

      <div className="settings-section">
        <span className="label">{home ? 'Change building' : 'Find your building'}</span>
        {loadError && (
          <div className="error-banner" style={{ marginBottom: 12 }}>
            <AlertTriangle size={18} />
            Couldn't load the building list. Please check your connection and try again.
          </div>
        )}
        <div className="search-field">
          <div className="search-input-wrap">
            <Search size={18} className="search-icon" />
            <input
              ref={inputRef}
              type="search"
              className="search-input"
              placeholder={loading ? 'Loading buildings…' : 'Search by address or district…'}
              value={query}
              disabled={loading}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
            />
            {query && (
              <button
                className="clear-search"
                onClick={() => { setQuery(''); setOpen(false); inputRef.current?.focus(); }}
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {open && results.length > 0 && (
            <ul className="search-dropdown" role="listbox">
              {results.map((block) => (
                <li
                  key={block.id}
                  role="option"
                  aria-selected={home?.id === block.id}
                  className={`search-option ${home?.id === block.id ? 'selected' : ''}`}
                  onClick={() => selectBuilding(block)}
                >
                  <span className="opt-pin">
                    <MapPin size={16} />
                  </span>
                  <div className="opt-body">
                    <p className="option-address">{block.address}</p>
                    <p className="option-district">{block.district}</p>
                  </div>
                  {home?.id === block.id && <CheckCircle size={18} className="check" />}
                </li>
              ))}
            </ul>
          )}

          {open && query.trim() && results.length === 0 && !loading && (
            <div className="no-results">
              <SearchDoodle size={90} />
              <p style={{ marginTop: 8 }}>No buildings found for “{query}”</p>
            </div>
          )}
        </div>
      </div>

      <div className="settings-section">
        <span className="label">Appearance</span>
        <div className="theme-switch" role="radiogroup" aria-label="Theme">
          {themeOptions.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="radio"
              aria-checked={mode === id}
              className={`theme-option ${mode === id ? 'active' : ''}`}
              onClick={() => setMode(id)}
            >
              <Icon size={22} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {home && (
        <button className="btn-primary" onClick={() => onNavigate('home')}>
          Done
        </button>
      )}

      <p className="settings-footnote">
        <ShieldDoodle size={30} />
        Your selection is stored only on this device. No account required.
      </p>
    </div>
  );
}
