# Ride the World · Marius Quast

Interaktive Vollbild-Weltkarte im **Apple-Liquid-Glass-Design** für Marius Quasts Bike-Touren, Alpenüberquerungen, Gravel-Abenteuer und weltweite Skigebiete.

## Highlights

- **100 % Vollbild-2D-Topografie-Karte** (`MapLibre GL JS` + AWS Terrarium Relief-Schummerung + Live-Höhenlinien via `maplibre-contour` – komplett ohne API-Kostenfalle).
- **Dynamischer Saison-Stimmungswechsel:** Subtiler Farbshift von Topografie & Glas-UI zwischen **Sommer / Bike** (warme Terracotta- & Naturtöne) und **Winter / Ski** (kühle Gletscher- & Eistöne).
- **Zweistufiges Apple-Liquid-Glass-UI:**
  - `Clear Glass`: Berechnete konvexe Squircle-SDF-Lichtbrechung (`feDisplacementMap`) an den Kanten für schwebende Pills, Filter & Map-Controls.
  - `Regular Glass`: Außen brechender Glasrand, innen ruhigerer Milchglas-Kern für perfekte Lesbarkeit von Texten, Statistiken und Höhenprofilen (inkl. Fallback für Safari/iOS).
- **Maßgeschneiderte Eintrags-Typen:**
  - **Mehrtagestouren (`multi-day-bike`):** Gesamtroute + wählbare Einzel-Etappen (z. B. *Deutschland-Cross Hamburg–München* mit allen 7 Original-Komoot-Etappen).
  - **Bike-Tagestouren & Pässe (`day-bike`):** Interaktives Höhenprofil (Hover bewegt synchron einen Live-Marker auf der Karte) + Untergrund-Mix (*Asphalt / Schotter / Trail*).
  - **Skigebiete & Ski-Challenges (`ski-resort` / `ski-challenge`):** Alpin-Steckbriefe mit Seehöhe, Höhendifferenz, Pistenkilometern, Maximalgefälle und Marius’ Fazit-Badge.
- **Schutz kostenpflichtiger Routen-Pakete (`accessType: 'shop-pack'`):** Für Produkte wie die *Quast-Route* wird nur eine stark vereinfachte Vorschau-Linie ohne `.gpx`-Download ausgeliefert; der Haupt-CTA führt direkt in Marius’ Shop.
- **DSGVO-freundlicher 1-Klick-Inline-Player (`youtube-nocookie.com`)** + teilbare Deep-Links (`?tour=quast-route`, `?mode=ski`).

## Lokaler Start

```bash
npm install
npm run dev
```

## Neue Tour in 30 Sekunden hinzufügen (Komoot oder GPX + YouTube)

### 1. Aus einer öffentlichen Komoot-Tour importieren

```bash
npm run import:tour -- \
  --komoot "https://www.komoot.com/de-de/tour/380812878" \
  --slug "meine-neue-tour" \
  --youtube "https://www.youtube.com/watch?v=oBe_vZ9lKuE"
```

### 2. Aus einer lokalen `.gpx`-Datei importieren

```bash
npm run import:tour -- \
  --gpx "./public/gpx-raw/tour.gpx" \
  --slug "meine-neue-tour" \
  --youtube "https://www.youtube.com/watch?v=cJO9VTVP7fU"
```

> **Hinweis für Bezahl-Pakete:** Einfach `--shop-preview` anhängen – dann speichert das Skript automatisch nur ca. 20 grobe Orientierungspunkte und erzeugt **keine** herunterladbare `.gpx`-Datei.

Anschließend das im Terminal ausgegebene JSON-Snippet in [`src/data/adventures.ts`](./src/data/adventures.ts) einfügen.
