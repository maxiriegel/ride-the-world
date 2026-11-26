# Ride the World · Marius Quast

[![Deploy to GitHub Pages](https://github.com/maxiriegel/ride-the-world/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/maxiriegel/ride-the-world/actions/workflows/deploy-pages.yml)

**Live Demo:** [https://maxiriegel.github.io/ride-the-world/](https://maxiriegel.github.io/ride-the-world/)

An interactive full-bleed 2D world map in **Apple Liquid Glass** design showcasing YouTuber **Marius Quast’s** summer cycling adventures (Gravel, Road, MTB, Multi-Day Bikepacking) and winter ski destinations across the DACH region and worldwide.

---

## Key Features

- **3-Mode Full-Bleed 2D Alpine Map** (`MapLibre GL JS` — zero API-key lock-in):
  - **Hybrid Satellite:** Sharded Esri `World_Imagery` aerial relief with crisp adaptive place & peak labels.
  - **Cartographic Topo:** OpenFreeMap vector cartography with on-demand AWS Terrarium DEM hillshading and live elevation contour isolines (`maplibre-contour`).
  - **Night Topo:** High-contrast darkened alpine terrain that highlights glowing route lines and pins.
- **Two-Tier Apple Liquid Glass V2 UI:**
  - **`Clear Glass`:** Real-time Snell’s-law 3D convex meniscus SDF refraction (`feDisplacementMap` + chromatic prism split) on floating capsules, region chips, and map controls.
  - **`Regular Glass`:** Optical meniscus rim combined with a calmer frosted core for effortless readability on detail sheets, filter popovers, and discovery cards (including a pure-CSS optical bevel fallback for Safari and Firefox).
- **Dynamic Seasonal Atmosphere:** Subtle color and accent transitions between **Summer / Bike** (warm terracotta & alpine earth tones) and **Winter / Ski** (glacier & ice-blue accents).
- **Tailored Adventure Types:**
  - **Multi-Day Bikepacking (`multi-day-bike`):** Full-route overview plus interactive per-day stage switching (e.g., *Germany Cross Hamburg → Munich* across all 7 recorded Komoot stages).
  - **Day Rides & Mountain Passes (`day-bike`):** Real OpenStreetMap / Komoot switchback geometry, interactive elevation chart synchronized with a live map hover puck, and surface breakdown (*Asphalt / Gravel / Trail*).
  - **Ski Resorts & Challenges (`ski-resort` / `ski-challenge`):** Base/peak elevation, vertical drop, total slope kilometers, maximum gradient, and Marius’s verdict badge.
- **Paid Route Pack Protection (`accessType: 'shop-pack'`):** Paid products such as the *Quast-Route* only expose a simplified ~20-point coarse preview line without a downloadable `.gpx` file, routing the primary CTA directly to Marius’s shop.
- **Privacy-Friendly Inline Video & Deep Links:** 1-click `youtube-nocookie.com` inline player plus shareable URL state (`?mode=bike&tour=col-de-la-bonette`, `?mode=ski`, `?map=topo`).
- **Responsive Across All Form Factors:** Dedicated layouts for Smartphone (`< 640px` 1-line HUD + 3-snap iOS bottom sheet synced to `visualViewport`), Tablet Portrait, Tablet Landscape, and Desktop.

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vanilla CSS Design System
- **Map Engine:** MapLibre GL JS 6 + `maplibre-contour` (code-split async chunk for instant mobile first paint)
- **Tooling & CI/CD:** Vite 8, Oxlint, GitHub Actions → GitHub Pages

---

## Local Development

```bash
npm install
npm run dev
```

### Lint & Production Build

```bash
npm run lint
npm run build
npm run preview
```

---

## Adding a New Tour in 30 Seconds (Komoot or GPX + YouTube)

### 1. Import from a public Komoot tour

```bash
npm run import:tour -- \
  --komoot "https://www.komoot.com/de-de/tour/380812878" \
  --slug "my-new-tour" \
  --youtube "https://www.youtube.com/watch?v=oBe_vZ9lKuE"
```

### 2. Import from a local `.gpx` file

```bash
npm run import:tour -- \
  --gpx "./public/gpx-raw/tour.gpx" \
  --slug "my-new-tour" \
  --youtube "https://www.youtube.com/watch?v=cJO9VTVP7fU"
```

> **Note for paid route packs:** Append `--shop-preview` to automatically downsample the track to ~20 coarse orientation points and skip generating a downloadable `.gpx` file.

Finally, paste the generated JSON entry printed in the terminal into [`src/data/adventures.ts`](./src/data/adventures.ts).
