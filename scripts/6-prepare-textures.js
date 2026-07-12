// Turn the raw downloaded covers into render-ready textures for the 3D boxes:
//   public/textures/<id>/cover.webp   front face,   long side <= 1024
//   public/textures/<id>/thumb.webp   2D fallback,   long side <= 320
// and sample per-game colors for the box's undecorated faces, written back
// into games.json as box.sideColor (dominant) + box.edgeColor (darker shade).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'covers');
const OUT = path.join(ROOT, 'public', 'textures');
const data = require(path.join(ROOT, 'src/data/games.json'));

const MAX_COVER = 1024;
const MAX_THUMB = 320;
const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const hex = ({ r, g, b }) => '#' + [r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('');
const darken = ({ r, g, b }, f) => ({ r: r * (1 - f), g: g * (1 - f), b: b * (1 - f) });

async function processGame(g) {
  const src = path.join(SRC, g.id + '.jpg');
  if (!fs.existsSync(src)) return { id: g.id, ok: false, reason: 'no-source' };
  const dir = path.join(OUT, g.id);
  fs.mkdirSync(dir, { recursive: true });

  try {
    const base = sharp(src, { failOn: 'none' }).rotate();
    const meta = await base.metadata();
    const long = Math.max(meta.width || 1, meta.height || 1);

    // cover (don't upscale small scans)
    const coverScale = long > MAX_COVER ? MAX_COVER / long : 1;
    await sharp(src, { failOn: 'none' })
      .rotate()
      .resize(Math.round((meta.width || 1) * coverScale), Math.round((meta.height || 1) * coverScale))
      .webp({ quality: 82, effort: 4 })
      .toFile(path.join(dir, 'cover.webp'));

    // thumbnail
    const thumbScale = long > MAX_THUMB ? MAX_THUMB / long : 1;
    await sharp(src, { failOn: 'none' })
      .rotate()
      .resize(Math.round((meta.width || 1) * thumbScale), Math.round((meta.height || 1) * thumbScale))
      .webp({ quality: 72, effort: 4 })
      .toFile(path.join(dir, 'thumb.webp'));

    // Representative side color: sample the CENTER (covers often have white scan
    // backgrounds / black borders that fool a whole-image dominant). Take the
    // center-crop dominant, but reject near-white/near-black extremes and fall
    // back to the center average color.
    const W = meta.width || 1, H = meta.height || 1;
    const cw = Math.max(1, Math.round(W * 0.6)), ch = Math.max(1, Math.round(H * 0.6));
    const cl = Math.round((W - cw) / 2), ct = Math.round((H - ch) / 2);
    const center = { left: cl, top: ct, width: cw, height: ch };

    const cStats = await sharp(src, { failOn: 'none' }).extract(center).stats();
    const avgBuf = await sharp(src, { failOn: 'none' }).extract(center).resize(1, 1).removeAlpha().raw().toBuffer();
    const avg = { r: avgBuf[0], g: avgBuf[1], b: avgBuf[2] };
    const extreme = (c) => (c.r > 238 && c.g > 238 && c.b > 238) || (c.r < 16 && c.g < 16 && c.b < 16);
    let dom = cStats.dominant;
    if (extreme(dom)) dom = avg;              // border/background fooled the histogram
    if (extreme(dom)) dom = { r: 90, g: 92, b: 98 }; // last-resort neutral slate

    const cover = fs.statSync(path.join(dir, 'cover.webp')).size;
    return {
      id: g.id, ok: true,
      w: Math.round((meta.width || 1) * coverScale), h: Math.round((meta.height || 1) * coverScale),
      bytes: cover,
      sideColor: hex(dom), edgeColor: hex(darken(dom, 0.4)),
    };
  } catch (e) {
    return { id: g.id, ok: false, reason: String(e).slice(0, 60) };
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const games = data.games;
  const results = [];
  const CONC = 6;
  for (let i = 0; i < games.length; i += CONC) {
    const batch = games.slice(i, i + CONC);
    results.push(...(await Promise.all(batch.map(processGame))));
    process.stderr.write('.');
  }
  process.stderr.write('\n');

  // write colors + texture paths back into games.json
  let ok = 0, srcBytes = 0, outBytes = 0;
  for (const g of games) {
    const r = results.find((x) => x.id === g.id);
    if (r && r.ok) {
      ok++;
      g.box.sideColor = r.sideColor;
      g.box.edgeColor = r.edgeColor;
      g.textures = { cover: `/textures/${g.id}/cover.webp`, thumb: `/textures/${g.id}/thumb.webp` };
      try { srcBytes += fs.statSync(path.join(SRC, g.id + '.jpg')).size; } catch {}
      outBytes += r.bytes;
    }
  }
  data.texturesPreparedAt = '2026-07-12';
  fs.writeFileSync(path.join(ROOT, 'src/data/games.json'), JSON.stringify(data, null, 2));

  const bad = results.filter((r) => !r.ok);
  console.log(`textures: ${ok}/${games.length}`);
  if (bad.length) console.log('failed:', JSON.stringify(bad));
  console.log(`cover source: ${(srcBytes / 1e6).toFixed(1)} MB  →  webp covers: ${(outBytes / 1e6).toFixed(1)} MB`);
  const dirSize = require('child_process').execSync(`du -sh "${OUT}"`).toString().split('\t')[0];
  console.log(`textures dir total (cover+thumb): ${dirSize}`);
  console.log('sample colors:', results.filter(r => r.ok).slice(0, 4).map(r => `${r.id}:${r.sideColor}`).join('  '));
})();
