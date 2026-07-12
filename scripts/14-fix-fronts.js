// Re-derive every front cover from the pristine source (public/covers/<id>.jpg),
// fixing two problems the earlier whitespace-trim introduced:
//   1. it stretched (fit:'fill') asymmetrically-trimmed covers — here we trim
//      preserving aspect (no distortion).
//   2. angled 3D product-shot covers can't be trimmed flat — a vision audit
//      (_fronts/out-*.json: {id, angled, quad}) marks those and we deproject the
//      front-face quad into a flat cover instead.
//   3. retail hang-tab boxes (Uno, Ναι ή Όχι, …) carry an opaque top FLAP above
//      the real artwork that whitespace-trim can't catch — a vision audit
//      (_flaps/out-*.json: {id, flap, top}) marks those and we crop [0,top) off
//      the top of the produced cover.
// Orientation (box.face) is recomputed from the CORRECTED cover's aspect.
//   node scripts/14-fix-fronts.js [--apply] [gameId]
const L = require('./lib');
const { fs, path, sharp, COVERS, GALLERY, texDir, loadGames, saveGames, deproject } = L;

const apply = process.argv.includes('--apply');
const only = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
const { games, list } = loadGames();

// load the front audit (angled + quad) if present
const audit = {};
const AD = path.join(GALLERY, '_fronts');
if (fs.existsSync(AD)) for (const f of fs.readdirSync(AD)) {
  if (f.startsWith('out-') && f.endsWith('.json')) { try { for (const e of JSON.parse(fs.readFileSync(path.join(AD, f), 'utf8'))) audit[e.id] = e; } catch (e) {} }
}

// load the hang-tab flap set; flaps[id] = fraction to crop off the top.
// Two sources, overrides win: the vision audit cache (_flaps/out-*.json, gitignored)
// and the hand-verified, committed flap-overrides.json (durable across machines).
const flaps = {};
const FD = path.join(GALLERY, '_flaps');
if (fs.existsSync(FD)) for (const f of fs.readdirSync(FD)) {
  if (f.startsWith('out-') && f.endsWith('.json')) { try { for (const e of JSON.parse(fs.readFileSync(path.join(FD, f), 'utf8'))) if (e.flap && e.top > 0) flaps[e.id] = e.top; } catch (e) {} }
}
const OV = path.join(__dirname, 'flap-overrides.json');
if (fs.existsSync(OV)) { try { for (const [id, top] of Object.entries(JSON.parse(fs.readFileSync(OV, 'utf8')))) top > 0 ? (flaps[id] = top) : delete flaps[id]; } catch (e) {} }

function orient(size, aspect) {
  const [a, b, c] = [size.w, size.h, size.d].sort((x, y) => y - x);
  const near = Math.abs(aspect - 1) < 0.05, land = aspect >= 1;
  return { face: near ? { w: size.w, h: size.h, d: size.d } : land ? { w: a, h: b, d: c } : { w: b, h: a, d: c }, orientation: near ? 'square' : land ? 'landscape' : 'portrait' };
}

(async () => {
  let trimmed = 0, deprojected = 0, plain = 0, missing = 0, flapped = 0;
  for (const g of list) {
    if (only && g.id !== only) continue;
    const src = path.join(COVERS, g.id + '.jpg');
    if (!fs.existsSync(src)) { missing++; continue; }
    const dir = texDir(g.id);
    const cover = path.join(dir, 'cover.webp'), thumb = path.join(dir, 'thumb.webp');
    const a = audit[g.id];
    let cw, ch;
    try {
      if (a && a.angled && a.quad && a.quad.length === 4) {
        const m = await sharp(src).metadata();
        const q = a.quad.map(([x, y]) => [x * m.width, y * m.height]);
        const d = (p, r) => Math.hypot(p[0] - r[0], p[1] - r[1]);
        const aspect = ((d(q[0], q[1]) + d(q[3], q[2])) / 2) / ((d(q[0], q[3]) + d(q[1], q[2])) / 2);
        cw = aspect >= 1 ? 1024 : Math.round(1024 * aspect);
        ch = aspect >= 1 ? Math.round(1024 / aspect) : 1024;
        if (apply) await deproject(src, q, cw, ch, null, cover); // front = reference: no normalization
        deprojected++;
      } else {
        const info = (await sharp(src).trim({ threshold: 14 }).toBuffer({ resolveWithObject: true })).info;
        const long = Math.max(info.width, info.height), sc = long > 1024 ? 1024 / long : 1;
        cw = Math.round(info.width * sc); ch = Math.round(info.height * sc);
        const removed = 1 - (info.width * info.height) / (m2(await sharp(src).metadata()));
        if (apply) await sharp(src).trim({ threshold: 14 }).resize(cw, ch).webp({ quality: 82, effort: 4 }).toFile(cover);
        removed > 0.02 ? trimmed++ : plain++;
      }
      // split the retail hang-tab flap off the top of the produced cover: the
      // strip becomes a 3D flap texture (box.flap), the remainder is the front.
      const flap = flaps[g.id];
      if (flap > 0.01) {
        const cut = Math.min(ch - 1, Math.round(flap * ch));
        if (apply) {
          const flapBuf = await sharp(cover).extract({ left: 0, top: 0, width: cw, height: cut }).webp({ quality: 84, effort: 4 }).toBuffer();
          fs.writeFileSync(path.join(dir, 'flap.webp'), flapBuf);
          const buf = await sharp(cover).extract({ left: 0, top: cut, width: cw, height: ch - cut }).webp({ quality: 82, effort: 4 }).toBuffer();
          fs.writeFileSync(cover, buf);
        }
        g.box.flap = { src: `/textures/${g.id}/flap.webp`, hFrac: +(flap / (1 - flap)).toFixed(3) };
        ch -= cut; flapped++;
      } else if (g.box.flap) { delete g.box.flap; }
      if (apply) { const long = Math.max(cw, ch), ts = 320 / long; await sharp(cover).resize(Math.round(cw * ts), Math.round(ch * ts)).webp({ quality: 78, effort: 4 }).toFile(thumb); }
      const o = orient(g.box.size, cw / ch);
      g.box.face = o.face; g.box.orientation = o.orientation;
    } catch (e) { console.log('ERR', g.id, e.message.slice(0, 70)); }
  }
  if (apply) saveGames(games);
  console.log(`[fronts] ${apply ? 'fixed' : 'would fix'} — deprojected ${deprojected}, trimmed ${trimmed}, unchanged ${plain}, flap-cropped ${flapped}, no-source ${missing}`);
})();
function m2(meta) { return meta.width * meta.height; }
