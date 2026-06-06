import { useEffect, useMemo, useState } from 'react';
import { Route as RouteIcon, X, MapPin } from 'lucide-react';
import type { Block } from '../data/blocks';
import {
  listDistricts,
  formatDuration,
  formatClock,
  DEFAULT_OPTIONS,
  type RouteResult,
} from '../lib/routePlanner';
import { colorForScore } from '../lib/constants';

interface Props {
  open: boolean;
  blocks: Block[];
  route: RouteResult | null;
  /** District the current route (or empty result) was computed for, if any. */
  plannedDistrict: string | null;
  onClose: () => void;
  onPlan: (district: string) => void;
  onSelectStop?: (id: string) => void;
}

export default function RoutePanel({ open, blocks, route, plannedDistrict, onClose, onPlan, onSelectStop }: Props) {
  const districts = useMemo(() => listDistricts(blocks), [blocks]);
  const [district, setDistrict] = useState('');

  // Default to the busiest district once data is in.
  useEffect(() => {
    if (!district && districts.length) setDistrict(districts[0].district);
  }, [districts, district]);

  if (!open) return null;

  const showRoute = !!route && route.district === district && route.stops.length > 0;
  const showEmpty = plannedDistrict === district && !showRoute;
  const endMin = route ? route.startMin + route.totalMin : 0;

  return (
    <div className="route-panel glass">
      <div className="route-head">
        <RouteIcon size={14} className="route-head-icon" />
        <span className="route-head-title">RECOMMENDED ROUTE</span>
        <button className="route-close" onClick={onClose} title="Close route planner">
          <X size={13} />
        </button>
      </div>

      <div className="route-controls">
        <label className="route-field">
          <span className="route-field-label">District</span>
          <select
            className="route-select"
            value={district}
            onChange={e => setDistrict(e.target.value)}
          >
            {districts.map(d => (
              <option key={d.district} value={d.district}>
                {d.district} ({d.count})
              </option>
            ))}
          </select>
        </label>
        <button
          className="route-plan-btn"
          onClick={() => district && onPlan(district)}
          disabled={!district}
        >
          Plan route
        </button>
      </div>

      {showRoute && (
        <>
          <div className="route-summary">
            <div className="route-time">
              <span className="route-time-approx">approx</span>
              <span className="route-time-big">{formatDuration(route!.totalMin)}</span>
            </div>
            <div className="route-time-split">
              {formatDuration(route!.driveMin)} driving + {formatDuration(route!.serviceMin)} inspecting
            </div>
            <div className="route-meta">
              {route!.stops.length} stops · {route!.distanceKm.toFixed(1)} km · risk {Math.round(route!.prize)}
            </div>
            <div className="route-meta">
              {formatClock(route!.startMin)} to {formatClock(endMin)}
              {route!.roads
                ? <span className="route-roads"> · via roads</span>
                : <span className="route-est"> · estimating roads…</span>}
            </div>
          </div>

          <div className="route-stops">
            <div className="route-depot-row">
              <span className="route-depot-dot" />
              <span className="route-depot-name">{route!.depot.name}</span>
              <span className="route-depot-tag">START</span>
            </div>
            {route!.stops.map(s => (
              <button
                key={s.block.id}
                className="route-stop"
                onClick={() => onSelectStop?.(s.block.id)}
                title="Show on map"
              >
                <span className="route-stop-no" style={{ background: colorForScore(s.block.riskScore) }}>
                  {s.order}
                </span>
                <span className="route-stop-body">
                  <span className="route-stop-name">{s.block.name}</span>
                  <span className="route-stop-sub">
                    risk {s.block.riskScore.toFixed(0)} · {formatClock(s.arriveMin)} to {formatClock(s.departMin)}
                    {s.driveMin >= 0.5 ? ` · ${Math.round(s.driveMin)}m drive` : ''}
                  </span>
                </span>
              </button>
            ))}
            <div className="route-depot-row">
              <span className="route-depot-dot" />
              <span className="route-depot-name">{route!.depot.name}</span>
              <span className="route-depot-tag">END</span>
            </div>
          </div>
        </>
      )}

      {showEmpty && (
        <div className="route-empty">
          <MapPin size={15} />
          <span>No routable buildings in {district}. They may all be inspected already.</span>
        </div>
      )}

      {!showRoute && !showEmpty && (
        <div className="route-hint">
          Pick a district and press <b>Plan route</b>. The planner picks the highest-risk
          buildings that fit one workday (up to {DEFAULT_OPTIONS.maxStops} stops,
          {' '}{Math.round(DEFAULT_OPTIONS.serviceMin)} min each) and routes them from the depot and back.
        </div>
      )}
    </div>
  );
}
