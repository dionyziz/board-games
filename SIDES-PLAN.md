# Side / Edge Texture Pipeline — obtain, clean, normalize

How we turn messy BGG user photos into clean, **consistent** box faces (spine,
top, bottom, back). Companion to `TEXTURE-PLAN.md`.

## Guiding principle — the front is the reference

The **front cover is the fixed reference and is NEVER renormalized.** It is the
highest-quality, most color-accurate asset we have. Every *other* extracted face
(back, spine, top, bottom) is photometrically transformed to match the front's
color / contrast / lighting, so the whole box reads as one object with no
brightness or temperature jump at the edges.

## 1. Source discovery (BGG user gallery)

- Pull the full gallery via the `api.geekdo.com/api/images` endpoint (paged,
  hi-res `imageurl_lg`), cache metadata + downloads.
- Score each image per target face:
  - **caption keywords** — back/rear; spine/side/edge; top/lid; bottom/underside.
  - **aspect prior** — spine ≈ `h:d` (tall, narrow); top/bottom ≈ `w:d` (wide,
    short); back ≈ front aspect.
  - **edition match** — prefer captions naming our edition/publisher (e.g. Z-Man
    / English) so the printed art is identical.
  - **penalize** gameplay / component shots (board, cards, minis, dice, hands).
- Keep the top candidates per face.

## 2. Human-in-the-loop pick (optional, fast)

A tiny local review page shows candidates per face; click to accept / reassign /
reject. QA only — never manual photography.

## 3. Geometric cleanup (crop / rectify)

- **Straight-on shots** → center-crop to the face aspect (cover-fit).
- **Angled shots** (most side/spine photos are angled) → 4-point perspective
  unwarp to a rectangle, then crop. If no clean quad is detectable → reject and
  fall back to the procedural face.
- Trim borders / hands / background; deskew.

## 4. Photometric normalization — match to the front  ← the key step

Front cover = reference (untouched). For every other face:

1. Compute per-channel **mean** and **std** of the reference and of the target
   over foreground pixels.
2. **Reinhard statistical transfer** per channel (in linear-ish RGB):

   ```
   out = (in − mean_target) · (std_ref / std_target) + mean_ref
   ```

   This lifts a dark, cool phone photo to the cover's tone and contrast.
3. **Nudge per-channel means** toward the reference to kill color cast (paper
   white / lighting temperature).
4. **Clamp the transfer strength** (blend ~75–85% toward the target, not 100%)
   so genuine content differences aren't destroyed — e.g. a mostly-white
   "contents" panel on the back shouldn't drag the whole image bright.
5. Optional mild denoise + unsharp so it sits next to the crisp cover; strip JPEG
   halos.

## 5. Provenance & fallback

- Per-face `source: photo | procedural` and a `normalized: true` flag.
- No usable photo for a face → keep the **procedural** face (already
  palette-consistent), `source: procedural`.

## 6. Validation

Per-game face contact sheet + the 6-face 3D turntable — eyeball that back/sides
feel like the front (no brightness/temperature jump at the seams).

## Deliverables

- `scripts/8-fetch-gallery.js` — discovery + scoring + caching (§1–2).
- `scripts/10-gen-faces.js` — extend with crop/rectify (§3) + **normalization**
  (§4) + provenance (§5). Normalization runs on *every* photographic face, with
  the front cover's stats as the reference.
