import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface LiquidGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'clear' | 'regular';
  radius?: number;
  interactive?: boolean;
  refractionScale?: number;
  as?: 'div' | 'header' | 'aside' | 'nav' | 'section';
  contentClassName?: string;
}

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

/** Generate convex-squircle Snell's-law displacement map data URL */
function buildDisplacementMapUrl(width: number, height: number, radius: number, bezelPx: number): string {
  const maxSample = 180;
  const ratio = Math.min(1, maxSample / Math.max(width, height, 1));
  const cw = Math.max(24, Math.round(width * ratio));
  const ch = Math.max(24, Math.round(height * ratio));
  const r = radius * ratio;
  const bezel = Math.max(4, bezelPx * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(cw, ch);
  const data = img.data;
  const hw = cw / 2;
  const hh = ch / 2;
  const eps = 0.75;

  for (let y = 0; y < ch; y++) {
    const py = y + 0.5 - hh;
    for (let x = 0; x < cw; x++) {
      const px = x + 0.5 - hw;
      const d = sdRoundedBox(px, py, hw, hh, r);
      const distInside = -d;
      const idx = (y * cw + x) * 4;

      if (distInside > 0 && distInside < bezel) {
        // Normalized rim position: 1 at outer glass edge -> 0 at inner flat plane
        const t = 1 - distInside / bezel;
        // Convex lens refraction curve (Snell's law inspired rim warp)
        const lens = Math.pow(t, 2.15);

        const gx =
          sdRoundedBox(px + eps, py, hw, hh, r) - sdRoundedBox(px - eps, py, hw, hh, r);
        const gy =
          sdRoundedBox(px, py + eps, hw, hh, r) - sdRoundedBox(px, py - eps, hw, hh, r);
        const len = Math.hypot(gx, gy) || 1;
        const nx = gx / len;
        const ny = gy / len;

        // Displace inward along surface normal
        const dx = -nx * lens;
        const dy = -ny * lens;

        data[idx] = Math.max(0, Math.min(255, Math.round(128 + dx * 127)));
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(128 + dy * 127)));
        data[idx + 2] = 128;
        data[idx + 3] = 255;
      } else {
        // Neutral flat interior: zero warp so text & charts stay razor sharp
        data[idx] = 128;
        data[idx + 1] = 128;
        data[idx + 2] = 128;
        data[idx + 3] = 255;
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export const LiquidGlass: React.FC<LiquidGlassProps> = ({
  variant = 'regular',
  radius = 24,
  interactive = false,
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
  const [lensState, setLensState] = useState<{ w: number; h: number; url: string } | null>(null);

  const scale = refractionScale ?? (variant === 'clear' ? 26 : 18);
  const bezelPx = variant === 'clear' ? 18 : 22;

  useEffect(() => {
    if (!canRefract || !containerRef.current) return;
    const el = containerRef.current;
    let rafId = 0;

    const updateMap = (w: number, h: number) => {
      if (w < 16 || h < 16) return;
      const url = buildDisplacementMapUrl(w, h, radius, bezelPx);
      if (url) {
        setLensState({ w: Math.round(w), h: Math.round(h), url });
      }
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
  }, [canRefract, radius, bezelPx]);

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

  const backdropStyle: React.CSSProperties = useMemo(() => {
    const base: React.CSSProperties = {
      ['--lg-radius' as string]: `${radius}px`,
      ...style,
    };
    if (canRefract && lensState?.url) {
      const blurPx = variant === 'clear' ? 5 : 17;
      const satPct = variant === 'clear' ? 185 : 190;
      const filterVal = `url(#${filterId}) blur(${blurPx}px) saturate(${satPct}%) brightness(1.04)`;
      base.backdropFilter = filterVal;
      base.WebkitBackdropFilter = filterVal;
    }
    return base;
  }, [canRefract, lensState?.url, radius, style, variant, filterId]);

  const Component = Tag as React.ElementType;

  return (
    <Component
      ref={containerRef}
      className={`lg-surface lg-surface--${variant} ${interactive ? 'lg-surface--interactive' : ''} ${className}`}
      style={backdropStyle}
      onPointerMove={handlePointerMove}
      {...rest}
    >
      {canRefract && lensState?.url && (
        <svg
          aria-hidden="true"
          width="0"
          height="0"
          style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
        >
          <defs>
            <filter
              id={filterId}
              x="0%"
              y="0%"
              width="100%"
              height="100%"
              colorInterpolationFilters="sRGB"
            >
              <feImage
                href={lensState.url}
                x="0"
                y="0"
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                result="dispMap"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="dispMap"
                scale={scale}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>
      )}
      <div className={`lg-content ${contentClassName}`}>{children}</div>
    </Component>
  );
};
