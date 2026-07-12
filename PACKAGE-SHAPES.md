# Non-box package shapes — audit notes

Every game is currently rendered as a rectangular `RoundedBox`. A vision audit of
all 210 covers (sharded across 6 subagents; raw output in
`scripts/gallery-cache/_shapes/out-*.json`) found the games below whose real
packaging is **not** a rectangular cardboard box. The curated, machine-readable
list lives in `scripts/package-shapes.json` (keyed by game id); a future
rendering pass can read it and pick a mesh/material per `shape`.

`source: image` = the shape is visible in the cover art. `source:
product-knowledge` = the flat cover hid the true shape but the real retail
packaging is known (lower confidence — verify before acting).

## Confirmed from the imagery

| Game | id | Shape | Notes |
|---|---|---|---|
| Dobble | `dobble-63268` | **round tin** | Circular metal tin — the canonical example. |
| Happy Salmon | `happy-salmon-194626` | **fabric pouch** | Fish-shaped zippered cloth bag. |
| Bag of Chips | `bag-of-chips-344114` | **foil pouch** | Resealable snack-bag; literally shaped like a chip bag. |
| Chupacabra: Survive the Night | `chupacabra-survive-the-night-120515` | **tube** | Cylindrical dice-cup canister. |
| Love Letter | `love-letter-277085` | **blister** | Clamshell holding a velvet drawstring bag. |
| Who am I? | `who-am-i-33406` | **blister** | Hang-card backer with an attached pen. |
| Ντάμα | `ntama-2083` | **other** | Marble draughts board + pieces, no box. |
| Connect 4 Shots | `connect-4-shots-258818` | **other** | Molded plastic case with a handle. |

## Suspected from product knowledge (cover art inconclusive)

| Game | id | Shape | Notes |
|---|---|---|---|
| Απαγορευμένη Νήσος (Forbidden Island) | `apagoreymeni-nisos-65244` | **rectangular tin** | Gamewright metal tin. |
| Sushi Go! | `sushi-go-133473` | **rectangular tin** | Small metal tin. |
| Zombie Dice: Horde Edition | `zombie-dice-horde-edition-224035` | **tube** | Cardboard tube. |

## Implementation status

- **DONE — cylinders** (`round-tin`, `tube`): rendered by `src/three/Cylinder.tsx`
  (a `CylinderGeometry` with a [side, topCap, bottomCap] material array). Dobble =
  glossy metal tin with a cookie-tin lid seam; Chupacabra & Zombie Dice = matte
  cardboard tubes, art wrapped around the side. Dispatched in `Package.tsx`.
  Flat textures (from vetted BGG gallery art, `scripts/cyl-src/` →
  `scripts/18-cyl-textures.js` → `public/textures/<id>/cyl.webp`, `box.cylTex`):
    - Dobble: genuine top-down round lid (imageid 6477003). ✅
    - Zombie Dice: flat front key art wrapped (7711840). ✅
    - Chupacabra: NO flat front art exists in the gallery (only a curved-tube
      photo, or the text-heavy back panel) — still on its cover; revisit if a flat
      front label surfaces.
  No flat Dobble side-band exists either, so the tin band stays plain metal.
- **DONE — `tin-rect`** (Forbidden Island, Sushi Go!): an extruded rounded-rect
  (flat front, rounded corners only) + glossier metal-tin material. Corner radius
  is per-game (`box.cornerR`); Sushi Go! raised to match its art.
- **DONE — `bag`** (Bag of Chips, Happy Salmon): `src/three/Bag.tsx` — a puffed
  "pillow" (two bulged planes meeting at a flat perimeter), cover art on the front
  bulge, foil (glossy) vs cloth (matte sheen) material by game. An approximation;
  a true wrinkled/fish-shaped pouch is out of scope.
- **PENDING** — `blister`, `other` still render as the default box.

Chupacabra's wrap had the gray tube-rim band showing as "white" around the top;
its `cyl.webp` source is now cropped to just the label art.

Shapes/dims live in `scripts/package-shapes.json`; `scripts/16-apply-shapes.js`
bakes them into `games.json` (`box.shape` / `box.cyl` / `box.capCrop`).

## Suggested rendering adjustments (remaining: blister / bag / other)

- **round tin / tube** → swap the `RoundedBox` for a `CylinderGeometry`
  (tin: short, radius ≈ face.w/2, height ≈ depth; tube: tall). Cover art on the
  top circular cap; wrap a label texture around the side. This is the biggest
  visual win (Dobble especially).
- **rectangular tin** → keep the box mesh, switch the material to metal
  (raise `metalness`, drop `roughness`, tighter edge radius, stronger
  `envMapIntensity`). Cheapest change; only the material differs.
- **blister / hang-card** → render a thin flat card panel (a shallow box) rather
  than a deep box, since the "packaging" is essentially a flat backer. Optionally
  a faint glossy clamshell overlay. Also drop the openable-box lid seam for these.
- **fabric / foil pouch (`bag`)** → no rigid box; simplest is a rounded, slightly
  irregular soft form, or fall back to a flat card of the cover. Lowest priority.
- **other** (Ντάμα, Connect 4 Shots) → one-offs; handle individually or leave as
  a box with an appropriate material (wood / plastic).

Also relevant: the **openable-box lid seam** (added in `boxShader.ts`) should be
suppressed for any non-box shape above — none of them are lid+base boxes.
