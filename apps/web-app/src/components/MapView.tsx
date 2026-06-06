import { useEffect, useRef, useSyncExternalStore } from 'react';
import maplibregl, { Map as MLMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  HK_CENTER, HK_DEFAULT_ZOOM, HK_DEFAULT_PITCH, HK_DEFAULT_BEARING,
  RISK_BANDS,
  LAST_INSPECTED_FACTOR,
  BUILDING_AGE_FACTOR,
  inspectionAgeScore,
  buildingAgeScore,
} from '../lib/constants';
import type { Block } from '../data/blocks';
import type { RouteResult } from '../lib/routePlanner';
import { ROAD_CRACKS } from '../data/roadCracks';
import MapControls from './MapControls';
import { getResolvedTheme, subscribeTheme, type ResolvedTheme } from '../lib/theme';

interface Props {
  blocks: Block[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  flyToken: number;
  /** When set, every dot is recolored by this breakdown factor (heatmap). */
  heatmapFactor?: string | null;
  /** When set, draw this inspection route (line + numbered stops + depot). */
  route?: RouteResult | null;
  routeOpen?: boolean;
  onToggleRoute?: () => void;
}

// Normal dot color: by risk band.
const BAND_COLOR_EXPR: maplibregl.ExpressionSpecification = [
  'match', ['get', 'band'],
  'Low',      RISK_BANDS[0].color,
  'Moderate', RISK_BANDS[1].color,
  'High',     RISK_BANDS[2].color,
  'Critical', RISK_BANDS[3].color,
  '#888',
];

// Heatmap dot color: a cool→hot gradient over the per-feature `hm` value
// (0..1). Features missing the factor carry hm = -1 and read as muted gray.
const HEAT_COLOR_EXPR: maplibregl.ExpressionSpecification = [
  'case',
  ['<', ['get', 'hm'], 0], '#4a5568',
  [
    'interpolate', ['linear'], ['get', 'hm'],
    0,    '#2b7bba',
    0.35, '#3FB6B0',
    0.6,  '#F5B642',
    0.8,  '#F37735',
    1,    '#E84545',
  ],
];

function dotColorExpr(heatmap: boolean): maplibregl.ExpressionSpecification {
  return heatmap ? HEAT_COLOR_EXPR : BAND_COLOR_EXPR;
}

// Swap dot coloring (band ↔ heat) and hide the risk glow while heat-mapping so
// the single-score gradient reads cleanly.
function applyHeatmapStyle(map: MLMap, factor: string | null) {
  if (!map.getLayer('blocks-circle')) return;
  const on = !!factor;
  map.setPaintProperty('blocks-circle', 'circle-color', dotColorExpr(on));
  if (map.getLayer('selected-dot')) {
    map.setPaintProperty('selected-dot', 'circle-color', dotColorExpr(on));
  }
  if (map.getLayer('blocks-glow')) {
    map.setLayoutProperty('blocks-glow', 'visibility', on ? 'none' : 'visible');
  }
}

// Fade the base building dots / clusters while a route is shown so the route
// line and its numbered stops stand out. Paint changes animate with MapLibre's
// default transition, so this cross-fades smoothly.
function applyRouteFocus(map: MLMap, active: boolean, heatmapOn: boolean) {
  if (map.getLayer('blocks-circle')) {
    map.setPaintProperty('blocks-circle', 'circle-opacity', active ? 0.12 : 1);
    map.setPaintProperty('blocks-circle', 'circle-stroke-opacity', active ? 0.12 : 1);
  }
  if (map.getLayer('clusters')) {
    map.setPaintProperty('clusters', 'circle-opacity', active ? 0.12 : 0.78);
  }
  if (map.getLayer('cluster-count')) {
    map.setPaintProperty('cluster-count', 'text-opacity', active ? 0.15 : 1);
  }
  if (map.getLayer('blocks-glow')) {
    map.setLayoutProperty('blocks-glow', 'visibility', active || heatmapOn ? 'none' : 'visible');
  }
}

// Per-block value (0..1) for the active heatmap factor, or -1 if unavailable.
function heatValue(b: Block, factor: string | null): number {
  if (!factor) return -1;
  if (factor === LAST_INSPECTED_FACTOR) return inspectionAgeScore(b.lastInspected) / 100;
  if (factor === BUILDING_AGE_FACTOR) return buildingAgeScore(b.completionDate) / 100;
  const f = b.factors?.find(x => x.label === factor);
  return f ? f.contribution : -1;
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
  const heatmapFactor = props.heatmapFactor ?? null;
  const heatmapFactorRef = useRef<string | null>(heatmapFactor);
  heatmapFactorRef.current = heatmapFactor;
  const route = props.route ?? null;
  const routeRef = useRef<RouteResult | null>(route);
  routeRef.current = route;
  const routeActiveRef = useRef<boolean>(!!route);
  routeActiveRef.current = !!route;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const loadedRef = useRef(false);
  const pulsePhaseRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const prevSelectedRef = useRef<string | null>(null);
  const prevHoveredRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;
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
      pushData(map, blocks, heatmapFactorRef.current);
      applyFeatureStateDelta(map, prevSelectedRef, selectedId, 'selected');
      applyFeatureStateDelta(map, prevHoveredRef, hoveredId, 'hovered');
      pushSelected(map, selectedId ? blocks.find(b => b.id === selectedId) : null, heatmapFactorRef.current);
      applyHeatmapStyle(map, heatmapFactorRef.current);
      pushRoute(map, routeRef.current);
      applyRouteFocus(map, !!routeRef.current, !!heatmapFactorRef.current);
      setupCrackLayer(map);
      bindInteractions(map);
      bindCrackInteractions(map);
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
        const routeLayers = m.getLayer('route-stops') ? ['route-stops'] : [];
        const hits = m.queryRenderedFeatures(e.point, {
          layers: ['blocks-circle', 'clusters', ...routeLayers],
        });
        // If we hit a cluster, the cluster-specific handler above handles it.
        if (hits.some(h => h.layer.id === 'clusters')) return;
        // A numbered route stop selects its underlying block.
        const stop = hits.find(h => h.layer.id === 'route-stops');
        if (stop) {
          const id = stop.properties?.id as string | undefined;
          if (id) onSelect(id);
          return;
        }
        const circle = hits.find(h => h.layer.id === 'blocks-circle');
        if (circle) {
          const id = circle.properties?.id as string | undefined;
          if (id) onSelect(id);
        } else {
          onSelect(null);
        }
      });
      m.on('mouseenter', 'route-stops', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'route-stops', () => { m.getCanvas().style.cursor = ''; });
    }

    function startPulse() {
      let lastPaint = 0;
      const tick = (now: number) => {
        rafRef.current = requestAnimationFrame(tick);
        const m = mapRef.current;
        if (!m || !loadedRef.current) return;

        // Mutating paint properties recompiles the expression and forces a full
        // repaint — doing that every frame, and especially *during* a pan/zoom,
        // was the main source of map + UI lag. So we skip entirely while the
        // map is moving (smooth gestures) and throttle to ~15fps.
        if (m.isMoving()) return;
        if (now - lastPaint < 66) return;
        lastPaint = now;

        pulsePhaseRef.current = (pulsePhaseRef.current + 0.18) % (Math.PI * 2);
        const t = (Math.sin(pulsePhaseRef.current) + 1) / 2;

        // ── Selected-block highlight: a breathing accent ring around the dot.
        // Runs at any zoom while a block is selected (detail panel open). The
        // overlay source holds only the selected point, so we animate the whole
        // layer directly — no per-feature gating needed.
        if (selectedIdRef.current && m.getLayer('selected-ring')) {
          const amp = 4 + t * 5; // ring grows/shrinks
          m.setPaintProperty('selected-ring', 'circle-radius', [
            'interpolate', ['linear'], ['zoom'],
            10, 7 + amp,
            14, 11 + amp,
            18, 16 + amp,
          ]);
          m.setPaintProperty('selected-ring', 'circle-stroke-opacity', 0.4 + t * 0.5);
        }

        // ── Risk glow: only animate when it's actually on screen (zoomed out).
        // Suppressed while a route is shown so the faded dots stay quiet.
        const z = m.getZoom();
        if (z < 14.5 && m.getLayer('blocks-glow') && !routeActiveRef.current) {
          // The glow is a tight HALO around the marker, not a fixed-size blob.
          const p = 1.5 + t * 3; // pulsing halo thickness in px
          m.setPaintProperty('blocks-glow', 'circle-radius', [
            'interpolate', ['linear'], ['zoom'],
            10, 3 + p,
            13, 4.5 + p * 1.1,
            15, 6 + p * 1.2,
          ]);
          // Fade the glow out as you zoom in. We already know the current zoom,
          // so bake the fade as a constant — a `zoom` interpolate can't be
          // nested under "*", and this avoids that restriction entirely.
          const fade = z <= 13 ? 1 : (14.5 - z) / 1.5;
          const base = (0.22 + t * 0.22) * fade;
          const critical = base;
          const high = base * 0.7;
          m.setPaintProperty('blocks-glow', 'circle-opacity', [
            'case',
            ['>=', ['get', 'score'], 90], critical,
            ['>=', ['get', 'score'], 70], high,
            0,
          ]);
        }
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
    pushData(m, blocks, heatmapFactorRef.current);
    // setData clears feature-state, so reset the delta refs and reapply the
    // current selection/hover from scratch — otherwise the highlight is lost
    // whenever the filtered point set changes.
    prevSelectedRef.current = null;
    prevHoveredRef.current = null;
    applyFeatureStateDelta(m, prevSelectedRef, selectedId, 'selected');
    applyFeatureStateDelta(m, prevHoveredRef, hoveredId, 'hovered');
    pushSelected(m, selectedId ? blocks.find(b => b.id === selectedId) : null, heatmapFactorRef.current);
  }, [blocks]);

  // Delta state updates — O(1) per change instead of O(n).
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    applyFeatureStateDelta(m, prevSelectedRef, selectedId, 'selected');
    pushSelected(m, selectedId ? blocks.find(b => b.id === selectedId) : null, heatmapFactorRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Heatmap toggle — re-serialize with the new per-feature values, restyle the
  // dot coloring, and reapply selection/hover (setData clears feature-state).
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    pushData(m, blocks, heatmapFactor);
    prevSelectedRef.current = null;
    prevHoveredRef.current = null;
    applyFeatureStateDelta(m, prevSelectedRef, selectedId, 'selected');
    applyFeatureStateDelta(m, prevHoveredRef, hoveredId, 'hovered');
    pushSelected(m, selectedId ? blocks.find(b => b.id === selectedId) : null, heatmapFactor);
    applyHeatmapStyle(m, heatmapFactor);
    applyRouteFocus(m, !!routeRef.current, !!heatmapFactor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmapFactor]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    applyFeatureStateDelta(m, prevHoveredRef, hoveredId, 'hovered');
  }, [hoveredId]);

  // Draw / clear the recommended route and frame it on the map.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    pushRoute(m, route);
    applyRouteFocus(m, !!route, !!heatmapFactor);
    if (route && route.line.length > 1) {
      const lngs = route.line.map(c => c[0]);
      const lats = route.line.map(c => c[1]);
      m.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: { top: 90, bottom: 60, left: 410, right: 360 }, maxZoom: 15.5, duration: 700 },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // theme → basemap swap; rebuild our overlay layers once new style loads
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    loadedRef.current = false;
    m.setStyle(getStyle(theme));
    const onStyle = () => {
      loadedRef.current = true;
      setupLayers(m);
      setupCrackLayer(m);
      pushData(m, blocks, heatmapFactorRef.current);
      // Reset delta refs so state re-applies cleanly onto the rebuilt source.
      prevSelectedRef.current = null;
      prevHoveredRef.current = null;
      applyFeatureStateDelta(m, prevSelectedRef, selectedId, 'selected');
      applyFeatureStateDelta(m, prevHoveredRef, hoveredId, 'hovered');
      pushSelected(m, selectedId ? blocks.find(b => b.id === selectedId) : null, heatmapFactorRef.current);
      applyHeatmapStyle(m, heatmapFactorRef.current);
      pushRoute(m, routeRef.current);
      applyRouteFocus(m, !!routeRef.current, !!heatmapFactorRef.current);
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
      <MapControls mapRef={mapRef} routeOpen={props.routeOpen} onToggleRoute={props.onToggleRoute} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Road-crack detections (drone-imagery layer). Static demo data placed at the
// highest InSAR subsidence-gradient spots; click a marker to see the real model
// heatmap and why it was flagged. See src/data/roadCracks.ts.
// ---------------------------------------------------------------------------
const CRACK_SEVERITY_COLOR: Record<string, string> = {
  Severe: '#d11149', High: '#f3722c', Moderate: '#f9c74f', Low: '#90be6d',
};

function crackFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: ROAD_CRACKS.map(c => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      properties: { ...c },
    })),
  };
}

