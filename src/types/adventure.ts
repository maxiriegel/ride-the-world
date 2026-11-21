export type AdventureCategory =
  | 'multi-day-bike'
  | 'day-bike'
  | 'ski-resort'
  | 'ski-challenge';

export type SeasonMode = 'summer' | 'winter';
export type FilterMode = 'all' | 'summer' | 'winter';

export type SubDiscipline =
  | 'gravel'
  | 'road'
  | 'mtb'
  | 'bikepacking'
  | 'resort'
  | 'extreme-run'
  | 'powder';

export type RegionId = 'dach' | 'europe' | 'north-america' | 'japan';

export type DifficultyLevel = 'einsteiger' | 'mittel' | 'sportlich' | 'extrem';

export type AccessType = 'free' | 'shop-pack' | 'info-only';

/** [lng, lat, elevationMeters, cumulativeDistanceKm] */
export type TrackPoint = [number, number, number, number];

export interface TrackPayload {
  slug: string;
  isPreviewOnly?: boolean;
  bbox: [number, number, number, number];
  points: TrackPoint[];
}

export interface SurfaceBreakdown {
  asphalt: number;
  gravel: number;
  trail: number;
}

export interface AdventureStage {
  stageNumber: number;
  id: string;
  title: string;
  subtitle?: string;
  distanceKm: number;
  elevationUpM: number;
  durationLabel?: string;
  youtubeId?: string;
  komootUrl?: string;
  gpxDownloadUrl?: string;
  trackFile: string;
}

export interface BikeMetrics {
  distanceKm: number;
  elevationUpM: number;
  highestPointM: number;
  days: number;
  durationLabel: string;
  surfaces: SurfaceBreakdown;
}

export interface SkiMetrics {
  baseElevationM: number;
  peakElevationM: number;
  slopesKm?: number;
  liftsCount?: number;
  maxGradientPct?: number;
  snowScoreLabel: string;
  verdictBadge: string;
}

export interface Adventure {
  slug: string;
  title: string;
  subtitle: string;
  locationLabel: string;
  countryCode: string;
  category: AdventureCategory;
  season: SeasonMode;
  subDiscipline: SubDiscipline;
  region: RegionId;
  difficulty: DifficultyLevel;
  isFavorite: boolean;
  year: number;
  /** [lng, lat] */
  coordinates: [number, number];
  zoomLevel?: number;
  youtubeId: string;
  youtubeTitle: string;
  summary: string;
  highlights: string[];
  mariusQuote?: string;
  accessType: AccessType;
  komootUrl?: string;
  shopUrl?: string;
  shopLabel?: string;
  blogUrl?: string;
  gpxDownloadUrl?: string;
  trackFile?: string;
  bikeMetrics?: BikeMetrics;
  skiMetrics?: SkiMetrics;
  stages?: AdventureStage[];
}
