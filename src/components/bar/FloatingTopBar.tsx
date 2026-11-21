import React, { useRef, useState } from 'react';
import {
  Bike,
  Globe,
  Mountain,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Snowflake,
  Star,
  X,
} from 'lucide-react';
import type {
  DifficultyLevel,
  FilterMode,
  RegionId,
  SubDiscipline,
} from '../../types/adventure';
import { REGION_PRESETS } from '../../data/adventures';
import { LiquidGlass } from '../glass/LiquidGlass';

export interface ActiveFilters {
  mode: FilterMode;
  search: string;
  subDisciplines: SubDiscipline[];
  difficulties: DifficultyLevel[];
  onlyFavorites: boolean;
  onlyMultiDay: boolean;
  onlyFreeGpx: boolean;
  elevationBand: 'all' | 'under1000' | '1000to3000' | 'over3000';
}

interface FloatingTopBarProps {
  filters: ActiveFilters;
  activeRegion: 'world' | RegionId | null;
  totalMatching: number;
  totalKm: number;
  isFilterOpen: boolean;
  onToggleFilterOpen: () => void;
  onCloseFilter: () => void;
  onUpdateFilters: (updater: (prev: ActiveFilters) => ActiveFilters) => void;
  onResetFilters: () => void;
  onJumpRegion: (regionKey: 'world' | RegionId) => void;
}

const BIKE_SUBS: { id: SubDiscipline; label: string }[] = [
  { id: 'gravel', label: 'Gravel' },
  { id: 'road', label: 'Rennrad' },
  { id: 'mtb', label: 'MTB' },
  { id: 'bikepacking', label: 'Bikepacking' },
];

const SKI_SUBS: { id: SubDiscipline; label: string }[] = [
  { id: 'resort', label: 'Skigebiet-Check' },
  { id: 'extreme-run', label: 'Extrem-Abfahrt' },
  { id: 'powder', label: 'Powder & Japow' },
];

const DIFFICULTIES: { id: DifficultyLevel; label: string }[] = [
  { id: 'einsteiger', label: 'Einsteiger' },
  { id: 'mittel', label: 'Mittel' },
  { id: 'sportlich', label: 'Sportlich' },
  { id: 'extrem', label: 'Extrem' },
];

