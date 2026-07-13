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
  const backTrim = await sharp(backSrc).trim({ threshold: 18 }).toBuffer(); // drop the white photo backdrop
  const patches = await Promise.all([
    region(cover, 0, 0.5, 0.77, 0.5),
    region(backTrim, 0, 0, 0.77, 0.5),
  ]);
  const out = path.join(__dirname, 'cyl-src', 'bag-of-chips-atlas.png');
  await sharp(base).composite(patches).png().toFile(out);
  console.log('chipbag atlas rebuilt', W + 'x' + H);
})();
