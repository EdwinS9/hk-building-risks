import { useEffect, useRef, useState } from 'react';
import { X, Clock4, StickyNote, Save, Loader2, Flame } from 'lucide-react';
import type { Block } from '../data/blocks';
import {
  colorForBand,
  relativeTime,
  inspectionAgeScore,
  buildingAgeScore,
  LAST_INSPECTED_FACTOR,
  BUILDING_AGE_FACTOR,
} from '../lib/constants';
import { setBlockNote } from '../data/blocks';

interface Props {
  block: Block | null;
  onClose: () => void;
  heatmapFactor: string | null;
  onToggleHeatmap: (label: string) => void;
}

// `lastInspected` is a plain YYYY-MM-DD date. Render it compactly, e.g. "12 Mar 2026".
function formatInspectedDate(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BlockDetail({ block, onClose, heatmapFactor, onToggleHeatmap }: Props) {
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
          </div>
        </div>

        <div className="section">
          <div className="section-label">RISK BREAKDOWN</div>
          <div className="factor-hint">Tap a score to heat-map it across the map.</div>
          <div className="factors">
            {b.factors && b.factors.length > 0 &&
              [...b.factors].sort((x, y) => y.contribution - x.contribution).map(f => (
                <FactorBar
                  key={f.label}
                  label={f.label}
                  pct={Math.round(f.contribution * 100)}
                  fillPct={f.contribution * 100}
                  color={color}
                  active={heatmapFactor === f.label}
                  onClick={() => onToggleHeatmap(f.label)}
                />
              ))}

            {/* Inspection age scored as its own risk factor. */}
            <FactorBar
              label="Last inspected"
              detail={b.lastInspected ? formatInspectedDate(b.lastInspected) : 'never'}
              pct={inspectionAgeScore(b.lastInspected)}
              fillPct={inspectionAgeScore(b.lastInspected)}
              color={color}
              active={heatmapFactor === LAST_INSPECTED_FACTOR}
              onClick={() => onToggleHeatmap(LAST_INSPECTED_FACTOR)}
            />

            <FactorBar
              label="Building age"
              detail={b.completionDate ? formatInspectedDate(b.completionDate) : 'unknown'}
              pct={buildingAgeScore(b.completionDate)}
              fillPct={buildingAgeScore(b.completionDate)}
              color={color}
              active={heatmapFactor === BUILDING_AGE_FACTOR}
              onClick={() => onToggleHeatmap(BUILDING_AGE_FACTOR)}
            />
          </div>
        </div>

        <NotesSection block={b} />
      </div>
    </aside>
  );
}

function FactorBar({
  label, detail, pct, fillPct, color, active, onClick,
}: {
  label: string;
  detail?: string;
  pct: number;
  fillPct: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`factor factor-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      title="Show this score as a heatmap on the map"
      aria-pressed={active}
    >
      <div className="factor-row">
        <span className="factor-label">
          {label}
          {detail && <span className="factor-detail">{detail}</span>}
        </span>
        <span className="factor-end">
          {active && <Flame size={11} className="factor-flame" />}
          <span className="factor-pct mono">{pct}%</span>
        </span>
      </div>
      <div className="factor-bar">
        <div className="factor-bar-fill" style={{ width: `${fillPct}%`, background: color }} />
      </div>
    </button>
  );
}

function NotesSection({ block }: { block: Block }) {
  const saved = block.note ?? '';
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync the editor whenever we switch blocks OR the shared note changes
  // underneath us (another user saved). We only clobber the draft when the
  // user hasn't started editing this block's note, to avoid eating keystrokes.
  const blockId = block.id;
  const lastSyncedRef = useRef<{ id: string; note: string }>({ id: blockId, note: saved });
  useEffect(() => {
    const prev = lastSyncedRef.current;
    const blockChanged = prev.id !== blockId;
    const remoteChanged = prev.note !== saved;
    if (blockChanged || remoteChanged) {
      setDraft(saved);
      setError(null);
      lastSyncedRef.current = { id: blockId, note: saved };
    }
  }, [blockId, saved]);

  const dirty = draft !== saved;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setBlockNote(blockId, draft);
      // refreshOne updates block.note; the sync effect above realigns lastSynced.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save note');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="section notes-section">
      <div className="section-label notes-label">
        <span><StickyNote size={11} /> SHARED NOTES</span>
        {block.noteUpdatedAt && !dirty && (
          <span className="notes-meta mono">updated {relativeTime(block.noteUpdatedAt)}</span>
        )}
      </div>
      <textarea
        className="notes-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="Add a note for this block. Visible to and editable by everyone with access."
        rows={3}
        disabled={saving}
      />
      <div className="notes-foot">
        <span className={`notes-hint ${error ? 'is-error' : ''}`}>{error ? error : 'Saved globally · last writer wins'}</span>
        <button
          className="action-btn notes-save"
          disabled={!dirty || saving}
          onClick={save}
        >
          {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
          {saving ? 'Saving…' : 'Save note'}
        </button>
      </div>
    </div>
  );
}
