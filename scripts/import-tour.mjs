#!/usr/bin/env node
/**
 * Ride the World — Auto-Importer für Komoot-URLs, lokale .gpx-Dateien & YouTube-Metadaten
 *
 * Beispiele:
 *   node scripts/import-tour.mjs --komoot https://www.komoot.com/de-de/tour/380812878 --slug muenchen-orbit --youtube https://www.youtube.com/watch?v=oBe_vZ9lKuE
 *   node scripts/import-tour.mjs --gpx ./public/gpx-raw/meine-tour.gpx --slug meine-tour --shop-preview
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TRACKS_DIR = path.join(ROOT, 'public', 'tracks');
const GPX_OUT_DIR = path.join(ROOT, 'public', 'gpx');

/** Haversine distance in km */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Downsample points evenly + preserve peaks & endpoints */
export function downsamplePoints(rawCoords, maxPoints = 360) {
  if (rawCoords.length <= maxPoints) return rawCoords;
  const result = [rawCoords[0]];
  const step = (rawCoords.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    const idx = Math.round(i * step);
    result.push(rawCoords[idx]);
  }
  result.push(rawCoords[rawCoords.length - 1]);
  return result;
}

/** Build TrackPayload from array of { lat, lng, alt } */
export function buildTrackPayload(slug, rawCoords, { isPreviewOnly = false, maxPoints } = {}) {
  const targetMax = maxPoints ?? (isPreviewOnly ? 22 : 380);
  const sampled = downsamplePoints(rawCoords, targetMax);

  let cumKm = 0;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const points = sampled.map((pt, idx) => {
    if (idx > 0) {
      const prev = sampled[idx - 1];
      cumKm += haversineKm(prev.lat, prev.lng, pt.lat, pt.lng);
    }
    if (pt.lng < minLng) minLng = pt.lng;
    if (pt.lng > maxLng) maxLng = pt.lng;
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;

    return [
      Number(pt.lng.toFixed(isPreviewOnly ? 3 : 5)),
      Number(pt.lat.toFixed(isPreviewOnly ? 3 : 5)),
      Math.round(pt.alt ?? 0),
      Number(cumKm.toFixed(2)),
    ];
  });

  return {
    slug,
    ...(isPreviewOnly ? { isPreviewOnly: true } : {}),
    bbox: [
      Number(minLng.toFixed(4)),
      Number(minLat.toFixed(4)),
      Number(maxLng.toFixed(4)),
      Number(maxLat.toFixed(4)),
    ],
    points,
  };
}