function setupCrackLayer(map: MLMap) {
  if (map.getLayer('road-cracks-dot')) return;
  if (!map.getSource('road-cracks')) {
    map.addSource('road-cracks', { type: 'geojson', data: crackFeatureCollection() });
  }
  const sevColor: maplibregl.ExpressionSpecification = [
    'match', ['get', 'severity'],
    'Severe', CRACK_SEVERITY_COLOR.Severe,
    'High', CRACK_SEVERITY_COLOR.High,
    'Moderate', CRACK_SEVERITY_COLOR.Moderate,
    'Low', CRACK_SEVERITY_COLOR.Low,
    '#f3722c',
  ];
  // Hollow alert ring plus a solid centre dot: a "target" look distinct from
  // the flat risk dots, sitting on top of the blocks layers.
  map.addLayer({
    id: 'road-cracks-ring', type: 'circle', source: 'road-cracks',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 9, 14, 13, 16, 16],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': sevColor,
      'circle-stroke-width': 3,
      'circle-stroke-opacity': 0.95,
    },
  });
  map.addLayer({
    id: 'road-cracks-dot', type: 'circle', source: 'road-cracks',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 14, 5, 16, 6.5],
      'circle-color': sevColor,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  });
}

function bindCrackInteractions(map: MLMap) {
  const popup = new maplibregl.Popup({
    closeButton: true, closeOnClick: true, maxWidth: '320px',
    className: 'crack-popup',
  });
  const open = (e: maplibregl.MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f || f.geometry.type !== 'Point') return;
    const p = f.properties as Record<string, string | number>;
    const conf = Math.round(Number(p.confidence) * 100);
    const vel = Number(p.subsidenceVelocityMmYr);
    const html = `
      <img class="crack-popup-img" src="${p.heatmap}" alt="drone crack heatmap" />
      <div class="crack-popup-body">
        <div class="crack-popup-title">Road crack
          <span class="crack-sev crack-sev-${p.severity}">${p.severity}</span>
        </div>
        <div class="crack-popup-row">${p.crackType} &middot; ~${p.widthMm} mm wide &middot; ~${p.lengthM} m long</div>
        <div class="crack-popup-row">Model confidence ${conf}% &middot; ${p.district}</div>
        <div class="crack-popup-why">Flagged by InSAR subsidence gradient
          ${p.subsidenceGradientScore}/100 (${vel > 0 ? '+' : ''}${vel} mm/yr);
          confirmed by drone imagery.</div>
        <div class="crack-popup-date">detected ${p.detectedAt}</div>
      </div>`;
    popup.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(html).addTo(map);
  };
  for (const id of ['road-cracks-dot', 'road-cracks-ring']) {
    map.on('click', id, open);
    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
  }
}

