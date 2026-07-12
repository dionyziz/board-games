// Build a complete, correctly-oriented 6-face texture set for a single game
// (see TEXTURE-PLAN.md). Photographic where we have a clean photo (front cover,
// and back if downloaded), procedural fallback for the faces photos never cover
// cleanly (spine / top / bottom).
//
//   node scripts/10-gen-faces.js <gameId> [pathToBackPhoto] [--force]
//
// Writes:
//   public/textures/<id>/back.webp   spine.webp   top.webp   bottom.webp
//   and games.json  ->  box.face, box.orientation, textures{...} (+ per-face source)
//
// IDEMPOTENT: a face whose current textures.<face>.source is `photo` or
// `cover-derived` (a real photo or an art-derived upgrade) is PRESERVED — its
// .webp and data entry are left untouched — so batch re-runs never clobber
// upgrades with the procedural fallback. Pass --force to regenerate everything.
// (box.face / box.orientation are always recomputed; they're deterministic.)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'src/data/games.json');
const TEX = path.join(ROOT, 'public', 'textures');

const argv = process.argv.slice(2).filter((a) => a !== '--force');
const force = process.argv.includes('--force');
const gameId = argv[0] || 'the-lord-of-the-rings-fate-of-the-fellowship-436217';
const backPhoto = argv[1]; // optional flat back-of-box photo

const games = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const list = Array.isArray(games) ? games : games.games;
const g = list.find((x) => x.id === gameId);
if (!g) throw new Error('game not found: ' + gameId);

const dir = path.join(TEX, g.id);
fs.mkdirSync(dir, { recursive: true });

const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

// ---- 1. orientation: the front face must follow the cover art aspect --------
const size = g.box.size;
const [a, b, c] = [size.w, size.h, size.d].sort((x, y) => y - x); // a>=b>=c ; c = thickness
const coverAspect = (g.imageWidth || 1) / (g.imageHeight || 1);
const nearSquare = Math.abs(coverAspect - 1) < 0.05;
// near-square covers give no reliable signal -> keep raw dims (w,h) as-is
const landscape = coverAspect >= 1;
const face = nearSquare
  ? { w: size.w, h: size.h, d: size.d }
  : landscape
    ? { w: a, h: b, d: c }
    : { w: b, h: a, d: c };
const orientation = nearSquare ? 'square' : landscape ? 'landscape' : 'portrait';

// ---- helpers ----------------------------------------------------------------
const PX = 40; // px per cm for procedural canvases
const clampHex = (n) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = ({ r, g, b }) => '#' + [r, g, b].map((v) => clampHex(v).toString(16).padStart(2, '0')).join('');
const mix = (h1, h2, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(h1), [r2, g2, b2] = p(h2);
  return toHex({ r: r1 + (r2 - r1) * t, g: g1 + (g2 - g1) * t, b: b1 + (b2 - b1) * t });
};

// pull a vivid accent from the cover (dominant is often the dark background)
async function accentFromCover() {
  const cover = path.join(dir, 'cover.webp');
  if (!fs.existsSync(cover)) return '#b98a3c';
  const { data, info } = await sharp(cover).resize(48, 48, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  let best = null, bestScore = -1;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], bl = data[i + 2];
    const max = Math.max(r, g, bl), min = Math.min(r, g, bl);
    const sat = max === 0 ? 0 : (max - min) / max;
    const score = sat * (max / 255); // saturated AND bright
    if (score > bestScore) { bestScore = score; best = { r, g, b: bl }; }
  }
  return best ? toHex(best) : '#b98a3c';
}

// fit a single line of text into a length budget (Georgia ~0.5em/char)
const fitFont = (text, lengthBudget, maxFont) =>
  Math.max(14, Math.min(maxFont, Math.floor(lengthBudget / (0.52 * Math.max(text.length, 1)))));

async function svgToWebp(svg, w, h, out) {
  await sharp(Buffer.from(svg)).resize(w, h).webp({ quality: 88, effort: 4 }).toFile(out);
}

