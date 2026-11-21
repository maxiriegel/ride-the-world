import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import mlcontour from 'maplibre-contour';
import {
  Bike,
  Compass,
  Layers,
  Minus,
  Moon,
  Mountain,
  Plus,
  Snowflake,
  Sparkles,
  Star,
} from 'lucide-react';
import type { Adventure, FilterMode, TrackPayload, TrackPoint } from '../../types/adventure';
import { REGION_PRESETS } from '../../data/adventures';
import { resolvePublicUrl } from '../../utils/publicUrl';
import { LiquidGlass } from '../glass/LiquidGlass';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

export type MapThemeMode = 'hybrid' | 'topo' | 'night';

interface TopoMapProps {
  adventures: Adventure[];
  selectedAdventure: Adventure | null;
  activeTrack: TrackPayload | null;
  hoveredPoint: TrackPoint | null;
  filterMode: FilterMode;
  mapTheme: MapThemeMode;
  onChangeMapTheme: (theme: MapThemeMode) => void;
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
const ESRI_WORLD_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

let contourProtocolRegistered = false;
let sharedDemSource: InstanceType<typeof mlcontour.DemSource> | null = null;

function ensureContourDemSource() {
  if (!sharedDemSource) {
    sharedDemSource = new mlcontour.DemSource({
      url: TERRARIUM_URL,
      encoding: 'terrarium',
      maxzoom: 13,
      worker: false,
      cacheSize: 120,
    });
  }
  if (!contourProtocolRegistered) {
    sharedDemSource.setupMaplibre(maplibregl);
    contourProtocolRegistered = true;
  }
  return sharedDemSource;
}

interface OriginalLabelStyle {
  textColor: maplibregl.DataDrivenPropertyValueSpecification<string> | undefined;
  haloColor: maplibregl.DataDrivenPropertyValueSpecification<string> | undefined;
  haloWidth: maplibregl.DataDrivenPropertyValueSpecification<number> | undefined;
}

export const TopoMap: React.FC<TopoMapProps> = ({
  adventures,
  selectedAdventure,
  activeTrack,
  hoveredPoint,
  filterMode,
  mapTheme,
  onChangeMapTheme,
  flyRequest,
  isSheetOpen,
  onSelectAdventure,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const hoverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hoverLabelRef = useRef<HTMLDivElement | null>(null);
  const symbolOriginalsRef = useRef<Record<string, OriginalLabelStyle>>({});

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
          const url = resolvePublicUrl(adv.trackFile);
          if (!url) return null;
          const res = await fetch(url);
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

  // Compute screen-space clusters on pan/zoom so pins stay crisp & legible
  const recomputeClusters = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const zoom = map.getZoom();
    const shouldCluster = zoom < 7.2;
    const thresholdPx = zoom < 4.2 ? 50 : zoom < 5.8 ? 38 : 32;

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
      center: [10.65, 47.08],
      zoom: 5.55,
      minZoom: 1.7,
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
      const layers = map.getStyle().layers || [];
      const firstSymbolId = layers.find(
        (l: maplibregl.LayerSpecification) => l.type === 'symbol'
      )?.id;
      const firstBoundaryId =
        layers.find((l: maplibregl.LayerSpecification) => l.id.startsWith('boundary'))?.id ||
        firstSymbolId;
      const firstRoadId =
        layers.find(
          (l: maplibregl.LayerSpecification) =>
            l.id.includes('road') || l.id.includes('highway') || l.id.includes('tunnel')
        )?.id || firstSymbolId;

      if (map.getLayer('building-3d')) {
        map.setLayoutProperty('building-3d', 'visibility', 'none');
      }

      // Save original vector symbol paint properties & enrich vector land/water for Topo mode
      const savedSymbols: Record<string, OriginalLabelStyle> = {};
      for (const lyr of layers) {
        if (lyr.type === 'symbol') {
          savedSymbols[lyr.id] = {
            textColor: (map.getPaintProperty(lyr.id, 'text-color') ?? undefined) as
              | maplibregl.DataDrivenPropertyValueSpecification<string>
              | undefined,
            haloColor: (map.getPaintProperty(lyr.id, 'text-halo-color') ?? undefined) as
              | maplibregl.DataDrivenPropertyValueSpecification<string>
              | undefined,
            haloWidth: (map.getPaintProperty(lyr.id, 'text-halo-width') ?? undefined) as
              | maplibregl.DataDrivenPropertyValueSpecification<number>
              | undefined,
          };
        }
        if (lyr.type === 'background') {
          try {
            map.setPaintProperty(lyr.id, 'background-color', '#0d1b2a');
          } catch {
            // ignore
          }
        }
        if (lyr.type === 'fill' && lyr.id.includes('water')) {
          try {
            map.setPaintProperty(lyr.id, 'fill-color', '#78b7db');
          } catch {
            // ignore
          }
        }
        if (
          lyr.type === 'fill' &&
          (lyr.id.includes('park') || lyr.id.includes('wood') || lyr.id.includes('forest'))
        ) {
          try {
            map.setPaintProperty(lyr.id, 'fill-color', '#bad7b5');
          } catch {
            // ignore
          }
        }
      }
      symbolOriginalsRef.current = savedSymbols;

      // 0. 2D Alpine Satellite Relief Raster Layer (for Hybrid & Night Topo modes)
      if (!map.getSource('esri-world-imagery')) {
        map.addSource('esri-world-imagery', {
          type: 'raster',
          tiles: [ESRI_WORLD_IMAGERY],
          tileSize: 256,
          maxzoom: 17,
          attribution: 'Tiles © Esri, Maxar, Earthstar Geographics',
        });
      }

      if (!map.getLayer('layer-esri-imagery')) {
        map.addLayer(
          {
            id: 'layer-esri-imagery',
            type: 'raster',
            source: 'esri-world-imagery',
            paint: {
              'raster-opacity': 1,
              'raster-saturation': 0.12,
              'raster-contrast': 0.14,
              'raster-brightness-max': 0.9,
            },
          },
          firstBoundaryId
        );
      }

      // 1. Topographic Relief Hillshading (Schummerung) & 2D Contour Isolines
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
                'hillshade-exaggeration': 0.42,
                'hillshade-illumination-direction': 315,
                'hillshade-shadow-color': '#091322',
                'hillshade-highlight-color': '#ffffff',
                'hillshade-accent-color': '#38bdf8',
              },
            },
            firstRoadId
          );
        }

        if (!map.getSource('topo-contours')) {
          map.addSource('topo-contours', {
            type: 'vector',
            tiles: [
              demSource.contourProtocolUrl({
                multiplier: 1,
                thresholds: {
                  8: [300, 1200],
                  10: [150, 750],
                  12: [50, 250],
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
              minzoom: 8,
              paint: {
                'line-color': 'rgba(255, 255, 255, 0.24)',
                'line-width': ['match', ['get', 'level'], 1, 1.25, 0.6],
              },
            },
            firstSymbolId
          );
        }
      } catch {
        // Fallback cleanly if external DEM source is unreachable
      }

      // 2. Overview Bike Tracks Source & Layers
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
            'line-color': 'rgba(255, 255, 255, 0.92)',
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3.6, 8, 5.8, 12, 7.2],
            'line-opacity': 0.9,
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
              '#f59e0b',
              '#ff5a1f',
            ],
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2.1, 8, 3.5, 12, 4.5],
            'line-opacity': 0.92,
          },
        },
        firstSymbolId
      );

      // 3. Active Selected Route / Stage Source & Layers
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
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 8, 10, 11, 14, 13],
          'line-opacity': 0.96,
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
          'line-color': '#ff5514',
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 4.2, 10, 6.0, 14, 7.2],
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
          'line-color': '#f59e0b',
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 4.0, 10, 5.6, 14, 6.8],
          'line-dasharray': [2, 1.7],
        },
      });

      map.addLayer({
        id: 'active-track-endpoints',
        type: 'circle',
        source: 'active-track',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': ['match', ['get', 'kind'], 'start', '#22c55e', '#0f172a'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.8,
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

  // Synchronize Map Theme (Hybrid Aerial Relief / Bright Alpine Topo / Dark Night Topo) + Season
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const isImagery = mapTheme === 'hybrid' || mapTheme === 'night';

    if (map.getLayer('background')) {
      try {
        map.setPaintProperty('background', 'background-color', isImagery ? '#0d1b2a' : '#e7efe5');
      } catch {
        // ignore
      }
    }

    if (map.getLayer('layer-esri-imagery')) {
      map.setLayoutProperty('layer-esri-imagery', 'visibility', isImagery ? 'visible' : 'none');
      if (mapTheme === 'hybrid') {
        map.setPaintProperty(
          'layer-esri-imagery',
          'raster-saturation',
          filterMode === 'winter' ? -0.05 : 0.14
        );
        map.setPaintProperty('layer-esri-imagery', 'raster-contrast', 0.15);
        map.setPaintProperty('layer-esri-imagery', 'raster-brightness-max', 0.9);
      } else if (mapTheme === 'night') {
        map.setPaintProperty('layer-esri-imagery', 'raster-saturation', -0.58);
        map.setPaintProperty('layer-esri-imagery', 'raster-contrast', 0.3);
        map.setPaintProperty('layer-esri-imagery', 'raster-brightness-max', 0.34);
      }
    }

    // Move hillshade & tune exaggeration per map theme
    if (map.getLayer('topo-hillshade')) {
      if (mapTheme === 'topo') {
        map.setPaintProperty('topo-hillshade', 'hillshade-exaggeration', 0.8);
        if (filterMode === 'summer') {
          map.setPaintProperty('topo-hillshade', 'hillshade-shadow-color', '#4c3828');
          map.setPaintProperty('topo-hillshade', 'hillshade-highlight-color', '#fffaf0');
          map.setPaintProperty('topo-hillshade', 'hillshade-accent-color', '#a86b3e');
        } else if (filterMode === 'winter') {
          map.setPaintProperty('topo-hillshade', 'hillshade-shadow-color', '#24496e');
          map.setPaintProperty('topo-hillshade', 'hillshade-highlight-color', '#ffffff');
          map.setPaintProperty('topo-hillshade', 'hillshade-accent-color', '#4fa3d8');
        } else {
          map.setPaintProperty('topo-hillshade', 'hillshade-shadow-color', '#2f4b61');
          map.setPaintProperty('topo-hillshade', 'hillshade-highlight-color', '#ffffff');
          map.setPaintProperty('topo-hillshade', 'hillshade-accent-color', '#5f8b6e');
        }
      } else {
        map.setPaintProperty('topo-hillshade', 'hillshade-exaggeration', 0.32);
        map.setPaintProperty('topo-hillshade', 'hillshade-shadow-color', '#060d18');
        map.setPaintProperty('topo-hillshade', 'hillshade-highlight-color', '#e0f2fe');
      }
    }

    if (map.getLayer('topo-contour-lines')) {
      if (mapTheme === 'topo') {
        map.setPaintProperty(
          'topo-contour-lines',
          'line-color',
          filterMode === 'winter' ? 'rgba(38, 92, 142, 0.34)' : 'rgba(104, 82, 56, 0.34)'
        );
      } else if (mapTheme === 'night') {
        map.setPaintProperty('topo-contour-lines', 'line-color', 'rgba(125, 211, 252, 0.22)');
      } else {
        map.setPaintProperty('topo-contour-lines', 'line-color', 'rgba(255, 255, 255, 0.25)');
      }
    }

    // Crisp adaptive place/peak labels across dark imagery vs bright cartographic topo
    const layers = map.getStyle().layers || [];
    for (const lyr of layers) {
      if (lyr.type !== 'symbol') continue;
      const orig = symbolOriginalsRef.current[lyr.id];
      try {
        if (isImagery) {
          map.setPaintProperty(lyr.id, 'text-color', 'rgba(255, 255, 255, 0.95)');
          map.setPaintProperty(lyr.id, 'text-halo-color', 'rgba(6, 12, 24, 0.86)');
          map.setPaintProperty(lyr.id, 'text-halo-width', 1.8);
        } else if (orig) {
          if (orig.textColor !== undefined)
            map.setPaintProperty(lyr.id, 'text-color', orig.textColor);
          if (orig.haloColor !== undefined)
            map.setPaintProperty(lyr.id, 'text-halo-color', orig.haloColor);
          if (orig.haloWidth !== undefined)
            map.setPaintProperty(lyr.id, 'text-halo-width', orig.haloWidth);
        }
      } catch {
        // Ignore non-text symbol layers (e.g. pure icon shields)
      }
    }
  }, [mapTheme, filterMode, mapReady]);

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
      : { top: 115, bottom: 120, left: 60, right: isSheetOpen ? 480 : 60 };

    if (activeTrack && activeTrack.points.length >= 2) {
      const coords = activeTrack.points.map((p): [number, number] => [p[0], p[1]]);
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
      padding: { top: 85, bottom: 95, left: 40, right: isSheetOpen ? 470 : 40 },
      duration: 1100,
    });
  }, [flyRequest, isSheetOpen, mapReady]);

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
                <span className="map-cluster__sheen" />
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
                {isBike ? (
                  <Bike size={15} strokeWidth={2.4} />
                ) : (
                  <Snowflake size={15} strokeWidth={2.4} />
                )}
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

      {/* Right-Side Map Style & Camera Liquid Glass Stack */}
      <div className="map-controls-stack">
        {/* 2D Map Atmosphere Switcher (Apple Maps Hybrid / Topo / Night) */}
        <LiquidGlass
          variant="clear"
          radius={22}
          className="map-style-pill"
          aria-label="Kartenstil wählen"
        >
          <button
            id="map-theme-hybrid-btn"
            type="button"
            className={`map-style-btn ${mapTheme === 'hybrid' ? 'map-style-btn--active' : ''}`}
            title="Alpin-Hybrid (Luftbild + Höhenlinien)"
            aria-label="Alpin-Hybrid"
            onClick={() => onChangeMapTheme('hybrid')}
          >
            <Layers size={15} />
            <span>Hybrid</span>
          </button>
          <button
            id="map-theme-topo-btn"
            type="button"
            className={`map-style-btn ${mapTheme === 'topo' ? 'map-style-btn--active' : ''}`}
            title="Klassische 2D-Topografie mit Schummerung"
            aria-label="2D-Topografie"
            onClick={() => onChangeMapTheme('topo')}
          >
            <Mountain size={15} />
            <span>Topo</span>
          </button>
          <button
            id="map-theme-night-btn"
            type="button"
            className={`map-style-btn ${mapTheme === 'night' ? 'map-style-btn--active' : ''}`}
            title="Dunkles Alpin-Relief"
            aria-label="Nacht-Relief"
            onClick={() => onChangeMapTheme('night')}
          >
            <Moon size={15} />
            <span>Nacht</span>
          </button>
        </LiquidGlass>

        {/* Zoom & World Reset Capsule */}
        <LiquidGlass
          variant="clear"
          radius={22}
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
    </div>
  );
};
