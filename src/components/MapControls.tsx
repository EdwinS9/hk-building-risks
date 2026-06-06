import { useState } from 'react';
import { Plus, Minus, Compass, RotateCcw, RotateCw, LocateFixed, Loader2, Route } from 'lucide-react';
import type { Map as MLMap } from 'maplibre-gl';
import type { RefObject } from 'react';
import { HK_CENTER, HK_DEFAULT_ZOOM, HK_DEFAULT_PITCH, HK_DEFAULT_BEARING } from '../lib/constants';

interface Props {
  mapRef: RefObject<MLMap | null>;
  routeOpen?: boolean;
  onToggleRoute?: () => void;
}

export default function MapControls({ mapRef, routeOpen, onToggleRoute }: Props) {
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  function withMap(fn: (m: MLMap) => void) {
    const m = mapRef.current;
    if (m) fn(m);
  }

  function locate() {
    if (!navigator.geolocation) {
      setLocateError('Geolocation is not available in this browser');
      setTimeout(() => setLocateError(null), 2200);
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        withMap(m =>
          m.flyTo({
            center: [pos.coords.longitude, pos.coords.latitude],
            zoom: Math.max(m.getZoom(), 15),
            speed: 1.4,
            curve: 1.4,
            essential: true,
          }),
        );
      },
      err => {
        setLocating(false);
        setLocateError(err.message || 'Could not get your location');
        setTimeout(() => setLocateError(null), 2400);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }

  return (
    <div className="map-controls">
      {onToggleRoute && (
        <button
          title={routeOpen ? 'Hide route planner' : 'Recommended routes'}
          onClick={onToggleRoute}
          className={routeOpen ? 'active' : ''}
        >
          <Route size={14} />
        </button>
      )}
      <button title="Zoom in" onClick={() => withMap(m => m.zoomIn())}>
        <Plus size={14} />
      </button>
      <button title="Zoom out" onClick={() => withMap(m => m.zoomOut())}>
        <Minus size={14} />
      </button>
      <button
        title="Rotate left"
        onClick={() => withMap(m => m.easeTo({ bearing: m.getBearing() + 20 }))}
      >
        <RotateCcw size={14} />
      </button>
      <button
        title="Rotate right"
        onClick={() => withMap(m => m.easeTo({ bearing: m.getBearing() - 20 }))}
      >
        <RotateCw size={14} />
      </button>
      <button
        title={locating ? 'Locating…' : 'Center on my location'}
        onClick={locate}
        disabled={locating}
        className={locating ? 'busy' : ''}
      >
        {locating ? <Loader2 size={14} className="spin" /> : <LocateFixed size={14} />}
      </button>
      <button
        title="Reset view"
        onClick={() =>
          withMap(m =>
            m.flyTo({
              center: HK_CENTER,
              zoom: HK_DEFAULT_ZOOM,
              pitch: HK_DEFAULT_PITCH,
              bearing: HK_DEFAULT_BEARING,
              speed: 1.4,
            }),
          )
        }
      >
        <Compass size={14} />
      </button>

      {locateError && <div className="map-controls-toast">{locateError}</div>}
    </div>
  );
}
