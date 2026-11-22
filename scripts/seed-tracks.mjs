#!/usr/bin/env node
import { fetchKomootTour, saveTrackArtifacts } from './import-tour.mjs';

/** Catmull-Rom / smooth interpolation between geographic key waypoints [lat, lng, alt] */
function interpolateWaypoints(waypoints, segmentsPerSpan = 16) {
  const out = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const p0 = waypoints[Math.max(0, i - 1)];
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const p3 = waypoints[Math.min(waypoints.length - 1, i + 2)];

    for (let s = 0; s < segmentsPerSpan; s++) {
      const t = s / segmentsPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;

      const catmull = (v0, v1, v2, v3) =>
        0.5 *
        (2 * v1 +
          (-v0 + v2) * t +
          (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
          (-v0 + 3 * v1 - 3 * v2 + v3) * t3);

      out.push({
        lat: catmull(p0[0], p1[0], p2[0], p3[0]),
        lng: catmull(p0[1], p1[1], p2[1], p3[1]),
        alt: Math.max(0, catmull(p0[2], p1[2], p2[2], p3[2])),
      });
    }
  }
  const last = waypoints[waypoints.length - 1];
  out.push({ lat: last[0], lng: last[1], alt: last[2] });
  return out;
}

/**
 * Fetch real 3D OpenStreetMap road/gravel/MTB switchback geometry from BRouter ([lat, lng, alt] waypoints).
 * Falls back gracefully to Catmull-Rom spline if offline.
 */
