import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { ADVENTURES, REGION_PRESETS } from './data/adventures';
import type {
  Adventure,
  FilterMode,
  RegionId,
  TrackPayload,
  TrackPoint,
} from './types/adventure';
import { FloatingTopBar, type ActiveFilters } from './components/bar/FloatingTopBar';
import { DiscoveryDock } from './components/dock/DiscoveryDock';
import type { MapThemeMode } from './components/map/TopoMap';
import { AdventureSheet, type MobileSheetSnap } from './components/sheet/AdventureSheet';
import { resolvePublicUrl } from './utils/publicUrl';

// Code-split heavy MapLibre WebGL bundle so the Liquid Glass UI shell renders instantaneously on mobile!
const LazyTopoMap = lazy(() => import('./components/map/TopoMap'));

const DEFAULT_FILTERS: ActiveFilters = {
  mode: 'all',
  search: '',
  subDisciplines: [],
  difficulties: [],
  onlyFavorites: false,
  onlyMultiDay: false,
  onlyFreeGpx: false,
  elevationBand: 'all',
};

function readInitialUrlState(): {
  mode: FilterMode;
  tourSlug: string | null;
  stageNum: number | null;
  mapTheme: MapThemeMode;
} {
  if (typeof window === 'undefined') {
    return { mode: 'all', tourSlug: null, stageNum: null, mapTheme: 'hybrid' };
  }
  const params = new URLSearchParams(window.location.search);
  const rawMode = params.get('mode');
  const mode: FilterMode =
    rawMode === 'summer' || rawMode === 'bike'
      ? 'summer'
      : rawMode === 'winter' || rawMode === 'ski'
        ? 'winter'
        : 'all';
  const rawMap = params.get('map');
  const mapTheme: MapThemeMode =
    rawMap === 'topo' ? 'topo' : rawMap === 'night' ? 'night' : 'hybrid';
  const tourSlug = params.get('tour');
  const rawStage = params.get('stage');
  const stageNum = rawStage ? Number(rawStage) || null : null;
  return { mode, tourSlug, stageNum, mapTheme };
}

