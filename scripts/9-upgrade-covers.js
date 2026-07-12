// Upgrade low-res front covers to the BGG hi-res original — but ONLY when the
// hi-res image is the SAME artwork as our current cover (perceptual match), so
// edition-specific covers (e.g. Greek editions) are never swapped for a
// different edition. Parallel-safe (per-game files only): shardable.
//
//   node scripts/9-upgrade-covers.js [--shard i/N] [--apply] [gameId]
// Without --apply: report only. With --apply: replace covers/<id>.jpg + regen
// textures/<id>/{cover,thumb}.webp at hi-res.
const L = require('./lib');
const { fs, path, sharp, COVERS, TEX, CACHE, sleep, grabBuffer, loadGames } = L;
const MAX_COVER = 1024, MAX_THUMB = 320;

const apply = process.argv.includes('--apply');
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const only = process.argv.find((a, i) => i >= 2 && !a.startsWith('--') && (process.argv[i - 1] || '').indexOf('--shard') < 0);
let list = loadGames().list.map((g, i) => ({ g, i }));
if (only) list = list.filter((w) => w.g.id === only);
const shard = arg('--shard');
if (shard) { const [ix, n] = shard.split('/').map(Number); list = list.filter((w) => w.i % n === (ix - 1)); }
const grab = grabBuffer;
// 16x16 grayscale mean-abs-diff (0=identical .. 1=totally different)
async function adiff(a, b) {
  const g = (buf) => sharp(buf).resize(16, 16, { fit: 'fill' }).grayscale().raw().toBuffer();
  const [x, y] = await Promise.all([g(a), g(b)]);
  let s = 0; for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]);
  return s / (x.length * 255);
}

(async () => {
  let upgraded = 0, skipDiff = 0, skipRes = 0, noCache = 0;
  for (const { g } of list) {
    const cf = path.join(CACHE, g.bggId + '.json');
    const cur = path.join(COVERS, g.id + '.jpg');
    if (!g.bggId || !fs.existsSync(cf) || !fs.existsSync(cur)) { noCache++; continue; }
    let orig; try { orig = JSON.parse(fs.readFileSync(cf, 'utf8')).meta?.images?.original; } catch (e) {}
    if (!orig) { noCache++; continue; }
    const hi = await grab(orig);
    if (!hi) { noCache++; continue; }
    try {
      const [hm, cm] = await Promise.all([sharp(hi).metadata(), sharp(cur).metadata()]);
      const hiLong = Math.max(hm.width, hm.height), curLong = Math.max(cm.width, cm.height);
      if (hiLong < curLong * 1.15) { skipRes++; continue; }          // not meaningfully sharper
      const d = await adiff(hi, fs.readFileSync(cur));
      if (d > 0.13) { skipDiff++; continue; }                        // different edition/art → keep ours
      upgraded++;
      if (apply) {
        fs.writeFileSync(cur, hi);
        const dir = path.join(TEX, g.id); fs.mkdirSync(dir, { recursive: true });
        const long = Math.max(hm.width, hm.height);
        const cs = long > MAX_COVER ? MAX_COVER / long : 1;
        await sharp(hi).rotate().resize(Math.round(hm.width * cs), Math.round(hm.height * cs)).webp({ quality: 82, effort: 4 }).toFile(path.join(dir, 'cover.webp'));
        const ts = long > MAX_THUMB ? MAX_THUMB / long : 1;
        await sharp(hi).rotate().resize(Math.round(hm.width * ts), Math.round(hm.height * ts)).webp({ quality: 78, effort: 4 }).toFile(path.join(dir, 'thumb.webp'));
      }
      console.log(`${apply ? 'UP' : 'would'} ${g.id}  ${curLong}->${hiLong}px  diff=${d.toFixed(3)}`);
    } catch (e) { noCache++; }
    await sleep(80);
  }
  console.log(`[covers] upgraded ${upgraded}, skip(diff-edition) ${skipDiff}, skip(not-sharper) ${skipRes}, no-source ${noCache}`);
})();
