// Install a flat front cover from an image file: replace the pristine source,
// mark the game non-angled in the front audit (so 14 trims instead of
// deprojecting), then re-derive the front + faces. Use when the owned cover is a
// bad angled/low-res shot and a clean flat cover is available (e.g. from BGG).
//   node scripts/set-cover.js <gameId> <imagePath>
const { execFileSync } = require('child_process');
const L = require('./lib');
const { fs, path, COVERS, GALLERY } = L;

const [id, img] = process.argv.slice(2);
if (!id || !img || !fs.existsSync(img)) { console.error('usage: set-cover.js <gameId> <imagePath>'); process.exit(1); }

fs.copyFileSync(img, path.join(COVERS, id + '.jpg'));

// clear any "angled" verdict for this id in the front audit
const AD = path.join(GALLERY, '_fronts');
if (fs.existsSync(AD)) for (const f of fs.readdirSync(AD)) {
  if (!f.endsWith('.json')) continue;
  const p = path.join(AD, f); const a = JSON.parse(fs.readFileSync(p, 'utf8')); let ch = false;
  for (const e of a) if (e.id === id) { e.angled = false; delete e.quad; ch = true; }
  if (ch) fs.writeFileSync(p, JSON.stringify(a, null, 2));
}

const node = process.execPath, S = __dirname;
execFileSync(node, [path.join(S, '14-fix-fronts.js'), '--apply', id], { stdio: 'inherit' });
execFileSync(node, [path.join(S, '10-gen-faces.js'), id], { stdio: 'inherit' });
console.log('cover installed:', id);
