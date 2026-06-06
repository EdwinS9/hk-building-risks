import { useEffect, useRef, useSyncExternalStore } from 'react';
import maplibregl, { Map as MLMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { HK_CENTER, HK_DEFAULT_ZOOM, HK_DEFAULT_PITCH, HK_DEFAULT_BEARING, RISK_BANDS } from '../lib/constants';
import type { Block } from '../data/blocks';
import MapControls from './MapControls';
import { getResolvedTheme, subscribeTheme, type ResolvedTheme } from '../lib/theme';

interface Props {
  blocks: Block[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  flyToken: number;
}

function cartoStyle(variant: 'dark' | 'light'): StyleSpecification {
  const slug = variant === 'dark' ? 'dark_all' : 'light_all';
  const bg = variant === 'dark' ? '#05080f' : '#eef2f6';
  return {
    version: 8,
    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources: {
      'carto-basemap': {
        type: 'raster',
        tiles: [
          `https://a.basemaps.cartocdn.com/${slug}/{z}/{x}/{y}.png`,
          `https://b.basemaps.cartocdn.com/${slug}/{z}/{x}/{y}.png`,
          `https://c.basemaps.cartocdn.com/${slug}/{z}/{x}/{y}.png`,
          `https://d.basemaps.cartocdn.com/${slug}/{z}/{x}/{y}.png`,
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors © CARTO',
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': bg } },
      { id: 'carto', type: 'raster', source: 'carto-basemap' },
    ],
  };
}

function getStyle(theme: ResolvedTheme): StyleSpecification | string {
  const key = import.meta.env.VITE_MAPTILER_KEY;
  // High-contrast keeps the dark basemap (more legible against the risk colors).
  const variant: 'dark' | 'light' = theme === 'light' ? 'light' : 'dark';
  if (key) {
    const slug = variant === 'dark' ? 'dataviz-dark' : 'dataviz-light';
    return `https://api.maptiler.com/maps/${slug}/style.json?key=${key}`;
  }
  return cartoStyle(variant);
}

export default function MapView(props: Props) {
  const { blocks, selectedId, hoveredId, onSelect, onHover, flyToken } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const loadedRef = useRef(false);
  const pulsePhaseRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const prevSelectedRef = useRef<string | null>(null);
  const prevHoveredRef = useRef<string | null>(null);
  const theme = useSyncExternalStore(subscribeTheme, getResolvedTheme, getResolvedTheme);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getStyle(themeRef.current),
      center: HK_CENTER,
      zoom: HK_DEFAULT_ZOOM,
      pitch: HK_DEFAULT_PITCH,
      bearing: HK_DEFAULT_BEARING,
      // Attribution is surfaced on the Settings page instead of floating on the map.
      attributionControl: false,
    });
    mapRef.current = map;

    map.on('load', () => {
      loadedRef.current = true;
      setupLayers(map);
      pushData(map, blocks);
      applyFeatureStateDelta(map, prevSelectedRef, selectedId, 'selected');
      applyFeatureStateDelta(map, prevHoveredRef, hoveredId, 'hovered');
      bindInteractions(map);
      startPulse();
    });

    function bindInteractions(m: MLMap) {
      m.on('mouseenter', 'blocks-circle', e => {
        m.getCanvas().style.cursor = 'pointer';
        const f = e.features?.[0];
        if (f) onHover(f.properties?.id ?? null);
      });
      m.on('mousemove', 'blocks-circle', e => {
        const f = e.features?.[0];
        if (f) onHover(f.properties?.id ?? null);
      });
      m.on('mouseleave', 'blocks-circle', () => {
        m.getCanvas().style.cursor = '';
        onHover(null);
      });
      // Clicking a cluster zooms in instead of selecting nothing.
      m.on('click', 'clusters', e => {
        const f = e.features?.[0];
        if (!f) return;
        const clusterId = f.properties?.cluster_id;
        const src = m.getSource('blocks') as maplibregl.GeoJSONSource | undefined;
        if (!src || clusterId == null) return;
        src.getClusterExpansionZoom(clusterId).then(zoom => {
          const geom = f.geometry;
          if (geom.type !== 'Point') return;
          m.easeTo({
            center: geom.coordinates as [number, number],
            zoom,
            duration: 500,
          });
        }).catch(() => { /* getClusterExpansionZoom may reject; ignore */ });
      });

      m.on('mouseenter', 'clusters', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'clusters', () => { m.getCanvas().style.cursor = ''; });

      // Single click handler also covers the "empty map → deselect" case.
      m.on('click', e => {
        const hits = m.queryRenderedFeatures(e.point, {
          layers: ['blocks-circle', 'clusters'],
        });
        // If we hit a cluster, the cluster-specific handler above handles it.
        if (hits.some(h => h.layer.id === 'clusters')) return;
        const circle = hits.find(h => h.layer.id === 'blocks-circle');
        if (circle) {
          const id = circle.properties?.id as string | undefined;
          if (id) onSelect(id);
        } else {
          onSelect(null);
        }
      });
    }

    function startPulse() {
      const tick = () => {
        pulsePhaseRef.current = (pulsePhaseRef.current + 0.05) % (Math.PI * 2);
        const m = mapRef.current;
        if (m && loadedRef.current && m.getLayer('blocks-glow')) {
          const t = (Math.sin(pulsePhaseRef.current) + 1) / 2;
          const min = 14, max = 28;
          const r = min + t * (max - min);
          const opacity = 0.18 + t * 0.22;
          m.setPaintProperty('blocks-glow', 'circle-radius', [
            'case',
            ['>=', ['get', 'score'], 90], r * 1.15,
            ['>=', ['get', 'score'], 70], r,
            0,
          ]);
          m.setPaintProperty('blocks-glow', 'circle-opacity', [
            'case',
            ['>=', ['get', 'score'], 90], opacity,
            ['>=', ['get', 'score'], 70], opacity * 0.7,
            0,
          ]);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push GeoJSON only when the data set itself changes. Hover/selection
  // state is propagated via setFeatureState in the separate effect below
  // so we never re-serialize 60k features for a single hover change.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    pushData(m, blocks);
    // Reapply current selection/hover state after a fresh data push.
    applyFeatureStateDelta(m, prevSelectedRef, selectedId, 'selected');
    applyFeatureStateDelta(m, prevHoveredRef, hoveredId, 'hovered');
  }, [blocks]);

  // Delta state updates — O(1) per change instead of O(n).
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    applyFeatureStateDelta(m, prevSelectedRef, selectedId, 'selected');
  }, [selectedId]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    applyFeatureStateDelta(m, prevHoveredRef, hoveredId, 'hovered');
  }, [hoveredId]);

  // theme → basemap swap; rebuild our overlay layers once new style loads
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    loadedRef.current = false;
    m.setStyle(getStyle(theme));
    const onStyle = () => {
      loadedRef.current = true;
      setupLayers(m);
      pushData(m, blocks);
      // Reset delta refs so state re-applies cleanly onto the rebuilt source.
      prevSelectedRef.current = null;
      prevHoveredRef.current = null;
      applyFeatureStateDelta(m, prevSelectedRef, selectedId, 'selected');
      applyFeatureStateDelta(m, prevHoveredRef, hoveredId, 'hovered');
    };
    m.once('style.load', onStyle);
    return () => { m.off('style.load', onStyle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // fly to selection
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !selectedId) return;
    const b = blocks.find(x => x.id === selectedId);
    if (!b) return;
    m.flyTo({
      center: [b.coordinate.lng, b.coordinate.lat],
      zoom: Math.max(m.getZoom(), 14.5),
      speed: 1.2,
      curve: 1.4,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToken]);

  return (
    <>
      <div ref={containerRef} className="map-container" />
      <MapControls mapRef={mapRef} />
    </>
  );
}

function setupLayers(map: MLMap) {
  // Clustering keeps the GPU happy with 60k+ points: at low zoom we paint
  // a few hundred cluster bubbles instead of every individual circle.
  map.addSource('blocks', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: true,
    clusterRadius: 38,
    clusterMaxZoom: 13,
    // Track the worst risk within a cluster so we can color cluster bubbles
    // by the band of their highest-scoring member.
    clusterProperties: {
      max_score: ['max', ['get', 'score']],
    },
  });

  const bandColorExpr: maplibregl.ExpressionSpecification = [
    'match',
    ['get', 'band'],
    'Low',      RISK_BANDS[0].color,
    'Moderate', RISK_BANDS[1].color,
    'High',     RISK_BANDS[2].color,
    'Critical', RISK_BANDS[3].color,
    '#888',
  ];

  // Cluster fill color follows the WORST block inside it — so high-risk
  // areas read as hot spots even when zoomed out.
  const clusterColorExpr: maplibregl.ExpressionSpecification = [
    'step', ['get', 'max_score'],
    RISK_BANDS[0].color,
    40, RISK_BANDS[1].color,
    70, RISK_BANDS[2].color,
    90, RISK_BANDS[3].color,
  ];

  // ---------- Cluster bubbles ----------
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'blocks',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': clusterColorExpr,
      'circle-opacity': 0.78,
      'circle-radius': [
        'step', ['get', 'point_count'],
        10,
        20,  14,
        100, 18,
        500, 24,
      ],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1.2,
      'circle-stroke-opacity': 0.55,
    },
  });

  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'blocks',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
      'text-size': 11,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#fff',
      'text-halo-color': 'rgba(0,0,0,0.45)',
      'text-halo-width': 1,
    },
  });

  // ---------- Unclustered individual blocks ----------
  // Pulsing glow only for Critical/High to avoid a 60k-point glow storm.
  map.addLayer({
    id: 'blocks-glow',
    type: 'circle',
    source: 'blocks',
    filter: ['all', ['!', ['has', 'point_count']], ['>=', ['get', 'score'], 70]],
    paint: {
      'circle-color': bandColorExpr,
      'circle-radius': 0,
      'circle-opacity': 0,
      'circle-blur': 0.85,
    },
  });

  // Main marker — radius shrunk roughly in half. Selected feature gets a
  // bump so it stays prominent.
  map.addLayer({
    id: 'blocks-circle',
    type: 'circle',
    source: 'blocks',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': bandColorExpr,
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        [
          'interpolate', ['linear'], ['zoom'],
          10, 4.5,
          13, 6,
          16, 8,
        ],
        [
          'interpolate', ['linear'], ['zoom'],
          10, 2.2,
          13, 3.2,
          16, 5,
        ],
      ],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': [
        'case',
        ['boolean', ['feature-state', 'selected'], false], 1.8,
        ['boolean', ['feature-state', 'hovered'], false], 1.1,
        0.3,
      ],
      'circle-stroke-opacity': 0.85,
      'circle-opacity': [
        'interpolate', ['linear'], ['zoom'],
        9, 0.55,
        12, 0.92,
      ],
    },
  });
}

