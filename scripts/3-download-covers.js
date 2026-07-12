const fs = require('fs');
const path = require('path');

const PROJECT = '/Users/dionyziz/workspace/board-games';
const COVERS = path.join(PROJECT, 'public', 'covers');
fs.mkdirSync(COVERS, { recursive: true });

const data = require('./games.json');
const games = data.games;

async function dl(g) {
  const url = g.image;
  if (!url) return { id: g.id, ok: false, reason: 'no-url' };
  const file = path.join(COVERS, g.id + '.jpg');
  try {
    const r = await fetch(url);
    if (!r.ok) return { id: g.id, ok: false, reason: 'http-' + r.status };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 500) return { id: g.id, ok: false, reason: 'tiny-' + buf.length };
    fs.writeFileSync(file, buf);
    return { id: g.id, ok: true, bytes: buf.length };
  } catch (e) {
    return { id: g.id, ok: false, reason: e.message.slice(0, 40) };
  }
}

(async () => {
  const results = [];
  const CONC = 8;
  for (let i = 0; i < games.length; i += CONC) {
    const batch = games.slice(i, i + CONC);
    const rs = await Promise.all(batch.map(dl));
    results.push(...rs);
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  const ok = results.filter((r) => r.ok);
  const bad = results.filter((r) => !r.ok);
  console.log('downloaded:', ok.length, '/', games.length);
  if (bad.length) console.log('FAILED:', JSON.stringify(bad, null, 1));

  // rewrite games.json with local cover paths + drop volatile signed urls
  for (const g of games) {
    const okr = ok.find((r) => r.id === g.id);
    g.cover = okr ? '/covers/' + g.id + '.jpg' : null;
    delete g.image;
    delete g.thumb;
  }
  fs.writeFileSync(path.join(PROJECT, 'src', 'data', 'games.json') , JSON.stringify(data, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
