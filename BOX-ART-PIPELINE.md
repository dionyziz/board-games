# Box Art Pipeline — download → crop → de-project → normalize → generate

The end-to-end playbook for building a complete, correctly-oriented, tonally
consistent **6-face box** for every game in the library. This is the master
document; `TEXTURE-PLAN.md` (strategy) and `SIDES-PLAN.md` (side photos) are the
background it distills.

It reflects what the scripts in `scripts/` actually do. Where a step is still
manual, it says so and notes what to build to automate it at library scale.

---

## 0. Principles

1. **The front cover is the reference and is NEVER renormalized.** It's the
   highest-quality, most color-accurate asset. Every *other* face is
   photometrically transformed to match it, so the box reads as one object with
   no brightness / contrast / temperature jump at the seams.
2. **Photographic where possible, generated where not.** Real photos (front,
   back, sometimes a spine) beat generated faces. Faces with no usable photo
   (almost always top/bottom, often spine) fall back to art-derived generation.
   Every box still ends up with all six faces filled.
3. **Orientation follows the art, not the raw dimensions.** A landscape cover
   must sit on a landscape face or the cover-fit crop slices the middle out.
4. **Everything is provenance-tagged.** Each face records where it came from and
   whether it was normalized, so the UI and future upgrades know what's real.

---

## 1. Data model (`src/data/games.json`)

Per game, the pipeline writes:

```jsonc
"box": {
  "size": { "w": 27, "h": 31, "d": 9 },   // real cm (unchanged input)
  "face": { "w": 31, "h": 27, "d": 9 },    // render dims, oriented to the cover
  "orientation": "landscape",              // landscape | portrait | square
  "sideColor": "#182828", "edgeColor": "#0e1818"
},
"textures": {
  "front":  { "src": ".../cover.webp",  "source": "airtable|bgg-hires" },
  "back":   { "src": ".../back.webp",   "source": "photo",         "normalized": true },
  "spine":  { "src": ".../spine.webp",  "source": "photo",         "normalized": true, "note": "..." },
  "top":    { "src": ".../top.webp",    "source": "cover-derived" },
  "bottom": { "src": ".../bottom.webp", "source": "cover-derived" },
  "thumb":  { "src": ".../thumb.webp",  "source": "derived" }
}
```

`source` ∈ `airtable | bgg-hires | photo | cover-derived | procedural | derived`.
The 3D viewer builds the box from `box.face` and maps the five `textures` faces
via box-projection (see the practice render).

Assets live in `public/textures/<gameId>/{cover,back,spine,top,bottom,thumb}.webp`.

---

## 2. Per-face source strategy (priority order)

| Face | 1st choice | 2nd | Fallback | Typical reality |
|---|---|---|---|---|
| **front** | Airtable cover → BGG hi-res upgrade | — | — | always present (reference) |
| **back** | flat English photo (BGG) | other-edition flat back | procedural panel | ~15–40% have a clean flat back |
| **spine** | flat spine photo | **de-projected** spine from a 3D-box render | procedural title band | clean photo <10%; renders more common |
| **top** | flat top photo | de-projected from render | **cover-derived band + title** | photo ~never; renders show only a grazing sliver |
| **bottom** | flat bottom photo | — | **cover-derived band + barcode/legal** | photo ~never (faithful as generated) |

Prefer captions/images naming **our edition/publisher** so the printed art is
identical; other-edition photos are usable for the *back* (layout matches) and,
with the language caveat, for a de-projected *spine*.

---

## 3. Stage 1 — Discover & download (BGG gallery)

BGG's XML API is dead; use the JSON gallery endpoint:

```
https://api.geekdo.com/api/images?ajax=1&foritempage=1&galleries[]=game
  &nosession=1&objectid=<bggId>&objecttype=thing&pageid=<N>&showcount=50
  &size=crop100&sort=hot
```

- Page through (`pageid=1..N`) with a browser `User-Agent`; dedupe by `imageid`.
- Hi-res URL is `imageurl_lg` (typically 1024 long edge). Cache metadata +
  downloads under a per-game folder.
- **Score each image per target face:**
  - **caption keywords** — `back|rear`; `spine|side|edge`; `top|lid`;
    `bottom|underside`; and render hints `3d box|render|mockup`.
  - **aspect prior** — spine ≈ `h:d` (tall, narrow); top/bottom ≈ `w:d` (wide,
    short); back ≈ front aspect.
  - **edition match** — boost captions naming our edition/publisher.
  - **penalize** gameplay/component shots: `board|card|meeple|mini|dice(?! tower)
    |game state|turn|win|play|component|inside`.