function setupLayers(map: MLMap) {
  // Clustering keeps the GPU happy with 60k+ points: at low zoom we paint
  // a few hundred cluster bubbles instead of every individual circle.
  map.addSource('blocks', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    // CRITICAL: clustering strips the top-level feature `id` from leaf points,
    // which silently breaks ALL feature-state (selected + hovered highlights).
    // promoteId rebuilds each leaf's id from its `id` property, so
    // setFeatureState({ id }) actually binds to the rendered dot again.
    promoteId: 'id',
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
      'circle-blur': 0.55,
    },
  });

  // Main marker — compact dots for usability. Selected feature gets a small
  // bump so it stays prominent without crowding. (The selected point is ALSO
  // re-drawn on top via the dedicated overlay layers below so it can never be
  // occluded by neighboring dots in this same layer.)
  map.addLayer({
    id: 'blocks-circle',
    type: 'circle',
    source: 'blocks',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': bandColorExpr,
      // IMPORTANT: MapLibre allows only ONE zoom-based interpolate per
      // property. A `case` wrapping two separate zoom interpolates (selected
      // vs not) is rejected and the WHOLE layer fails to load — which is why
      // individual points vanished above the cluster zoom. Keep a single
      // zoom interpolate and branch on selection inside each stop's output.
      // Explicit high-zoom stops keep dots visible once clusters break apart.
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        10, ['case', ['boolean', ['feature-state', 'selected'], false], 4, 2],
        13, ['case', ['boolean', ['feature-state', 'selected'], false], 5, 2.8],
        16, ['case', ['boolean', ['feature-state', 'selected'], false], 7.5, 5],
        20, ['case', ['boolean', ['feature-state', 'selected'], false], 11, 8],
      ],
      'circle-stroke-color': [
        'case', ['boolean', ['feature-state', 'selected'], false], '#6EC1FF', '#ffffff',
      ],
      'circle-stroke-width': [
        'case',
        ['boolean', ['feature-state', 'selected'], false], 2.5,
        ['boolean', ['feature-state', 'hovered'], false], 1.2,
        0.6,
      ],
      'circle-stroke-opacity': 1,
      // Fully opaque, crisp dots — no zoom-based fade.
      'circle-opacity': 1,
    },
  });

  // ---------- Selected-block overlay (always on top) ----------
  // A separate, un-clustered source holding ONLY the selected block. Because
  // these layers are added last, the chosen point is painted above every other
  // dot in `blocks-circle` — so it can never be hidden behind a neighbor. The
  // ring "breathes" via the pulse loop; the dot mirrors the main marker.
  map.addSource('selected-block', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Breathing accent ring (animated by the pulse loop).
  map.addLayer({
    id: 'selected-ring',
    type: 'circle',
    source: 'selected-block',
    paint: {
      'circle-color': 'rgba(0,0,0,0)', // ring only — no fill
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        10, 9, 14, 13, 18, 19,
      ],
      'circle-stroke-color': '#6EC1FF',
      'circle-stroke-width': 2.5,
      'circle-stroke-opacity': 0.85,
    },
  });

  // The selected dot itself, re-drawn on top of the main marker layer.
  map.addLayer({
    id: 'selected-dot',
    type: 'circle',
    source: 'selected-block',
    paint: {
      'circle-color': bandColorExpr,
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        10, 4, 13, 5, 16, 7.5, 20, 11,
      ],
      'circle-stroke-color': '#6EC1FF',
      'circle-stroke-width': 2.5,
      'circle-stroke-opacity': 1,
      'circle-opacity': 1,
    },
  });

  setupRouteLayers(map);
}

