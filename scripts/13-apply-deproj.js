// Apply box-back deprojections chosen by the vision triage. Reads the shard JSON
// files in a triage dir (arrays of { id, angled, quad }, quad = 4 fractional
// [x,y] corners tl,tr,br,bl of the box-back within the raw photo) and unwarps
// each angled back from its raw back-src into a rectified, front-normalized
// back.webp (see lib.deproject).
//   node scripts/13-apply-deproj.js [triageDir=_deproj]
const L = require('./lib');
const { fs, path, sharp, GALLERY, loadGames, saveGames, texDir, deproject } = L;

const dir = process.argv[2] || '_deproj';
const DEPROJ = path.join(GALLERY, dir);
const { games, list } = loadGames();
const byId = Object.fromEntries(list.map((g) => [g.id, g]));

let entries = [];
if (fs.existsSync(DEPROJ)) for (const f of fs.readdirSync(DEPROJ)) {
  if (f.startsWith('out-') && f.endsWith('.json')) { try { entries = entries.concat(JSON.parse(fs.readFileSync(path.join(DEPROJ, f), 'utf8'))); } catch (e) {} }
}

(async () => {
  let done = 0, skip = 0, err = 0;
  for (const e of entries) {
    const g = byId[e.id];
    if (!g || !e.angled || !e.quad || e.quad.length !== 4) { skip++; continue; }
    const cdir = path.join(GALLERY, e.id);
    const srcName = fs.existsSync(cdir) && fs.readdirSync(cdir).find((n) => n.startsWith('back-src.'));
    if (!srcName) { skip++; continue; }
    try {
      const m = await sharp(path.join(cdir, srcName)).metadata();
      const quad = e.quad.map(([x, y]) => [Math.round(x * m.width), Math.round(y * m.height)]);
      const face = g.box.face || g.box.size;
      await deproject(path.join(cdir, srcName), quad, Math.round(face.w * 40), Math.round(face.h * 40),
        path.join(texDir(g.id), 'cover.webp'), path.join(texDir(g.id), 'back.webp'));
      g.textures.back = { src: `/textures/${g.id}/back.webp`, source: 'photo', normalized: true, note: 'deprojected from an angled BGG photo' };
      done++; console.log('deprojected', e.id);
    } catch (ex) { err++; console.log('ERR', e.id, ex.message.slice(0, 80)); }
  }
  saveGames(games);
  console.log(`[deproj] applied ${done}, skipped ${skip}, errors ${err}`);
})();
