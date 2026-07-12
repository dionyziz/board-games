// Add searchable alternate titles so a game is findable by its English/BGG name
// even when the owned copy's title is Greek (e.g. "Απαγορευμένη Νήσος" ↔ "Forbidden
// Island", "Οι Άποικοι του Κατάν" ↔ "Catan"). Pulls names from the BGG cache
// (meta.name + meta.alternatename) and the hand-verified backfill patch.
//   node scripts/17-alt-titles.js [--apply]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, 'bgg-cache');
const apply = process.argv.includes('--apply');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/games.json'), 'utf8'));
let patch = {};
try { patch = JSON.parse(fs.readFileSync(path.join(__dirname, 'bare-meta-patch.json'), 'utf8')); } catch (e) {}

const norm = (s) => (s || '').trim().toLowerCase();
let n = 0;
for (const g of data.games) {
  const names = new Set();
  const add = (v) => { if (typeof v === 'string' && v.trim() && norm(v) !== norm(g.title)) names.add(v.trim()); };
  if (g.bggId) {
    const f = path.join(CACHE, g.bggId + '.json');
    if (fs.existsSync(f)) {
      try {
        const r = JSON.parse(fs.readFileSync(f));
        const m = r.meta || {};
        add(m.name);
        const alt = m.alternatename;
        if (Array.isArray(alt)) alt.forEach(add); else add(alt);
      } catch (e) {}
    }
  }
  if (patch[g.id]) add(patch[g.id].canonicalName);
  if (names.size) { g.altTitles = [...names]; n++; }
  else if (g.altTitles) delete g.altTitles;
}

if (apply) { fs.writeFileSync(path.join(ROOT, 'src/data/games.json'), JSON.stringify(data, null, 2)); console.log(`applied altTitles to ${n} games.`); }
else {
  console.log(`[dry run] ${n} games would get altTitles. Samples:`);
  for (const g of data.games.filter((x) => x.altTitles).slice(0, 12)) console.log('  ', g.id, '→', JSON.stringify(g.altTitles));
}