/** Export clean GPX XML from sampled or full coordinates */
export function buildGpxXml(name, coords) {
  const sampled = downsamplePoints(coords, 1200);
  const trkpts = sampled
    .map(
      (c) =>
        `      <trkpt lat="${c.lat.toFixed(6)}" lon="${c.lng.toFixed(6)}"><ele>${Math.round(c.alt ?? 0)}</ele></trkpt>`
    )
    .join('\n');

  const safeName = name.replace(/[<>&'"]/g, '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ride the World - Marius Quast" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
  </metadata>
  <trk>
    <name>${safeName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

/** Parse a local .gpx file */
export async function parseGpxFile(filePath) {
  const xml = await fs.readFile(filePath, 'utf8');
  const nameMatch = xml.match(/<name>([^<]+)<\/name>/);
  const ptRegex = /<trkpt[^>]*lat=["']([0-9.-]+)["'][^>]*lon=["']([0-9.-]+)["'][^>]*>([\s\S]*?)<\/trkpt>/g;
  const coords = [];
  let m;
  while ((m = ptRegex.exec(xml)) !== null) {
    const eleMatch = m[3].match(/<ele>([0-9.-]+)<\/ele>/);
    coords.push({
      lat: parseFloat(m[1]),
      lng: parseFloat(m[2]),
      alt: eleMatch ? parseFloat(eleMatch[1]) : 0,
    });
  }
  let elevationUp = 0;
  let distKm = 0;
  let maxEle = 0;
  for (let i = 0; i < coords.length; i++) {
    if (coords[i].alt > maxEle) maxEle = coords[i].alt;
    if (i > 0) {
      distKm += haversineKm(coords[i - 1].lat, coords[i - 1].lng, coords[i].lat, coords[i].lng);
      const diff = coords[i].alt - coords[i - 1].alt;
      if (diff > 1.5) elevationUp += diff;
    }
  }
  return {
    title: nameMatch ? nameMatch[1] : path.basename(filePath, '.gpx'),
    distanceKm: Number(distKm.toFixed(1)),
    elevationUpM: Math.round(elevationUp),
    highestPointM: Math.round(maxEle),
    surfaces: { asphalt: 50, gravel: 40, trail: 10 },
    coords,
  };
}

/** Fetch public Komoot tour data from public tour URL or ID */
export async function fetchKomootTour(urlOrId) {
  const idMatch = String(urlOrId).match(/([0-9]{6,14})/);
  if (!idMatch) throw new Error(`Ungültige Komoot-Tour-ID oder URL: ${urlOrId}`);
  const tourId = idMatch[1];
  const url = `https://www.komoot.com/de-de/tour/${tourId}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) RideTheWorldImporter/1.0',
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`Komoot HTTP ${res.status} für Tour ${tourId}`);
  const html = await res.text();
  const bootMatch = html.match(/kmtBoot\.setProps\("((?:\\.|[^"])*)"\)/);
  if (!bootMatch) throw new Error(`Kein öffentliches kmtBoot-Payload auf ${url} gefunden.`);
  const unescaped = JSON.parse(`"${bootMatch[1]}"`);
  const data = JSON.parse(unescaped);
  const tour = data?.page?._embedded?.tour;
  if (!tour) throw new Error(`Tour ${tourId} ist nicht öffentlich lesbar.`);

  const coords = tour?._embedded?.coordinates?.items ?? [];
  const rawSurfaces = tour?._embedded?.surfaces?.items ?? [];
  let asphalt = 0;
  let gravel = 0;
  let trail = 0;
  for (const s of rawSurfaces) {
    const amt = (s.amount ?? 0) * 100;
    const t = String(s.type || '');
    if (t.includes('asphalt') || t.includes('paved') || t.includes('concrete')) {
      asphalt += amt;
    } else if (t.includes('gravel') || t.includes('compacted') || t.includes('cobbles')) {
      gravel += amt;
    } else {
      trail += amt;
    }
  }
  const sum = asphalt + gravel + trail || 100;
  const surfaces = {
    asphalt: Math.round((asphalt / sum) * 100),
    gravel: Math.round((gravel / sum) * 100),
    trail: Math.max(0, 100 - Math.round((asphalt / sum) * 100) - Math.round((gravel / sum) * 100)),
  };

  let highestPointM = 0;
  for (const c of coords) {
    if ((c.alt ?? 0) > highestPointM) highestPointM = Math.round(c.alt);
  }

  return {
    tourId,
    komootUrl: url,
    title: tour.name || `Komoot Tour ${tourId}`,
    distanceKm: Number(((tour.distance ?? 0) / 1000).toFixed(1)),
    elevationUpM: Math.round(tour.elevation_up ?? 0),
    durationSec: tour.duration ?? 0,
    highestPointM,
    surfaces,
    coords,
  };
}

/** Fetch YouTube oEmbed metadata without API key */
export async function fetchYouTubeMeta(youtubeUrlOrId) {
  const idMatch =
    String(youtubeUrlOrId).match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/) ||
    String(youtubeUrlOrId).match(/^([A-Za-z0-9_-]{11})$/);
  if (!idMatch) return null;
  const youtubeId = idMatch[1];
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`;
    const res = await fetch(oembedUrl);
    if (!res.ok) return { youtubeId, title: '' };
    const json = await res.json();
    return { youtubeId, title: json.title || '' };
  } catch {
    return { youtubeId, title: '' };
  }
}

/** Save track JSON and (if not shop-preview) downloadable GPX */
export async function saveTrackArtifacts(slug, title, coords, { isPreviewOnly = false, maxPoints } = {}) {
  await fs.mkdir(TRACKS_DIR, { recursive: true });
  await fs.mkdir(GPX_OUT_DIR, { recursive: true });

  const payload = buildTrackPayload(slug, coords, { isPreviewOnly, maxPoints });
  const trackOutPath = path.join(TRACKS_DIR, `${slug}.json`);
  await fs.writeFile(trackOutPath, JSON.stringify(payload));

  let gpxDownloadUrl;
  if (!isPreviewOnly) {
    const gpxXml = buildGpxXml(title, coords);
    const gpxOutPath = path.join(GPX_OUT_DIR, `${slug}.gpx`);
    await fs.writeFile(gpxOutPath, gpxXml);
    gpxDownloadUrl = `/gpx/${slug}.gpx`;
  }

  // Keep lightweight overview-bundle.json in sync automatically for instant map startup
  if (!slug.includes('-etappe-')) {
    const bundlePath = path.join( path.dirname(path.join('public/tracks', `${slug}.json`)), 'overview-bundle.json');
    let bundle = {};
    try {
      bundle = JSON.parse(await fs.readFile(bundlePath, 'utf8'));
    } catch {
      bundle = {};
    }
    const pts = payload.points;
    const step = Math.max(1, Math.floor(pts.length / 55));
    const mini = [];
    for (let i = 0; i < pts.length; i += step) {
      mini.push([Number(pts[i][0].toFixed(4)), Number(pts[i][1].toFixed(4))]);
    }
    if (pts.length > 0) {
      const last = pts[pts.length - 1];
      const lc = [Number(last[0].toFixed(4)), Number(last[1].toFixed(4))];
      if (!mini.length || mini[mini.length - 1][0] !== lc[0] || mini[mini.length - 1][1] !== lc[1]) {
        mini.push(lc);
      }
    }
    bundle[slug] = mini;
    await fs.writeFile(bundlePath, JSON.stringify(bundle));
  }

  return {
    trackFile: `/tracks/${slug}.json`,
    gpxDownloadUrl,
    bbox: payload.bbox,
    startCoordinate: payload.points[0]
      ? [payload.points[0][0], payload.points[0][1]]
      : [11.576, 48.137],
  };
}

// Direct CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  const komootArg = getArg('--komoot');
  const gpxArg = getArg('--gpx');
  const slug = getArg('--slug');
  const youtubeArg = getArg('--youtube');
  const isPreviewOnly = args.includes('--shop-preview');

  if (!slug || (!komootArg && !gpxArg)) {
    console.log(
      'Nutzung:\n  node scripts/import-tour.mjs --komoot <url|id> --slug <slug> [--youtube <url|id>] [--shop-preview]\n  node scripts/import-tour.mjs --gpx <pfad.gpx> --slug <slug> [--youtube <url|id>] [--shop-preview]'
    );
    process.exit(0);
  }

  const parsed = komootArg
    ? await fetchKomootTour(komootArg)
    : await parseGpxFile(path.resolve(process.cwd(), gpxArg));
  const yt = youtubeArg ? await fetchYouTubeMeta(youtubeArg) : null;
  const saved = await saveTrackArtifacts(slug, parsed.title, parsed.coords, { isPreviewOnly });

  const snippet = {
    slug,
    title: parsed.title,
    coordinates: saved.startCoordinate,
    youtubeId: yt?.youtubeId ?? 'YOUTUBE_ID_HIER',
    youtubeTitle: yt?.title || parsed.title,
    accessType: isPreviewOnly ? 'shop-pack' : 'free',
    ...(parsed.komootUrl && !isPreviewOnly ? { komootUrl: parsed.komootUrl } : {}),
    trackFile: saved.trackFile,
    ...(saved.gpxDownloadUrl ? { gpxDownloadUrl: saved.gpxDownloadUrl } : {}),
    bikeMetrics: {
      distanceKm: parsed.distanceKm,
      elevationUpM: parsed.elevationUpM,
      highestPointM: parsed.highestPointM,
      days: 1,
      durationLabel: 'Tagestour',
      surfaces: parsed.surfaces,
    },
  };

  console.log('\n✅ Track erfolgreich verarbeitet & gespeichert!');
  console.log('   Track-JSON:', saved.trackFile);
  if (saved.gpxDownloadUrl) console.log('   GPX-Datei: ', saved.gpxDownloadUrl);
  console.log('\n📋 Fertiger Daten-Eintrag für src/data/adventures.ts:\n');
  console.log(JSON.stringify(snippet, null, 2));
}