export const FloatingTopBar: React.FC<FloatingTopBarProps> = ({
  filters,
  activeRegion,
  totalMatching,
  totalKm,
  isFilterOpen,
  onToggleFilterOpen,
  onCloseFilter,
  onUpdateFilters,
  onResetFilters,
  onJumpRegion,
}) => {
  const desktopSearchRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchRef = useRef<HTMLInputElement | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const extraFilterCount =
    filters.subDisciplines.length +
    filters.difficulties.length +
    (filters.onlyFavorites ? 1 : 0) +
    (filters.onlyMultiDay ? 1 : 0) +
    (filters.onlyFreeGpx ? 1 : 0) +
    (filters.elevationBand !== 'all' ? 1 : 0);

  const toggleSub = (sub: SubDiscipline) => {
    onUpdateFilters((prev) => ({
      ...prev,
      subDisciplines: prev.subDisciplines.includes(sub)
        ? prev.subDisciplines.filter((s) => s !== sub)
        : [...prev.subDisciplines, sub],
    }));
  };

  const toggleDifficulty = (diff: DifficultyLevel) => {
    onUpdateFilters((prev) => ({
      ...prev,
      difficulties: prev.difficulties.includes(diff)
        ? prev.difficulties.filter((d) => d !== diff)
        : [...prev.difficulties, diff],
    }));
  };

  const handleToggleMobileSearch = () => {
    setMobileSearchOpen((prev) => {
      const next = !prev;
      if (next) {
        onCloseFilter();
        requestAnimationFrame(() => mobileSearchRef.current?.focus());
      }
      return next;
    });
  };

  const visibleSubs =
    filters.mode === 'summer'
      ? BIKE_SUBS
      : filters.mode === 'winter'
        ? SKI_SUBS
        : [...BIKE_SUBS, ...SKI_SUBS];

  return (
    <header className="top-hud" role="banner">
      <div className="top-hud__main-row">
        {/* Main Floating Liquid Glass Capsule (Always 1 compact line on Mobile, Tablet & Desktop!) */}
        <LiquidGlass variant="clear" radius={999} className="top-bar-capsule">
          {/* Brand Identity */}
          <button
            id="brand-home-btn"
            type="button"
            className="brand-block"
            onClick={() => onJumpRegion('dach')}
            title="Auf Alpen / DACH zentrieren"
          >
            <div className="brand-emblem" aria-hidden="true">
              <Mountain size={17} strokeWidth={2.4} />
            </div>
            <div className="brand-copy">
              <h1 className="brand-title">Ride the World</h1>
              <p className="brand-subtitle">
                Marius Quast · <span>{totalMatching} Ziele</span>
                <span className="brand-subtitle__km">
                  · {totalKm.toLocaleString('de-DE')} km
                </span>
              </p>
            </div>
          </button>

          <div className="top-bar-divider" aria-hidden="true" />

          {/* Season / Sport Mode Segmented Control */}
          <div className="mode-segmented" role="group" aria-label="Saison und Sportart wählen">
            <button
              id="mode-btn-all"
              type="button"
              className={`mode-btn ${filters.mode === 'all' ? 'mode-btn--active' : ''}`}
              onClick={() =>
                onUpdateFilters((prev) => ({
                  ...prev,
                  mode: 'all',
                }))
              }
            >
              Alle
            </button>
            <button
              id="mode-btn-summer"
              type="button"
              className={`mode-btn mode-btn--summer ${filters.mode === 'summer' ? 'mode-btn--active' : ''}`}
              onClick={() =>
                onUpdateFilters((prev) => ({
                  ...prev,
                  mode: 'summer',
                  subDisciplines: prev.subDisciplines.filter((s) =>
                    BIKE_SUBS.some((b) => b.id === s)
                  ),
                }))
              }
            >
              <Bike size={14} strokeWidth={2.3} />
              <span>Bike</span>
            </button>
            <button
              id="mode-btn-winter"
              type="button"
              className={`mode-btn mode-btn--winter ${filters.mode === 'winter' ? 'mode-btn--active' : ''}`}
              onClick={() =>
                onUpdateFilters((prev) => ({
                  ...prev,
                  mode: 'winter',
                  onlyMultiDay: false,
                  onlyFreeGpx: false,
                  subDisciplines: prev.subDisciplines.filter((s) =>
                    SKI_SUBS.some((k) => k.id === s)
                  ),
                }))
              }
            >
              <Snowflake size={14} strokeWidth={2.3} />
              <span>Ski</span>
            </button>
          </div>

          <div className="top-bar-divider top-bar-divider--desktop" aria-hidden="true" />

          {/* Search Input (Tablet/Desktop) + Compact Icon Triggers (Mobile) */}
          <div className="search-filter-group">
            <div className="glass-search glass-search--desktop">
              <Search size={14} className="glass-search__icon" />
              <input
                ref={desktopSearchRef}
                id="global-tour-search"
                type="search"
                value={filters.search}
                onChange={(e) =>
                  onUpdateFilters((prev) => ({ ...prev, search: e.target.value }))
                }
                placeholder="Ort, Pass, Tour…"
                aria-label="Touren und Skigebiete durchsuchen"
              />
              {filters.search && (
                <button
                  id="clear-search-btn"
                  type="button"
                  className="glass-search__clear"
                  aria-label="Suche löschen"
                  onClick={() => {
                    onUpdateFilters((prev) => ({ ...prev, search: '' }));
                    desktopSearchRef.current?.focus();
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Mobile Search Icon Button (< 640px) */}
            <button
              id="mobile-search-toggle-btn"
              type="button"
              className={`mobile-search-btn ${mobileSearchOpen || filters.search ? 'mobile-search-btn--active' : ''}`}
              onClick={handleToggleMobileSearch}
              aria-expanded={mobileSearchOpen}
              aria-label="Suche öffnen"
            >
              <Search size={16} strokeWidth={2.3} />
              {filters.search && <span className="mobile-search-btn__dot" />}
            </button>

            <button
              id="toggle-filters-btn"
              type="button"
              className={`filter-trigger-btn ${isFilterOpen || extraFilterCount > 0 ? 'filter-trigger-btn--active' : ''}`}
              onClick={() => {
                setMobileSearchOpen(false);
                onToggleFilterOpen();
              }}
              aria-expanded={isFilterOpen}
              aria-label="Detailfilter öffnen"
            >
              <SlidersHorizontal size={15} strokeWidth={2.3} />
              <span className="filter-trigger-btn__label">Filter</span>
              {extraFilterCount > 0 && (
                <span className="filter-trigger-btn__badge">{extraFilterCount}</span>
              )}
            </button>
          </div>
        </LiquidGlass>
      </div>

      {/* Expandable Mobile Search Capsule (16px font prevents iOS Safari auto-zoom!) */}
      {mobileSearchOpen && (
        <LiquidGlass
          variant="regular"
          radius={999}
          opticalLens={false}
          className="mobile-search-drawer"
        >
          <div className="mobile-search-drawer__inner">
            <Search size={16} className="glass-search__icon" />
            <input
              ref={mobileSearchRef}
              id="mobile-tour-search"
              type="search"
              value={filters.search}
              onChange={(e) =>
                onUpdateFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              placeholder="Ort, Pass, Skigebiet oder Tour suchen…"
              aria-label="Touren durchsuchen"
            />
            {filters.search && (
              <button
                id="mobile-clear-search-btn"
                type="button"
                className="glass-search__clear"
                aria-label="Suchtext löschen"
                onClick={() => {
                  onUpdateFilters((prev) => ({ ...prev, search: '' }));
                  mobileSearchRef.current?.focus();
                }}
              >
                <X size={14} />
              </button>
            )}
            <button
              id="mobile-close-search-btn"
              type="button"
              className="mobile-search-done-btn"
              onClick={() => setMobileSearchOpen(false)}
            >
              Fertig
            </button>
          </div>
        </LiquidGlass>
      )}

      {/* Second Row: Quick Region Jumpers & Favorites Chip */}
      <div
        className={`region-chips-row ${isFilterOpen || mobileSearchOpen ? 'region-chips-row--hidden-mobile' : ''}`}
        role="navigation"
        aria-label="Regionen-Schnellauswahl"
      >
        {(
          ['world', 'dach', 'europe', 'north-america', 'japan'] as Array<'world' | RegionId>
        ).map((key) => {
          const preset = REGION_PRESETS[key];
          const isActive = activeRegion === key;
          return (
            <LiquidGlass
              key={key}
              variant="clear"
              radius={999}
              interactive
              opticalLens={false}
              className={`region-chip-glass ${isActive ? 'region-chip-glass--active' : ''}`}
              onClick={() => onJumpRegion(key)}
            >
              <button
                id={`region-jump-${key}`}
                type="button"
                className="region-chip-btn"
              >
                {key === 'world' && <Globe size={13} />}
                <span>{preset.shortLabel}</span>
              </button>
            </LiquidGlass>
          );
        })}

        <LiquidGlass
          variant="clear"
          radius={999}
          interactive
          opticalLens={false}
          className={`region-chip-glass ${filters.onlyFavorites ? 'region-chip-glass--fav-active' : ''}`}
          onClick={() =>
            onUpdateFilters((prev) => ({ ...prev, onlyFavorites: !prev.onlyFavorites }))
          }
        >
          <button id="quick-favorites-toggle" type="button" className="region-chip-btn">
            <Star
              size={13}
              fill={filters.onlyFavorites ? 'currentColor' : 'none'}
            />
            <span>Marius’ Favoriten</span>
          </button>
        </LiquidGlass>
      </div>

      {/* Context-Sensitive Regular Liquid Glass Filter Popover */}
      {isFilterOpen && (
        <LiquidGlass
          variant="regular"
          radius={24}
          className="filter-popover"
          role="dialog"
          aria-label="Detailfilter"
        >
          <div className="filter-popover__header">
            <div>
              <strong>Kontext-Filter</strong>
              <span>
                {filters.mode === 'summer'
                  ? ' · Sommer & Bike'
                  : filters.mode === 'winter'
                    ? ' · Winter & Ski'
                    : ' · Alle Abenteuer'}
              </span>
            </div>
            <div className="filter-popover__actions">
              {extraFilterCount > 0 && (
                <button
                  id="reset-filters-btn"
                  type="button"
                  className="filter-reset-btn"
                  onClick={onResetFilters}
                >
                  <RotateCcw size={12} />
                  Zurücksetzen
                </button>
              )}
              <button
                id="close-filters-btn"
                type="button"
                className="filter-close-btn"
                aria-label="Filter schließen"
                onClick={onCloseFilter}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="filter-section">
            <span className="filter-section__title">Disziplin & Format</span>
            <div className="filter-pills-wrap">
              {visibleSubs.map((sub) => {
                const active = filters.subDisciplines.includes(sub.id);
                return (
                  <button
                    key={sub.id}
                    id={`filter-sub-${sub.id}`}
                    type="button"
                    className={`filter-pill ${active ? 'filter-pill--active' : ''}`}
                    onClick={() => toggleSub(sub.id)}
                  >
                    {sub.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="filter-section">
            <span className="filter-section__title">Anspruch & Technik</span>
            <div className="filter-pills-wrap">
              {DIFFICULTIES.map((d) => {
                const active = filters.difficulties.includes(d.id);
                return (
                  <button
                    key={d.id}
                    id={`filter-diff-${d.id}`}
                    type="button"
                    className={`filter-pill ${active ? 'filter-pill--active' : ''}`}
                    onClick={() => toggleDifficulty(d.id)}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="filter-section">
            <span className="filter-section__title">
              {filters.mode === 'winter' ? 'Gipfelhöhe (Skigebiet)' : 'Höhenmeter / Berghöhe'}
            </span>
            <div className="filter-pills-wrap">
              {[
                { id: 'all', label: 'Alle Höhen' },
                {
                  id: 'under1000',
                  label: filters.mode === 'winter' ? 'Bis 2.000 m' : 'Bis 1.000 hm',
                },
                {
                  id: '1000to3000',
                  label: filters.mode === 'winter' ? '2.000 – 3.000 m' : '1.000 – 3.000 hm',
                },
                {
                  id: 'over3000',
                  label: filters.mode === 'winter' ? 'Über 3.000 m (Gletscher)' : 'Über 3.000 hm',
                },
              ].map((band) => (
                <button
                  key={band.id}
                  id={`filter-elev-${band.id}`}
                  type="button"
                  className={`filter-pill ${filters.elevationBand === band.id ? 'filter-pill--active' : ''}`}
                  onClick={() =>
                    onUpdateFilters((prev) => ({
                      ...prev,
                      elevationBand: band.id as ActiveFilters['elevationBand'],
                    }))
                  }
                >
                  {band.label}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-toggles-row">
            {filters.mode !== 'winter' && (
              <>
                <button
                  id="filter-toggle-multiday"
                  type="button"
                  className={`filter-pill ${filters.onlyMultiDay ? 'filter-pill--active' : ''}`}
                  onClick={() =>
                    onUpdateFilters((prev) => ({ ...prev, onlyMultiDay: !prev.onlyMultiDay }))
                  }
                >
                  Nur Mehrtagestouren
                </button>
                <button
                  id="filter-toggle-freegpx"
                  type="button"
                  className={`filter-pill ${filters.onlyFreeGpx ? 'filter-pill--active' : ''}`}
                  onClick={() =>
                    onUpdateFilters((prev) => ({ ...prev, onlyFreeGpx: !prev.onlyFreeGpx }))
                  }
                >
                  Freier GPX-Download
                </button>
              </>
            )}
          </div>
        </LiquidGlass>
      )}
    </header>
  );
};
