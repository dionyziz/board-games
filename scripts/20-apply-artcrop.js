// Apply the art-crop audit (_artcrop/out-*.json): trim the flagged non-artwork
// borders off fronts (cover.webp) and photo backs (back.webp), then recompute the
// front orientation + thumbnail. 'overcropped'/'angled' can't be trimmed — they
// need a better source, so they're only reported here.
//   node scripts/20-apply-artcrop.js [--apply]
const L = require('./lib');
const { fs, path, sharp, texDir, loadGames, saveGames, readAudit } = L;

const apply = process.argv.includes('--apply');
const { games, list } = loadGames();
const audit = readAudit('_artcrop');

function orient(size, aspect) {
  const [a, b, c] = [size.w, size.h, size.d].sort((x, y) => y - x);
  const near = Math.abs(aspect - 1) < 0.05, land = aspect >= 1;
  return { face: near ? { w: size.w, h: size.h, d: size.d } : land ? { w: a, h: b, d: c } : { w: b, h: a, d: c }, orientation: near ? 'square' : land ? 'landscape' : 'portrait' };
}

const sig = (c) => c && (c.t > 0.004 || c.r > 0.004 || c.b > 0.004 || c.l > 0.004);
async function cropFile(file, c) {
  const m = await sharp(file).metadata();
  const left = Math.round(c.l * m.width), top = Math.round(c.t * m.height);
  const width = Math.round(m.width * (1 - c.l - c.r)) , height = Math.round(m.height * (1 - c.t - c.b));
  if (width < 40 || height < 40) return null;
  const buf = await sharp(file).extract({ left, top, width, height }).webp({ quality: 82, effort: 4 }).toBuffer();
  fs.writeFileSync(file, buf);
  return { width, height };
}

(async () => {
  let fCrop = 0, bCrop = 0; const followups = [];
  for (const g of list) {
    const a = audit[g.id]; if (!a) continue;
    const dir = texDir(g.id);
    // FRONT
    if (a.front) {
      if ((a.front.status === 'overcropped' || a.front.status === 'angled')) followups.push(`${a.front.status} FRONT ${g.id} — ${a.front.note || ''}`);
      else if (a.front.status === 'border' && sig(a.front.crop)) {
        const cover = path.join(dir, 'cover.webp'), thumb = path.join(dir, 'thumb.webp');
        if (fs.existsSync(cover)) {
          if (apply) {
            const d = await cropFile(cover, a.front.crop);
            if (d) {
              const ts = 320 / Math.max(d.width, d.height);
              await sharp(cover).resize(Math.round(d.width * ts), Math.round(d.height * ts)).webp({ quality: 78, effort: 4 }).toFile(thumb);
              const o = orient(g.box.size, d.width / d.height); g.box.face = o.face; g.box.orientation = o.orientation;
            }
          }
          fCrop++;
        }
      }
    }
    // BACK (photo only)
    if (a.back) {
      if (a.back.status === 'overcropped' || a.back.status === 'angled') followups.push(`${a.back.status} BACK ${g.id} — ${a.back.note || ''}`);
      else if (a.back.status === 'border' && sig(a.back.crop)) {
        const back = path.join(dir, 'back.webp');
        if (fs.existsSync(back) && g.textures.back && g.textures.back.source === 'photo') {
          if (apply) await cropFile(back, a.back.crop);
          bCrop++;
        }
      }
    }
  }
  if (apply) saveGames(games);
  console.log(`[artcrop] ${apply ? 'cropped' : 'would crop'} — fronts ${fCrop}, backs ${bCrop}`);
  console.log(`follow-ups needing a better source (${followups.length}):`);
  followups.forEach((s) => console.log('  ' + s));
})();
