// Cut the fish out of Happy Salmon's cover (border flood-fill removes the white
// backdrop but keeps interior whites like the eye) → cutout.webp (RGBA), used to
// render the fish-shaped plush pouch.  node scripts/gen-salmon-cutout.js
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, '..', 'public/textures/happy-salmon-194626');
(async () => {
  const src = path.join(dir, 'cover.webp');
  const m = await sharp(src).metadata();
  const cropH = Math.round(m.height * 0.60); // drop the row of cards along the bottom
  const { data, info } = await sharp(src).extract({ left: 0, top: 0, width: m.width, height: cropH })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;
  const near = (i) => data[i] > 232 && data[i + 1] > 232 && data[i + 2] > 232;
  const seen = new Uint8Array(w * h), stack = [];
  const push = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const p = y * w + x; if (seen[p]) return; seen[p] = 1; if (near(p * ch)) stack.push(p); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  let cleared = 0;
  while (stack.length) { const p = stack.pop(); data[p * ch + 3] = 0; cleared++; const x = p % w, y = (p / w) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  await sharp(Buffer.from(data), { raw: { width: w, height: h, channels: ch } })
    .webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(dir, 'cutout.webp'));
  console.log('salmon cutout', w + 'x' + h, '| transparent', (100 * cleared / (w * h)).toFixed(0) + '%');
})();
