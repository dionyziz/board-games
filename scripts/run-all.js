// Batch driver for the whole-library box-art run (see BOX-ART-PIPELINE.md §9).
//
// Two phases, deliberately separated because 10-gen-faces.js / gen-top-band.js
// read+write games.json and must NOT run concurrently (JSON read-modify-write
// race). The fetch phase writes only to per-game caches, so it is safe to shard
// across parallel workers/subagents; the build phase is single-process.
//
//   node scripts/run-all.js --fetch [--shard i/N] [--concurrency c] [--limit n] [--ids a,b]
//   node scripts/run-all.js --build [--force] [--limit n] [--ids a,b]
//
// --fetch : per game -> 8-fetch-gallery.js  (parallel-safe)
// --build : per game -> 10-gen-faces.js (+cached back) -> gen-top-band.js  (sequential)
const { execFile } = require('child_process');
const { path, ROOT, loadGames, pool } = require('./lib');
const NODE = process.execPath;

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
};
const has = (name) => process.argv.includes(name);

const list = loadGames().list;

// worklist
let work = list.map((g, i) => ({ g, i }));
const ids = arg('--ids');
if (ids) { const set = new Set(ids.split(',')); work = work.filter((w) => set.has(w.g.id)); }
const shard = arg('--shard');
if (shard) { const [ix, n] = shard.split('/').map(Number); work = work.filter((w) => w.i % n === (ix - 1)); }
const limit = arg('--limit');
if (limit) work = work.slice(0, Number(limit));

function run(script, args, timeout = 120000) {
  return new Promise((resolve) => {
    execFile(NODE, [path.join(__dirname, script), ...args], { cwd: ROOT, timeout, maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout || '', stderr: stderr || (err ? err.message : '') });
    });
  });
}


(async () => {
  const total = work.length;
  let n = 0, backs = 0, errs = 0;

  const FACES = ['BACK', 'SPINE', 'TOP', 'BOTTOM'];
  if (has('--fetch')) {
    const concurrency = Number(arg('--concurrency', '2'));
    const tally = { BACK: 0, SPINE: 0, TOP: 0, BOTTOM: 0 };
    console.log(`[fetch] ${total} games, concurrency ${concurrency}${shard ? ', shard ' + shard : ''}`);
    await pool(work, concurrency, async ({ g }) => {
      const r = await run('8-fetch-gallery.js', [g.id]);
      const hits = FACES.filter((f) => { const m = new RegExp(f + '=(\\S+)').exec(r.stdout); if (m) tally[f]++; return m; });
      if (!r.ok) errs++;
      console.log(`[fetch ${++n}/${total}] ${g.id} ${hits.length ? hits.join('+').toLowerCase() : '—'}${r.ok ? '' : ' ERR:' + r.stderr.slice(0, 80)}`);
    });
    console.log(`[fetch] done — ${FACES.map((f) => f.toLowerCase() + ':' + tally[f]).join(' ')}, ${errs} errors`);
    return;
  }

  if (has('--build')) {
    const force = has('--force') ? ['--force'] : [];
    console.log(`[build] ${total} games (sequential)`);
    for (const { g } of work) {
      const a = await run('10-gen-faces.js', [g.id, ...force]);       // self-reads gallery for photos
      const b = await run('gen-top-band.js', [g.id]);                  // cover-derived top/bottom fallback
      if (!a.ok || !b.ok) errs++;
      const err = !a.ok ? ' ERR(faces):' + a.stderr.slice(0, 80) : !b.ok ? ' ERR(top):' + b.stderr.slice(0, 80) : '';
      console.log(`[build ${++n}/${total}] ${g.id}${err}`);
    }
    console.log(`[build] done — ${errs} errors`);
    return;
  }

  console.error('specify --fetch or --build');
  process.exit(1);
})();
