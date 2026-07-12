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
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, 'gallery-cache');
const NODE = process.execPath;

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
};
const has = (name) => process.argv.includes(name);

const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/games.json'), 'utf8'));
const list = Array.isArray(games) ? games : games.games;

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

async function pool(items, concurrency, fn) {
  let idx = 0; const results = [];
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) { const k = idx++; results[k] = await fn(items[k], k); }
  });
  await Promise.all(workers);
  return results;
}

const backFileFor = (id) => {
  const gf = path.join(CACHE, id, 'gallery.json');
  if (!fs.existsSync(gf)) return null;
  try { const j = JSON.parse(fs.readFileSync(gf, 'utf8')); return j.chosen && j.chosen.back && j.chosen.back.file && fs.existsSync(j.chosen.back.file) ? j.chosen.back.file : null; }
  catch (e) { return null; }
};

(async () => {
  const total = work.length;
  let n = 0, backs = 0, errs = 0;

  if (has('--fetch')) {
    const concurrency = Number(arg('--concurrency', '2'));
    console.log(`[fetch] ${total} games, concurrency ${concurrency}${shard ? ', shard ' + shard : ''}`);
    await pool(work, concurrency, async ({ g }) => {
      const r = await run('8-fetch-gallery.js', [g.id]);
      const back = /BACK=(.+)/.exec(r.stdout);
      const hasBack = back && back[1].trim();
      if (hasBack) backs++;
      if (!r.ok) errs++;
      console.log(`[fetch ${++n}/${total}] ${g.id} ${hasBack ? 'back✓' : 'back—'}${r.ok ? '' : ' ERR:' + r.stderr.slice(0, 80)}`);
    });
    console.log(`[fetch] done — ${backs} backs found, ${errs} errors`);
    return;
  }

  if (has('--build')) {
    const force = has('--force') ? ['--force'] : [];
    console.log(`[build] ${total} games (sequential)`);
    for (const { g } of work) {
      const back = backFileFor(g.id);
      const a = await run('10-gen-faces.js', back ? [g.id, back, ...force] : [g.id, ...force]);
      const b = await run('gen-top-band.js', [g.id]);
      if (back) backs++;
      if (!a.ok || !b.ok) { errs++; }
      const err = !a.ok ? ' ERR(faces):' + a.stderr.slice(0, 80) : !b.ok ? ' ERR(top):' + b.stderr.slice(0, 80) : '';
      console.log(`[build ${++n}/${total}] ${g.id} ${back ? 'back✓' : 'back—'}${err}`);
    }
    console.log(`[build] done — ${backs} photographic backs, ${errs} errors`);
    return;
  }

  console.error('specify --fetch or --build');
  process.exit(1);
})();
