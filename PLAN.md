# Jason's Board Game Library — Project Plan

A website that showcases Jason's board game collection as a gallery of
photorealistic **3D game boxes**, browsable in the style of
[Stripe Press](https://press.stripe.com/): a vertical column of floating,
softly-lit boxes you scroll through, each one clickable into a detail view
where the box rotates in 3D next to its description.

---

## 1. Goals & Non-Goals

**Goals**
- A beautiful, tactile 3D presentation of each board game box that evokes the
  real physical object (front cover, spine, side panels, box depth).
- A simple, hand-editable data source (JSON) describing the collection.
- Smooth 60fps scrolling on desktop, graceful degradation on mobile.
- Fast first paint; 3D loads progressively.
- Deployable as a static site (no backend required).

**Non-Goals (v1)**
- No user accounts, borrowing/lending workflow, or inventory management.
- No live sync with Airtable at runtime (Airtable is the *authoring* source;
  we snapshot it to JSON at build time).
- No e-commerce.

---

## 2. Reference: What "Stripe Press style" means here

From the reference screenshots:
- **Gallery view:** boxes float in a dark, near-black environment, evenly
  spaced in a single vertical column, gently tilted toward the viewer. As you
  scroll, boxes drift in/out with subtle parallax. Soft studio lighting with a
  faint reflection/shadow underneath.
- **Detail view:** the selected box is shown at an angle (3/4 perspective),
  slowly rotating or draggable, with title, author/designer, and a long
  description in a serif-forward typographic layout beside it. A "Living cover"
  concept (animated cover art) is optional flair.

**Key difference for board games:** Stripe Press shows *books* — thin objects
dominated by their spine. Board games are **boxes** — closer to cubes or flat
squares (e.g. Ticket to Ride ≈ 300×300×70mm; Codenames ≈ a flatter box; small
card games ≈ tuck boxes). Our 3D primitive is therefore a **rectangular box
with six textured faces**, and box proportions must come from real dimensions
so the collection reads as authentic. This is the single most important visual
detail to get right.

---

## 3. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Vite + React + TypeScript** | Fast dev, static build, typed data. |
| 3D | **Three.js** via **@react-three/fiber** + **@react-three/drei** | Declarative 3D in React; drei gives us `Environment`, `useTexture`, `ScrollControls`, `Html`, `ContactShadows` out of the box. |
| Scroll/animation | drei `ScrollControls` + **framer-motion** (2D UI) | Scroll-driven 3D camera + polished DOM transitions. |
| Styling | **CSS Modules** or Tailwind (pick one; Tailwind recommended) | Keep the typographic UI clean. |
| State/routing | **React Router** (`/` gallery, `/game/:slug` detail) | Deep-linkable games. |
| Data | Static **JSON** in `/src/data/games.json` | Hand-editable, versioned in git. |
| Hosting | **Vercel / Netlify / GitHub Pages** | Static, free, instant. |

> Alternative if we want *zero* framework: vanilla Three.js + a small router.
> React + R3F is recommended because the gallery↔detail state and DOM overlay
> are much easier to manage declaratively.

---

## 4. Data Layer

### 4.1 Sourcing the data from Airtable — ✅ DONE

**The data has been captured** (2026-07-12). See `scripts/README.md`.

Airtable's shared view serves an index-compressed msgpack payload that can't be
scraped server-side. The working approach (implemented in `scripts/`): drive a
headless Chromium (Playwright), intercept the app's own **signed** data request
(`/v0.3/application/appH80uhZrvloxhPR/read?…&accessPolicy=…`), and re-issue it
with `allowMsgpackOfResult=false` so the server returns plain JSON — the signed
`accessPolicy` is preserved, so **no token is needed**.

Result: **210 games**, all with cover images, 203 with BGG links, downloaded
locally to `public/covers/` (signed image URLs expire, so we don't hotlink).

**Actual Airtable fields** (this is all Jason tracks):
`Name`, `Notes`, `Optimal Players` (multi-select of player counts),
`Weight` (1–5 select), `BoardGameGeek` (URL), `Image` (attachment),
`Expansions`, `Sleeves`, `Tags`.

> ⚠️ There is **no** box dimensions, designer, year, playtime, or long
> description in Airtable. Those (needed for authentic box proportions and rich
> detail pages) must come from a **BGG enrichment** pass — see §4.4.

### 4.2 Current JSON schema (`src/data/games.json`) — as generated

```jsonc
{
  "source": "Airtable — Jason's tabletop games",
  "fetchedAt": "2026-07-12",
  "count": 210,
  "games": [
    {
      "id": "codenames-178900",          // slug: transliterated title + bggId
      "recordId": "recTSLUjqlnwxdo1v",
      "title": "Codenames",
      "bggId": 178900,
      "bggUrl": "https://boardgamegeek.com/boardgame/178900/codenames",
      "optimalPlayers": ["4","5","6","7","8","9+"],
      "weight": 1,                        // 1–5
      "notes": "",
      "expansions": "",
      "sleeves": [],
      "tags": [],
      "imageWidth": 279,
      "imageHeight": 400,
      "cover": "/covers/codenames-178900.jpg"
    }
  ]
}
```

### 4.3 Target schema after BGG enrichment (§4.4)

The 3D presentation needs a few fields Airtable doesn't have. After enrichment
each game gains:

```jsonc
{
  // …existing fields…
  "designers": ["Vlaada Chvátil"],
  "year": 2015,
  "players": { "min": 2, "max": 8 },
  "playtime": { "min": 15, "max": 15 },
  "complexity": 1.28,                    // BGG weight (finer than Jason's 1–5)
  "categories": ["Deduction", "Party"],
  "description": "Long-form blurb for the detail view…",
  "box": {
    "size": { "w": 160, "h": 118, "d": 33 },  // mm → drives 3D proportions
    "estimatedSize": false,
    "sideColor": "#b5121b"                     // dominant cover color, sampled
  }
}
```

**Notes**
- `box.size` is the crux of authenticity. BGG rarely lists box dimensions, so
  we infer a footprint per game **category/format** (big-box square, standard
  rectangular, small-box, tuck-box) and flag `estimatedSize: true`. Hero titles
  get hand-verified sizes.
- `sideColor` is auto-sampled from the cover (dominant color) so the box's
  undecorated side faces blend with the art — no box ever looks broken.
- Only `cover` is strictly required to render; everything else has a fallback.

### 4.4 BGG enrichment — ✅ DONE

**The XML API is dead** — `boardgamegeek.com/xmlapi2/*` now returns `401
Unauthorized` (requires login), even through a real browser. Workaround: BGG's
own website is powered by an **undocumented JSON API at `api.geekdo.com`** which
is open. `scripts/4-fetch-bgg.js` (headless browser for cookies) pulls, per game:
- `api/geekitems` → year, players, playtime, designers, artists, publishers,
  categories, mechanics, families, short + full description.
- `api/dynamicinfo` → complexity (`avgweight`), BGG rating, rank.
- `api/geekitem/linkeditems?…boardgameversion` → **every edition's physical box
  dimensions**.

Raw responses are cached under `scripts/bgg-cache/` so `scripts/5-enrich.js`
(normalization) re-runs offline. **Result: metadata for 203/210 games.**

#### Box dimensions — accurate & cross-checked (the hard part)

BGG stores dimensions **per edition**, contributor-entered in **mixed units**
(same physical box appears in inches for the English edition, cm for the German
one). `5-enrich.js` handles this:
1. **Unit-normalize** every version to cm (max side > 15 → already cm; else
   inches → ×2.54; no boxed game side exceeds ~15 in / 38 cm).
2. **Edition-match** to Jason's actual copy: if his title names a size variant
   (“Azul **Mini**”, “… XXL”) match that edition; if his title is Greek, prefer
   Greek editions.
3. **Cross-check** across all editions: cluster by longest side, keep the
   dominant cluster (rejects unit-misentered outliers), take the **median** per
   dimension, and record an `agreement` score (1.0 = all editions agree).
4. **Fallback**: category/format footprint model (`estimatedSize: true`) for the
   14 games with no BGG link or no version data.

**Coverage: 196/210 real cross-checked dims, 14 estimated.** Spot-checks:
Ticket to Ride 29.7×29.7×7.1, Codenames 16.2×23.2×5.0, Dune Imperium 30×30×8.2,
Uno 9.4×12.7×2.0 cm — all correct. 28 games have `agreement < 0.8` (editions
genuinely vary) flagged in `scripts/enrich-report.json` for optional review.

> Note on "multiple APIs": a genuinely independent box-dimension API no longer
> exists (BoardGameAtlas shut down in 2023; Amazon has no free API). The
> cross-check here is **multi-edition within BGG** — which is stronger than a
> single lookup, since it triangulates across up to ~45 editions per game.

### 4.5 Textures — ✅ DONE

`scripts/6-prepare-textures.js` (`sharp`) processed all 210 covers:
- `public/textures/<id>/cover.webp` — front face, long side ≤ 1024px, q82.
- `public/textures/<id>/thumb.webp` — 2D-fallback thumb, long side ≤ 320px.
- Per-game **`box.sideColor`** (dominant) + **`box.edgeColor`** (darker shade)
  written back into `games.json`, for the box's undecorated side/back faces.

Colors are sampled from the **center 60%** of each cover (whole-image dominant
was fooled by white scan backgrounds / black borders), with near-white/black
extremes rejected. Results verified sane: Uno `#d82818`, Dixit `#e86828`,
Saboteur `#66543d`. **Payload: 112 MB of source covers → 12 MB of webp
(15 MB incl. thumbs).**

The originals in `public/covers/` are the source of truth; only
`public/textures/` needs to ship. (Recommend git-ignoring `public/covers/` and
`scripts/bgg-cache/` — both are regenerable — to keep the repo light.)

---

## 5. 3D Design

### 5.1 The box component (`<GameBox>`)

- A `BoxGeometry` scaled to `box.size` (normalized so the largest dimension =
  1 unit; keep real aspect ratios).
- **Per-face materials** (`MeshStandardMaterial[6]`): front = cover, back =
  back art, four sides = spine/side textures or tinted `sideColor`.
- Slight **bevel/rounded edges** (via `RoundedBoxGeometry` from drei or a small
  bevel) — real boxes aren't razor-sharp; this reads as premium.
- Subtle **material realism:** low roughness variation, a faint clear-coat
  sheen on the cover to catch the key light (mimics glossy cardstock).

### 5.2 Lighting & environment

- Dark background (`#0b0b0c`), matching the reference.
- **Studio lighting:** one key light (soft, upper-front), one rim/back light for
  edge separation, low ambient. Use a subtle **HDRI environment** (drei
  `Environment preset="studio"` or a custom `.hdr`) for realistic reflections
  in the cover's sheen.
- **ContactShadows** under each box for grounding.
- Keep it moody but readable — cover art must stay legible.

### 5.3 Gallery layout & scroll

- Boxes arranged in a **vertical column** in 3D space, evenly spaced along −Y.
- drei **`ScrollControls`**: scrolling moves the camera down the column (or moves
  boxes up past a fixed camera). Add gentle **parallax** and a slight rotation
  so boxes rotate to face the viewer as they reach center focus.
- **Hover:** the focused box scales up slightly and rotates a few degrees;
  cursor becomes a pointer.
- **Snap** (optional): scroll snaps to center a box, like a coverflow.

### 5.4 Detail view (`/game/:slug`)

- Selected box animates from its gallery position to the left/center, enlarges,
  and enters a slow auto-rotate; **drag to orbit** (`OrbitControls`, damped,
  limited polar angle).
- Right side: DOM overlay (drei `Html` or a fixed React panel) with title,
  designers, publisher/year, player count, playtime, complexity, categories,
  full description, and a BGG link.
- Smooth camera transition between gallery and detail using a tweened camera
  (framer-motion values or `maath` easing / `@react-spring/three`).

### 5.5 Mobile & fallback

- On small screens: single-column, larger boxes, tap-to-open detail; reduce
  shadow/reflection quality.
- **No-WebGL / reduced-motion fallback:** render a clean **2D grid** of cover
  images with the same detail pages. Respect `prefers-reduced-motion` by
  disabling auto-rotate and parallax.

---

## 6. Performance

- **Lazy-load textures** as boxes approach the viewport (drei `useTexture` +
  virtualization: only mount boxes near the camera; recycle geometry).
- **Instancing / shared geometry:** one `RoundedBoxGeometry`, per-instance
  scale + material.
- Cap texture size (≤1024px), serve `.webp`, use `KTX2`/basis compression if the
  collection grows large.
- Target: interactive < 2.5s on desktop; keep draw calls low; `powerPreference:
  "high-performance"`; pause the render loop when the tab is hidden and when
  nothing animates (R3F `frameloop="demand"` where possible).
- Lighthouse budget: performance ≥ 90 on desktop.

---

## 7. Proposed File Structure

```
board-games/
├─ PLAN.md
├─ index.html
├─ package.json
├─ vite.config.ts
├─ scripts/
│  ├─ import.ts             # Airtable CSV/API → games.json (+ BGG enrichment)
│  └─ prepare-textures.ts   # resize/webp + derive spine/side art (sharp)
├─ public/
│  └─ textures/<id>/cover.webp …
└─ src/
   ├─ main.tsx
   ├─ App.tsx               # Router
   ├─ data/games.json
   ├─ data/games.ts         # typed loader + schema (zod)
   ├─ three/
   │  ├─ Scene.tsx          # Canvas, lights, Environment, ScrollControls
   │  ├─ GameBox.tsx        # the 3D box
   │  ├─ Gallery.tsx        # column layout + scroll logic
   │  └─ DetailStage.tsx    # orbit + camera transition
   ├─ ui/
   │  ├─ GalleryOverlay.tsx # titles, scroll hints
   │  ├─ DetailPanel.tsx    # description + metadata
   │  └─ Fallback2D.tsx     # no-WebGL / reduced-motion grid
   └─ styles/
```

---

## 8. Milestones

**Phase 0 — Data ✅ DONE**
- ✅ Captured all **210 games** from Airtable → `src/data/games.json`
  (`scripts/1-3`), downloaded all covers → `public/covers/`.
- ✅ BGG enrichment (`scripts/4-5`): full metadata for 203 games; box dimensions
  for all 210 (196 real & cross-checked, 14 estimated).
- ✅ Texture prep (`scripts/6`): 210 covers → webp cover+thumb (112→12 MB) +
  sampled `sideColor`/`edgeColor`.
- ⬜ Optional: review the 28 low-`agreement` dimension cases and 14 estimates.
  **Data layer is complete** — ready to build the 3D app.

**Phase 1 — Scaffold (½ day)**
- Vite + React + TS + R3F + drei + Tailwind. Router with `/` and `/game/:slug`.
- Typed data loader with zod validation.

**Phase 2 — Single 3D box (1 day)**
- `<GameBox>` with per-face textures, rounded edges, studio lighting,
  environment, contact shadow. Get *one* box looking convincingly real.

**Phase 3 — Gallery (1–2 days)**
- Column layout, `ScrollControls`, parallax, hover focus, optional snap.
- Texture lazy-loading + virtualization.

**Phase 4 — Detail view (1 day)**
- Camera transition, orbit controls, DOM info panel, deep links.

**Phase 5 — Polish & fallbacks (1–2 days)**
- Mobile layout, 2D fallback, reduced-motion, loading states, SEO/meta,
  favicon, OG images. Performance pass (Lighthouse). Deploy to Vercel.

**Phase 6 — Nice-to-haves (backlog)**
- Search/filter (by player count, playtime, complexity, category).
- Sort orders; "shelf" grouping.
- "Living cover" animated art for a few hero games.
- Intro animation; ambient audio toggle; share cards per game.

---

## 9. Open Questions for Jason / dionyziz

1. **Box dimensions:** biggest open item — Airtable/BGG don't have them. OK to
   estimate from category/format defaults (with hand-tuning for hero games)?
2. **Descriptions:** use BGG descriptions, or write custom blurbs? (Airtable's
   `Notes` field is mostly empty.)
3. **Cover art:** the 210 Airtable covers are captured (many are small ~300–400px
   scans, some Greek editions). Good enough, or re-shoot / upgrade the heroes?
4. ~~Airtable access~~ ✅ solved — headless capture, no token needed.
5. ~~Collection size~~ ✅ **210 games** (informs virtualization).
6. **Domain / hosting** preference?

---

## 10. Risks

- **Missing/low-res cover art** → boxes look flat. Mitigate with BGG + a texture
  fallback that never looks broken.
- **Unknown box dimensions** → collection looks uniform/fake. Mitigate with
  category-based defaults + an "estimated" flag and easy manual override.
- **3D perf on low-end mobile** → virtualize + 2D fallback.
- **Airtable data drift** → treat JSON as the source of truth in git; re-import
  is a deliberate build step, not runtime.

---

*Next action after approval: Phase 0 — get the CSV/data and generate a real
`games.json`, then build one convincing 3D box (Phase 2) as a vertical slice.*