// ---- photometric normalization (see SIDES-PLAN.md §4) ----------------------
// The FRONT cover is the reference and is never touched. Every other extracted
// photo is Reinhard-transferred toward the cover's per-channel mean/std so the
// whole box reads with one consistent tone/contrast/temperature.
function statsFromRaw(data, ch) {
  const n = data.length / ch, mean = [0, 0, 0], m2 = [0, 0, 0];
  for (let i = 0; i < data.length; i += ch) for (let c = 0; c < 3; c++) mean[c] += data[i + c];
  for (let c = 0; c < 3; c++) mean[c] /= n;
  for (let i = 0; i < data.length; i += ch) for (let c = 0; c < 3; c++) { const d = data[i + c] - mean[c]; m2[c] += d * d; }
  return { mean, std: m2.map((v) => Math.sqrt(v / n)) };
}
async function channelStats(input) {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return statsFromRaw(data, info.channels);
}
// transfer `data` (raw RGB) toward ref stats; strength<1 keeps some of the
// original so genuine content differences (e.g. a white panel) aren't crushed.
function normalizeToward(data, ch, src, ref, strength = 0.8) {
  for (let i = 0; i < data.length; i += ch) for (let c = 0; c < 3; c++) {
    const s = src.std[c] > 1e-3 ? src.std[c] : 1;
    const matched = (data[i + c] - src.mean[c]) * (ref.std[c] / s) + ref.mean[c];
    data[i + c] = Math.max(0, Math.min(255, data[i + c] + (matched - data[i + c]) * strength));
  }
}

// ---- idempotency guard: never regenerate an upgraded face ------------------
// A face already sourced from a real photo or an art-derived upgrade is kept
// as-is; only procedural/absent faces are (re)generated. --force overrides.
const prevTex = g.textures || {};
const PROTECTED = new Set(['photo', 'cover-derived']);
const kept = {};
const keepFace = (name) => {
  if (force) return false;
  const e = prevTex[name];
  return !!(e && PROTECTED.has(e.source) && fs.existsSync(path.join(dir, name + '.webp')));
};

// ---- 2. back: real photo (cropped + normalized) if provided, else procedural
const sources = {};
const normalized = {};
async function makeBack(refStats) {
  if (keepFace('back')) { kept.back = true; return; }
  const out = path.join(dir, 'back.webp');
  const faceAspect = face.w / face.h;
  if (backPhoto && fs.existsSync(backPhoto)) {
    const meta = await sharp(backPhoto).metadata();
    const long = Math.max(meta.width, meta.height);
    const scale = long > 1024 ? 1024 / long : 1;
    const w = Math.round(meta.width * scale);
    const { data, info } = await sharp(backPhoto)
      .resize(w, Math.round(meta.height * scale))
      // center-crop to the exact back-face aspect (front == back dims)
      .resize({ width: w, height: Math.round(w / faceAspect), fit: 'cover', position: 'centre' })
      .removeAlpha().raw().toBuffer({ resolveWithObject: true });
    normalizeToward(data, info.channels, statsFromRaw(data, info.channels), refStats, 0.82);
    await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .webp({ quality: 84, effort: 4 }).toFile(out);
    sources.back = 'photo';
    normalized.back = true;
    return;
  }
  // procedural: darkened cover backdrop + description
  const W = Math.round(face.w * PX), H = Math.round(face.h * PX);
  const words = esc((g.shortDescription || g.title));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${g.box.edgeColor}"/>
    <text x="${W / 2}" y="${H / 2}" fill="#cfc9bd" font-family="Georgia, serif" font-size="${fitFont(words, W * 0.9, 34)}"
      text-anchor="middle">${words}</text></svg>`;
  await svgToWebp(svg, W, H, out);
  sources.back = 'procedural';
}

// ---- 3. spine (long side): title-on-a-band, the hero of the shelf view -------
async function makeSpine(accent) {
  if (keepFace('spine')) { kept.spine = true; return; }
  const out = path.join(dir, 'spine.webp');
  const W = Math.round(face.d * PX), H = Math.round(face.h * PX); // tall, narrow
  const title = esc(g.title);
  const pub = esc((g.publishers && g.publishers[0]) || '');
  const font = fitFont(g.title, H * 0.8, W * 0.5);
  const cx = W / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${g.box.sideColor}"/>
      <stop offset="1" stop-color="${mix(g.box.sideColor, g.box.edgeColor, 0.9)}"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="0" y="${H * 0.06}" width="${W * 0.09}" height="${H * 0.88}" fill="${accent}"/>
    <g transform="translate(${cx}, ${H / 2}) rotate(-90)">
      <text x="0" y="0" fill="#efeadf" font-family="Georgia, serif" font-weight="500"
        font-size="${font}" text-anchor="middle" dominant-baseline="middle"
        letter-spacing="1">${title}</text>
    </g>
    <g transform="translate(${W * 0.82}, ${H / 2}) rotate(-90)">
      <text x="0" y="0" fill="#9c968a" font-family="Georgia, serif" font-size="${Math.round(W * 0.16)}"
        text-anchor="middle" dominant-baseline="middle" letter-spacing="1">${pub}</text>
    </g></svg>`;
  await svgToWebp(svg, W, H, out);
  sources.spine = 'procedural';
}

