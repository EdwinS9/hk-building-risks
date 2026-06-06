import { RISK_BANDS } from '../lib/constants';

interface Props {
  triageOpen: boolean;
}

export default function Legend({ triageOpen }: Props) {
  return (
    <div className={`legend glass ${triageOpen ? '' : 'shifted'}`}>
      <div className="legend-title">RISK BAND</div>
      {RISK_BANDS.map(b => (
        <div className="legend-row" key={b.band}>
          <span className="legend-swatch" style={{ background: b.color, boxShadow: `0 0 8px ${b.glow}` }} />
          <span className="legend-band">{b.band}</span>
          <span className="legend-range mono">{b.min}–{b.max}</span>
        </div>
      ))}
    </div>
  );
}
