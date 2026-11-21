import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import mlcontour from 'maplibre-contour';
import { Bike, Compass, Minus, Plus, Snowflake, Sparkles, Star } from 'lucide-react';
import type { Adventure, FilterMode, TrackPayload, TrackPoint } from '../../types/adventure';
import { REGION_PRESETS } from '../../data/adventures';
import { LiquidGlass } from '../glass/LiquidGlass';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

interface TopoMapProps {
  adventures: Adventure[];
  selectedAdventure: Adventure | null;
  activeTrack: TrackPayload | null;
  hoveredPoint: TrackPoint | null;
  filterMode: FilterMode;
  flyRequest: { center: [number, number]; zoom: number; seq: number } | null;
  isSheetOpen: boolean;
  onSelectAdventure: (adventure: Adventure) => void;
}

interface ScreenCluster {
  id: string;
  x: number;
  y: number;
  lng: number;
  lat: number;
  items: Adventure[];
}

const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

let contourProtocolRegistered = false;
let sharedDemSource: InstanceType<typeof mlcontour.DemSource> | null = null;

function ensureContourDemSource() {
  if (!sharedDemSource) {
    sharedDemSource = new mlcontour.DemSource({
      url: TERRARIUM_URL,
      encoding: 'terrarium',
      maxzoom: 13,
      worker: false,
      cacheSize: 100,
    });
  }
  if (!contourProtocolRegistered) {
    sharedDemSource.setupMaplibre(maplibregl);
    contourProtocolRegistered = true;
  }
  return sharedDemSource;
}

