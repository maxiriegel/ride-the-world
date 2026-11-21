import React, { useRef, useState } from 'react';
import {
  Bike,
  BookOpen,
  Check,
  ChevronUp,
  Download,
  ExternalLink,
  Layers,
  MapPin,
  Play,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Snowflake,
  Star,
  X,
} from 'lucide-react';
import type { Adventure, TrackPayload, TrackPoint } from '../../types/adventure';
import { resolvePublicUrl } from '../../utils/publicUrl';
import { LiquidGlass } from '../glass/LiquidGlass';
import { ElevationChart } from './ElevationChart';

export type MobileSheetSnap = 'peek' | 'half' | 'full';

interface AdventureSheetProps {
  adventure: Adventure;
  activeStageNumber: number | null;
  activeTrack: TrackPayload | null;
  mobileSnap: MobileSheetSnap;
  onChangeMobileSnap: (snap: MobileSheetSnap) => void;
  onSelectStage: (stageNumber: number | null) => void;
  onHoverTrackPoint: (point: TrackPoint | null) => void;
  onClose: () => void;
}

const SUB_LABELS: Record<Adventure['subDiscipline'], string> = {
  gravel: 'Gravel-Bike',
  road: 'Rennrad',
  mtb: 'Mountainbike',
  bikepacking: 'Bikepacking · Mehrtagestour',
  resort: 'Skigebiet-Check',
  'extreme-run': 'Extrem-Abfahrt',
  powder: 'Powder & Freeride',
};

const DIFF_LABELS: Record<Adventure['difficulty'], string> = {
  einsteiger: 'Einsteigerfreundlich',
  mittel: 'Mittlerer Anspruch',
  sportlich: 'Sportlich',
  extrem: 'Extrem',
};