// ---------- Recommended-route overlay (line + numbered stops + depot) -------
// Added last so the route always paints above every other marker. Three small
// GeoJSON sources keep updates cheap; pushRoute() feeds them.
function setupRouteLayers(map: MLMap) {
  for (const id of ['route', 'route-stops', 'route-depot']) {
    if (!map.getSource(id)) {
      map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
  }

  // Color a stop by its risk band, like the rest of the map.
  const stopColorExpr: maplibregl.ExpressionSpecification = [
    'step', ['get', 'score'],
    RISK_BANDS[0].color,
    40, RISK_BANDS[1].color,
    70, RISK_BANDS[2].color,
    90, RISK_BANDS[3].color,
  ];

  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#6EC1FF',
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 16, 4],
      'line-opacity': 0.85,
      'line-dasharray': [2, 1.5],
    },
  });

  // Depot marker.
  map.addLayer({
    id: 'route-depot',
    type: 'circle',
    source: 'route-depot',
    paint: {
      'circle-color': '#0c111c',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, 16, 9],
      'circle-stroke-color': '#6EC1FF',
      'circle-stroke-width': 2.5,
    },
  });
  map.addLayer({
    id: 'route-depot-label',
    type: 'symbol',
    source: 'route-depot',
    layout: {
      'text-field': 'HQ',
      'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
      'text-size': 10,
      'text-offset': [0, -1.4],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': '#6EC1FF', 'text-halo-color': 'rgba(0,0,0,0.65)', 'text-halo-width': 1.2 },
  });

  // Numbered stop markers.
  map.addLayer({
    id: 'route-stops',
    type: 'circle',
    source: 'route-stops',
    paint: {
      'circle-color': stopColorExpr,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 16, 12],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: 'route-stops-label',
    type: 'symbol',
    source: 'route-stops',
    layout: {
      'text-field': ['get', 'order'],
      'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
      'text-size': 11,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.5)', 'text-halo-width': 1 },
  });
}

