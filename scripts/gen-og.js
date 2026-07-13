// Social-media link previews (Open Graph / Twitter cards) + per-game entry pages.
//
// Games are real paths (/g/<id>/), so a shared link is a URL a crawler can fetch.
// For each game we pre-render `g/<id>/index.html`: a copy of the built app shell
// with that game's OG/Twitter tags injected. A crawler reads the correct card;
// a real browser loads the same bundle, and the SPA routes to /g/<id>/ in place —
// no redirect, so the address bar keeps the shareable URL. `404.html` is a copy of
// the shell so any unknown path still boots the app (GitHub Pages SPA fallback).
//
// Also emits `og/<id>.jpg` (1200×630 preview images) and `og/_default.jpg` (site card).
//
//   node scripts/gen-og.js [outDir=dist]   — runs automatically from `npm run build`
const L = require('./lib');
const { fs, path, sharp, ROOT } = L;

// set a <meta … content="…"> value (or <title>) regardless of quote/self-close style
const setContent = (html, sel, val) => html.replace(new RegExp('(<meta ' + sel + ' content=")[^"]*"'), (_m, p1) => p1 + val + '"');
const setTitle = (html, val) => html.replace(/<title>[^<]*<\/title>/, `<title>${val}</title>`);

async function main() {
  const outDir = path.resolve(ROOT, process.argv[2] || 'dist');
  const shellPath = path.join(outDir, 'index.html');
  if (!fs.existsSync(shellPath)) { console.warn(`gen-og: ${outDir}/index.html missing (run vite build first) — skipping`); return; }
  const shell = fs.readFileSync(shellPath, 'utf8');
  const domain = 'https://' + fs.readFileSync(path.join(ROOT, 'public', 'CNAME'), 'utf8').trim();
  const { list } = L.loadGames();

  const ogDir = path.join(outDir, 'og'), gDir = path.join(outDir, 'g');
  fs.mkdirSync(ogDir, { recursive: true });

  // SPA fallback for unknown paths (real game paths are pre-rendered below)
  fs.writeFileSync(path.join(outDir, '404.html'), shell);

  const W = 1200, H = 630;
  const coverPath = (g) => [path.join(L.TEX, g.id, 'cover.webp'), path.join(L.TEX, g.id, 'thumb.webp'), path.join(L.COVERS, g.id + '.jpg')].find(fs.existsSync);

  const summary = (g) => {
    let s = (g.shortDescription || g.description || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    if (s.length > 180) s = s.slice(0, 177).replace(/\s+\S*$/, '') + '…';
    return s || `${g.title} — from Jason's board game collection.`;
  };

  let made = 0;
  for (const g of list) {
    const cov = coverPath(g);
    if (!cov) continue;
    const bg = L.hexToRGB(L.mix(g.box?.sideColor || '#1a1a1e', '#0b0b0c', 0.72));
    const coverBuf = await sharp(cov).resize({ width: 1000, height: 520, fit: 'inside' })
      .extend({ top: 6, bottom: 6, left: 6, right: 6, background: { r: 12, g: 12, b: 14 } }).toBuffer();
    await sharp({ create: { width: W, height: H, channels: 3, background: bg } })
      .composite([{ input: coverBuf, gravity: 'center' }]).jpeg({ quality: 80, mozjpeg: true })
      .toFile(path.join(ogDir, g.id + '.jpg'));

    const title = L.esc(g.title), desc = L.esc(summary(g));
    const img = `${domain}/og/${g.id}.jpg`, url = `${domain}/g/${g.id}/`;
    let html = setTitle(shell, `${title} — Jason's Board Games`);
    html = setContent(html, 'name="description"', desc);
    html = setContent(html, 'property="og:title"', title);
    html = setContent(html, 'property="og:description"', desc);
    html = setContent(html, 'property="og:url"', url);
    html = setContent(html, 'property="og:image"', img);
    html = setContent(html, 'name="twitter:title"', title);
    html = setContent(html, 'name="twitter:description"', desc);
    html = setContent(html, 'name="twitter:image"', img);
    const dir = path.join(gDir, g.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    made++;
  }

  // site-level default card: a montage of a dozen covers
  const picks = list.filter(coverPath).slice(0, 12);
  const cols = 4, rows = 3, cw = W / cols, chh = H / rows, tiles = [];
  for (let i = 0; i < Math.min(picks.length, cols * rows); i++) {
    const b = await sharp(coverPath(picks[i])).resize(Math.round(cw), Math.round(chh), { fit: 'cover' }).toBuffer();
    tiles.push({ input: b, left: Math.round((i % cols) * cw), top: Math.round(Math.floor(i / cols) * chh) });
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 11, g: 11, b: 12 } } })
    .composite(tiles).jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(ogDir, '_default.jpg'));

  console.log(`gen-og: ${made} pre-rendered game pages + cards → ${path.relative(ROOT, outDir)}/{og,g}`);
}

main().catch((e) => { console.warn('gen-og: skipped —', e.message); process.exit(0); });
