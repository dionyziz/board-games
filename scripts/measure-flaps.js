// Apply per-game hang-tab flap params (scripts/flap-params.json) to box.flap:
// cornerR (rounded free corners) and the keyhole hole (stadium slot + top circle),
// measured from the flap textures.  node scripts/measure-flaps.js
const L = require('./lib');
const { fs, path, loadGames, saveGames } = L;

const params = JSON.parse(fs.readFileSync(path.join(__dirname, 'flap-params.json'), 'utf8'));
const { games, list } = loadGames();
let n = 0;
for (const g of list) {
  if (!g.box.flap) continue;
  g.box.flap.cornerR = (params.cornerR && params.cornerR[g.id]) || 0.28;
  const wf = params.wFrac && params.wFrac[g.id];
  if (wf) g.box.flap.wFrac = wf; else delete g.box.flap.wFrac;
  const hole = params.hole && params.hole[g.id];
  if (hole) g.box.flap.hole = hole; else delete g.box.flap.hole;
  n++;
  console.log(`  ${g.id}  cornerR ${g.box.flap.cornerR}  hole ${hole ? 'set' : 'none'}`);
}
saveGames(games);
console.log(`applied flap params to ${n} flaps.`);
