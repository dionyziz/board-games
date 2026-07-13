# Jason's Board Games

A Stripe-Press-style showcase of a ~200-game board-game collection, rendered as
photorealistic 3D boxes you can browse and open. Live at
**[jasongames.xyz](https://jasongames.xyz/)**.

- **Gallery** — an infinite vertical shelf of 3D boxes; scroll / `j` `k` / arrows to
  move, click or `→`/`Enter` to open, `/` to focus search, `Esc` to clear.
- **Detail** — orbit the box (drag / scroll), with metadata, categories and a link
  to BoardGameGeek.
- **Search & filters** — free-text search (Greek/Latin/any script, transliterated)
  plus facets for players, recommended player counts, weight, BGG rating, play time,
  age and type; sortable by name or weight. The search state lives in the URL, so any
  filtered view can be copied and shared.

---

## Tech stack

| Area | Libraries |
| --- | --- |
| App | [React 18](https://react.dev), [Vite 5](https://vitejs.dev), TypeScript |
| 3D | [three.js](https://threejs.org), [@react-three/fiber](https://github.com/pmndrs/react-three-fiber), [@react-three/drei](https://github.com/pmndrs/drei), [@react-three/postprocessing](https://github.com/pmndrs/react-postprocessing) |
| Routing | [react-router-dom](https://reactrouter.com) (`BrowserRouter`; games are real `/g/<id>/` paths, each pre-rendered so links preview + deep-link, with a `404.html` SPA fallback) |
| Search | [transliteration](https://www.npmjs.com/package/transliteration) (romanize any script for forgiving matching) |
| Data / image tooling | [sharp](https://sharp.pixelplumbing.com) (raster work), [playwright-core](https://playwright.dev) (headless fetch of Cloudflare/msgpack sources), Node's built-in `fetch` |

Custom 3D touches live in `src/three/`: a box-projection shader that paints six face
textures onto one rounded box (`boxShader.ts`), bespoke packaging geometry
(`geometry.ts` — tins, tubes, hang-tab flaps, the Happy Salmon fish pouch), a
reference-counted texture pool (`textures.ts`), and a glTF model path for the
Bag of Chips (`Model.tsx`).

---

## Setup

Requires Node 20+ (Node 22 recommended).

```bash
npm install
```

`sharp` is an optional dependency (prebuilt binaries for macOS/Linux). The data CLI's
network steps drive a headless browser — install it once:

```bash
npx playwright install chromium
```

### Develop / build / preview

```bash
npm run dev       # Vite dev server with HMR
npm run build     # production build → dist/  (also generates OG preview cards)
npm run preview   # serve the built dist/ locally
```

The app is served at Vite base `/` (custom domain root). `public/` — textures, glTF
models, favicon, `CNAME` — is copied verbatim into `dist/`.

---

## Data pipeline

Game data has two origins:

1. **Airtable** — Jason's collection (owned titles, cover images, his own "weight"
   rating, optimal player counts). Fetched from a public shared view.
2. **BoardGameGeek** — everything else (year, players, play time, min age, designers,
   categories, mechanics, description, **complexity** = BGG `avgweight`, **rating**,
   **rank**, and box dimensions from the editions list). Fetched from BGG's internal
   JSON API at `api.geekdo.com` (the public XML API2 now returns 401), through a
   headless Chromium so Cloudflare is satisfied.

> **Weight vs. complexity.** BGG exposes a *single* weight metric (`avgweight`, 1–5) —
> that is the `complexity` field, shown in the detail panel and used by the Weight
> filter/sort. The integer `weight` field is Jason's own coarse rating from Airtable, a
> **separate source**. The two are never derived from each other.

The canonical data file is **`src/data/games.json`** (`{ games: [...] , … }`), keyed by
a transliterated slug + BGG id. Per-game art lives in `public/textures/<id>/`
(`cover`, `back`, `spine`, `top`, `bottom`, bump maps, and shape-specific extras).

The build is a chain of numbered scripts in `scripts/` (`1-fetch-airtable` →
`2-build-games` → `3-download-covers` → `4-fetch-bgg` → `5-enrich` →
`6-prepare-textures`, then the box-art phase `8`/`10`/… and per-shape generators).
Hand-curated overrides that a refresh must preserve (and does — they are only ever
*re-applied*, never regenerated): `package-shapes.json`, `flap-params.json`,
`flap-overrides.json`, `bare-meta-patch.json`, and `cyl-src/`.

### The data CLI

A single entry point orchestrates the pipeline in the right order:

```bash
npm run data -- <command> [options]        # or: node scripts/cli.js <command>
```

| Command | What it does |
| --- | --- |
| `refresh` | Re-fetch BGG data for **all** games, re-enrich, rebuild assets |
| `refresh --since=2024` | …only games published in/after a year |
| `refresh --last-year` | …only games published in the last ~12 months |
| `refresh --last-month` | …only games published this calendar year (BGG data is year-granular) |
| `refresh --force-bgg` | full refresh: clear ALL cached BGG JSON (a bounded refresh already re-pulls its targets) |
| `add` | pull newly-added games from Airtable and process only the new ones |
| `assets` | re-run the offline generators/overlays only — no network |
| `help` | usage |

Add `--dry-run` to any command to print the plan without executing it. Example:

```bash
npm run data -- refresh --last-year --dry-run
npm run data -- add
```

`assets` re-applies the package shapes, hang-tab flaps, alternate titles, non-BGG
metadata backfill and cylinder wraps, and regenerates the bespoke Happy Salmon cutout
and Bag of Chips model. (The vision-audit-driven cover/face fixes — steps 12/13/14/20/21
— depend on gitignored working caches and are run by hand.)

---

## Social previews

Link-preview crawlers don't run JS, so a SPA needs static HTML per shareable URL.
Because games are real `/g/<id>/` paths, `scripts/gen-og.js` — run automatically by
`npm run build` — pre-renders, into `dist/`:

- `og/<id>.jpg` — a 1200×630 Open Graph card (the game's cover on a tinted background),
- `og/_default.jpg` — a site card (montage of covers), referenced from `index.html`,
- `g/<id>/index.html` — a copy of the app shell with that game's OG/Twitter tags
  injected. A crawler reads the correct card; a browser loads the same bundle and the
  SPA routes to the game in place (no redirect — the address bar keeps the shareable URL),
- `404.html` — a shell copy so any unknown path still boots the app (GitHub Pages
  SPA fallback).

So the game's own URL (`https://jasongames.xyz/g/<id>/`) is the shareable, previewable
one — no separate link to hand out.

---

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes
`dist/` to GitHub Pages. The custom domain (`jasongames.xyz`) is set via `public/CNAME`
plus the repo's Pages settings; HTTPS is enforced.
