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
  // near-white / near-grey: all channels bright AND roughly neutral (low
  // saturation) — catches the white backdrop + grey shadow pockets, but not the
  // saturated green scales / orange belly of the fish.
  const near = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mn > 205 && mx - mn < 26;
  };

  // Remove the white backdrop: label every near-white component, then drop it if
  // it touches the border OR is a big enclosed pocket in the lower half (the gaps
  // under the chin / behind the tail). Small interior whites (the eye) survive.
  const lbl = new Int32Array(w * h);
  let id = 0;
  for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) {
    if (!near((sy * w + sx) * ch) || lbl[sy * w + sx]) continue;
    id++; const st = [sy * w + sx]; lbl[sy * w + sx] = id;
    const cells = []; let border = false, sumY = 0;
    while (st.length) {
      const p = st.pop(); cells.push(p); const x = p % w, y = (p / w) | 0; sumY += y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      for (const q of [p + 1, p - 1, p + w, p - w]) {
        const qx = q % w; if (q < 0 || q >= w * h || Math.abs(qx - x) > 1 || lbl[q] || !near(q * ch)) continue;
        lbl[q] = id; st.push(q);
      }
    }
    const area = cells.length / (w * h), cy = sumY / cells.length / h;
    if (border || (area > 0.004 && cy > 0.42)) for (const p of cells) data[p * ch + 3] = 0;
  }
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
