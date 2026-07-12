# Complete Box Textures & Orientation — Collection Plan

The practice render exposed two gaps in the data model:

1. **Orientation is wrong.** The box is drawn portrait (27×31) while the cover art
   is landscape (1417×1200), so the "cover-fit" crop slices the middle out of the
   art. The box's orientation must follow the artwork.
2. **Only the front face is textured.** The other five faces are flat colors. But
   the end goal includes a **library/shelf view seen from the side**, where the
   face you actually read is the **spine** — so side, top, bottom (and back)
   textures are first-class requirements, not decoration.

This plan covers how to get **complete, correctly-oriented, 6-face textures for
all 210 games.**

---

## 0. What "complete" means — the six faces

Every box is a cuboid with six faces. Naming them relative to the cover:

| Face | Content on a real board-game box | Where it's seen |
|---|---|---|
| **front** | the cover art | gallery view (face-on) |
| **back** | blurb, components, photos, barcode | detail view (rotate) |
| **spine ×2** (long sides) | title on a colored band (so it's readable when shelved) | **library/shelf view** |
| **top / bottom** (short sides) | title band or plain; bottom often has legal/barcode | shelf view (stacked), rotate |

> For the shelf view, the **spine is the hero**. Board-game spines are almost
> always "title text on a solid brand color" — which is exactly the part we can
> generate convincingly without a photo.

---

## 1. Orientation — deterministic, ready to implement now

We already have, per game: the three real box dimensions (cm) and the cover
image's pixel dimensions. Orientation follows from the **cover aspect ratio**.

```
dims sorted descending → [a, b, c]      // a≥b≥c ; c is the box thickness (depth)
coverAspect = coverW / coverH
if coverAspect >= 1 (landscape):  face = { w:a, h:b, d:c }   orientation:"landscape"
else (portrait):                  face = { w:b, h:a, d:c }   orientation:"portrait"
```

- The front face then has aspect `a:b` (or `b:a`), which is within a few % of the
  cover aspect → the "cover-fit" crop becomes negligible instead of destructive.
  (LOTR: 31×27 landscape, aspect 1.148 vs cover 1.181 — near-perfect.)
- **Edge cases:** near-square covers (|aspect−1| < 0.05) → fall back to raw BGG
  dims; covers that are angled product shots (not a flat front) give a misleading
  aspect → flag for review (see §6 provenance).

**Deliverable:** `scripts/7-orient.js` writes `box.face = {w,h,d}` and
`box.orientation` into `games.json` for all 210 games. Pure, no network. This
alone fixes problem #1 and can ship immediately.

---

## 2. Texture sources — grounded reality check

I probed what BGG actually exposes (the XML API is dead; we use the `api.geekdo.com`
JSON API). Summary of what's obtainable per face:

| Face | Best available source | Realistic coverage | Quality |
|---|---|---|---|
| front | BGG representative image (hi-res original, e.g. 1694²) | 203/210 | ★★★ upgrade over Airtable scans |
| back | BGG user **gallery**, caption-mined (`back`, `rear`) | ~15–40% | ★ inconsistent (angled, hands, watermarks) |
| bottom | gallery (`bottom of the box`) | ~5–20% | ★ |
| spine/sides | gallery photos rarely isolate a clean side | <10% | ✗ mostly unusable |
| top | gallery | <10% | ✗ |

**Conclusion:** photographic per-face coverage is *opportunistic at best*. The
BGG gallery has freeform captions (no structured face tags), so mining is keyword
+ human-review, and spines/tops are almost never cleanly photographed. Therefore
photos **cannot** be the baseline — they're an upgrade tier.

---

## 3. The pipeline — photographic-first (chosen strategy)

**Decision (locked):** go **photographic everywhere**, sourced entirely from the
**web (BGG galleries + publisher/retailer images)** — **no shelf photography**.
Procedural generation is kept only as a **last-resort fallback** for faces where
no usable photo is found (otherwise those faces would render blank). Front covers
are **upgraded to BGG hi-res**.

So the tier order is inverted from a baseline-first build: we collect photos
aggressively first, then fill gaps procedurally.

### Tier A — Photographic collection (primary, all faces)
- Upgrade front covers to BGG hi-res originals (`scripts/9`).
- Pull every game's full BGG image gallery at high res (`scripts/8`).
- (Optional secondary) publisher/retailer product images for back/side shots.
- Aggressively classify each image to a face (front/back/spine/top/bottom) using
  caption keywords + image aspect + heuristics, score candidates, auto-pick best.
- Perspective-correct / crop the winner to the face rectangle.
- A lightweight local **review page** lets us accept/reassign picks (QA only — not
  manual photography). Fast to run over 210 games.

### Tier B — Procedural fallback (gap-fill only)
For any face with no usable photo, generate it from data we already have (cover
art, sampled `sideColor`/`edgeColor`, title, publisher, description) so every box
still renders a complete 6-face set. Spines especially: board-game spines are
title-on-a-colored-band, so the generated version reads correctly on a shelf.

- **spine / sides** → colored band in `sideColor` + the **game title** set in a
  clean typeface (auto-fit; must handle Greek titles), a thin accent stripe
  sampled from the cover's edge, and the publisher name small. Rendered at the
  face's real aspect (`h : d`). *This is the single most important generated
  asset — it's what the library view reads.*
- **top** → same treatment as spine (title band), sized `w : d`.
- **bottom** → `edgeColor` with a faint generated "barcode" + small legal-style
  text, or just `edgeColor`. Low visual priority.
- **back** → darkened/blurred cover as a backdrop + the short description text,
  or a solid `edgeColor` panel. Placeholder-grade but coherent.

Tooling: `sharp` + SVG (crisp text, easy Unicode/Greek) composited to `.webp`.

### Tier 1 — Photographic upgrade (opportunistic, automated + review)
- `scripts/8-fetch-gallery.js`: pull each game's BGG gallery (hi-res), cache
  metadata.
- Classify by caption keywords (`back|rear|bottom|side|spine|box`), score, keep
  top candidates per face.
- Human-in-the-loop: a tiny local review page (grid of candidates → click to
  accept/assign a face). Cheap to build, makes the noisy data usable.
- Perspective-correct / crop accepted photos to the face rectangle.
- Replaces the procedural asset for that face and sets provenance `photo`.

### Tier 2 — Hero games (manual, highest fidelity)
- For the top ~20–30 games (or all "big box" titles), **photograph Jason's actual
  shelf**: front, back, and one spine each. A phone + a consistent setup is
  enough; a light crop step turns them into faces.
- These are the games most likely to be featured, so the ROI is high.

### Cover upgrade (independent, recommended)
`scripts/9-upgrade-covers.js`: re-fetch the **hi-res original** front image from
BGG (`cf.geekdo-images.com` originals; many Airtable covers are only ~300–400 px).
Re-run the texture prep (`scripts/6`) on the upgrades.

---

## 4. Procedural spine generation (detail — the make-or-break asset)

Because the library view lives or dies on the spine:

```
face aspect = height : depth   (tall, narrow — e.g. 31 : 9)
canvas:
  ├─ background: vertical gradient from sideColor → edgeColor
  ├─ 6–10% accent stripe sampled from the cover's dominant secondary color
  ├─ TITLE: rotated 90°, auto-sized to fill ~70% of the long axis,
  │         off-white, subtle letter-spacing; Greek-aware font stack
  └─ publisher name: small, opposite end
export → public/textures/<id>/spine.webp
```

Validation: render a **shelf contact sheet** (all 210 spines side-by-side) so we
can eyeball legibility and palette variety before wiring it into 3D — same way we
validated the cover colors.

---

## 5. Data model changes (`games.json`)

```jsonc
"box": {
  "size": { "w": 27, "h": 31, "d": 9 },        // unchanged: real cm
  "face": { "w": 31, "h": 27, "d": 9 },         // NEW: render dims (oriented)
  "orientation": "landscape",                    // NEW
  "sideColor": "#182828", "edgeColor": "#0e1818"
},
"textures": {
  "front":  { "src": "/textures/<id>/front.webp",  "source": "bgg-hires" },
  "back":   { "src": "/textures/<id>/back.webp",   "source": "procedural" },
  "spine":  { "src": "/textures/<id>/spine.webp",  "source": "procedural" },
  "top":    { "src": "/textures/<id>/top.webp",    "source": "procedural" },
  "bottom": { "src": "/textures/<id>/bottom.webp", "source": "procedural" }
}
```
Per-face **`source`** provenance (`bgg-hires | photo | procedural`) lets the UI
and future upgrades know what's real vs generated, and flags what to improve.

---

## 6. Rendering changes (feeds the full app)

- Box uses **6 materials** mapped to the six face textures, built from `box.face`
  (correctly oriented) instead of `box.size`.
- **Two view modes** the data now supports:
  - **Gallery** — boxes face-on (front), Stripe-style column.
  - **Library / shelf** — boxes rotated to present the **spine**, packed side by
    side like books on a shelf (the eventual headline view).
- Cover-fit crop stays as a safety net but is near-no-op once orientation matches.

---

## 7. Milestones

| Step | Script | Output | Effort |
|---|---|---|---|
| Orientation | `7-orient.js` | `box.face`, `box.orientation` (210) | ~½ day, **ready now** |
| Procedural faces | `10-gen-faces.js` | spine/top/bottom/back for 210 | 1–2 days |
| Shelf contact sheet | — | QA image of all spines | ½ day |
| Hi-res covers | `9-upgrade-covers.js` | upgraded fronts | ½ day |
| Gallery mining | `8-fetch-gallery.js` + review page | real back/bottom where good | 1–2 days |
| Hero photos | manual | ~25 games, real faces | depends on Jason |

Baseline (orientation + procedural + hi-res covers) gives a **complete, shippable
6-face set for all 210 games**; the photographic tiers are incremental polish.

---

## 8. Decisions — LOCKED

1. **Side/spine/back faces:** ✅ **Photographic everywhere**, sourced from the web
   (BGG galleries + publisher/retailer). Procedural only as a gap-fill fallback.
2. **Photograph Jason's shelf:** ❌ No — online sources only.
3. **Upgrade covers to BGG hi-res:** ✅ Yes.
4. **Spine content (fallback only):** title-on-color band.

---

## 9. Risks

- **Procedural spines look generated.** Mitigation: sample real palette + accent
  from each cover so they carry the game's identity; vary typography by title
  length; QA via the contact sheet.
- **Gallery photos are unusable more often than not** (angles, glare, hands).
  Mitigation: treat as opportunistic; always keep the procedural fallback.
- **Greek titles** must render (font coverage) — already handled in slugs; reuse
  the same care for spine text.
- **Angled cover scans** break the orientation heuristic. Mitigation: flag near-
  square / odd-aspect covers for the same review page used in Tier 1.
