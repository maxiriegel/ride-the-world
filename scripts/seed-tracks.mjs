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

async function main() {
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

  const komootStats = {};
  for (const job of komootJobs) {
    const parsed = await fetchKomootTour(job.id);
    const saved = await saveTrackArtifacts(job.slug, parsed.title, parsed.coords, {
      maxPoints: job.maxPoints,
    });
    komootStats[job.slug] = {
      title: parsed.title,
      distanceKm: parsed.distanceKm,
      elevationUpM: parsed.elevationUpM,
      highestPointM: parsed.highestPointM,
      surfaces: parsed.surfaces,
      start: saved.startCoordinate,
    };
    console.log(
      `  ✓ ${job.slug}: ${parsed.distanceKm} km, ${parsed.elevationUpM} hm (${parsed.coords.length} Rohpunkte)`
    );
  }

  // 1) Quast-Route München -> Gardasee (GROBE SHOP-PREVIEW: nur 20 Stützpunkte, kein GPX!)
  const quastRouteWaypoints = [
    { lat: 48.111, lng: 11.582, alt: 530 }, // München Perlacher Str. 100
    { lat: 47.996, lng: 11.345, alt: 586 }, // Starnberger See
    { lat: 47.84, lng: 11.29, alt: 615 },   // Osterseen
    { lat: 47.678, lng: 11.2, alt: 688 },   // Murnau
    { lat: 47.492, lng: 11.095, alt: 708 }, // Garmisch-Partenkirchen
    { lat: 47.392, lng: 11.035, alt: 1502 },// Ehrwalder Alm / Gaistal Einstieg
    { lat: 47.365, lng: 10.955, alt: 1380 },// Gaistal / Leutasch
    { lat: 47.239, lng: 10.74, alt: 827 },  // Imst
    { lat: 47.14, lng: 10.565, alt: 816 },  // Landeck
    { lat: 46.968, lng: 10.538, alt: 970 }, // Pfunds
    { lat: 46.797, lng: 10.298, alt: 1290 },// Scuol
    { lat: 46.718, lng: 10.333, alt: 1810 },// S-charl
    { lat: 46.666, lng: 10.371, alt: 2251 },// Pass da Costainas (Höchster Punkt!)
    { lat: 46.625, lng: 10.428, alt: 1375 },// Val Müstair
    { lat: 46.671, lng: 10.553, alt: 907 }, // Glurns / Vinschgau
    { lat: 46.669, lng: 11.159, alt: 325 }, // Meran
    { lat: 46.479, lng: 11.258, alt: 262 }, // Eppan / Bozen Süd
    { lat: 46.342, lng: 11.242, alt: 218 }, // Auer / Etschtal
    { lat: 45.89, lng: 10.955, alt: 287 },  // Passo San Giovanni (Mori)
    { lat: 45.869, lng: 10.876, alt: 68 },  // Torbole am Gardasee
  ];
  await saveTrackArtifacts('quast-route', 'Quast-Route Gravel Alpencross (Preview)', quastRouteWaypoints, {
    isPreviewOnly: true,
    maxPoints: 20,
  });
  console.log('  ✓ quast-route (Shop-Pack Schutz aktiv: nur 20 grobe Stützpunkte, kein GPX)');

  // 2) Bodensee - Königssee Etappen 2, 3 & Gesamtroute (kombiniert mit echtem Etappe-1-Track!)
  const bodenseeStage1 = await fetchKomootTour('776027495');
  const stage1End = bodenseeStage1.coords[bodenseeStage1.coords.length - 1];
  const bodenseeStage2Pts = interpolateWaypoints(
    [
      [stage1End.lat, stage1End.lng, stage1End.alt || 820],
      [47.558, 10.749, 805],  // Füssen
      [47.565, 10.95, 1090],  // Ammergebirge
      [47.596, 11.095, 845],  // Oberammergau
      [47.565, 11.312, 805],  // Walchensee-Vorland / Eschenlohe
      [47.669, 11.576, 720],  // Bad Tölz
      [47.728, 11.734, 735],  // Tegernsee
      [47.685, 11.878, 795],  // Schliersee
    ],
    18
  );
  const bodenseeStage3Pts = interpolateWaypoints(
    [
      [47.685, 11.878, 795],  // Schliersee
      [47.669, 12.025, 1085], // Sudelfeld / Bayrischzell
      [47.768, 12.235, 520],  // Aschau im Chiemgau
      [47.752, 12.455, 560],  // Marquartstein
      [47.762, 12.648, 600],  // Ruhpolding
      [47.665, 12.785, 690],  // Inzell / Alpenstraße
      [47.63, 12.998, 572],   // Berchtesgaden
      [47.591, 12.988, 603],  // Königssee
    ],
    18
  );
  await saveTrackArtifacts('bodensee-koenigssee-etappe-2', 'Bodensee – Königssee (Etappe 2/3)', bodenseeStage2Pts, { maxPoints: 180 });
  await saveTrackArtifacts('bodensee-koenigssee-etappe-3', 'Bodensee – Königssee (Etappe 3/3)', bodenseeStage3Pts, { maxPoints: 180 });
  await saveTrackArtifacts(
    'bodensee-koenigssee',
    'Bodensee – Königssee Gravel Bikepacking',
    [...bodenseeStage1.coords.filter((_, i) => i % 90 === 0), ...bodenseeStage2Pts, ...bodenseeStage3Pts],
    { maxPoints: 340 }
  );

  // 3) Weitere kuratierte Bike-Klassiker mit topografischen Routenverläufen
  const curatedRoutes = [
    {
      slug: 'ski-transalp-muenchen-nizza',
      title: 'Mit Ski am Rad über die Alpen (München – Nizza)',
      waypoints: [
        [48.137, 11.576, 520],
        [47.728, 11.734, 730],
        [47.269, 11.404, 574], // Innsbruck
        [47.003, 11.507, 1370],// Brenner
        [46.671, 10.553, 910], // Vinschgau
        [46.529, 10.453, 2757],// Stilfser Joch Nähe / Bormio
        [46.169, 9.87, 310],   // Valtellina
        [45.815, 9.085, 210],  // Como
        [45.07, 7.686, 240],   // Turin
        [44.384, 7.542, 535],  // Cuneo
        [44.145, 7.568, 1871], // Col de Tende
        [43.696, 7.265, 12],   // Nizza Mittelmeer
      ],
    },
    {
      slug: 'stoneman-dolomiti-gold',
      title: 'Stoneman Dolomiti MTB Gold (< 24h)',
      waypoints: [
        [46.731, 12.279, 1175], // Toblach
        [46.729, 12.356, 1180], // Innichen
        [46.732, 12.438, 2434], // Marchkinkele (2.545m Grat)
        [46.743, 12.495, 1100], // Sillian
        [46.695, 12.482, 2150], // Leckfeldalm / Sillianer Hütte (2.447m)
        [46.663, 12.432, 1910], // Passo Silvella
        [46.605, 12.485, 1636], // Padola / Kreuzbergpass
        [46.638, 12.398, 2020], // Rotwandwiesen
        [46.699, 12.356, 1310], // Sexten
        [46.731, 12.279, 1175], // Toblach Ziel
      ],
    },
    {
      slug: 'alpe-dhuez-21-kehren',
      title: 'Alpe d’Huez – Die 21 Kehren der Tour de France',
      waypoints: [
        [45.056, 6.03, 722],   // Bourg-d'Oisans
        [45.063, 6.038, 845],  // Kehre 21-18 La Garde
        [45.072, 6.046, 1045], // Kehre 16-13
        [45.078, 6.058, 1265], // Kehre 10 St-Ferréol
        [45.083, 6.065, 1450], // Kehre 7 Huez Village
        [45.088, 6.071, 1645], // Kehre 4-2
        [45.092, 6.07, 1850],   // Alpe d'Huez Ziel
      ],
    },
    {
      slug: 'zillertaler-hoehenstrasse',
      title: 'Zillertaler Höhenstraße mit dem Rennrad',
      waypoints: [
        [47.272, 11.883, 560],  // Ried im Zillertal
        [47.262, 11.855, 1150], // Auffahrt Riedberg
        [47.245, 11.825, 1790], // Kristallhütte Nähe
        [47.216, 11.819, 2020], // Melchboden (Höchster Punkt 2.020 m)
        [47.198, 11.839, 1740], // Schlegeisblick / Mösl
        [47.204, 11.871, 610],  // Hippach im Zillertal
        [47.272, 11.883, 560],  // Ried im Zillertal
      ],
    },
    {
      slug: 'ammersee-gravel-runde',
      title: 'Ammersee-Runde mit dem Gravel-Bike',
      waypoints: [
        [48.005, 11.168, 535], // Herrsching
        [48.078, 11.132, 542], // Stegen Nordufer
        [48.045, 11.095, 580], // Schondorf / Westufer
        [47.949, 11.106, 536], // Dießen am Ammersee
        [47.912, 11.148, 595], // Ammer-Naturschutzgebiet / Weilheim-Vorland
        [47.968, 11.208, 712], // Kloster Andechs Anstieg
        [48.005, 11.168, 535], // Herrsching
      ],
    },
    {
      slug: 'mallorca-tramuntana-klassiker',
      title: 'Mallorca Küstenklassiker – Sa Calobra & Tramuntana',
      waypoints: [
        [39.853, 3.012, 55],   // Alcúdia / Port de Pollença
        [39.826, 2.912, 582],  // Coll de Femenia
        [39.818, 2.821, 682],  // Coll dels Reis (Krawattenknoten)
        [39.851, 2.799, 12],   // Port de Sa Calobra (Meereshöhe!)
        [39.818, 2.821, 682],  // Wieder hoch zum Coll dels Reis!
        [39.796, 2.778, 875],  // Puig Major Tunnel-Passage
        [39.766, 2.715, 145],  // Sóller
        [39.798, 2.891, 510],  // Kloster Lluc
        [39.853, 3.012, 55],   // Port de Pollença
      ],
    },
    {
      slug: 'pfaffenwinkel-weitblicke',
      title: 'Weitblicke im Pfaffenwinkel & Hoher Peißenberg',
      waypoints: [
        [47.836, 11.142, 563], // Weilheim in Oberbayern
        [47.795, 11.015, 988], // Hoher Peißenberg Gipfel (988 m)
        [47.736, 10.972, 745], // Rottenbuch / Ammerschlucht
        [47.674, 10.978, 835], // Wieskirche (UNESCO)
        [47.716, 11.095, 675], // Bad Bayersoien
        [47.785, 11.135, 610], // Polling
        [47.836, 11.142, 563], // Weilheim
      ],
    },
    {
      slug: 'col-de-la-bonette',
      title: 'Col de la Bonette – Europas höchste Passstraße',
      waypoints: [
        [44.387, 6.651, 1140], // Jausiers
        [44.365, 6.705, 1560], // Lans
        [44.345, 6.752, 2040], // Caserne de Restefond
        [44.321, 6.807, 2802], // Cime de la Bonette (2.802 m!)
        [44.345, 6.752, 2040], // Restefond Rückfahrt
        [44.387, 6.651, 1140], // Jausiers
      ],
    },
  ];

  for (const r of curatedRoutes) {
    const pts = interpolateWaypoints(r.waypoints, 22);
    await saveTrackArtifacts(r.slug, r.title, pts, { maxPoints: 260 });
    console.log(`  ✓ ${r.slug}: Track & GPX erzeugt`);
  }

  console.log('\n🎉 Alle V1-Tracks erfolgreich unter public/tracks/ und public/gpx/ bereitgestellt!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
