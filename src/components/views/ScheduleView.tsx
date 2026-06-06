import { useMemo } from 'react';
import { CalendarClock, CheckCircle2, MapPin } from 'lucide-react';
import type { Block } from '../../data/blocks';
import { updateBlockStatus } from '../../data/blocks';
import { colorForBand } from '../../lib/constants';

interface Props {
  blocks: Block[];
  onJump: (id: string) => void;
}

export default function ScheduleView({ blocks, onJump }: Props) {
  const rows = useMemo(
    () =>
      blocks
        .filter(b => b.status === 'Scheduled')
        .sort((a, b) => b.riskScore - a.riskScore),
    [blocks],
  );

  return (
    <main className="page">
      <header className="page-header">
        <div className="page-title">
          <CalendarClock size={16} />
          <h1>Scheduled Inspections</h1>
          <span className="page-count mono">{rows.length}</span>
        </div>
        <div className="page-sub">
          Blocks queued for inspection. Sorted by risk score, highest first.
        </div>
      </header>

      <section className="page-body">
        {rows.length === 0 ? (
          <div className="page-empty">No inspections currently scheduled.</div>
        ) : (
          <div className="data-table-wrap">
            <div className="data-table schedule-table">
              <div className="data-thead">
                <div>BLOCK</div>
                <div>DISTRICT</div>
                <div className="ta-r">SCORE</div>
                <div>BAND</div>
                <div className="ta-r">ACTIONS</div>
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
                      <div className="dt-actions">
                        <button className="action-btn tiny" onClick={() => onJump(b.id)}>
                          <MapPin size={11} /> Locate
                        </button>
                        <button
                          className="action-btn primary tiny"
                          onClick={() => updateBlockStatus(b.id, 'Inspected')}
                        >
                          <CheckCircle2 size={11} /> Mark done
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
