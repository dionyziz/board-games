// Rebuild the chip-bag model's base-colour atlas with OUR label. The model's UV
// atlas has the front on the bottom band and the back on the top band; we paste
// our cover into both (front mirrored, because the model's front UV is flipped)
// so the printed bag shows the game art on both faces instead of the Calbee art.
// Keeps the model's normal/roughness maps (the wrinkles).  node scripts/gen-chipbag-atlas.js
const L = require('./lib');
const { fs, path, sharp, texDir } = L;

const GAME = 'bag-of-chips-344114';
const GLB = path.join(__dirname, 'model-src', 'calbee_potato_chips_pizza.glb');

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
  const backSrc = path.join(__dirname, 'cyl-src', 'bag-of-chips-back.jpg'); // distinct back (German edition)
  // The model's front/back UV bands are landscape while the faces are portrait, so
  // each source is rotated −90° to read upright and flopped (both UV bands are
  // mirrored). Front = game cover, back = the game's back cover (white trimmed).
  const region = async (src, rx, ry, rw, rh) => {
    const b = await sharp(src).rotate(-90).flop().resize(Math.round(rw * W), Math.round(rh * H), { fit: 'fill' }).toBuffer();
    return { input: b, left: Math.round(rx * W), top: Math.round(ry * H) };
  };
  // drop the white photo backdrop. trim() leaves white side-bands (the top hang-hole
  // row spans full width, pinning the bbox), so scan columns for the red bag's actual
  // horizontal extent and crop to it; also crop off the top (the die-cut hang-hole,
  // which the model has no geometry for and would read as a hole/white spot).
  const bt0 = await sharp(backSrc).trim({ threshold: 18 }).toBuffer();
  const bm = await sharp(bt0).metadata();
  const { data: bd } = await sharp(bt0).raw().toBuffer({ resolveWithObject: true });
  const bw = bm.width, bh = bm.height, bc = bd.length / (bw * bh);
  const colWhite = (x) => { let n = 0; for (let y = 0; y < bh; y++) { const i = (y * bw + x) * bc; if (Math.min(bd[i], bd[i + 1], bd[i + 2]) > 210) n++; } return n / bh; };
  let L = 0, R = bw - 1;
  while (L < bw && colWhite(L) > 0.5) L++;
  while (R > L && colWhite(R) > 0.5) R--;
  const backTrim = await sharp(bt0).extract({ left: L, top: Math.round(bh * 0.15), width: R - L + 1, height: Math.round(bh * 0.85) }).toBuffer();
  const patches = await Promise.all([
    region(cover, 0, 0.5, 0.77, 0.5),
    region(backTrim, 0, 0, 0.77, 0.5),
  ]);
  const out = path.join(__dirname, 'cyl-src', 'bag-of-chips-atlas.png');
  await sharp(base).composite(patches).png().toFile(out);
  console.log('chipbag atlas rebuilt', W + 'x' + H);
})();
