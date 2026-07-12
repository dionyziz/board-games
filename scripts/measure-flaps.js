// Measure each hang-tab flap texture so the 3D flap can match it: detect the
// punched hang-hole (largest compact near-white blob in the upper area) and record
// it (+ a corner radius) as box.flap.{cornerR,hole} — normalised, so Flap.tsx can
// round the tab's top corners and punch an aligned hole without any hard-coding.
//   node scripts/measure-flaps.js
const sharp = require('sharp');
const L = require('./lib');
const { fs, path, texDir, loadGames, saveGames } = L;

async function measure(dir) {
  const { data, info } = await sharp(path.join(dir, 'flap.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;
  const white = (x, y) => { const i = (y * w + x) * ch; return data[i] > 234 && data[i + 1] > 234 && data[i + 2] > 234; };
  // label near-white components (4-connectivity)
  const lbl = new Int32Array(w * h).fill(0);
  let best = null;
  let id = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!white(x, y) || lbl[y * w + x]) continue;
    id++; const st = [[x, y]]; lbl[y * w + x] = id;
    let minx = x, maxx = x, miny = y, maxy = y, n = 0, touchBorder = false;
    while (st.length) {
      const [cx, cy] = st.pop(); n++;
      if (cx === 0 || cx === w - 1 || cy === 0 || cy === h - 1) touchBorder = true;
      minx = Math.min(minx, cx); maxx = Math.max(maxx, cx); miny = Math.min(miny, cy); maxy = Math.max(maxy, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || lbl[ny * w + nx] || !white(nx, ny)) continue;
        lbl[ny * w + nx] = id; st.push([nx, ny]);
      }
    }
    const area = n / (w * h), bw = (maxx - minx + 1) / w, bh = (maxy - miny + 1) / h;
    const cy = (miny + maxy) / 2 / h, fill = n / ((maxx - minx + 1) * (maxy - miny + 1));
    // a punched hang-hole: a solid blob, fully INTERIOR (not a top-edge notch or
    // an edge-hugging art region), in the upper ~⅔ of the tab. Allow WIDE slots.
    if (area > 0.015 && area < 0.4 && cy < 0.72 && bw > 0.05 && bw < 0.7 && fill > 0.35 && !touchBorder) {
      const score = area - cy * 0.2; // prefer bigger, higher
      if (!best || score > best.score) best = { score, cx: (minx + maxx) / 2 / w, cy, rx: bw / 2, ry: bh / 2 };
    }
  }
  return best;
}

(async () => {
  const { games, list } = loadGames();
  const params = JSON.parse(fs.readFileSync(path.join(__dirname, 'flap-params.json'), 'utf8'));
  let n = 0;
  for (const g of list) {
    if (!g.box.flap) continue;
    g.box.flap.cornerR = (params.cornerR && params.cornerR[g.id]) || 0.28; // round the tab's free (top) corners
    const hole = (params.hole && params.hole[g.id]) || await measure(texDir(g.id)); // hand override wins
    if (hole) { g.box.flap.hole = { cx: +hole.cx.toFixed(3), cy: +hole.cy.toFixed(3), rx: +hole.rx.toFixed(3), ry: +hole.ry.toFixed(3) }; }
    else delete g.box.flap.hole;
    console.log(`  ${g.id}  cornerR ${g.box.flap.cornerR}  hole ${hole ? JSON.stringify(g.box.flap.hole) : 'none'}`);
    n++;
  }
  saveGames(games);
  console.log(`measured ${n} flaps.`);
})();