export const App: React.FC = () => {
  const initial = useMemo(() => readInitialUrlState(), []);

  const [filters, setFilters] = useState<ActiveFilters>(() => ({
    ...DEFAULT_FILTERS,
    mode: initial.mode,
  }));
  const [mapTheme, setMapTheme] = useState<MapThemeMode>(initial.mapTheme);
  const [selectedAdventure, setSelectedAdventure] = useState<Adventure | null>(() =>
    initial.tourSlug ? ADVENTURES.find((a) => a.slug === initial.tourSlug) ?? null : null
  );
  const [mobileSnap, setMobileSnap] = useState<MobileSheetSnap>('peek');
  const [activeStageNumber, setActiveStageNumber] = useState<number | null>(initial.stageNum);
  const [trackMap, setTrackMap] = useState<Record<string, TrackPayload>>({});
  const [hoveredTrackPoint, setHoveredTrackPoint] = useState<TrackPoint | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeRegion, setActiveRegion] = useState<'world' | RegionId | null>('dach');
  const [flyRequest, setFlyRequest] = useState<{
    center: [number, number];
    zoom: number;
    seq: number;
  } | null>(null);

  const targetTrackUrl = useMemo(() => {
    if (!selectedAdventure) return null;
    const stageObj =
      activeStageNumber !== null
        ? selectedAdventure.stages?.find((s) => s.stageNumber === activeStageNumber)
        : undefined;
    return resolvePublicUrl(stageObj?.trackFile || selectedAdventure.trackFile);
  }, [selectedAdventure, activeStageNumber]);

  const activeTrack = targetTrackUrl ? trackMap[targetTrackUrl] ?? null : null;

  // Safeguard against accidental "Desktop site" checkbox on small physical smartphones
  // and continuously sync live visualViewport height so bottom browser address bars never cover UI!
  useEffect(() => {
    const syncForcedDesktopPhone = () => {
      const isCoarse = window.matchMedia?.('(pointer: coarse)').matches;
      const minPhysScreen = Math.min(window.screen.width || 9999, window.screen.height || 9999);
      if (isCoarse && minPhysScreen <= 480 && window.innerWidth >= 820) {
        const vpMeta = document.querySelector('meta[name="viewport"]');
        if (vpMeta) {
          vpMeta.setAttribute(
            'content',
            `width=${Math.max(375, minPhysScreen)}, initial-scale=1.0, viewport-fit=cover`
          );
        }
      }
    };

    const syncVisualViewportHeight = () => {
      const vv = window.visualViewport;
      const visibleH =
        vv && (!vv.scale || vv.scale <= 1.05)
          ? Math.min(window.innerHeight, vv.height)
          : window.innerHeight;
      if (visibleH > 120) {
        document.documentElement.style.setProperty('--app-vh', `${Math.round(visibleH)}px`);
      }
    };

    syncForcedDesktopPhone();
    syncVisualViewportHeight();

    window.addEventListener('resize', syncVisualViewportHeight);
    window.addEventListener('orientationchange', syncVisualViewportHeight);
    window.visualViewport?.addEventListener('resize', syncVisualViewportHeight);
    window.visualViewport?.addEventListener('scroll', syncVisualViewportHeight);

    return () => {
      window.removeEventListener('resize', syncVisualViewportHeight);
      window.removeEventListener('orientationchange', syncVisualViewportHeight);
      window.visualViewport?.removeEventListener('resize', syncVisualViewportHeight);
      window.visualViewport?.removeEventListener('scroll', syncVisualViewportHeight);
    };
  }, []);

  // Sync season & mapTheme attributes on <html> for adaptive Liquid Glass & ink tokens
  useEffect(() => {
    if (filters.mode === 'all') {
      delete document.documentElement.dataset.season;
    } else {
      document.documentElement.dataset.season = filters.mode;
    }
  }, [filters.mode]);

  useEffect(() => {
    document.documentElement.dataset.mapTheme = mapTheme;
  }, [mapTheme]);

  // Sync URL query params cleanly for shareable deep-links
  useEffect(() => {
    const url = new URL(window.location.href);
    if (filters.mode === 'summer') url.searchParams.set('mode', 'bike');
    else if (filters.mode === 'winter') url.searchParams.set('mode', 'ski');
    else url.searchParams.delete('mode');

    if (mapTheme !== 'hybrid') url.searchParams.set('map', mapTheme);
    else url.searchParams.delete('map');

    if (selectedAdventure) {
      url.searchParams.set('tour', selectedAdventure.slug);
      if (activeStageNumber !== null) {
        url.searchParams.set('stage', String(activeStageNumber));
      } else {
        url.searchParams.delete('stage');
      }
    } else {
      url.searchParams.delete('tour');
      url.searchParams.delete('stage');
    }

    window.history.replaceState({}, '', url.toString());
  }, [filters.mode, mapTheme, selectedAdventure, activeStageNumber]);

  // Escape key closes open popover or detail sheet
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFilterOpen) setIsFilterOpen(false);
        else if (selectedAdventure) {
          setSelectedAdventure(null);
          setActiveStageNumber(null);
          setHoveredTrackPoint(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFilterOpen, selectedAdventure]);

  // Fetch uncached route or stage track JSON asynchronously
  useEffect(() => {
    if (!targetTrackUrl || trackMap[targetTrackUrl]) return;

    let cancelled = false;
    fetch(targetTrackUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: TrackPayload | null) => {
        if (cancelled || !data) return;
        setTrackMap((prev) => ({ ...prev, [targetTrackUrl]: data }));
      })
      .catch(() => {
        // Ignore network failure
      });

    return () => {
      cancelled = true;
    };
  }, [targetTrackUrl, trackMap]);

  // Filtered adventures
  const filteredAdventures = useMemo(() => {
    const q = filters.search.trim().toLowerCase();

    return ADVENTURES.filter((adv) => {
      if (filters.mode !== 'all' && adv.season !== filters.mode) return false;
      if (filters.onlyFavorites && !adv.isFavorite) return false;
      if (filters.onlyMultiDay && adv.category !== 'multi-day-bike') return false;
      if (filters.onlyFreeGpx && adv.accessType !== 'free') return false;

      if (
        filters.subDisciplines.length > 0 &&
        !filters.subDisciplines.includes(adv.subDiscipline)
      ) {
        return false;
      }

      if (filters.difficulties.length > 0 && !filters.difficulties.includes(adv.difficulty)) {
        return false;
      }

      if (filters.elevationBand !== 'all') {
        if (adv.season === 'summer' && adv.bikeMetrics) {
          const hm = adv.bikeMetrics.elevationUpM;
          if (filters.elevationBand === 'under1000' && hm > 1000) return false;
          if (filters.elevationBand === '1000to3000' && (hm < 1000 || hm > 3000)) return false;
          if (filters.elevationBand === 'over3000' && hm <= 3000) return false;
        } else if (adv.season === 'winter' && adv.skiMetrics) {
          const peak = adv.skiMetrics.peakElevationM;
          if (filters.elevationBand === 'under1000' && peak > 2000) return false;
          if (filters.elevationBand === '1000to3000' && (peak < 2000 || peak > 3000)) return false;
          if (filters.elevationBand === 'over3000' && peak <= 3000) return false;
        }
      }

      if (q) {
        const haystack = [
          adv.title,
          adv.subtitle,
          adv.locationLabel,
          adv.countryCode,
          adv.summary,
          ...adv.highlights,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [filters]);

  const totalKm = useMemo(() => {
    return Math.round(
      filteredAdventures.reduce((sum, a) => {
        if (a.bikeMetrics) return sum + a.bikeMetrics.distanceKm;
        if (a.skiMetrics?.slopesKm) return sum + a.skiMetrics.slopesKm;
        return sum;
      }, 0)
    );
  }, [filteredAdventures]);

  const handleSelectAdventure = useCallback((adv: Adventure) => {
    setSelectedAdventure(adv);
    setMobileSnap('peek');
    setActiveStageNumber(null);
    setHoveredTrackPoint(null);
    setIsFilterOpen(false);
    setActiveRegion(null);
  }, []);

  const handleSelectStage = useCallback((stageNum: number | null) => {
    setActiveStageNumber(stageNum);
    setHoveredTrackPoint(null);
  }, []);

  const handleJumpRegion = useCallback((regionKey: 'world' | RegionId) => {
    const preset = REGION_PRESETS[regionKey];
    setActiveRegion(regionKey);
    setIsFilterOpen(false);
    if (window.innerWidth < 640) {
      setSelectedAdventure(null);
    }
    setFlyRequest((prev) => ({
      center: preset.center,
      zoom: preset.zoom,
      seq: (prev?.seq ?? 0) + 1,
    }));
  }, []);

  return (
    <main
      className={`app-viewport ${selectedAdventure ? 'app-viewport--sheet-open' : ''}`}
    >
      {/* Floating Apple Liquid Glass Top Navigation & Filters */}
      <FloatingTopBar
        filters={filters}
        activeRegion={activeRegion}
        totalMatching={filteredAdventures.length}
        totalKm={totalKm}
        isFilterOpen={isFilterOpen}
        onToggleFilterOpen={() => setIsFilterOpen((o) => !o)}
        onCloseFilter={() => setIsFilterOpen(false)}
        onUpdateFilters={setFilters}
        onResetFilters={() =>
          setFilters((prev) => ({
            ...DEFAULT_FILTERS,
            mode: prev.mode,
          }))
        }
        onJumpRegion={handleJumpRegion}
      />

      {/* 100% Full-Bleed 2D Topographic Map (Async Code-Split Chunk for Instant Mobile First Paint) */}
      <Suspense
        fallback={
          <div className="topo-stage">
            <div className="map-loading-pill">
              <span className="map-loading-pill__spinner" />
              <span>Weltkarte startet…</span>
            </div>
          </div>
        }
      >
        <LazyTopoMap
          adventures={filteredAdventures}
          selectedAdventure={selectedAdventure}
          activeTrack={activeTrack}
          hoveredPoint={hoveredTrackPoint}
          filterMode={filters.mode}
          mapTheme={mapTheme}
          onChangeMapTheme={setMapTheme}
          flyRequest={flyRequest}
          isSheetOpen={Boolean(selectedAdventure)}
          isFilterOpen={isFilterOpen}
          mobileSnap={mobileSnap}
          onSelectAdventure={handleSelectAdventure}
        />
      </Suspense>

      {/* Collapsible Bottom Discovery Carousel */}
      <DiscoveryDock
        adventures={filteredAdventures}
        selectedSlug={selectedAdventure?.slug ?? null}
        isSheetOpen={Boolean(selectedAdventure) || isFilterOpen}
        onSelectAdventure={handleSelectAdventure}
      />

      {/* Floating Right Detail Sheet / 3-Snap Mobile iOS Bottom Sheet */}
      {selectedAdventure && (
        <AdventureSheet
          adventure={selectedAdventure}
          activeStageNumber={activeStageNumber}
          activeTrack={activeTrack}
          mobileSnap={mobileSnap}
          onChangeMobileSnap={setMobileSnap}
          onSelectStage={handleSelectStage}
          onHoverTrackPoint={setHoveredTrackPoint}
          onClose={() => {
            setSelectedAdventure(null);
            setActiveStageNumber(null);
            setHoveredTrackPoint(null);
          }}
        />
      )}
    </main>
  );
};

export default App;
