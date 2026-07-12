// Backfill metadata for the handful of games the BGG pipeline skipped (they had
// no bggId, so 4-fetch-bgg/5-enrich never touched them). Reads a hand-verified
// patch (produced by resolving each to its correct BGG entry — see
// bare-meta-patch.json) and fills the metadata fields ONLY. Box dimensions are
// left untouched (already estimated + faces generated against them).
//   node scripts/enrich-bare.js [--apply]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const apply = process.argv.includes('--apply');
const patch = JSON.parse(fs.readFileSync(path.join(__dirname, 'bare-meta-patch.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/games.json'), 'utf8'));

// metadata fields we own here; box.* is intentionally excluded
const FIELDS = ['year', 'players', 'playtime', 'minAge', 'designers', 'artists',
  'publishers', 'categories', 'mechanics', 'families', 'complexity',
  'bggRating', 'bggRank', 'shortDescription', 'description'];

let touched = 0;
for (const [id, p] of Object.entries(patch)) {
  const g = data.games.find((x) => x.id === id);
  if (!g) { console.log('  ?? no such game:', id); continue; }
  for (const f of FIELDS) if (p[f] !== undefined) g[f] = p[f];
  if (p.onBgg && p.bggId) { g.bggId = String(p.bggId); g.bggUrl = p.bggUrl; }
  g.metaSource = p.onBgg ? 'bgg-backfill' : 'manual-backfill';
  touched++;
  const nn = FIELDS.filter((f) => p[f] != null && !(typeof p[f] === 'object' && p[f].min == null && p[f].max == null)).length;
  console.log(`  ${p.onBgg ? 'BGG ' + p.bggId : 'MANUAL'}  ${id}  (${nn} fields)  ${p.canonicalName || g.title}`);
}

if (apply) { fs.writeFileSync(path.join(ROOT, 'src/data/games.json'), JSON.stringify(data, null, 2)); console.log(`\napplied to ${touched} games.`); }
else console.log(`\n[dry run] would patch ${touched} games — pass --apply to write.`);
