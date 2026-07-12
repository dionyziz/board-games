// Apply box-back deprojections chosen by the vision triage. Reads the shard JSON
// files in scripts/gallery-cache/_deproj/ (arrays of { id, angled, quad }, quad =
// 4 fractional [x,y] corners tl,tr,br,bl of the box-back within the raw photo),
// and for each angled back runs the homography unwarp (scripts/unwarp-face.js)
// from the raw back-src into a rectified, front-normalized back.webp.
//   node scripts/13-apply-deproj.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DEPROJ = path.join(__dirname, 'gallery-cache', '_deproj');
const DATA = path.join(ROOT, 'src/data/games.json');
const games = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const list = Array.isArray(games) ? games : games.games;
const byId = Object.fromEntries(list.map((g) => [g.id, g]));

// merge all shard files
let entries = [];
if (fs.existsSync(DEPROJ)) {
  for (const f of fs.readdirSync(DEPROJ)) {
    if (!f.endsWith('.json')) continue;
    try { entries = entries.concat(JSON.parse(fs.readFileSync(path.join(DEPROJ, f), 'utf8'))); } catch (e) {}
  }
}
const sharp = require('sharp');

(async () => {
  let done = 0, skip = 0, err = 0;
  for (const e of entries) {
    const g = byId[e.id];
    if (!g || !e.angled || !e.quad || e.quad.length !== 4) { skip++; continue; }
    const dir = path.join(__dirname, 'gallery-cache', e.id);
    const srcName = fs.existsSync(dir) && fs.readdirSync(dir).find((n) => n.startsWith('back-src.'));
    if (!srcName) { skip++; continue; }
    const src = path.join(dir, srcName);
    try {
      const m = await sharp(src).metadata();
      const px = e.quad.map(([x, y]) => `${Math.round(x * m.width)},${Math.round(y * m.height)}`).join(';');
      const face = g.box.face || g.box.size;
      const W = Math.round(face.w * 40), H = Math.round(face.h * 40);
      const cover = path.join(ROOT, 'public', 'textures', g.id, 'cover.webp');
      const out = path.join(ROOT, 'public', 'textures', g.id, 'back.webp');
      execFileSync(process.execPath, [path.join(__dirname, 'unwarp-face.js'), src, px, String(W), String(H), cover, out], { stdio: 'ignore' });
      g.textures.back = { src: `/textures/${g.id}/back.webp`, source: 'photo', normalized: true, note: 'deprojected from an angled BGG photo' };
      done++;
      console.log('deprojected', e.id);
    } catch (ex) { err++; console.log('ERR', e.id, ex.message.slice(0, 80)); }
  }
  fs.writeFileSync(DATA, JSON.stringify(games, null, 2) + '\n');
  console.log(`[deproj] applied ${done}, skipped ${skip}, errors ${err}`);
})();
