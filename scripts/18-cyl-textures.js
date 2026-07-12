// Build dedicated cylinder textures for tins/tubes from hand-picked FLAT source
// art in scripts/cyl-src/<id>.jpg (found by vetting the BGG galleries — a genuine
// top-down lid for a round tin, flat key art for a tube). Writes
// public/textures/<id>/cyl.webp and points box.cylTex at it. The renderer prefers
// box.cylTex over the (often angled) cover for cylindrical packages.
//   node scripts/18-cyl-textures.js [--apply]
const L = require('./lib');
const { fs, path, sharp, texDir, loadGames, saveGames } = L;

const SRC = path.join(__dirname, 'cyl-src');
const apply = process.argv.includes('--apply');
const { games, list } = loadGames();

(async () => {
  if (!fs.existsSync(SRC)) { console.log('no cyl-src dir'); return; }
  let n = 0;
  for (const file of fs.readdirSync(SRC)) {
    const id = file.replace(/\.[^.]+$/, '');
    const g = list.find((x) => x.id === id);
    if (!g) { console.log('  ?? no game', id); continue; }
    const src = path.join(SRC, file);
    const dir = texDir(g.id);
    const out = path.join(dir, 'cyl.webp');
    const shape = g.box.shape;
    let pipe = sharp(src).rotate();
    if (shape === 'round-tin') {
      // center-crop to a square so the round lid is inscribed in the cap disc
      const m = await sharp(src).metadata();
      const s = Math.min(m.width, m.height);
      pipe = pipe.extract({ left: Math.round((m.width - s) / 2), top: Math.round((m.height - s) / 2), width: s, height: s }).resize(1024, 1024);
    } else {
      // tube: keep the flat art as-is; cap the long side at 1024 for the wrap
      pipe = pipe.resize(1024, 1024, { fit: 'inside', withoutEnlargement: true });
    }
    if (apply) {
      fs.mkdirSync(dir, { recursive: true });
      await pipe.webp({ quality: 90, effort: 4 }).toFile(out);
    }
    g.box.cylTex = `/textures/${g.id}/cyl.webp`;
    n++;
    console.log(`  ${shape.padEnd(10)} ${id} → cyl.webp`);
  }
  if (apply) { saveGames(games); console.log(`\napplied cylinder textures for ${n} games.`); }
  else console.log(`\n[dry run] ${n} games — pass --apply.`);
})();
