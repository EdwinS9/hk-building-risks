import { useMemo } from 'react';
import { ClipboardCheck, MapPin } from 'lucide-react';
import type { Block } from '../../data/blocks';
import { colorForBand, relativeTime } from '../../lib/constants';

interface Props {
  blocks: Block[];
  onJump: (id: string) => void;
}

export default function InspectedLog({ blocks, onJump }: Props) {
  const rows = useMemo(
    () =>
      blocks
        .filter(b => b.status === 'Inspected' && b.lastInspected)
        .sort((a, b) => (b.lastInspected! > a.lastInspected! ? 1 : -1)),
    [blocks],
  );

  return (
    <main className="page">
      <header className="page-header">
        <div className="page-title">
          <ClipboardCheck size={16} />
          <h1>Inspected Log</h1>
          <span className="page-count mono">{rows.length}</span>
        </div>
        <div className="page-sub">
          Chronological record of completed inspections. Sorted by most recent.
        </div>
      </header>

      <section className="page-body">
        {rows.length === 0 ? (
          <div className="page-empty">No inspections recorded yet.</div>
        ) : (
          <div className="data-table-wrap">
            <div className="data-table inspected-table">
              <div className="data-thead">
                <div>BLOCK</div>
                <div>DISTRICT</div>
                <div className="ta-r">SCORE</div>
                <div>BAND</div>
                <div>INSPECTED</div>
                <div className="ta-r">ACTION</div>
              </div>
              <div className="data-tbody">
                {rows.map(b => {
                  const color = colorForBand(b.riskBand);
                  return (
                    <div className="data-trow" key={b.id}>
                      <div className="dt-name">
                        <span className="row-dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                        <span>{b.name}</span>
                      </div>
                      <div className="dt-dim">{b.district}</div>
                      <div className="ta-r mono" style={{ color }}>{b.riskScore}</div>
                      <div className="dt-band" style={{ color }}>{b.riskBand.toUpperCase()}</div>
                      <div className="dt-dim mono">{relativeTime(b.lastInspected!)}</div>
                      <div className="ta-r">
                        <button className="action-btn tiny" onClick={() => onJump(b.id)}>
                          <MapPin size={11} /> View on map
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
