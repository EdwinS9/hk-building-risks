import { useEffect, useRef, useState } from 'react';
import { X, CalendarCheck, CheckCircle2, AlertTriangle, Clock4, Info } from 'lucide-react';
import type { Block } from '../data/blocks';
import { colorForBand, isStale, relativeTime, STALE_THRESHOLD_DAYS } from '../lib/constants';
import { updateBlockStatus } from '../data/blocks';

interface Props {
  block: Block | null;
  onClose: () => void;
}

export default function BlockDetail({ block, onClose }: Props) {
  // Keep last block while animating out so content doesn't blank during exit.
  const lastBlockRef = useRef<Block | null>(null);
  const [displayBlock, setDisplayBlock] = useState<Block | null>(null);

  useEffect(() => {
    if (block) {
      lastBlockRef.current = block;
      setDisplayBlock(block);
    } else if (lastBlockRef.current) {
      // hold the last block during the exit animation
      const id = setTimeout(() => setDisplayBlock(null), 320);
      return () => clearTimeout(id);
    }
  }, [block]);

  const isOpen = !!block;
  const b = displayBlock;

  if (!b) {
    return <aside className="detail glass side-panel side-right collapsed" aria-hidden />;
  }

  const color = colorForBand(b.riskBand);
  const stale = isStale(b.scoreUpdatedAt);

  return (
    <aside
      className={`detail glass side-panel side-right ${isOpen ? 'open' : 'collapsed'}`}
      aria-hidden={!isOpen}
    >
      <div className="panel-inner">
        <div className="detail-header">
          <div className="panel-label">BLOCK DETAIL</div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="detail-name">{b.name}</div>
        <div className="detail-district">{b.district.toUpperCase()}</div>

        <div className="score-card" style={{ borderColor: color, ['--score-color' as any]: color }}>
          <div className="score-label">RISK SCORE</div>
          <div className="score-row">
            <div className="score-value mono" style={{ color }}>{b.riskScore}</div>
            <div className="score-band" style={{ color }}>{b.riskBand.toUpperCase()}</div>
          </div>
          <div className="score-bar">
            <div className="score-bar-fill" style={{ width: `${b.riskScore}%`, background: color }} />
          </div>
          <div className="score-freshness">
            <Clock4 size={11} />
            <span>computed {relativeTime(b.scoreUpdatedAt)}</span>
            {stale && (
              <span className="stale-tag" title={`Older than ${STALE_THRESHOLD_DAYS} days`}>
                <AlertTriangle size={10} /> STALE — may not reflect latest data
              </span>
            )}
          </div>
        </div>

        <div className="section">
          <div className="section-label">RISK BREAKDOWN</div>
          {b.factors && b.factors.length > 0 ? (
            <div className="factors">
              {[...b.factors].sort((x, y) => y.contribution - x.contribution).map(f => (
                <div className="factor" key={f.label}>
                  <div className="factor-row">
                    <span className="factor-label">{f.label}</span>
                    <span className="factor-pct mono">{Math.round(f.contribution * 100)}%</span>
                  </div>
                  <div className="factor-bar">
                    <div
                      className="factor-bar-fill"
                      style={{ width: `${f.contribution * 100}%`, background: color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-note">Factor breakdown not yet available for this block.</div>
          )}
        </div>

        <div className="section meta-grid">
          <div>
            <div className="meta-label">LAST INSPECTED</div>
            <div className="meta-value mono">
              {b.lastInspected ? relativeTime(b.lastInspected) : '—'}
            </div>
          </div>
          <div>
            <div className="meta-label">STATUS</div>
            <div className={`meta-value status-${b.status.replace(' ', '-').toLowerCase()}`}>
              {b.status}
            </div>
          </div>
        </div>

        <div className="section actions">
          <button
            className="action-btn"
            disabled={b.status === 'Scheduled'}
            onClick={() => updateBlockStatus(b.id, 'Scheduled')}
          >
            <CalendarCheck size={13} /> Schedule inspection
          </button>
          <button
            className="action-btn primary"
            disabled={b.status === 'Inspected'}
            onClick={() => updateBlockStatus(b.id, 'Inspected')}
          >
            <CheckCircle2 size={13} /> Mark inspected
          </button>
        </div>

        <div className="disclaimer">
          <Info size={11} />
          <span>
            The risk score is an indicator to prioritize inspection, not a determination of safety.
            A human inspector must verify on site.
          </span>
        </div>
      </div>
    </aside>
  );
}