// ---- 4. top (short side): same band, title horizontal -----------------------
async function makeTop(accent) {
  if (keepFace('top')) { kept.top = true; return; }
  const out = path.join(dir, 'top.webp');
  const W = Math.round(face.w * PX), H = Math.round(face.d * PX); // wide, short
  const title = esc(g.title);
  const font = fitFont(g.title, W * 0.82, H * 0.5);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${g.box.sideColor}"/>
      <stop offset="1" stop-color="${mix(g.box.sideColor, g.box.edgeColor, 0.9)}"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="${W * 0.04}" y="0" width="${W * 0.92}" height="${H * 0.08}" fill="${accent}"/>
    <text x="${W / 2}" y="${H * 0.58}" fill="#efeadf" font-family="Georgia, serif" font-weight="500"
      font-size="${font}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">${title}</text>
  </svg>`;
  await svgToWebp(svg, W, H, out);
  sources.top = 'procedural';
}

// ---- 5. bottom: edge color + faint barcode + legal-ish line ------------------
async function makeBottom() {
  if (keepFace('bottom')) { kept.bottom = true; return; }
  const out = path.join(dir, 'bottom.webp');
  const W = Math.round(face.w * PX), H = Math.round(face.d * PX);
  let bars = '';
  let x = W * 0.06;
  const seed = g.bggId || 1;
  for (let i = 0; x < W * 0.34; i++) {
    const w = 2 + ((seed >> (i % 12)) & 3);
    if (i % 2 === 0) bars += `<rect x="${x.toFixed(1)}" y="${H * 0.3}" width="${w}" height="${H * 0.4}" fill="#2b2620"/>`;
    x += w + 2;
  }
  const legal = esc(`© ${g.year || ''} ${(g.publishers && g.publishers[0]) || ''} · ${g.title}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${g.box.edgeColor}"/>
    ${bars}
    <text x="${W * 0.4}" y="${H * 0.56}" fill="#6f685c" font-family="Georgia, serif"
      font-size="${Math.round(H * 0.22)}" dominant-baseline="middle">${legal}</text>
  </svg>`;
  await svgToWebp(svg, W, H, out);
  sources.bottom = 'procedural';
}

(async () => {
  // front cover = the reference; compute its stats and never modify it
  const refStats = await channelStats(path.join(dir, 'cover.webp'));
  const accent = await accentFromCover();
  await Promise.all([makeBack(refStats), makeSpine(accent), makeTop(accent), makeBottom()]);

  // ---- 6. write data model back -------------------------------------------
  // kept faces keep their existing entry verbatim; regenerated faces get a fresh one
  const buildFace = (name, source) => kept[name]
    ? prevTex[name]
    : { src: `/textures/${g.id}/${name}.webp`, source, ...(normalized[name] ? { normalized: true } : {}) };
  g.box.face = { w: face.w, h: face.h, d: face.d };
  g.box.orientation = orientation;
  g.textures = {
    front: { src: `/textures/${g.id}/cover.webp`, source: prevTex.front?.source || 'airtable' },
    back: buildFace('back', sources.back),
    spine: buildFace('spine', sources.spine),
    top: buildFace('top', sources.top),
    bottom: buildFace('bottom', sources.bottom),
    thumb: { src: `/textures/${g.id}/thumb.webp`, source: 'derived' },
  };
  fs.writeFileSync(DATA, JSON.stringify(games, null, 2) + '\n');

  const summary = { back: sources.back, spine: sources.spine, top: sources.top, bottom: sources.bottom };
  for (const k of Object.keys(kept)) summary[k] = prevTex[k].source + ' (kept)';
  console.log('done:', g.id, force ? '[--force]' : '');
  console.log('  orientation:', orientation, '| face', JSON.stringify(g.box.face), '| accent', accent);
  console.log('  faces:', JSON.stringify(summary));
})();