function pushData(map: MLMap, blocks: Block[], heatmapFactor: string | null) {
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
        // Heatmap value for the active factor (-1 when none/unavailable).
        hm: heatValue(b, heatmapFactor),
      },
    };
  }
  src.setData({ type: 'FeatureCollection', features });
}

// Feed the dedicated overlay source with just the selected block (or clear it).
function pushSelected(map: MLMap, block: Block | null | undefined, heatmapFactor: string | null) {
  const src = map.getSource('selected-block') as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  const features: GeoJSON.Feature[] = block
    ? [{
        type: 'Feature',
        id: block.id,
        geometry: { type: 'Point', coordinates: [block.coordinate.lng, block.coordinate.lat] },
        properties: {
          id: block.id, score: block.riskScore, band: block.riskBand, name: block.name,
          hm: heatValue(block, heatmapFactor),
        },
      }]
    : [];
  src.setData({ type: 'FeatureCollection', features });
}

// Feed the three route sources (or clear them when route is null).
function pushRoute(map: MLMap, route: RouteResult | null) {
  const lineSrc = map.getSource('route') as maplibregl.GeoJSONSource | undefined;
  const stopsSrc = map.getSource('route-stops') as maplibregl.GeoJSONSource | undefined;
  const depotSrc = map.getSource('route-depot') as maplibregl.GeoJSONSource | undefined;
  if (!lineSrc || !stopsSrc || !depotSrc) return;

  if (!route) {
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    lineSrc.setData(empty);
    stopsSrc.setData(empty);
    depotSrc.setData(empty);
    return;
  }

  lineSrc.setData({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: route.line },
    properties: {},
  });
  stopsSrc.setData({
    type: 'FeatureCollection',
    features: route.stops.map(s => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.block.coordinate.lng, s.block.coordinate.lat] },
      properties: { id: s.block.id, order: String(s.order), score: s.block.riskScore },
    })),
  });
  depotSrc.setData({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [route.depot.lng, route.depot.lat] },
    properties: { name: route.depot.name },
  });
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