export const AdventureSheet: React.FC<AdventureSheetProps> = ({
  adventure,
  activeStageNumber,
  activeTrack,
  mobileSnap,
  onChangeMobileSnap,
  onSelectStage,
  onHoverTrackPoint,
  onClose,
}) => {
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const touchStartYRef = useRef<number | null>(null);
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);

  const isDesktop =
    typeof window !== 'undefined' ? window.innerWidth >= 860 : true;

  const activeStage =
    activeStageNumber !== null
      ? adventure.stages?.find((s) => s.stageNumber === activeStageNumber) ?? null
      : null;

  const activeYoutubeId = activeStage?.youtubeId || adventure.youtubeId;
  const activeKomootUrl = activeStage?.komootUrl || adventure.komootUrl;
  const activeGpxUrl = resolvePublicUrl(
    activeStage?.gpxDownloadUrl || adventure.gpxDownloadUrl
  );
  const isPlayingVideo = playingVideoId === activeYoutubeId;

  const handleCopyDeepLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tour', adventure.slug);
      if (navigator.share && window.innerWidth < 860) {
        await navigator.share({
          title: adventure.title,
          url: url.toString(),
        });
        return;
      }
      await navigator.clipboard.writeText(url.toString());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const handleCycleSnap = () => {
    if (mobileSnap === 'peek') onChangeMobileSnap('half');
    else if (mobileSnap === 'half') onChangeMobileSnap('full');
    else onChangeMobileSnap('peek');
  };

  const handleHeaderTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
  };

  const handleHeaderTouchEnd = (e: React.TouchEvent) => {
    const startY = touchStartYRef.current;
    const endY = e.changedTouches[0]?.clientY ?? null;
    touchStartYRef.current = null;
    if (startY === null || endY === null) return;
    const dy = endY - startY;

    if (dy < -32) {
      // Swipe up
      if (dy < -140) onChangeMobileSnap('full');
      else if (mobileSnap === 'peek') onChangeMobileSnap('half');
      else onChangeMobileSnap('full');
    } else if (dy > 36) {
      // Swipe down
      if (mobileSnap === 'full') onChangeMobileSnap('half');
      else if (mobileSnap === 'half') onChangeMobileSnap('peek');
      else onClose();
    }
  };

  const isBike = adventure.season === 'summer';
  const quickStatLine = adventure.bikeMetrics
    ? `${(activeStage?.distanceKm ?? adventure.bikeMetrics.distanceKm).toLocaleString('de-DE')} km · ${(activeStage?.elevationUpM ?? adventure.bikeMetrics.elevationUpM).toLocaleString('de-DE')} hm · Gipfel ${adventure.bikeMetrics.highestPointM.toLocaleString('de-DE')} m`
    : adventure.skiMetrics
      ? `${adventure.skiMetrics.baseElevationM.toLocaleString('de-DE')}–${adventure.skiMetrics.peakElevationM.toLocaleString('de-DE')} m${adventure.skiMetrics.slopesKm ? ` · ${adventure.skiMetrics.slopesKm} Pisten-km` : ''}`
      : '';

  return (
    <aside
      className={`detail-sheet-wrap detail-sheet-wrap--${mobileSnap}`}
      aria-label={`Details zu ${adventure.title}`}
    >
      <LiquidGlass
        variant="regular"
        radius={26}
        opticalLens={isDesktop}
        className="detail-sheet"
      >
        {/* Mobile/Tablet iOS Draggable Sheet Handle + Header */}
        <div
          className="sheet-drag-zone"
          onTouchStart={handleHeaderTouchStart}
          onTouchEnd={handleHeaderTouchEnd}
        >
          <button
            type="button"
            className="sheet-grabber-area"
            onClick={handleCycleSnap}
            aria-label="Detailansicht vergrößern oder verkleinern"
          >
            <span className="sheet-grabber-bar" />
          </button>

          {/* Top Sheet Meta & Action Buttons */}
          <div className="sheet-topbar">
            <div className="sheet-badges">
              <span className={`sheet-pill sheet-pill--${adventure.season}`}>
                {isBike ? <Bike size={12} /> : <Snowflake size={12} />}
                {SUB_LABELS[adventure.subDiscipline]}
              </span>
              <span className="sheet-pill sheet-pill--neutral">{adventure.countryCode}</span>
              {adventure.isFavorite && (
                <span className="sheet-pill sheet-pill--fav" title="Marius’ persönlicher Favorit">
                  <Star size={11} fill="currentColor" /> Favorit
                </span>
              )}
            </div>

            <div className="sheet-icon-actions">
              <button
                id="sheet-share-btn"
                type="button"
                className="sheet-circle-btn"
                onClick={handleCopyDeepLink}
                title="Tour teilen oder Direktlink kopieren"
                aria-label="Tour teilen"
              >
                {copiedLink ? <Check size={15} /> : <Share2 size={15} />}
              </button>
              <button
                id="sheet-close-btn"
                type="button"
                className="sheet-circle-btn"
                onClick={onClose}
                title="Schließen"
                aria-label="Detailansicht schließen"
              >
                <X size={17} />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Sheet Body */}
        <div
          ref={scrollBodyRef}
          className="sheet-scroll-body"
          onScroll={(e) => {
            if (mobileSnap === 'peek' && e.currentTarget.scrollTop > 18) {
              onChangeMobileSnap('half');
            }
          }}
        >
          {/* Title & Location */}
          <div className="sheet-heading">
            <h2 className="sheet-title">{adventure.title}</h2>
            <p className="sheet-subtitle">{adventure.subtitle}</p>
            <div className="sheet-location-line">
              <MapPin size={13} />
              <span>{adventure.locationLabel}</span>
              <span className="sheet-dot">·</span>
              <span>{DIFF_LABELS[adventure.difficulty]}</span>
            </div>
          </div>

          {/* Mobile Peek Quick-Bar (gives immediate stats & expand button while keeping >52% map visible!) */}
          <div className="sheet-peek-bar">
            <span className="sheet-peek-bar__stats">{quickStatLine}</span>
            <button
              id="sheet-expand-btn"
              type="button"
              className="sheet-peek-bar__expand"
              onClick={() => onChangeMobileSnap('half')}
            >
              <Play size={12} fill="currentColor" />
              <span>Video & Profil</span>
              <ChevronUp size={14} />
            </button>
          </div>

          {/* 1-Click Privacy-Clean Inline YouTube Video */}
          <div className="sheet-video-block">
            <div className="sheet-video-frame">
              {isPlayingVideo ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${activeYoutubeId}?autoplay=1&rel=0&playsinline=1`}
                  title={adventure.youtubeTitle}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <button
                  id="sheet-play-video-btn"
                  type="button"
                  className="sheet-video-poster"
                  onClick={() => {
                    if (mobileSnap === 'peek') onChangeMobileSnap('half');
                    setPlayingVideoId(activeYoutubeId);
                  }}
                  aria-label={`YouTube-Video abspielen: ${adventure.youtubeTitle}`}
                >
                  <img
                    src={`https://i.ytimg.com/vi/${activeYoutubeId}/hqdefault.jpg`}
                    alt={adventure.youtubeTitle}
                  />
                  <div className="sheet-video-poster__scrim" />
                  <LiquidGlass
                    variant="clear"
                    radius={999}
                    opticalLens={isDesktop}
                    className="sheet-play-glass-btn"
                  >
                    <Play size={20} fill="currentColor" />
                    <span>Video abspielen</span>
                  </LiquidGlass>
                  <span className="sheet-video-poster__caption">
                    {activeStage ? `${activeStage.title}` : adventure.youtubeTitle}
                  </span>
                </button>
              )}
            </div>

            <div className="sheet-video-subbar">
              <span>DSGVO-freundlicher Inline-Player</span>
              <a
                id="sheet-open-youtube-external"
                href={`https://www.youtube.com/watch?v=${activeYoutubeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="sheet-yt-link"
              >
                Auf YouTube öffnen <ExternalLink size={12} />
              </a>
            </div>
          </div>

          {/* Multi-Day Stage Switcher */}
          {adventure.stages && adventure.stages.length > 0 && (
            <div className="sheet-stages-box">
              <div className="sheet-stages-box__header">
                <Layers size={13} />
                <span>Etappen-Auswahl ({adventure.stages.length} Tage)</span>
              </div>
              <div className="sheet-stages-pills">
                <button
                  id="stage-pill-all"
                  type="button"
                  className={`stage-pill ${activeStageNumber === null ? 'stage-pill--active' : ''}`}
                  onClick={() => onSelectStage(null)}
                >
                  Gesamtroute
                </button>
                {adventure.stages.map((st) => (
                  <button
                    key={st.id}
                    id={`stage-pill-${st.stageNumber}`}
                    type="button"
                    className={`stage-pill ${activeStageNumber === st.stageNumber ? 'stage-pill--active' : ''}`}
                    onClick={() => onSelectStage(st.stageNumber)}
                  >
                    Etappe {st.stageNumber}
                  </button>
                ))}
              </div>
              {activeStage && (
                <div className="stage-active-banner">
                  <strong>{activeStage.title}</strong>
                  <span>
                    {activeStage.distanceKm.toLocaleString('de-DE')} km ·{' '}
                    {activeStage.elevationUpM.toLocaleString('de-DE')} hm
                    {activeStage.durationLabel ? ` · ${activeStage.durationLabel}` : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Bike-Specific Metrics, Surface Mix & Interactive Elevation Chart */}
          {adventure.bikeMetrics && (
            <>
              <div className="metrics-grid">
                <div className="metric-tile">
                  <span className="metric-tile__label">Strecke</span>
                  <strong className="metric-tile__value">
                    {(activeStage?.distanceKm ?? adventure.bikeMetrics.distanceKm).toLocaleString(
                      'de-DE'
                    )}{' '}
                    <small>km</small>
                  </strong>
                </div>
                <div className="metric-tile">
                  <span className="metric-tile__label">Aufstieg</span>
                  <strong className="metric-tile__value">
                    {(
                      activeStage?.elevationUpM ?? adventure.bikeMetrics.elevationUpM
                    ).toLocaleString('de-DE')}{' '}
                    <small>hm</small>
                  </strong>
                </div>
                <div className="metric-tile">
                  <span className="metric-tile__label">Höchster Punkt</span>
                  <strong className="metric-tile__value">
                    {adventure.bikeMetrics.highestPointM.toLocaleString('de-DE')}{' '}
                    <small>m</small>
                  </strong>
                </div>
                <div className="metric-tile">
                  <span className="metric-tile__label">Umfang</span>
                  <strong className="metric-tile__value metric-tile__value--text">
                    {activeStage?.durationLabel ?? adventure.bikeMetrics.durationLabel}
                  </strong>
                </div>
              </div>

              {/* Interactive Elevation Profile */}
              {activeTrack && activeTrack.points.length >= 2 && (
                <ElevationChart
                  points={activeTrack.points}
                  displayDistanceKm={
                    activeStage?.distanceKm ?? adventure.bikeMetrics.distanceKm
                  }
                  isPreviewOnly={activeTrack.isPreviewOnly}
                  season={adventure.season}
                  onHoverPoint={onHoverTrackPoint}
                />
              )}

              {/* Surface Breakdown Bar */}
              <div className="surface-card">
                <div className="surface-card__header">
                  <span>Untergrund-Mix</span>
                  <div className="surface-legend">
                    <span>
                      <i className="surf-dot surf-dot--asphalt" /> Asphalt{' '}
                      {adventure.bikeMetrics.surfaces.asphalt}%
                    </span>
                    {adventure.bikeMetrics.surfaces.gravel > 0 && (
                      <span>
                        <i className="surf-dot surf-dot--gravel" /> Schotter{' '}
                        {adventure.bikeMetrics.surfaces.gravel}%
                      </span>
                    )}
                    {adventure.bikeMetrics.surfaces.trail > 0 && (
                      <span>
                        <i className="surf-dot surf-dot--trail" /> Trail{' '}
                        {adventure.bikeMetrics.surfaces.trail}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="surface-bar">
                  <div
                    className="surface-bar__seg surface-bar__seg--asphalt"
                    style={{ width: `${adventure.bikeMetrics.surfaces.asphalt}%` }}
                  />
                  <div
                    className="surface-bar__seg surface-bar__seg--gravel"
                    style={{ width: `${adventure.bikeMetrics.surfaces.gravel}%` }}
                  />
                  <div
                    className="surface-bar__seg surface-bar__seg--trail"
                    style={{ width: `${adventure.bikeMetrics.surfaces.trail}%` }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Ski-Specific Metrics & Verdict */}
          {adventure.skiMetrics && (
            <>
              <div className="ski-verdict-ribbon">
                <span className="ski-verdict-badge">{adventure.skiMetrics.verdictBadge}</span>
                <span className="ski-snow-label">{adventure.skiMetrics.snowScoreLabel}</span>
              </div>

              <div className="metrics-grid">
                <div className="metric-tile">
                  <span className="metric-tile__label">Seehöhe</span>
                  <strong className="metric-tile__value metric-tile__value--text">
                    {adventure.skiMetrics.baseElevationM.toLocaleString('de-DE')} –{' '}
                    {adventure.skiMetrics.peakElevationM.toLocaleString('de-DE')} m
                  </strong>
                </div>
                <div className="metric-tile">
                  <span className="metric-tile__label">Höhendifferenz</span>
                  <strong className="metric-tile__value">
                    {(
                      adventure.skiMetrics.peakElevationM - adventure.skiMetrics.baseElevationM
                    ).toLocaleString('de-DE')}{' '}
                    <small>hm</small>
                  </strong>
                </div>
                {adventure.skiMetrics.slopesKm && (
                  <div className="metric-tile">
                    <span className="metric-tile__label">Pistenkilometer</span>
                    <strong className="metric-tile__value">
                      {adventure.skiMetrics.slopesKm} <small>km</small>
                    </strong>
                  </div>
                )}
                {adventure.skiMetrics.maxGradientPct ? (
                  <div className="metric-tile">
                    <span className="metric-tile__label">Max. Gefälle</span>
                    <strong className="metric-tile__value">
                      {adventure.skiMetrics.maxGradientPct} <small>%</small>
                    </strong>
                  </div>
                ) : (
                  adventure.skiMetrics.liftsCount && (
                    <div className="metric-tile">
                      <span className="metric-tile__label">Liftanlagen</span>
                      <strong className="metric-tile__value">
                        {adventure.skiMetrics.liftsCount}
                      </strong>
                    </div>
                  )
                )}
              </div>
            </>
          )}

          {/* Story & Highlights */}
          <div className="sheet-story">
            <p className="sheet-summary">{adventure.summary}</p>

            {adventure.mariusQuote && (
              <blockquote className="marius-quote">
                „{adventure.mariusQuote}“
                <footer>— Marius Quast</footer>
              </blockquote>
            )}

            <div className="sheet-highlights">
              <h3>Highlights dieser Tour</h3>
              <ul>
                {adventure.highlights.map((hl, idx) => (
                  <li key={idx}>{hl}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Shop-Pack Protection Notice */}
          {adventure.accessType === 'shop-pack' && (
            <div className="shop-protection-note">
              <ShieldCheck size={17} />
              <p>
                <strong>Geschütztes Routen-Paket:</strong> Die Karte zeigt eine vereinfachte
                Übersichts-Linie. Die exakten Feintracks aller 6 Etappen, die Light-Variante & das
                Planungs-Booklet gibt es direkt in Marius’ Shop.
              </p>
            </div>
          )}

          {/* Smart Action CTAs */}
          <div className="sheet-cta-stack">
            {adventure.accessType === 'shop-pack' && adventure.shopUrl && (
              <a
                id="cta-shop-pack"
                href={adventure.shopUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cta-btn cta-btn--shop"
              >
                <ShoppingBag size={16} />
                <span>{adventure.shopLabel || 'Routen-Paket im Shop sichern'}</span>
                <ExternalLink size={14} />
              </a>
            )}

            {adventure.accessType === 'free' && (
              <div className="cta-row">
                {activeKomootUrl && (
                  <a
                    id="cta-open-komoot"
                    href={activeKomootUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cta-btn cta-btn--primary-bike"
                  >
                    <span>Auf Komoot nachfahren</span>
                    <ExternalLink size={14} />
                  </a>
                )}
                {activeGpxUrl && (
                  <a
                    id="cta-download-gpx"
                    href={activeGpxUrl}
                    download
                    className={`cta-btn ${activeKomootUrl ? 'cta-btn--secondary' : 'cta-btn--primary-bike'}`}
                  >
                    <Download size={15} />
                    <span>GPX laden</span>
                  </a>
                )}
              </div>
            )}

            {adventure.accessType === 'info-only' && (
              <a
                id="cta-watch-youtube"
                href={`https://www.youtube.com/watch?v=${activeYoutubeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="cta-btn cta-btn--primary-ski"
              >
                <Play size={15} fill="currentColor" />
                <span>Video & Infos auf YouTube ansehen</span>
                <ExternalLink size={14} />
              </a>
            )}

            {adventure.blogUrl && (
              <a
                id="cta-read-blog"
                href={adventure.blogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cta-btn cta-btn--secondary"
              >
                <BookOpen size={15} />
                <span>Bericht auf mariusquast.de lesen</span>
                <ExternalLink size={13} />
              </a>
            )}
          </div>
        </div>
      </LiquidGlass>
    </aside>
  );
};
