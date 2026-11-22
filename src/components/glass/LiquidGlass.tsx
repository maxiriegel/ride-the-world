import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface LiquidGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'clear' | 'regular';
  radius?: number;
  interactive?: boolean;
  /** Enable full SVG Snell's-law displacement lens (enabled by default; disable on long scrolling lists for 120fps GPU budget) */
  opticalLens?: boolean;
  refractionScale?: number;
  as?: 'div' | 'header' | 'aside' | 'nav' | 'section';
  contentClassName?: string;
}

/** Shared memoization cache for identical glass geometry SDF maps */
const DISPLACEMENT_CACHE = new Map<string, string>();

/** Detect Chromium support for SVG url() inside CSS backdrop-filter */
function supportsSvgBackdropFilter(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches) return false;
  const ua = navigator.userAgent;
  const isFirefox = /firefox/i.test(ua);
  const isSafariOnly = /^((?!chrome|chromium|crios|edg|opr|android).)*safari/i.test(ua);
  return !isFirefox && !isSafariOnly;
}

/** Signed distance to rounded rectangle (negative inside, 0 on border, positive outside) */
function sdRoundedBox(px: number, py: number, hw: number, hh: number, r: number): number {
  const clampedR = Math.min(r, hw, hh);
  const qx = Math.abs(px) - (hw - clampedR);
  const qy = Math.abs(py) - (hh - clampedR);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - clampedR;
}

/**
 * Generates (and caches) a real Snell's-law 3D convex meniscus displacement map (n1=1.0 -> n2=1.52).
 * R channel = X normal refraction, G channel = Y normal refraction.
 */
