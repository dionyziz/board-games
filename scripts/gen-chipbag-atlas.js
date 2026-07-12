// Rebuild the chip-bag model's base-colour atlas with OUR label. The model's UV
// atlas has the front on the bottom band and the back on the top band; we paste
// our cover into both (front mirrored, because the model's front UV is flipped)
// so the printed bag shows the game art on both faces instead of the Calbee art.
// Keeps the model's normal/roughness maps (the wrinkles).  node scripts/gen-chipbag-atlas.js
const L = require('./lib');
const { fs, path, sharp, texDir } = L;

const GAME = 'bag-of-chips-344114';
const GLB = path.join(__dirname, '..', 'public/models/calbee_potato_chips_pizza.glb');

(async () => {
  // extract baseColor (image 0) from the GLB
  const buf = fs.readFileSync(GLB);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const bv = json.bufferViews[json.images[0].bufferView];
  const off = binStart + (bv.byteOffset || 0);
  const base = buf.slice(off, off + bv.byteLength);
  const m = await sharp(base).metadata(); const W = m.width, H = m.height;

  const cover = path.join(texDir(GAME), 'cover.webp');
  // The model's front/back UV bands are landscape while the faces are portrait, so
  // the cover is rotated −90° to read upright; the front is additionally flopped
  // (its UV is mirrored), the back is not (opposite-facing).
  const region = (rx, ry, rw, rh, flop) => {
    let img = sharp(cover).rotate(-90);
    if (flop) img = img.flop();
    return img.resize(Math.round(rw * W), Math.round(rh * H), { fit: 'fill' }).toBuffer()
      .then((b) => ({ input: b, left: Math.round(rx * W), top: Math.round(ry * H) }));
  };
  const patches = await Promise.all([
    region(0, 0.5, 0.77, 0.5, true),   // front band (UV mirrored → flop)
    region(0, 0, 0.77, 0.5, false),    // back band
  ]);
  const out = path.join(texDir(GAME), 'chipbag-atlas.png');
  await sharp(base).composite(patches).png().toFile(out);
  console.log('chipbag atlas rebuilt', W + 'x' + H);
})();