function pushData(map: MLMap, blocks: Block[]) {
  const src = map.getSource('blocks') as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  // Build a fresh FeatureCollection. With 60k blocks this is the most
  // expensive part of a refresh; MapLibre will then cluster + tile in a
  // worker, which is fast and stays off the main thread.
  const features: GeoJSON.Feature[] = new Array(blocks.length);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    features[i] = {
      type: 'Feature',
      id: b.id,
      geometry: { type: 'Point', coordinates: [b.coordinate.lng, b.coordinate.lat] },
      properties: {
        id: b.id,
        score: b.riskScore,
        band: b.riskBand,
        name: b.name,
      },
    };
  }
  src.setData({ type: 'FeatureCollection', features });
}

function applyFeatureStateDelta(
  map: MLMap,
  prevRef: { current: string | null },
  nextId: string | null,
  key: 'selected' | 'hovered',
) {
  const prev = prevRef.current;
  if (prev === nextId) return;
  if (prev) {
    try { map.removeFeatureState({ source: 'blocks', id: prev }, key); }
    catch { /* feature might be clustered or gone — safe to ignore */ }
  }
  if (nextId) {
    try { map.setFeatureState({ source: 'blocks', id: nextId }, { [key]: true }); }
    catch { /* ditto */ }
  }
  prevRef.current = nextId;
}
