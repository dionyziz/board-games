// Merge the package-shape audit (scripts/package-shapes.json) into games.json so
// the renderer knows each game's real packaging. Sets box.shape on every flagged
// game, and box.cyl {diameter,height} (cm) + box.capCrop for cylinders. Games not
// listed keep no shape → rendered as the default box.
//   node scripts/16-apply-shapes.js [--apply]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const apply = process.argv.includes('--apply');
const { shapes } = JSON.parse(fs.readFileSync(path.join(__dirname, 'package-shapes.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/games.json'), 'utf8'));

let n = 0, miss = 0;
// clear any stale shapes first so removing an entry reverts a game to a box
for (const g of data.games) { if (g.box) { delete g.box.shape; delete g.box.cyl; delete g.box.capCrop; delete g.box.cornerR; delete g.box.bag; delete g.box.model; } }

for (const [id, s] of Object.entries(shapes)) {
  const g = data.games.find((x) => x.id === id);
  if (!g) { console.log('  ?? no such game:', id); miss++; continue; }
  g.box.shape = s.shape;
  if (s.dims) g.box.cyl = { diameter: s.dims.diameter, height: s.dims.height };
  if (s.capCrop) g.box.capCrop = s.capCrop;
  if (s.cornerR) g.box.cornerR = s.cornerR;
  if (s.bag) g.box.bag = s.bag;
  if (s.model) g.box.model = s.model;
  n++;
  console.log(`  ${s.shape.padEnd(10)} ${id}${s.dims ? '  cyl ⌀' + s.dims.diameter + '×' + s.dims.height : ''}`);
}

if (apply) { fs.writeFileSync(path.join(ROOT, 'src/data/games.json'), JSON.stringify(data, null, 2)); console.log(`\napplied shape to ${n} games (${miss} missing).`); }
else console.log(`\n[dry run] would set shape on ${n} games — pass --apply.`);
