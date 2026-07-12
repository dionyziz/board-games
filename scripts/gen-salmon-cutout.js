// Happy Salmon ships as a fish-shaped plush pouch. Cut the fish out of the cover
// (border flood-fill removes the white backdrop, keeps interior whites like the
// eye) → cutout.webp (RGBA). Then MEASURE the fish silhouette (a column-scan
// contour) and store it as box.bagOutline so the renderer can extrude a closed,
// puffed pouch of exactly that shape.  node scripts/gen-salmon-cutout.js
const sharp = require('sharp');
const L = require('./lib');
const { path, texDir, loadGames, saveGames } = L;

const GAME = 'happy-salmon-194626'; // asset-gen for one game; the params land in games.json

(async () => {
  const dir = texDir(GAME);
  const src = path.join(dir, 'cover.webp');
  const m = await sharp(src).metadata();
  const cropH = Math.round(m.height * 0.60); // drop the row of cards along the bottom
  const { data, info } = await sharp(src).extract({ left: 0, top: 0, width: m.width, height: cropH })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;
  const near = (i) => data[i] > 232 && data[i + 1] > 232 && data[i + 2] > 232;

  // border flood-fill → transparent backdrop
  const seen = new Uint8Array(w * h), stack = [];
  const push = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const p = y * w + x; if (seen[p]) return; seen[p] = 1; if (near(p * ch)) stack.push(p); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) { const p = stack.pop(); data[p * ch + 3] = 0; const x = p % w, y = (p / w) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  await sharp(Buffer.from(data), { raw: { width: w, height: h, channels: ch } })
    .webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(dir, 'cutout.webp'));

  // column-scan silhouette: per sampled column, first/last opaque row → a closed
  // polygon (top edge L→R, then bottom edge R→L). Normalised to 0..1.
  const opaque = (x, y) => data[(y * w + x) * ch + 3] > 40;
  const step = Math.max(2, Math.round(w / 90));
  const top = [], bot = [];
  for (let x = 0; x < w; x += step) {
    let y0 = -1, y1 = -1;
    for (let y = 0; y < h; y++) if (opaque(x, y)) { if (y0 < 0) y0 = y; y1 = y; }
    if (y0 >= 0) { top.push([x / w, y0 / h]); bot.push([x / w, y1 / h]); }
  }
  const poly = top.concat(bot.reverse()).map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]);
  const { games, list } = loadGames();
  list.find((x) => x.id === GAME).box.bagOutline = { aspect: +(w / h).toFixed(3), poly };
  saveGames(games);
  console.log(`salmon cutout ${w}x${h}, outline ${poly.length} pts, aspect ${(w / h).toFixed(3)}`);
})();
