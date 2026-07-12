// Build a complete, correctly-oriented 6-face texture set for a single game.
//   node scripts/10-gen-faces.js <gameId> [pathToBackPhoto] [--force]
//
// IDEMPOTENT: a face whose current textures.<face>.source is `photo` or
// `cover-derived` is PRESERVED (its .webp + data entry untouched) so batch
// re-runs never clobber upgrades with the procedural fallback. --force
// regenerates everything. (box.face / box.orientation are always recomputed.)
const L = require('./lib');
const { fs, path, PX, esc, cleanPub, mix, fitFont, accentFromCover, svgToWebp, writeBump, channelStats, makePhotoFace, loadGames, saveGames, texDir, GALLERY } = L;

const argv = process.argv.slice(2).filter((a) => a !== '--force');
const force = process.argv.includes('--force');
const gameId = argv[0] || 'the-lord-of-the-rings-fate-of-the-fellowship-436217';
const backPhoto = argv[1];

const { games, list } = loadGames();
const g = list.find((x) => x.id === gameId);
if (!g) throw new Error('game not found: ' + gameId);
const dir = texDir(g.id);
fs.mkdirSync(dir, { recursive: true });

// ---- 1. orientation: the front face must follow the cover art aspect --------
const size = g.box.size;
const [a, b, c] = [size.w, size.h, size.d].sort((x, y) => y - x); // a>=b>=c ; c = thickness
const coverAspect = (g.imageWidth || 1) / (g.imageHeight || 1);
const nearSquare = Math.abs(coverAspect - 1) < 0.05;
const landscape = coverAspect >= 1;
const face = nearSquare ? { w: size.w, h: size.h, d: size.d } : landscape ? { w: a, h: b, d: c } : { w: b, h: a, d: c };
const orientation = nearSquare ? 'square' : landscape ? 'landscape' : 'portrait';

let REF = null; // front-cover stats (reference, never modified)

// ---- photographic candidates chosen by 8-fetch-gallery.js (per face) -------
let galleryChosen = {};
const galleryFile = path.join(GALLERY, g.id, 'gallery.json');
if (fs.existsSync(galleryFile)) { try { galleryChosen = JSON.parse(fs.readFileSync(galleryFile, 'utf8')).chosen || {}; } catch (e) {} }
const photoFor = (facek) => {
  if (facek === 'back' && backPhoto) return fs.existsSync(backPhoto) ? backPhoto : null;
  const ch = galleryChosen[facek];
  return ch && ch.file && fs.existsSync(ch.file) ? ch.file : null;
};

// ---- tier-aware idempotency guard (photo > cover-derived > procedural) ------
const prevTex = g.textures || {};
const kept = {}, sources = {}, normalized = {}, bumps = {};
const keepFace = (name) => {
  if (force) return false;
  const e = prevTex[name];
  if (!e || !fs.existsSync(path.join(dir, name + '.webp'))) return false;
  if (e.source === 'photo') return true;
  if (e.source === 'cover-derived') return !photoFor(name);
  return false;
};
const P = (f) => Math.round(f * PX);

// ---- 2. back: photo (cropped + normalized) if available, else procedural ----
async function makeBack() {
  if (keepFace('back')) { kept.back = true; return; }
  const out = path.join(dir, 'back.webp');
  const src = photoFor('back');
  if (src) { await makePhotoFace(src, P(face.w), P(face.h), out, REF); sources.back = 'photo'; normalized.back = true; return; }
  const W = P(face.w), H = P(face.h), words = esc(g.shortDescription || g.title);
  await svgToWebp(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${g.box.edgeColor}"/>
    <text x="${W / 2}" y="${H / 2}" fill="#cfc9bd" font-family="Georgia, serif" font-size="${fitFont(words, W * 0.9, 34)}" text-anchor="middle">${words}</text></svg>`, W, H, out);
  sources.back = 'procedural';
}

// ---- 3. spine (long side): title-on-a-band, the shelf-view hero -------------
async function makeSpine(accent) {
  if (keepFace('spine')) { kept.spine = true; return; }
  const out = path.join(dir, 'spine.webp');
  const W = P(face.d), H = P(face.h);
  const photo = photoFor('spine');
  if (photo) { await makePhotoFace(photo, W, H, out, REF); sources.spine = 'photo'; normalized.spine = true; return; }
  const title = esc(g.title), pub = esc(cleanPub(g.publishers)), font = fitFont(g.title, H * 0.8, W * 0.5), cx = W / 2;
  const pubFont = Math.round(W * 0.16);
  await svgToWebp(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g.box.sideColor}"/><stop offset="1" stop-color="${mix(g.box.sideColor, g.box.edgeColor, 0.9)}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="0" y="${H * 0.06}" width="${W * 0.09}" height="${H * 0.88}" fill="${accent}"/>
    <g transform="translate(${cx}, ${H / 2}) rotate(-90)"><text x="0" y="0" fill="#efeadf" font-family="Georgia, serif" font-weight="500" font-size="${font}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">${title}</text></g>
    <g transform="translate(${W * 0.82}, ${H / 2}) rotate(-90)"><text x="0" y="0" fill="#9c968a" font-family="Georgia, serif" font-size="${pubFont}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">${pub}</text></g></svg>`, W, H, out);
  await writeBump(`<g transform="translate(${cx}, ${H / 2}) rotate(-90)"><text x="0" y="0" fill="#ffffff" font-family="Georgia, serif" font-weight="500" font-size="${font}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">${title}</text></g>
    <g transform="translate(${W * 0.82}, ${H / 2}) rotate(-90)"><text x="0" y="0" fill="#8a8a8a" font-family="Georgia, serif" font-size="${pubFont}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">${pub}</text></g>`, W, H, path.join(dir, 'spine-bump.webp'));
  sources.spine = 'procedural'; bumps.spine = true;
}

