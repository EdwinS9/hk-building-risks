import { Database, AlertCircle, RotateCw } from 'lucide-react';
import type { LoadProgress } from '../data/blocks';
import { retryLoad } from '../data/blocks';

interface Props {
  progress: LoadProgress;
}

export default function DataLoadingScreen({ progress }: Props) {
  const { loaded, total, error } = progress;
  const pct = total && total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : null;

  return (
    <div className="load-root">
      <div className="bg-grid" aria-hidden />
      <div className="bg-vignette" aria-hidden />

      <div className="load-card">
        {error ? (
          <>
            <div className="load-icon error"><AlertCircle size={22} /></div>
            <div className="load-title">Could not load building data</div>
            <div className="load-sub">{error}</div>
            <button className="login-submit" onClick={() => retryLoad()}>
              <RotateCw size={14} /> <span>Retry</span>
            </button>
          </>
        ) : (
          <>
            <div className="load-icon">
              <Database size={22} />
              <span className="load-ring" aria-hidden />
            </div>
            <div className="load-title">Loading building data</div>
            <div className="load-sub">
              {total != null
                ? `${loaded.toLocaleString()} of ${total.toLocaleString()} blocks`
                : 'Connecting to database…'}
            </div>

            <div className="load-bar">
              <div
                className={`load-bar-fill ${pct == null ? 'indeterminate' : ''}`}
                style={pct != null ? { width: `${pct}%` } : undefined}
              />
            </div>
            <div className="load-pct mono">{pct != null ? `${pct}%` : '—'}</div>
          </>
        )}
      </div>
    </div>
  );
}
