// Social-media link previews (Open Graph / Twitter cards).
//
// The app is a hash-routed SPA on GitHub Pages, so deep links look like
// `…/#/game/<id>` — but link-preview crawlers don't run JS or read the hash, so
// they'd only ever see the site-level card. To give every game a correct preview
// (its cover as the image + its title/description), we PRE-RENDER one tiny static
// page per game at `/g/<id>/` carrying that game's OG tags, which then redirects a
// real browser into the SPA. Share `https://<domain>/g/<id>/` and the unfurl is
// correct; the visitor lands on `#/game/<id>`.
//
// Outputs (into the deploy dir, default dist/ — regenerated on every build, never
// committed): `og/<id>.jpg` 1200×630 preview images, `og/_default.jpg` (site card),
// and `g/<id>/index.html` redirect stubs.
//
//   node scripts/gen-og.js [outDir=dist]
const L = require('./lib');
const { fs, path, sharp, ROOT } = L;

async function main() {
  const outDir = path.resolve(ROOT, process.argv[2] || 'dist');
  if (!fs.existsSync(outDir)) { console.warn(`gen-og: ${outDir} missing (run vite build first) — skipping`); return; }
  const domain = 'https://' + fs.readFileSync(path.join(ROOT, 'public', 'CNAME'), 'utf8').trim();
  const { list } = L.loadGames();

  const ogDir = path.join(outDir, 'og'), gDir = path.join(outDir, 'g');
  fs.mkdirSync(ogDir, { recursive: true });

  const W = 1200, H = 630;
  const coverPath = (g) => {
    for (const p of [path.join(L.TEX, g.id, 'cover.webp'), path.join(L.TEX, g.id, 'thumb.webp'), path.join(L.COVERS, g.id + '.jpg')])
      if (fs.existsSync(p)) return p;
    return null;
  };

  // strip HTML/entities and clamp for an attribute-safe, tweet-length description
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

    const title = L.esc(g.title), desc = L.esc(summary(g)), img = `${domain}/og/${g.id}.jpg`;
    const rel = '../../#/game/' + encodeURIComponent(g.id); // base-agnostic redirect into the SPA
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Jason's Board Games</title>
<meta name="description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Jason's Board Games">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="${W}"><meta property="og:image:height" content="${H}">
<meta property="og:url" content="${domain}/g/${encodeURIComponent(g.id)}/">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${img}">
<link rel="canonical" href="${domain}/#/game/${encodeURIComponent(g.id)}">
<script>location.replace(${JSON.stringify(rel)})</script>
<meta http-equiv="refresh" content="0;url=${rel}">
</head><body style="background:#0b0b0c;color:#e9e6df;font-family:sans-serif">
Redirecting to <a href="${rel}">${title}</a>…</body></html>`;
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

  console.log(`gen-og: ${made} game cards + site card → ${path.relative(ROOT, outDir)}/{og,g}`);
}

main().catch((e) => { console.warn('gen-og: skipped —', e.message); process.exit(0); });