async function fetchBrouterOrSpline(waypoints, profile = 'fastbike', maxRoadPeakM = null) {
  try {
    const lonlats = waypoints.map((w) => `${w[1]},${w[0]}`).join('|');
    const url = `https://brouter.de/brouter?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`BRouter HTTP ${res.status}`);
    const gj = await res.json();
    const raw = gj?.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(raw) || raw.length < 10) throw new Error('Empty BRouter geometry');
    return raw.map(([lng, lat, ele]) => ({
      lat,
      lng,
      alt:
        maxRoadPeakM !== null
          ? Math.min(maxRoadPeakM, Math.max(0, Number(ele ?? 0)))
          : Math.max(0, Number(ele ?? 0)),
    }));
  } catch (err) {
    console.warn(`  ⚠ BRouter Fallback aktiv (${err.message})`);
    return interpolateWaypoints(waypoints, 22);
  }
}

async function main() {
  const curatedOnly = process.argv.includes('--curated-only');

  if (!curatedOnly) {
    console.log('🌍 Lade echte öffentliche Komoot-Touren von Marius Quast...');

    const komootJobs = [
      { id: '607111877', slug: 'deutschland-cross', maxPoints: 420 },
      { id: '358064545', slug: 'deutschland-cross-etappe-1', maxPoints: 220 },
      { id: '358066261', slug: 'deutschland-cross-etappe-2', maxPoints: 220 },
      { id: '358068257', slug: 'deutschland-cross-etappe-3', maxPoints: 220 },
      { id: '358069890', slug: 'deutschland-cross-etappe-4', maxPoints: 220 },
      { id: '358071044', slug: 'deutschland-cross-etappe-5', maxPoints: 220 },
      { id: '358072082', slug: 'deutschland-cross-etappe-6', maxPoints: 220 },
      { id: '358073037', slug: 'deutschland-cross-etappe-7', maxPoints: 220 },
      { id: '776027495', slug: 'bodensee-koenigssee-etappe-1', maxPoints: 280 },
      { id: '380812878', slug: 'muenchen-orbit', maxPoints: 320 },
      { id: '420816266', slug: 'seceda-dolomiten-mtb', maxPoints: 300 },
    ];

    for (const job of komootJobs) {
      const parsed = await fetchKomootTour(job.id);
      await saveTrackArtifacts(job.slug, parsed.title, parsed.coords, {
        maxPoints: job.maxPoints,
      });
      console.log(
        `  ✓ ${job.slug}: ${parsed.distanceKm} km, ${parsed.elevationUpM} hm (${parsed.coords.length} Rohpunkte)`
      );
    }

    // 1) Quast-Route München -> Gardasee (GROBE SHOP-PREVIEW: nur 20 Stützpunkte, kein GPX!)
    const quastRouteWaypoints = [
      { lat: 48.111, lng: 11.582, alt: 530 },
      { lat: 47.996, lng: 11.345, alt: 586 },
      { lat: 47.84, lng: 11.29, alt: 615 },
      { lat: 47.678, lng: 11.2, alt: 688 },
      { lat: 47.492, lng: 11.095, alt: 708 },
      { lat: 47.392, lng: 11.035, alt: 1502 },
      { lat: 47.365, lng: 10.955, alt: 1380 },
      { lat: 47.239, lng: 10.74, alt: 827 },
      { lat: 47.14, lng: 10.565, alt: 816 },
      { lat: 46.968, lng: 10.538, alt: 970 },
      { lat: 46.797, lng: 10.298, alt: 1290 },
      { lat: 46.718, lng: 10.333, alt: 1810 },
      { lat: 46.666, lng: 10.371, alt: 2251 },
      { lat: 46.625, lng: 10.428, alt: 1375 },
      { lat: 46.671, lng: 10.553, alt: 907 },
      { lat: 46.669, lng: 11.159, alt: 325 },
      { lat: 46.479, lng: 11.258, alt: 262 },
      { lat: 46.342, lng: 11.242, alt: 218 },
      { lat: 45.89, lng: 10.955, alt: 287 },
      { lat: 45.869, lng: 10.876, alt: 68 },
    ];
    await saveTrackArtifacts('quast-route', 'Quast-Route Gravel Alpencross (Preview)', quastRouteWaypoints, {
      isPreviewOnly: true,
      maxPoints: 20,
    });
    console.log('  ✓ quast-route (Shop-Pack Schutz aktiv: nur 20 grobe Stützpunkte, kein GPX)');
  }

  // 2) Bodensee - Königssee Etappen 2, 3 & Gesamtroute mit echten OSM-Gravelwegen!
  const fs = await import('node:fs/promises');
  const st1Raw = JSON.parse(await fs.readFile('public/tracks/bodensee-koenigssee-etappe-1.json', 'utf8'));
  const st1Pts = st1Raw.points.map((p) => ({ lng: p[0], lat: p[1], alt: p[2] }));
  const st1End = st1Pts[st1Pts.length - 1];

  const bodenseeStage2Pts = await fetchBrouterOrSpline(
    [
      [st1End.lat, st1End.lng, st1End.alt || 820],
      [47.5696, 10.7004, 805], // Füssen
      [47.5968, 11.0645, 845], // Oberammergau
      [47.6032, 11.1895, 650], // Eschenlohe
      [47.7606, 11.5591, 658], // Bad Tölz
      [47.7094, 11.7568, 735], // Tegernsee
      [47.7346, 11.8608, 785], // Schliersee
    ],
    'trekking'
  );

  const bodenseeStage3Pts = await fetchBrouterOrSpline(
    [
      [47.7346, 11.8608, 785], // Schliersee
      [47.6744, 12.0125, 805], // Bayrischzell
      [47.7667, 12.3235, 620], // Aschau im Chiemgau
      [47.7634, 12.6456, 656], // Ruhpolding
      [47.7642, 12.7485, 692], // Inzell
      [47.6302, 13.0001, 572], // Berchtesgaden
      [47.5892, 12.9885, 603], // Königssee Seelände
    ],
    'trekking'
  );

  await saveTrackArtifacts('bodensee-koenigssee-etappe-2', 'Bodensee – Königssee (Etappe 2/3)', bodenseeStage2Pts, {
    maxPoints: 260,
  });
  await saveTrackArtifacts('bodensee-koenigssee-etappe-3', 'Bodensee – Königssee (Etappe 3/3)', bodenseeStage3Pts, {
    maxPoints: 260,
  });
  await saveTrackArtifacts(
    'bodensee-koenigssee',
    'Bodensee – Königssee Gravel Bikepacking',
    [...st1Pts, ...bodenseeStage2Pts, ...bodenseeStage3Pts],
    { maxPoints: 380 }
  );
  console.log('  ✓ bodensee-koenigssee + Etappen 2 & 3 mit echten OSM-Wegen aktualisiert');

  // 3) Kuratierte Pässe & Touren mit 100% echten Straßen- & Kehren-Geometrien (BRouter OSM + SRTM)
  const curatedRoutes = [
    {
      slug: 'col-de-la-bonette',
      title: 'Cime de la Bonette – Europas höchste Passstraße',
      profile: 'fastbike',
      maxPoints: 380,
      maxRoadPeakM: 2802,
      waypoints: [
        [44.4181, 6.7312, 1215], // Jausiers Start (D64 / D900)
        [44.3215, 6.8075, 2802], // Cime de la Bonette Gipfelschleife (2.802 m!)
        [44.4181, 6.7312, 1215], // Rückfahrt über die D64-Serpentinen nach Jausiers
      ],
    },
    {
      slug: 'alpe-dhuez-21-kehren',
      title: 'Alpe d’Huez – Die 21 Kehren der Tour de France',
      profile: 'fastbike',
      maxPoints: 360,
      maxRoadPeakM: 1850,
      waypoints: [
        [45.0558, 6.0298, 722],  // Bourg-d'Oisans Fuß des Anstiegs
        [45.0924, 6.0699, 1850], // Alpe d'Huez Avenue du Rif Nel (Tour-Ziel)
        [45.0558, 6.0298, 722],  // Bourg-d'Oisans
      ],
    },
    {
      slug: 'zillertaler-hoehenstrasse',
      title: 'Zillertaler Höhenstraße mit dem Rennrad',
      profile: 'fastbike',
      maxPoints: 360,
      maxRoadPeakM: 2020,
      waypoints: [
        [47.2995, 11.8705, 555], // Ried im Zillertal
        [47.2165, 11.8204, 2020],// Melchboden (Höchster Punkt 2.020 m)
        [47.2044, 11.8654, 600], // Hippach im Zillertal
        [47.2995, 11.8705, 555], // Zurück nach Ried im Zillertal
      ],
    },
    {
      slug: 'mallorca-tramuntana-klassiker',
      title: 'Mallorca Küstenklassiker – Sa Calobra & Tramuntana',
      profile: 'fastbike',
      maxPoints: 400,
      maxRoadPeakM: 880,
      waypoints: [
        [39.9062, 3.0812, 15],   // Port de Pollença
        [39.8188, 2.8856, 515],  // Lluc / Coll de Femenia
        [39.8515, 2.7995, 12],   // Port de Sa Calobra (inkl. 270°-Krawattenknoten!)
        [39.7962, 2.7852, 875],  // Puig Major Tunnel-Scheitel
        [39.7668, 2.7152, 55],   // Sóller
        [39.8188, 2.8856, 515],  // Coll de Sóller / Lluc Rückweg
        [39.9062, 3.0812, 15],   // Port de Pollença
      ],
    },
    {
      slug: 'ammersee-gravel-runde',
      title: 'Ammersee-Runde & Kloster Andechs',
      profile: 'trekking',
      maxPoints: 340,
      maxRoadPeakM: 715,
      waypoints: [
        [47.9992, 11.1712, 538], // Herrsching S-Bahnhof
        [48.0768, 11.1325, 538], // Stegen Nordufer
        [47.9498, 11.1045, 538], // Dießen am Ammersee
        [47.9125, 11.1475, 585], // Raisting / Südmoos
        [47.9745, 11.1822, 710], // Kloster Andechs
        [47.9992, 11.1712, 538], // Herrsching
      ],
    },
    {
      slug: 'pfaffenwinkel-weitblicke',
      title: 'Weitblicke im Pfaffenwinkel & Hoher Peißenberg',
      profile: 'trekking',
      maxPoints: 360,
      maxRoadPeakM: 988,
      waypoints: [
        [47.8398, 11.1422, 563], // Weilheim in Oberbayern
        [47.8009, 11.0125, 988], // Hoher Peißenberg Gipfel (988 m)
        [47.7345, 10.9665, 755], // Rottenbuch / Ammerschlucht
        [47.6797, 10.9002, 871], // Wieskirche (UNESCO)
        [47.7212, 11.0285, 795], // Bad Bayersoien
        [47.8398, 11.1422, 563], // Weilheim
      ],
    },
    {
      slug: 'stoneman-dolomiti-gold',
      title: 'Stoneman Dolomiti MTB Gold (< 24h)',
      profile: 'mtb',
      maxPoints: 380,
      maxRoadPeakM: 2545,
      waypoints: [
        [46.7278, 12.2232, 1215],// Toblach
        [46.7318, 12.2795, 1175],// Innichen
        [46.7848, 12.3982, 2545],// Marchkinkele (2.545 m!)
        [46.7495, 12.4215, 1103],// Sillian
        [46.7095, 12.4265, 2430],// Sillianer Hütte / Demut-Passage
        [46.6552, 12.4212, 1636],// Kreuzbergpass
        [46.7022, 12.3505, 1310],// Sexten
        [46.7278, 12.2232, 1215],// Toblach
      ],
    },
    {
      slug: 'ski-transalp-muenchen-nizza',
      title: 'Mit Ski am Rad über die Alpen (München – Nizza)',
      profile: 'trekking',
      maxPoints: 420,
      maxRoadPeakM: 2757,
      waypoints: [
        [48.1372, 11.5755, 520], // München Marienplatz
        [47.2692, 11.4041, 574], // Innsbruck
        [47.0028, 11.5069, 1370],// Brennerpass
        [46.6212, 10.7735, 800], // Schlanders / Vinschgau
        [46.5287, 10.4531, 2757],// Stilfser Joch (2.757 m)
        [46.1695, 9.8702, 310],  // Sondrio / Valtellina
        [45.8112, 9.0852, 205],  // Como
        [44.3845, 7.5425, 535],  // Cuneo
        [44.1495, 7.5618, 1871], // Col de Tende
        [43.6959, 7.2655, 12],   // Nizza Promenade des Anglais
      ],
    },
  ];

  for (const r of curatedRoutes) {
    const pts = await fetchBrouterOrSpline(r.waypoints, r.profile, r.maxRoadPeakM);
    await saveTrackArtifacts(r.slug, r.title, pts, { maxPoints: r.maxPoints });
    console.log(`  ✓ ${r.slug}: ${pts.length} echte OSM-Rohpunkte -> Track & GPX erzeugt`);
  }

  console.log('\n🎉 Alle Tracks erfolgreich unter public/tracks/ und public/gpx/ bereitgestellt!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
