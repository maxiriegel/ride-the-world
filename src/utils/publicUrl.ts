/**
 * Resolves public-folder paths (such as `/tracks/*.json` or `/gpx/*.gpx`)
 * relative to Vite's configured `BASE_URL`, so the app works identically
 * on root domains (Vercel/Cloudflare) and subpaths (GitHub Pages).
 */
export function resolvePublicUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const clean = path.replace(/^\/+/, '');
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${clean}`;
}