function buildDisplacementMapUrl(
  width: number,
  height: number,
  radius: number,
  bezelPx: number
): string {
  const maxSample = 196;
  const ratio = Math.min(1, maxSample / Math.max(width, height, 1));
  const cw = Math.max(28, Math.round(width * ratio));
  const ch = Math.max(28, Math.round(height * ratio));
  const r = radius * ratio;
  const bezel = Math.max(6, Math.min(bezelPx * ratio, Math.min(cw, ch) * 0.48));

  const cacheKey = `${cw}x${ch}_r${Math.round(r * 10)}_b${Math.round(bezel * 10)}`;
  const cached = DISPLACEMENT_CACHE.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(cw, ch);
  const data = img.data;
  const hw = cw / 2;
  const hh = ch / 2;
  const eps = 0.8;

  const maxTheta = Math.asin(0.985);
  const maxRefracted = Math.asin(0.985 / 1.52);
  const normDeflect = Math.sin(maxTheta - maxRefracted) || 1;

  for (let y = 0; y < ch; y++) {
    const py = y + 0.5 - hh;
    for (let x = 0; x < cw; x++) {
      const px = x + 0.5 - hw;
      const d = sdRoundedBox(px, py, hw, hh, r);
      const distInside = -d;
      const idx = (y * cw + x) * 4;

      if (distInside > 0 && distInside < bezel) {
        const t = 1 - distInside / bezel;
        const sinTheta = Math.min(0.985, Math.pow(t, 1.32));
        const theta = Math.asin(sinTheta);
        const thetaRefracted = Math.asin(sinTheta / 1.52);
        const lens = Math.sin(theta - thetaRefracted) / normDeflect;

        const gx =
          sdRoundedBox(px + eps, py, hw, hh, r) - sdRoundedBox(px - eps, py, hw, hh, r);
        const gy =
          sdRoundedBox(px, py + eps, hw, hh, r) - sdRoundedBox(px, py - eps, hw, hh, r);
        const len = Math.hypot(gx, gy) || 1;
        const nx = gx / len;
        const ny = gy / len;

        const dx = -nx * lens;
        const dy = -ny * lens;

        data[idx] = Math.max(0, Math.min(255, Math.round(128 + dx * 127)));
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(128 + dy * 127)));
        data[idx + 2] = 128;
        data[idx + 3] = 255;
      } else {
        data[idx] = 128;
        data[idx + 1] = 128;
        data[idx + 2] = 128;
        data[idx + 3] = 255;
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL('image/png');
  DISPLACEMENT_CACHE.set(cacheKey, url);
  return url;
}

export const LiquidGlass: React.FC<LiquidGlassProps> = ({
  variant = 'regular',
  radius = 26,
  interactive = false,
  opticalLens = true,
  refractionScale,
  as: Tag = 'div',
  className = '',
  contentClassName = '',
  style,
  children,
  onPointerMove,
  ...rest
}) => {
  const rawId = useId();
  const filterId = useMemo(() => `lg-lens-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [rawId]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canRefract] = useState<boolean>(() => supportsSvgBackdropFilter());
  const useLens = canRefract && opticalLens;
  const [lensUrl, setLensUrl] = useState<string>('');

  const scale = refractionScale ?? (variant === 'clear' ? 50 : 38);
  const bezelPx = variant === 'clear' ? 28 : 34;
  const preBlurStdDev = variant === 'clear' ? 2.8 : 6.0;

  useEffect(() => {
    if (!useLens || !containerRef.current) return;
    const el = containerRef.current;
    let rafId = 0;

    const updateMap = (w: number, h: number) => {
      if (w < 16 || h < 16) return;
      const url = buildDisplacementMapUrl(w, h, radius, bezelPx);
      if (url) setLensUrl(url);
    };

    const rect = el.getBoundingClientRect();
    updateMap(rect.width, rect.height);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => updateMap(width, height));
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [useLens, radius, bezelPx]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
      const yPct = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100;
      containerRef.current.style.setProperty('--mx', `${xPct.toFixed(1)}%`);
      containerRef.current.style.setProperty('--my', `${yPct.toFixed(1)}%`);
    }
    onPointerMove?.(e);
  };

  const surfaceStyle: React.CSSProperties = useMemo(
    () => ({
      ['--lg-radius' as string]: `${radius}px`,
      ...style,
    }),
    [radius, style]
  );

  const backdropStyle: React.CSSProperties | undefined = useMemo(() => {
    if (!(useLens && lensUrl)) return undefined;
    const satPct = variant === 'clear' ? 195 : 190;
    const filterVal = `url(#${filterId}) saturate(${satPct}%) contrast(1.06) brightness(1.04)`;
    return {
      backdropFilter: filterVal,
      WebkitBackdropFilter: filterVal,
    };
  }, [useLens, lensUrl, variant, filterId]);

  const Component = Tag as React.ElementType;
  const scaleWarm = Number((scale * 0.95).toFixed(1));
  const scaleCool = Number((scale * 1.04).toFixed(1));

  return (
    <Component
      ref={containerRef}
      className={`lg-surface lg-surface--${variant} ${!(useLens && lensUrl) ? 'lg-surface--fallback' : ''} ${interactive ? 'lg-surface--interactive' : ''} ${className}`}
      style={surfaceStyle}
      onPointerMove={handlePointerMove}
      {...rest}
    >
      {/* Dedicated childless backdrop layer prevents Chromium OOPIF compositor blur on child iframes/videos */}
      <div className="lg-backdrop" aria-hidden="true" style={backdropStyle} />
      {useLens && lensUrl && (
        <svg
          aria-hidden="true"
          width="0"
          height="0"
          style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
        >
          <defs>
            <filter
              id={filterId}
              x="-5%"
              y="-5%"
              width="110%"
              height="110%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation={preBlurStdDev}
                edgeMode="duplicate"
                result="blurredBg"
              />
              <feImage
                href={lensUrl}
                x="0%"
                y="0%"
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                result="dispMap"
              />
              {variant === 'clear' ? (
                <>
                  <feDisplacementMap
                    in="blurredBg"
                    in2="dispMap"
                    scale={scaleWarm}
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="rawWarm"
                  />
                  <feColorMatrix
                    in="rawWarm"
                    type="matrix"
                    values="1 0 0 0 0  0 0.5 0 0 0  0 0 0 0 0  0 0 0 1 0"
                    result="chanWarm"
                  />
                  <feDisplacementMap
                    in="blurredBg"
                    in2="dispMap"
                    scale={scaleCool}
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="rawCool"
                  />
                  <feColorMatrix
                    in="rawCool"
                    type="matrix"
                    values="0 0 0 0 0  0 0.5 0 0 0  0 0 1 0 0  0 0 0 1 0"
                    result="chanCool"
                  />
                  <feComposite
                    in="chanWarm"
                    in2="chanCool"
                    operator="arithmetic"
                    k1="0"
                    k2="1"
                    k3="1"
                    k4="0"
                    result="refractedPrism"
                  />
                </>
              ) : (
                <feDisplacementMap
                  in="blurredBg"
                  in2="dispMap"
                  scale={scale}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="refractedClean"
                />
              )}
            </filter>
          </defs>
        </svg>
      )}
      <div className={`lg-content ${contentClassName}`}>{children}</div>
    </Component>
  );
};
