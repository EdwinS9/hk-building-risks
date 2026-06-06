import { useState } from 'react';
import { Database, Copy, Check } from 'lucide-react';
import type { Block } from '../../data/blocks';

interface Props {
  blocks: Block[];
}

export default function DataView({ blocks }: Props) {
  const [mode, setMode] = useState<'table' | 'json'>('table');
  const [copied, setCopied] = useState(false);

  const json = JSON.stringify(blocks, null, 2);

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <div className="page-title">
          <Database size={16} />
          <h1>Raw Data</h1>
          <span className="page-count mono">{blocks.length}</span>
        </div>
        <div className="page-sub">
          The data behind the dashboard. Useful for debugging and verification.
        </div>
        <div className="page-actions">
          <div className="seg">
            <button className={mode === 'table' ? 'on' : ''} onClick={() => setMode('table')}>TABLE</button>
            <button className={mode === 'json' ? 'on' : ''} onClick={() => setMode('json')}>JSON</button>
          </div>
          <button className="action-btn tiny" onClick={copy}>
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
        </div>
      </header>

      <section className="page-body">
        {mode === 'table' ? (
          <div className="data-table-wrap">
            <div className="data-table raw-table">
              <div className="data-thead">
                <div>ID</div>
                <div>NAME</div>
                <div>DISTRICT</div>
                <div className="ta-r">LNG</div>
                <div className="ta-r">LAT</div>
                <div className="ta-r">SCORE</div>
                <div>BAND</div>
                <div>STATUS</div>
                <div>UPDATED</div>
              </div>
              <div className="data-tbody">
                {blocks.map(b => (
                  <div className="data-trow" key={b.id}>
                    <div className="mono dt-dim">{b.id}</div>
                    <div>{b.name}</div>
                    <div className="dt-dim">{b.district}</div>
                    <div className="ta-r mono dt-dim">{b.coordinate.lng.toFixed(4)}</div>
                    <div className="ta-r mono dt-dim">{b.coordinate.lat.toFixed(4)}</div>
                    <div className="ta-r mono">{b.riskScore}</div>
                    <div>{b.riskBand}</div>
                    <div className="dt-dim">{b.status}</div>
                    <div className="dt-dim mono">{b.scoreUpdatedAt.slice(0, 10)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <pre className="data-json mono">{json}</pre>
        )}
      </section>
    </main>
  );
}
