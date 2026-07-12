// Flatten box faces photographed at an angle, using 4-corner quads picked by a
// vision pass (_backquads/out-*.json). A homography warps the quad to a straight
// rectangle. Fronts re-derive cover.webp (+ orientation); backs re-derive
// back.webp (normalised to the front). Faces are then regenerated (10-gen-faces
// keeps photo faces, so a deprojected back survives while procedural sides refresh).
//   node scripts/21-deproject.js [--apply]
const { execFileSync } = require('child_process');
const L = require('./lib');
const { fs, path, sharp, COVERS, GALLERY, texDir, loadGames, saveGames, deproject, channelStats, readAudit } = L;

const apply = process.argv.includes('--apply');
const { games, list } = loadGames();
const byId = Object.fromEntries(list.map((g) => [g.id, g]));

const audit = readAudit('_backquads');
const OV = path.join(__dirname, 'backquad-overrides.json'); // hand fixes win
if (fs.existsSync(OV)) for (const e of JSON.parse(fs.readFileSync(OV, 'utf8'))) audit[e.id + ':' + e.face] = e;
// audit is keyed by id; the vision shards emit one entry per (id,face) so re-key
const entries = [];
for (const f of fs.existsSync(path.join(GALLERY, '_backquads')) ? fs.readdirSync(path.join(GALLERY, '_backquads')) : []) {
  if (f.startsWith('out-') && f.endsWith('.json')) { try { entries.push(...JSON.parse(fs.readFileSync(path.join(GALLERY, '_backquads', f), 'utf8'))); } catch (e) {} }
}
if (fs.existsSync(OV)) entries.push(...JSON.parse(fs.readFileSync(OV, 'utf8')));

const edge = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const quadAspect = (q) => ((edge(q[0], q[1]) + edge(q[3], q[2])) / 2) / ((edge(q[0], q[3]) + edge(q[1], q[2])) / 2);

(async () => {
  const touched = new Set();
  let nf = 0, nb = 0;
  for (const e of entries) {
    const g = byId[e.id]; if (!g || !e.quad || e.quad.length !== 4) continue;
    const dir = texDir(g.id);
    const srcFile = e.face === 'front' ? path.join(COVERS, g.id + '.jpg')
      : (fs.existsSync(path.join(GALLERY, g.id, 'back-src.jpg')) ? path.join(GALLERY, g.id, 'back-src.jpg') : path.join(dir, 'back.webp'));
    if (!fs.existsSync(srcFile)) { console.log('  no src', e.id, e.face); continue; }
    const m = await sharp(srcFile).metadata();
    const q = e.quad.map(([x, y]) => [x * m.width, y * m.height]); // → source pixels
    const asp = quadAspect(q);
    const W = asp >= 1 ? 1024 : Math.round(1024 * asp), H = asp >= 1 ? Math.round(1024 / asp) : 1024;
    if (e.face === 'front') {
      if (apply) {
        await deproject(srcFile, q, W, H, null, path.join(dir, 'cover.webp'));
        const ts = 320 / Math.max(W, H);
        await sharp(path.join(dir, 'cover.webp')).resize(Math.round(W * ts), Math.round(H * ts)).webp({ quality: 78, effort: 4 }).toFile(path.join(dir, 'thumb.webp'));
      }
      nf++;
    } else {
      const coverPath = path.join(dir, 'cover.webp'); // normalise the back toward the front
      if (apply) await deproject(srcFile, q, W, H, fs.existsSync(coverPath) ? coverPath : null, path.join(dir, 'back.webp'));
      nb++;
    }
    touched.add(g.id);
    console.log(`  ${e.face.padEnd(5)} ${e.id}  (${W}x${H})`);
  }
  // refresh faces/orientation; photo faces (incl. deprojected backs) are kept
  if (apply) for (const id of touched) execFileSync(process.execPath, [path.join(__dirname, '10-gen-faces.js'), id], { stdio: 'ignore' });
  console.log(`[deproject] ${apply ? 'applied' : 'would apply'} — fronts ${nf}, backs ${nb}`);
})();