// ---- 4. top (short side): same band, title horizontal -----------------------
async function makeTop(accent) {
  if (keepFace('top')) { kept.top = true; return; }
  const out = path.join(dir, 'top.webp');
  const W = P(face.w), H = P(face.d);
  const photo = photoFor('top');
  if (photo) { await makePhotoFace(photo, W, H, out, REF); sources.top = 'photo'; normalized.top = true; return; }
  const title = esc(g.title), font = fitFont(g.title, W * 0.82, H * 0.5);
  const txt = (fill) => `<text x="${W / 2}" y="${H * 0.58}" fill="${fill}" font-family="Georgia, serif" font-weight="500" font-size="${font}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">${title}</text>`;
  await svgToWebp(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g.box.sideColor}"/><stop offset="1" stop-color="${mix(g.box.sideColor, g.box.edgeColor, 0.9)}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="${W * 0.04}" y="0" width="${W * 0.92}" height="${H * 0.08}" fill="${accent}"/>${txt('#efeadf')}</svg>`, W, H, out);
  await writeBump(txt('#ffffff'), W, H, path.join(dir, 'top-bump.webp'));
  sources.top = 'procedural'; bumps.top = true;
}

// ---- 5. bottom: edge color + faint barcode + legal line ---------------------
async function makeBottom() {
  if (keepFace('bottom')) { kept.bottom = true; return; }
  const out = path.join(dir, 'bottom.webp');
  const W = P(face.w), H = P(face.d);
  const photo = photoFor('bottom');
  if (photo) { await makePhotoFace(photo, W, H, out, REF); sources.bottom = 'photo'; normalized.bottom = true; return; }
  let bars = '', x = W * 0.06; const seed = g.bggId || 1;
  for (let i = 0; x < W * 0.34; i++) { const w = 2 + ((seed >> (i % 12)) & 3); if (i % 2 === 0) bars += `<rect x="${x.toFixed(1)}" y="${H * 0.3}" width="${w}" height="${H * 0.4}" fill="#2b2620"/>`; x += w + 2; }
  const cr = ['©', g.year || '', cleanPub(g.publishers)].filter(Boolean).join(' ');
  const legal = esc([cr === '©' ? '' : cr, g.title].filter(Boolean).join(' · '));
  const txt = (fill) => `<text x="${W * 0.4}" y="${H * 0.56}" fill="${fill}" font-family="Georgia, serif" font-size="${Math.round(H * 0.22)}" dominant-baseline="middle">${legal}</text>`;
  await svgToWebp(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${g.box.edgeColor}"/>${bars}${txt('#6f685c')}</svg>`, W, H, out);
  await writeBump(`${bars.replace(/fill="#2b2620"/g, 'fill="#ffffff"')}${txt('#dddddd')}`, W, H, path.join(dir, 'bottom-bump.webp'));
  sources.bottom = 'procedural'; bumps.bottom = true;
}

(async () => {
  const coverPath = path.join(dir, 'cover.webp');
  REF = fs.existsSync(coverPath) ? await channelStats(coverPath) : null;
  const accent = await accentFromCover(dir);
  await Promise.all([makeBack(), makeSpine(accent), makeTop(accent), makeBottom()]);

  const buildFace = (name, source) => kept[name]
    ? prevTex[name]
    : { src: `/textures/${g.id}/${name}.webp`, source, ...(normalized[name] ? { normalized: true } : {}), ...(bumps[name] ? { bump: `/textures/${g.id}/${name}-bump.webp` } : {}) };
  g.box.face = { w: face.w, h: face.h, d: face.d };
  g.box.orientation = orientation;
  g.textures = {
    front: { src: `/textures/${g.id}/cover.webp`, source: prevTex.front?.source || 'airtable' },
    back: buildFace('back', sources.back), spine: buildFace('spine', sources.spine),
    top: buildFace('top', sources.top), bottom: buildFace('bottom', sources.bottom),
    thumb: { src: `/textures/${g.id}/thumb.webp`, source: 'derived' },
  };
  saveGames(games);

  const summary = { back: sources.back, spine: sources.spine, top: sources.top, bottom: sources.bottom };
  for (const k of Object.keys(kept)) summary[k] = prevTex[k].source + ' (kept)';
  console.log('done:', g.id, force ? '[--force]' : '', '| orient', orientation, '| accent', accent);
  console.log('  faces:', JSON.stringify(summary));
})();
