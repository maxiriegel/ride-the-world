import React, { useState } from 'react';
import { Bike, ChevronDown, ChevronUp, Snowflake, Sparkles, Star } from 'lucide-react';
import type { Adventure } from '../../types/adventure';
import { LiquidGlass } from '../glass/LiquidGlass';

interface DiscoveryDockProps {
  adventures: Adventure[];
  selectedSlug: string | null;
  isSheetOpen: boolean;
  onSelectAdventure: (adv: Adventure) => void;
}

export const DiscoveryDock: React.FC<DiscoveryDockProps> = ({
  adventures,
  selectedSlug,
  isSheetOpen,
  onSelectAdventure,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  if (adventures.length === 0) {
    return (
      <div className={`discovery-dock ${isSheetOpen ? 'discovery-dock--shifted' : ''}`}>
        <LiquidGlass variant="regular" radius={20} className="discovery-empty">
          Keine Treffer für diese Filterkombination.
        </LiquidGlass>
      </div>
    );
  }

  return (
    <section
      className={`discovery-dock ${isSheetOpen ? 'discovery-dock--shifted' : ''} ${collapsed ? 'discovery-dock--collapsed' : ''}`}
      aria-label="Touren- und Skigebiets-Entdeckerleiste"
    >
      <div className="discovery-dock__bar">
        <LiquidGlass
          variant="clear"
          radius={999}
          interactive
          className="discovery-toggle-pill"
          onClick={() => setCollapsed((c) => !c)}
        >
          <button
            id="toggle-discovery-dock-btn"
            type="button"
            className="discovery-toggle-btn"
          >
            <span>Entdecken ({adventures.length})</span>
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </LiquidGlass>
      </div>

      {!collapsed && (
        <div className="discovery-strip" role="list">
          {adventures.map((adv) => {
            const isSelected = adv.slug === selectedSlug;
            const isBike = adv.season === 'summer';
            const metricLine = adv.bikeMetrics
              ? `${adv.bikeMetrics.distanceKm.toLocaleString('de-DE')} km · ${adv.bikeMetrics.elevationUpM.toLocaleString('de-DE')} hm`
              : adv.skiMetrics
                ? `bis ${adv.skiMetrics.peakElevationM.toLocaleString('de-DE')} m · ${
                    adv.skiMetrics.slopesKm ? `${adv.skiMetrics.slopesKm} km` : adv.skiMetrics.verdictBadge
                  }`
                : '';

            return (
              <LiquidGlass
                key={adv.slug}
                variant="regular"
                radius={18}
                interactive
                role="listitem"
                className={`dock-card ${isSelected ? 'dock-card--selected' : ''}`}
                onClick={() => onSelectAdventure(adv)}
              >
                <button
                  id={`dock-card-${adv.slug}`}
                  type="button"
                  className="dock-card__inner"
                >
                  <div className="dock-card__thumb-wrap">
                    <img
                      src={`https://i.ytimg.com/vi/${adv.youtubeId}/mqdefault.jpg`}
                      alt={adv.title}
                      loading="lazy"
                      className="dock-card__thumb"
                    />
                    <span className={`dock-card__sport dock-card__sport--${adv.season}`}>
                      {isBike ? <Bike size={11} /> : <Snowflake size={11} />}
                    </span>
                    {adv.accessType === 'shop-pack' ? (
                      <span className="dock-card__flag dock-card__flag--shop">
                        <Sparkles size={10} /> Paket
                      </span>
                    ) : adv.isFavorite ? (
                      <span className="dock-card__flag">
                        <Star size={9} fill="currentColor" />
                      </span>
                    ) : null}
                  </div>
                  <div className="dock-card__body">
                    <span className="dock-card__country">{adv.countryCode}</span>
                    <strong className="dock-card__title">{adv.title}</strong>
                    <span className="dock-card__metrics">{metricLine}</span>
                  </div>
                </button>
              </LiquidGlass>
            );
          })}
        </div>
      )}
    </section>
  );
};