- Keep the top few candidates per face.

> **Automation gap:** discovery is currently run ad-hoc (a scan script piped to a
> keyword filter). To scale, build `scripts/8-fetch-gallery.js` that does the
> above for every game and writes a `gallery.json` of scored candidates per face.

**Alternative sources** (when BGG is thin): publisher (zmangames.com), retailer
product pages (Asmodee, Miniature Market, Noble Knight). In practice these show
front/back only — tops/bottoms are essentially never photographed anywhere.

---

## 4. Stage 2 — Pick per face

Auto-pick the top-scored candidate per face; keep the rest as alternates.
For QA, a lightweight local **review page** (grid of candidates per face → click
to accept / reassign / reject) makes the noisy data usable fast. This is a QA
step, not manual photography.

> **Automation gap:** the review page is not built yet. Today, picking is a quick
> manual eyeball of the scan output + downloading the winner.

---

## 5. Stage 3 — Crop / de-project

Two cases:

### 5a. Straight-on photo → center-crop
Resize to ≤1024 long edge, then cover-crop to the exact face aspect (`face.w:h`
for back). This is what `10-gen-faces.js` does for the back.

### 5b. Angled photo (spine/top from a 3D render) → perspective de-projection
Use `scripts/unwarp-face.js` — a homography (DLT) unwarp of a 4-point quad into a
flat rectangle + bilinear resample:

```
node scripts/unwarp-face.js <srcImg> "<tlx,tly;trx,try;brx,bry;blx,bly>" \
     <outW> <outH> <coverRef> <outWebp>
```

- Corners are `tl, tr, br, bl` mapping to output `(0,0),(1,0),(1,1),(0,1)`.
  Order them so the output is upright and un-mirrored (front-edge vs back-edge
  choice flips the U axis — if text comes out mirrored, swap the left/right
  corners).
- **Reading the corners:** overlay a coordinate grid on the source, or draw the
  candidate quad back onto the source and eyeball the fit, then iterate. (The
  quad-overlay + grid one-liners used for the LOTR spine are the pattern.)
- Output size = the face's true aspect: spine `d:h` (e.g. 360×1080), top/bottom
  `w:d` (e.g. 1240×360).
- Exclude neighboring faces: keep the quad strictly inside the target face (the
  lid band, the front-title bleed, etc. are easy to grab by accident).
- `unwarp-face.js` also **normalizes** the result to the cover (Stage 6) in the
  same pass.

> **Automation gap:** corner selection is manual per image. Angled sources vary
> too much for a blind auto-quad; automated quad detection (edge/rectangle
> finding) is the upgrade if scaling de-projection widely. In practice most games
> won't need it — back is straight-on and top/bottom go cover-derived.

---

## 6. Stage 4 — Photometric normalization (match to the front)

Front cover = reference (untouched). For every other **photographic** face:

1. Compute per-channel **mean** and **std** of the reference and the target.
2. **Reinhard statistical transfer** per channel:
   ```
   out = (in − mean_target) · (std_ref / std_target) + mean_ref
   ```
