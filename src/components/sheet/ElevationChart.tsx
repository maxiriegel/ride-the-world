import React, { useMemo, useRef, useState } from 'react';
import type { TrackPoint } from '../../types/adventure';

interface ElevationChartProps {
  points: TrackPoint[];
  displayDistanceKm?: number;
  isPreviewOnly?: boolean;
  season: 'summer' | 'winter';
  onHoverPoint: (point: TrackPoint | null) => void;
}

export const ElevationChart: React.FC<ElevationChartProps> = ({
  points,
  displayDistanceKm,
  isPreviewOnly = false,
  season,
  onHoverPoint,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 380;
  const height = 118;
  const padLeft = 6;
  const padRight = 6;
  const padTop = 16;
  const padBottom = 20;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const stats = useMemo(() => {
    if (points.length < 2) return null;
    let minEle = Infinity;
    let maxEle = -Infinity;
    let peakIdx = 0;
    for (let i = 0; i < points.length; i++) {
      const ele = points[i][2];
      if (ele < minEle) minEle = ele;
      if (ele > maxEle) {
        maxEle = ele;
        peakIdx = i;
      }
    }
    const rawTotalKm = Math.max(0.1, points[points.length - 1][3]);
    const displayKm = displayDistanceKm ?? rawTotalKm;
    const kmScale = displayKm / rawTotalKm;
    const eleSpan = Math.max(80, maxEle - minEle);

    const coords = points.map((pt) => {
      const x = padLeft + (pt[3] / rawTotalKm) * innerW;
      const y = padTop + innerH - ((pt[2] - minEle) / eleSpan) * innerH;
      return { x, y, pt, scaledKm: pt[3] * kmScale };
    });

    const linePath = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' ');
    const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${height - padBottom} L${coords[0].x.toFixed(1)},${height - padBottom} Z`;

    return {
      minEle,
      maxEle,
      rawTotalKm,
      displayKm,
      peakCoord: coords[peakIdx],
      coords,
      linePath,
      areaPath,
    };
  }, [points, displayDistanceKm, innerW, innerH]);

  if (!stats) return null;

  const handlePointer = (clientX: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const targetKm = relX * stats.rawTotalKm;

    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < points.length; i++) {
      const diff = Math.abs(points[i][3] - targetKm);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    setHoverIdx(bestIdx);
    const chosen = points[bestIdx];
    const scaledPt: TrackPoint = [
      chosen[0],
      chosen[1],
      chosen[2],
      Number(stats.coords[bestIdx].scaledKm.toFixed(1)),
    ];
    onHoverPoint(scaledPt);
  };

  const active = hoverIdx !== null ? stats.coords[hoverIdx] : null;
  let gradientPct = 0;
  if (hoverIdx !== null && hoverIdx > 0 && !isPreviewOnly) {
    const prev = points[hoverIdx - 1];
    const curr = points[hoverIdx];
    const dKm = curr[3] - prev[3];
    if (dKm > 0.02) {
      gradientPct = Math.round(((curr[2] - prev[2]) / (dKm * 1000)) * 100);
    }
  }

  const strokeColor = isPreviewOnly
    ? '#d97706'
    : season === 'summer'
      ? '#ea580c'
      : '#0284c7';

  return (
    <div className="elev-card">
      <div className="elev-card__header">
        <span className="elev-card__label">
          Höhenprofil {isPreviewOnly ? '(Grobe Orientierung)' : '· Interaktiv'}
        </span>
        {active ? (
          <span className="elev-card__readout">
            <strong>{active.pt[2].toLocaleString('de-DE')} m</strong> ·{' '}
            {active.scaledKm.toFixed(1).replace('.', ',')} km
            {gradientPct !== 0 && (
              <span className="elev-card__slope">
                {gradientPct > 0 ? `+${gradientPct}%` : `${gradientPct}%`}
              </span>
            )}
          </span>
        ) : (
          <span className="elev-card__hint">Mit Maus/Finger abfahren</span>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="elev-card__svg"
        role="img"
        aria-label="Interaktives Höhenprofil der Strecke"
        onPointerMove={(e) => handlePointer(e.clientX)}
        onPointerDown={(e) => handlePointer(e.clientX)}
        onPointerLeave={() => {
          setHoverIdx(null);
          onHoverPoint(null);
        }}
      >
        <defs>
          <linearGradient id={`elev-grad-${season}-${isPreviewOnly ? 'p' : 'f'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.38" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Horizontal guide lines */}
        <line
          x1={padLeft}
          y1={padTop}
          x2={width - padRight}
          y2={padTop}
          stroke="rgba(15,23,42,0.08)"
          strokeDasharray="3 3"
        />
        <line
          x1={padLeft}
          y1={height - padBottom}
          x2={width - padRight}
          y2={height - padBottom}
          stroke="rgba(15,23,42,0.12)"
        />

        {/* Filled elevation area & stroke */}
        <path d={stats.areaPath} fill={`url(#elev-grad-${season}-${isPreviewOnly ? 'p' : 'f'})`} />
        <path
          d={stats.linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={isPreviewOnly ? '5 4' : undefined}
        />

        {/* Highest peak marker */}
        <circle
          cx={stats.peakCoord.x}
          cy={stats.peakCoord.y}
          r="3"
          fill="#ffffff"
          stroke={strokeColor}
          strokeWidth="2"
        />
        <text
          x={Math.min(width - 42, Math.max(36, stats.peakCoord.x))}
          y={Math.max(11, stats.peakCoord.y - 6)}
          textAnchor="middle"
          className="elev-card__peak-text"
        >
          ▲ {stats.maxEle.toLocaleString('de-DE')} m
        </text>

        {/* Axis labels */}
        <text x={padLeft} y={height - 5} className="elev-card__axis-text">
          0 km
        </text>
        <text x={width - padRight} y={height - 5} textAnchor="end" className="elev-card__axis-text">
          {Math.round(stats.displayKm)} km
        </text>

        {/* Active scrub cursor */}
        {active && (
          <g>
            <line
              x1={active.x}
              y1={padTop - 4}
              x2={active.x}
              y2={height - padBottom}
              stroke={strokeColor}
              strokeWidth="1.4"
              strokeDasharray="2 2"
            />
            <circle
              cx={active.x}
              cy={active.y}
              r="5"
              fill={strokeColor}
              stroke="#ffffff"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>
    </div>
  );
};
