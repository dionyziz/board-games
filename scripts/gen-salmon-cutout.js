// Happy Salmon ships as a fish-shaped plush pouch. Cut the fish out of the cover
// (border flood-fill removes the white backdrop, keeps interior whites like the
// eye), ERODE the anti-aliased edge fringe, then trace an accurate silhouette
// contour → box.bagOutline so the renderer's two bulged faces meet exactly at the
// seam (closed pouch, no white fringe).  node scripts/gen-salmon-cutout.js
const sharp = require('sharp');
const L = require('./lib');
const { path, texDir, loadGames, saveGames } = L;

const GAME = 'happy-salmon-194626';

// Moore-neighbour boundary trace of a binary mask → CW pixel contour.
function traceContour(op, w, h) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && op[y * w + x];
  let start = null;
  for (let y = 0; y < h && !start; y++) for (let x = 0; x < w; x++) if (inside(x, y)) { start = [x, y]; break; }
  if (!start) return [];
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]; // CW from E
  const contour = []; let cx = start[0], cy = start[1], dir = 4, steps = 0, max = w * h * 8;
  do {
    contour.push([cx, cy]);
    let found = false;
    for (let k = 0; k < 8; k++) {
      const nd = (dir + 6 + k) % 8, nx = cx + dirs[nd][0], ny = cy + dirs[nd][1];
      if (inside(nx, ny)) { cx = nx; cy = ny; dir = nd; found = true; break; }
    }
    if (!found) break;
    steps++;
  } while ((cx !== start[0] || cy !== start[1]) && steps < max);
  return contour;
}

// Douglas–Peucker polyline simplification.
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  let imax = 0, dmax = 0; const a = pts[0], b = pts[pts.length - 1];
  const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / dl;
    if (d > dmax) { dmax = d; imax = i; }
  }
  if (dmax > eps) return simplify(pts.slice(0, imax + 1), eps).slice(0, -1).concat(simplify(pts.slice(imax), eps));
  return [a, b];
}

(async () => {
  const dir = texDir(GAME);
  const src = path.join(dir, 'cover.webp');
  const m = await sharp(src).metadata();
  const cropH = Math.round(m.height * 0.60); // drop the row of cards along the bottom
  const { data, info } = await sharp(src).extract({ left: 0, top: 0, width: m.width, height: cropH })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;
  const near = (i) => { const r = data[i], g = data[i + 1], b = data[i + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mn > 200 && mx - mn < 28; };

  // remove backdrop + enclosed grey pockets (label components; drop border-touching
  // ones and big lower pockets)
  const lbl = new Int32Array(w * h);
  let id = 0;
  for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) {
    if (!near((sy * w + sx) * ch) || lbl[sy * w + sx]) continue;
    id++; const st = [sy * w + sx]; lbl[sy * w + sx] = id; const cells = []; let border = false, sumY = 0;
    while (st.length) {
      const p = st.pop(); cells.push(p); const x = p % w, y = (p / w) | 0; sumY += y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      for (const q of [p + 1, p - 1, p + w, p - w]) { const qx = q % w; if (q < 0 || q >= w * h || Math.abs(qx - x) > 1 || lbl[q] || !near(q * ch)) continue; lbl[q] = id; st.push(q); }
    }
    const area = cells.length / (w * h), cy = sumY / cells.length / h;
    if (border || (area > 0.004 && cy > 0.42)) for (const p of cells) data[p * ch + 3] = 0;
  }

  // erode the alpha 2px to kill the anti-aliased white fringe
  const alpha = () => { const a = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) a[i] = data[i * ch + 3] > 128 ? 1 : 0; return a; };
  for (let pass = 0; pass < 2; pass++) {
    const a = alpha();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!a[y * w + x]) continue;
      if (!a[y * w + Math.max(0, x - 1)] || !a[y * w + Math.min(w - 1, x + 1)] || !a[Math.max(0, y - 1) * w + x] || !a[Math.min(h - 1, y + 1) * w + x]) data[(y * w + x) * ch + 3] = 0;
    }
  }
  await sharp(Buffer.from(data), { raw: { width: w, height: h, channels: ch } }).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(dir, 'cutout.webp'));

  // accurate silhouette contour from the eroded alpha
  const op = alpha();
  const poly = simplify(traceContour(op, w, h), 2.2).map(([x, y]) => [+(x / w).toFixed(3), +(y / h).toFixed(3)]);
  const { games, list } = loadGames();
  list.find((x) => x.id === GAME).box.bagOutline = { aspect: +(w / h).toFixed(3), poly };
  saveGames(games);
  console.log(`salmon cutout ${w}x${h}, contour ${poly.length} pts, aspect ${(w / h).toFixed(3)}`);
})();