3. **Blend at ~0.82** (not 1.0) so genuine content differences aren't crushed
   (e.g. a white "contents" panel shouldn't drag the whole image bright).
4. Result: a dark, cool phone photo is lifted to the cover's tone/contrast.

Implemented as `statsFromRaw` / `normalizeToward` in both `10-gen-faces.js`
(back) and `unwarp-face.js` (spine/de-projected faces). Validate by luminance:
after normalization a face's mean luminance should land within a few % of the
front's.

Cover-derived and procedural faces are consistent **by construction** (they're
built from the cover's own art/palette), so they don't need a transfer pass.

---

## 7. Stage 5 — Generate the fallbacks

### 7a. Orientation (always, pure/no-network)
`10-gen-faces.js`:
```
sort [w,h,d] desc → [a,b,c]        // c = thickness/depth
coverAspect = imageWidth / imageHeight
|coverAspect − 1| < 0.05 → square  → keep raw dims (unreliable signal)
coverAspect ≥ 1 (landscape)        → face = {w:a, h:b, d:c}
else (portrait)                    → face = {w:b, h:a, d:c}
```
Writes `box.face` + `box.orientation`. This alone fixes cover-cropping.

### 7b. Procedural spine (when no spine photo)
Gradient `sideColor→edgeColor` band + accent stripe (vividest color sampled from
the cover) + rotated title (auto-fit, Greek-aware Georgia stack) + small
publisher. Rendered at spine aspect `d:h`. This is the shelf-view "hero" fallback.

### 7c. Cover-derived top & bottom (`gen-top-band.js`)
No photographic top/bottom essentially ever exists, so derive both from the real
cover art so they stay tonally consistent with the photographic faces:
- **top** — darkened (~0.5×), blurred slice of the cover + title + accent stripe.
- **bottom** — the same band but dimmer (~0.3×) + softer, with a barcode block
  and an auto-fit legal line (`© year publisher · title`) — faithful to what a
  real box underside shows.
```
node scripts/gen-top-band.js <gameId>
```

### 7d. Procedural back (when no back photo)
Darkened `edgeColor` panel + short description text.

---

## 8. Provenance & flags

Every face entry carries `source` and, for photographic faces, `normalized:true`
and an optional `note` (e.g. "perspective-unwarped from BGG Ukrainian 3D-box
render"). This lets the UI badge real-vs-generated and lets a later pass find
faces worth upgrading (e.g. any `procedural` spine, any non-`bgg-hires` front).

---

## 9. Running it across the whole library

Per game the flow is:

```
1. 10-gen-faces.js <id> [backPhoto]   # orientation + back + procedural fallbacks + data model
2. (if a spine/side photo was found)  # unwarp-face.js → overwrite spine.webp, set source:photo
3. gen-top-band.js <id>               # cover-derived top + bottom
```

For a batch driver:
- Iterate all 210 `games.json` entries.
- **Re-run safety (done):** `10-gen-faces.js` is **idempotent** — any face whose
  current `textures.<face>.source` is `photo` or `cover-derived` is preserved
  (its `.webp` and data entry untouched); only procedural/absent faces are
  regenerated. So batch re-runs never clobber upgrades, and run order no longer
  matters. Pass `--force` to regenerate everything. (`box.face` /
  `box.orientation` are always recomputed — they're deterministic.)
- **Caching:** keep downloaded gallery images + accepted picks under version
  control (or a cache dir) so re-runs are network-free and reproducible.
- **Cover hi-res upgrade** (recommended, independent): re-fetch the BGG hi-res
  original front and re-run texture prep (`scripts/6`) before normalization, so
  the *reference* is as good as possible.

Practical expectation at library scale (from `TEXTURE-PLAN.md §2`):
- front: 100% (reference) · back: ~15–40% photo, rest procedural ·
  spine: <10% photo/de-projected, rest procedural ·
  top/bottom: ~0% photo → cover-derived everywhere.

---

## 10. QA / validation

- **Per-face contact sheet** — the 6 faces side by side; check crops, text fit,
  and that back/sides feel like the front (no tone jump).
- **Shelf contact sheet** — all spines side by side; eyeball legibility and
  palette variety before wiring into 3D.
- **3D turntable** — load the game in the practice render and rotate; confirm
  orientation, seam alignment on the bevels, and consistent lighting all around.
- **Luminance check** — normalized faces within a few % of the front's mean
  luminance.

---

## 11. Scripts reference

| Script | Purpose | Invocation |
|---|---|---|
| `scripts/10-gen-faces.js` | Orientation + back (crop+normalize) + procedural spine/top/bottom + write data model | `node scripts/10-gen-faces.js <id> [backPhoto]` |
| `scripts/unwarp-face.js` | Perspective de-projection of a 4-point quad + normalize to cover | `node scripts/unwarp-face.js <src> "<quad>" <W> <H> <cover> <out>` |
| `scripts/gen-top-band.js` | Cover-derived top + bottom bands | `node scripts/gen-top-band.js <id>` |
| `scripts/6-prepare-textures.js` | Cover → render-ready `cover.webp`/`thumb.webp` + sample `sideColor`/`edgeColor` | `node scripts/6-prepare-textures.js` |

**Dependencies:** `sharp` (+ librsvg/fontconfig via sharp for SVG text; a serif
font such as Georgia must be installed for titles, incl. Greek coverage).

---

## 12. Known limits / to build

- `scripts/8-fetch-gallery.js` (automated discovery + scoring per face) — **not
  built**; discovery is currently ad-hoc.
- Candidate **review page** — **not built**; picking is a manual eyeball.
- De-projection **corner selection** is manual; automated quad detection is the
  upgrade for wide side-photo use.
- ~~Re-run idempotency guard in `10-gen-faces.js`~~ — **done** (see §9).
- Language mismatch: a de-projected spine from a foreign-edition render carries
  that language's text (accepted as "imperfect"); prefer our-edition sources.