export const TopoMap: React.FC<TopoMapProps> = ({
  adventures,
  selectedAdventure,
  activeTrack,
  hoveredPoint,
  filterMode,
  flyRequest,
  isSheetOpen,
  onSelectAdventure,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const hoverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hoverLabelRef = useRef<HTMLDivElement | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [clusters, setClusters] = useState<ScreenCluster[]>([]);
  const [overviewTracks, setOverviewTracks] = useState<Record<string, TrackPayload>>({});

  // Preload lightweight overview tracks for visible Bike routes
  useEffect(() => {
    let cancelled = false;
    const bikeWithTracks = adventures.filter((a) => a.trackFile);
    Promise.all(
      bikeWithTracks.map(async (adv) => {
        try {
          const res = await fetch(adv.trackFile!);
          if (!res.ok) return null;
          const json = (await res.json()) as TrackPayload;
          return [adv.slug, json] as const;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      const mapObj: Record<string, TrackPayload> = {};
      for (const entry of entries) {
        if (entry) mapObj[entry[0]] = entry[1];
      }
      setOverviewTracks(mapObj);
    });

    return () => {
      cancelled = true;
    };
  }, [adventures]);

  // Compute screen-space clusters on pan/zoom so pins never overlap in DACH
  const recomputeClusters = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const zoom = map.getZoom();
    const shouldCluster = zoom < 8.6;
    const thresholdPx = zoom < 4.5 ? 58 : zoom < 6.8 ? 50 : 40;

    const projected = adventures.map((adv) => {
      const pt = map.project(adv.coordinates);
      return { adv, x: pt.x, y: pt.y };
    });

    if (!shouldCluster) {
      setClusters(
        projected.map((p) => ({
          id: p.adv.slug,
          x: p.x,
          y: p.y,
          lng: p.adv.coordinates[0],
          lat: p.adv.coordinates[1],
          items: [p.adv],
        }))
      );
      return;
    }

    const used = new Set<string>();
    const grouped: ScreenCluster[] = [];

    // Keep currently selected adventure unclustered so its active pin stays visible
    for (const p of projected) {
      if (selectedAdventure && p.adv.slug === selectedAdventure.slug) {
        used.add(p.adv.slug);
        grouped.push({
          id: p.adv.slug,
          x: p.x,
          y: p.y,
          lng: p.adv.coordinates[0],
          lat: p.adv.coordinates[1],
          items: [p.adv],
        });
      }
    }

    for (let i = 0; i < projected.length; i++) {
      const seed = projected[i];
      if (used.has(seed.adv.slug)) continue;
      used.add(seed.adv.slug);

      const members = [seed];
      for (let j = i + 1; j < projected.length; j++) {
        const cand = projected[j];
        if (used.has(cand.adv.slug)) continue;
        const dist = Math.hypot(seed.x - cand.x, seed.y - cand.y);
        if (dist <= thresholdPx) {
          used.add(cand.adv.slug);
          members.push(cand);
        }
      }

      const avgX = members.reduce((s, m) => s + m.x, 0) / members.length;
      const avgY = members.reduce((s, m) => s + m.y, 0) / members.length;
      const avgLng = members.reduce((s, m) => s + m.adv.coordinates[0], 0) / members.length;
      const avgLat = members.reduce((s, m) => s + m.adv.coordinates[1], 0) / members.length;

      grouped.push({
        id: members.map((m) => m.adv.slug).join('+'),
        x: avgX,
        y: avgY,
        lng: avgLng,
        lat: avgLat,
        items: members.map((m) => m.adv),
      });
    }

    setClusters(grouped);
  }, [adventures, selectedAdventure]);

  // Initialize MapLibre 2D Topographic Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const demSource = ensureContourDemSource();

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: OPENFREEMAP_STYLE,
      center: REGION_PRESETS.dach.center,
      zoom: 4.85,
      minZoom: 1.6,
      maxZoom: 16,
      pitch: 0,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('style.load', () => {
      // Find first label or road layer to insert topographic relief & contours cleanly underneath labels
      const layers = map.getStyle().layers || [];
      const firstSymbolId = layers.find((l: maplibregl.LayerSpecification) => l.type === 'symbol')?.id;
      const firstRoadId =
        layers.find(
          (l: maplibregl.LayerSpecification) =>
            l.id.includes('road') || l.id.includes('highway') || l.id.includes('tunnel')
        )?.id || firstSymbolId;

      // 1. Topographic Relief Hillshading (Schummerung)
      try {
        if (!map.getSource('topo-dem')) {
          map.addSource('topo-dem', {
            type: 'raster-dem',
            tiles: [TERRARIUM_URL],
            encoding: 'terrarium',
            tileSize: 256,
            maxzoom: 13,
          });
        }

        if (!map.getLayer('topo-hillshade')) {
          map.addLayer(
            {
              id: 'topo-hillshade',
              type: 'hillshade',
              source: 'topo-dem',
              paint: {
                'hillshade-exaggeration': 0.56,
                'hillshade-illumination-direction': 315,
                'hillshade-shadow-color': '#445a6d',
                'hillshade-highlight-color': '#ffffff',
                'hillshade-accent-color': '#78947c',
              },
            },
            firstRoadId
          );
        }

        // 2. Live 2D Topographic Contour Lines
        if (!map.getSource('topo-contours')) {
          map.addSource('topo-contours', {
            type: 'vector',
            tiles: [
              demSource.contourProtocolUrl({
                multiplier: 1,
                thresholds: {
                  9: [250, 1000],
                  11: [100, 500],
                  13: [50, 250],
                },
                elevationKey: 'ele',
                levelKey: 'level',
                contourLayer: 'contours',
              }),
            ],
            maxzoom: 15,
          });
        }

        if (!map.getLayer('topo-contour-lines')) {
          map.addLayer(
            {
              id: 'topo-contour-lines',
              type: 'line',
              source: 'topo-contours',
              'source-layer': 'contours',
              minzoom: 9,
              paint: {
                'line-color': 'rgba(92, 104, 88, 0.28)',
                'line-width': ['match', ['get', 'level'], 1, 1.15, 0.55],
              },
            },
            firstRoadId
          );
        }
      } catch {
        // Fallback cleanly if external DEM source is unreachable
      }

      // 3. Overview Bike Tracks Source & Layers
      map.addSource('overview-tracks', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer(
        {
          id: 'overview-tracks-casing',
          type: 'line',
          source: 'overview-tracks',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': 'rgba(255, 255, 255, 0.82)',
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3.2, 8, 5.2, 12, 6.5],
            'line-opacity': 0.85,
          },
        },
        firstSymbolId
      );

      map.addLayer(
        {
          id: 'overview-tracks-line',
          type: 'line',
          source: 'overview-tracks',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'isShopPack'], true],
              '#d97706',
              '#ea580c',
            ],
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.8, 8, 3.1, 12, 4.0],
            'line-opacity': 0.75,
          },
        },
        firstSymbolId
      );

      // 4. Active Selected Route / Stage Source & Layers
      map.addSource('active-track', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'active-track-glow',
        type: 'line',
        source: 'active-track',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 7, 10, 10, 14, 12],
          'line-opacity': 0.94,
        },
      });

      map.addLayer({
        id: 'active-track-line',
        type: 'line',
        source: 'active-track',
        filter: [
          'all',
          ['==', ['geometry-type'], 'LineString'],
          ['!=', ['get', 'isPreviewOnly'], true],
        ],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ea580c',
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3.8, 10, 5.4, 14, 6.6],
        },
      });

      map.addLayer({
        id: 'active-track-preview-dashed',
        type: 'line',
        source: 'active-track',
        filter: [
          'all',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['get', 'isPreviewOnly'], true],
        ],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#d97706',
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3.6, 10, 5.0, 14, 6.2],
          'line-dasharray': [2, 1.8],
        },
      });

      map.addLayer({
        id: 'active-track-endpoints',
        type: 'circle',
        source: 'active-track',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 6.5,
          'circle-color': ['match', ['get', 'kind'], 'start', '#16a34a', '#0f172a'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
        },
      });

      setMapReady(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Keep cluster projection synced immediately as soon as map instance exists
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    recomputeClusters();
    const handler = () => recomputeClusters();
    map.on('move', handler);
    map.on('resize', handler);
    return () => {
      map.off('move', handler);
      map.off('resize', handler);
    };
  }, [mapReady, recomputeClusters]);

  // Apply seasonal topographic atmosphere (All / Summer Bike / Winter Ski)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer('topo-hillshade')) return;

    if (filterMode === 'summer') {
      map.setPaintProperty('topo-hillshade', 'hillshade-shadow-color', '#5a4635');
      map.setPaintProperty('topo-hillshade', 'hillshade-highlight-color', '#fffaf2');
      map.setPaintProperty('topo-hillshade', 'hillshade-accent-color', '#b87d4b');
      if (map.getLayer('topo-contour-lines')) {
        map.setPaintProperty('topo-contour-lines', 'line-color', 'rgba(130, 88, 52, 0.28)');
      }
    } else if (filterMode === 'winter') {
      map.setPaintProperty('topo-hillshade', 'hillshade-shadow-color', '#2d5378');
      map.setPaintProperty('topo-hillshade', 'hillshade-highlight-color', '#ffffff');
      map.setPaintProperty('topo-hillshade', 'hillshade-accent-color', '#5ea8d6');
      if (map.getLayer('topo-contour-lines')) {
        map.setPaintProperty('topo-contour-lines', 'line-color', 'rgba(46, 98, 145, 0.26)');
      }
    } else {
      map.setPaintProperty('topo-hillshade', 'hillshade-shadow-color', '#445a6d');
      map.setPaintProperty('topo-hillshade', 'hillshade-highlight-color', '#ffffff');
      map.setPaintProperty('topo-hillshade', 'hillshade-accent-color', '#78947c');
      if (map.getLayer('topo-contour-lines')) {
        map.setPaintProperty('topo-contour-lines', 'line-color', 'rgba(92, 104, 88, 0.26)');
      }
    }
  }, [filterMode, mapReady]);

  // Sync overview polylines for filtered Bike adventures
  const visibleSlugs = useMemo(() => new Set(adventures.map((a) => a.slug)), [adventures]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('overview-tracks') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features: Array<{
      type: 'Feature';
      properties: { slug: string; isShopPack: boolean; category: string };
      geometry: { type: 'LineString'; coordinates: [number, number][] };
    }> = [];
    for (const adv of adventures) {
      if (!visibleSlugs.has(adv.slug)) continue;
      if (selectedAdventure?.slug === adv.slug) continue;
      const track = overviewTracks[adv.slug];
      if (!track || track.points.length < 2) continue;

      features.push({
        type: 'Feature',
        properties: {
          slug: adv.slug,
          isShopPack: adv.accessType === 'shop-pack',
          category: adv.category,
        },
        geometry: {
          type: 'LineString',
          coordinates: track.points.map((p): [number, number] => [p[0], p[1]]),
        },
      });
    }

    src.setData({ type: 'FeatureCollection', features });
  }, [adventures, visibleSlugs, overviewTracks, selectedAdventure, mapReady]);

  // Sync active selected route / stage track & fit camera smoothly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('active-track') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (!selectedAdventure) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const isMobile = window.innerWidth < 860;
    const padding = isMobile
      ? { top: 110, bottom: isSheetOpen ? 360 : 90, left: 36, right: 36 }
      : { top: 115, bottom: 110, left: 60, right: isSheetOpen ? 470 : 60 };

    if (activeTrack && activeTrack.points.length >= 2) {
      const coords = activeTrack.points.map((p) => [p[0], p[1]]);
      const first = coords[0];
      const last = coords[coords.length - 1];

      src.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              isPreviewOnly: Boolean(activeTrack.isPreviewOnly),
            },
            geometry: {
              type: 'LineString',
              coordinates: coords,
            },
          },
          {
            type: 'Feature',
            properties: { kind: 'start' },
            geometry: { type: 'Point', coordinates: first },
          },
          {
            type: 'Feature',
            properties: { kind: 'end' },
            geometry: { type: 'Point', coordinates: last },
          },
        ],
      });

      map.fitBounds(
        [
          [activeTrack.bbox[0], activeTrack.bbox[1]],
          [activeTrack.bbox[2], activeTrack.bbox[3]],
        ],
        { padding, maxZoom: 13.2, duration: 1050 }
      );
    } else {
      src.setData({ type: 'FeatureCollection', features: [] });
      map.flyTo({
        center: selectedAdventure.coordinates,
        zoom: selectedAdventure.zoomLevel ?? 11.2,
        padding,
        duration: 1050,
      });
    }
  }, [selectedAdventure, activeTrack, isSheetOpen, mapReady]);

  // Handle explicit region jump requests
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !flyRequest) return;
    map.flyTo({
      center: flyRequest.center,
      zoom: flyRequest.zoom,
      padding: { top: 80, bottom: 80, left: 40, right: 40 },
      duration: 1100,
    });
  }, [flyRequest, mapReady]);

  // Live Elevation Profile Hover Puck on the Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!hoveredPoint) {
      hoverMarkerRef.current?.remove();
      hoverMarkerRef.current = null;
      return;
    }

    if (!hoverMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'map-hover-puck';
      const dot = document.createElement('div');
      dot.className = 'map-hover-puck__dot';
      const label = document.createElement('div');
      label.className = 'map-hover-puck__label';
      el.appendChild(label);
      el.appendChild(dot);
      hoverLabelRef.current = label;
      hoverMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([hoveredPoint[0], hoveredPoint[1]])
        .addTo(map);
    } else {
      hoverMarkerRef.current.setLngLat([hoveredPoint[0], hoveredPoint[1]]);
    }

    if (hoverLabelRef.current) {
      hoverLabelRef.current.textContent = `${hoveredPoint[2].toLocaleString('de-DE')} m · ${hoveredPoint[3].toFixed(1).replace('.', ',')} km`;
    }
  }, [hoveredPoint, mapReady]);

  const handleClusterClick = (cluster: ScreenCluster) => {
    const map = mapRef.current;
    if (!map) return;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const item of cluster.items) {
      minLng = Math.min(minLng, item.coordinates[0]);
      maxLng = Math.max(maxLng, item.coordinates[0]);
      minLat = Math.min(minLat, item.coordinates[1]);
      maxLat = Math.max(maxLat, item.coordinates[1]);
    }
    const span = Math.max(maxLng - minLng, maxLat - minLat);
    if (span < 0.05) {
      map.flyTo({ center: [cluster.lng, cluster.lat], zoom: map.getZoom() + 2.4, duration: 750 });
    } else {
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 110, maxZoom: 11.5, duration: 850 }
      );
    }
  };

  return (
    <div className="topo-stage">
      <div ref={mapContainerRef} id="topo-world-map" className="topo-canvas" />

      {/* Subtle seasonal atmospheric tint overlay */}
      <div className="topo-season-veil" aria-hidden="true" />

      {/* Screen-space Liquid Glass Clusters & Custom Pins */}
      <div className="topo-overlay-markers">
        {clusters.map((cluster) => {
          if (cluster.items.length > 1) {
            const bikeCount = cluster.items.filter((i) => i.season === 'summer').length;
            const skiCount = cluster.items.length - bikeCount;
            const tone =
              bikeCount > 0 && skiCount > 0 ? 'mixed' : bikeCount > 0 ? 'summer' : 'winter';

            return (
              <button
                key={cluster.id}
                type="button"
                className={`map-cluster map-cluster--${tone}`}
                style={{ transform: `translate3d(${cluster.x}px, ${cluster.y}px, 0)` }}
                onClick={() => handleClusterClick(cluster)}
                aria-label={`${cluster.items.length} Abenteuer in dieser Region anzeigen`}
              >
                <span className="map-cluster__ring" />
                <span className="map-cluster__count">{cluster.items.length}</span>
                <span className="map-cluster__dots">
                  {bikeCount > 0 && <i className="dot dot--bike" />}
                  {skiCount > 0 && <i className="dot dot--ski" />}
                </span>
              </button>
            );
          }

          const adv = cluster.items[0];
          const isSelected = selectedAdventure?.slug === adv.slug;
          const isBike = adv.season === 'summer';

          return (
            <button
              key={adv.slug}
              id={`pin-${adv.slug}`}
              type="button"
              className={`map-pin map-pin--${adv.season} ${isSelected ? 'map-pin--selected' : ''}`}
              style={{ transform: `translate3d(${cluster.x}px, ${cluster.y}px, 0)` }}
              onClick={() => onSelectAdventure(adv)}
              aria-label={`${adv.title} öffnen`}
            >
              {isSelected && <span className="map-pin__pulse" />}
              <span className="map-pin__core">
                {isBike ? <Bike size={15} strokeWidth={2.3} /> : <Snowflake size={15} strokeWidth={2.3} />}
                {adv.accessType === 'shop-pack' ? (
                  <span className="map-pin__badge map-pin__badge--shop" title="Marius Routen-Paket">
                    <Sparkles size={9} />
                  </span>
                ) : adv.isFavorite ? (
                  <span className="map-pin__badge" title="Marius Favorit">
                    <Star size={8} fill="currentColor" />
                  </span>
                ) : null}
              </span>
              <span className="map-pin__caption">{adv.title.split(':')[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Floating Liquid Glass Zoom & World Controls */}
      <LiquidGlass
        variant="clear"
        radius={20}
        className="map-controls-pill"
        aria-label="Kartensteuerung"
      >
        <button
          id="map-zoom-in-btn"
          type="button"
          className="map-ctrl-btn"
          title="Hineinzoomen"
          aria-label="Hineinzoomen"
          onClick={() => mapRef.current?.zoomIn({ duration: 280 })}
        >
          <Plus size={17} />
        </button>
        <div className="map-ctrl-divider" />
        <button
          id="map-zoom-out-btn"
          type="button"
          className="map-ctrl-btn"
          title="Herauszoomen"
          aria-label="Herauszoomen"
          onClick={() => mapRef.current?.zoomOut({ duration: 280 })}
        >
          <Minus size={17} />
        </button>
        <div className="map-ctrl-divider" />
        <button
          id="map-reset-world-btn"
          type="button"
          className="map-ctrl-btn"
          title="Auf Weltübersicht zoomen"
          aria-label="Auf Weltübersicht zoomen"
          onClick={() =>
            mapRef.current?.flyTo({
              center: REGION_PRESETS.world.center,
              zoom: REGION_PRESETS.world.zoom,
              duration: 950,
            })
          }
        >
          <Compass size={17} />
        </button>
      </LiquidGlass>
    </div>
  );
};
