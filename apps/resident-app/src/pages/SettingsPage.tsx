import { useState, useEffect, useRef } from 'react';
import { Search, CheckCircle, Building2, X } from 'lucide-react';
import type { Block, Page } from '../types';
import { supabase } from '../lib/supabase';
import { getHomeBuilding, setHomeBuilding, clearHomeBuilding } from '../lib/storage';

interface Props {
  onNavigate: (page: Page) => void;
}

export default function SettingsPage({ onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Block[]>([]);
  const [allBlocks, setAllBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [home, setHome] = useState(getHomeBuilding);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchBlocks() {
      const { data, error } = await supabase
        .from('blocks')
        .select('id, address, district, object_id')
        .order('address');
      if (!error && data) setAllBlocks(data as Block[]);
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
        .filter(
          (b) =>
            b.address.toLowerCase().includes(q) ||
            b.district.toLowerCase().includes(q) ||
            b.object_id.toLowerCase().includes(q)
        )
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
        <h1>Settings</h1>
        <p className="muted">Choose the building you live in.</p>
      </div>

      {home && (
        <div className="current-building-card">
          <Building2 size={24} />
          <div className="current-building-info">
            <p className="label">Current home building</p>
            <p className="building-address">{home.address}</p>
            <p className="district">{home.district}</p>
          </div>
          <button
            className="icon-btn"
            onClick={handleClear}
            aria-label="Remove selection"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {saved && (
        <div className="success-banner">
          <CheckCircle size={16} />
          Building saved!
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
              onClick={() => { setQuery(''); setOpen(false); }}
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
                className={`search-option ${home?.id === block.id ? 'selected' : ''}`}
                onClick={() => selectBuilding(block)}
              >
                <Building2 size={16} />
                <div>
                  <p className="option-address">{block.address}</p>
                  <p className="option-district">{block.district}</p>
                </div>
                {home?.id === block.id && <CheckCircle size={16} className="check" />}
              </li>
            ))}
          </ul>
        )}

        {open && query.trim() && results.length === 0 && !loading && (
          <div className="no-results">No buildings found for "{query}"</div>
        )}
      </div>

      {home && (
        <button className="btn-primary" style={{ marginTop: 24 }} onClick={() => onNavigate('home')}>
          Done
        </button>
      )}

      <p className="settings-footnote">
        Your selection is stored only on this device. No account required.
      </p>
    </div>
  );
}
