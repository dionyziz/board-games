// Shared helpers for the texture pipeline scripts. Everything that was
// copy-pasted across 8/9/10/gen-top-band/unwarp-face/13 lives here.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'src/data/games.json');
const TEX = path.join(ROOT, 'public', 'textures');
const COVERS = path.join(ROOT, 'public', 'covers');
const CACHE = path.join(__dirname, 'bgg-cache');
const GALLERY = path.join(__dirname, 'gallery-cache');
const PX = 40; // px per cm for procedural canvases
const UA = 'Mozilla/5.0 (board-games texture pipeline; contact dionyziz)';

// ---- data ------------------------------------------------------------------
function loadGames() { const games = JSON.parse(fs.readFileSync(DATA, 'utf8')); return { games, list: Array.isArray(games) ? games : games.games }; }
function saveGames(games) { fs.writeFileSync(DATA, JSON.stringify(games, null, 2) + '\n'); }
const texDir = (id) => path.join(TEX, id);

// Merge every out-*.json in a gallery-cache audit dir into a map keyed by id
// (used by the sharded vision audits: _fronts, _flaps, _artcrop, …).
function readAudit(subdir) {
  const dir = path.join(GALLERY, subdir), out = {};
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('out-') && f.endsWith('.json')) {
      try { for (const e of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) out[e.id] = e; } catch (e) {}
    }
  }
  return out;
}

// ---- text / publisher ------------------------------------------------------
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
// first real publisher (BGG stores "(Unknown)" for missing ones — skip those)
const cleanPub = (arr) => (arr || []).find((p) => p && !/^\(unknown\)$/i.test(String(p).trim())) || '';
const fitFont = (text, budget, maxFont) => Math.max(14, Math.min(maxFont, Math.floor(budget / (0.52 * Math.max((text || '').length, 1)))));

// ---- colours ---------------------------------------------------------------
const clampHex = (n) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = ({ r, g, b }) => '#' + [r, g, b].map((v) => clampHex(v).toString(16).padStart(2, '0')).join('');
const hexToRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (h1, h2, t) => { const [r1, g1, b1] = hexToRGB(h1), [r2, g2, b2] = hexToRGB(h2); return toHex({ r: r1 + (r2 - r1) * t, g: g1 + (g2 - g1) * t, b: b1 + (b2 - b1) * t }); };
// vividest (saturated & bright) colour sampled from a cover — used as the accent
async function accentFromCover(dir, fallback = '#b98a3c') {
  const cover = path.join(dir, 'cover.webp');
  if (!fs.existsSync(cover)) return fallback;
  const { data, info } = await sharp(cover).resize(48, 48, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  let best = fallback, score = -1;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const s = (mx === 0 ? 0 : (mx - mn) / mx) * (mx / 255);
    if (s > score) { score = s; best = toHex({ r, g, b }); }
  }
  return best;
}

// ---- svg → webp helpers ----------------------------------------------------
async function svgToWebp(svg, w, h, out) { await sharp(Buffer.from(svg)).resize(w, h).webp({ quality: 88, effort: 4 }).toFile(out); }
// text/ink bump map: printed elements white on black, softly blurred; LOSSLESS
// (no compression ringing around the high-contrast edges)
async function writeBump(inner, w, h, out) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#000000"/>${inner}</svg>`;
  await sharp(Buffer.from(svg)).resize(w, h).blur(1.8).webp({ lossless: true, effort: 4 }).toFile(out);
}
// darkened/blurred horizontal slice of the cover (top/bottom bands)
async function coverBand(dir, W, H, sliceCenter, brightness, blur) {
  const rb = await sharp(path.join(dir, 'cover.webp')).resize({ width: W }).toBuffer({ resolveWithObject: true });
  const top = Math.max(0, Math.round(rb.info.height * sliceCenter) - Math.round(H / 2));
  const h = Math.min(H, rb.info.height - top);
  return sharp(rb.data).extract({ left: 0, top, width: W, height: h }).resize(W, H, { fit: 'fill' }).modulate({ brightness }).blur(blur).toBuffer();
}

// ---- photometric normalization (front cover = reference, never touched) -----
function statsFromRaw(data, ch) {
  const n = data.length / ch, mean = [0, 0, 0], m2 = [0, 0, 0];
  for (let i = 0; i < data.length; i += ch) for (let c = 0; c < 3; c++) mean[c] += data[i + c];
  for (let c = 0; c < 3; c++) mean[c] /= n;
  for (let i = 0; i < data.length; i += ch) for (let c = 0; c < 3; c++) { const d = data[i + c] - mean[c]; m2[c] += d * d; }
  return { mean, std: m2.map((v) => Math.sqrt(v / n)) };
}
async function channelStats(input) { const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return statsFromRaw(data, info.channels); }
function normalizeToward(data, ch, src, ref, strength = 0.82) {
  for (let i = 0; i < data.length; i += ch) for (let c = 0; c < 3; c++) {
    const s = src.std[c] > 1e-3 ? src.std[c] : 1;
    const matched = (data[i + c] - src.mean[c]) * (ref.std[c] / s) + ref.mean[c];
    data[i + c] = Math.max(0, Math.min(255, data[i + c] + (matched - data[i + c]) * strength));
  }
}
// crop a photo to a face rectangle (rotating a strip if orientation differs) and
// normalize it to the reference (front) stats. Used for every photographic face.
async function makePhotoFace(src, targetW, targetH, out, ref) {
  const oriented = await sharp(src, { failOn: 'none' }).rotate().toBuffer();
  const m = await sharp(oriented).metadata();
  let pipe = sharp(oriented);
  if ((targetW >= targetH) !== ((m.width || 1) >= (m.height || 1))) pipe = pipe.rotate(90);
  const { data, info } = await pipe.resize(targetW, targetH, { fit: 'cover', position: 'centre' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (ref) normalizeToward(data, info.channels, statsFromRaw(data, info.channels), ref, 0.82);
  await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).webp({ quality: 86, effort: 4 }).toFile(out);
}

// ---- perspective de-projection (homography) --------------------------------
// solve the 3x3 homography mapping unit-square (u,v) corners -> src (x,y)
function solveH(corr) {
  const A = [], b = [], uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let k = 0; k < 4; k++) {
    const [u, v] = uv[k], [x, y] = corr[k];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  for (let i = 0; i < 8; i++) {
    let p = i; for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = 0; r < 8; r++) { if (r === i) continue; const f = A[r][i] / A[i][i]; for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
  }
  return b.map((v, i) => v / A[i][i]);
}
// unwarp `quad` (4 px corners tl,tr,br,bl) of srcImg into a WxH rectangle and
// normalize to coverRef; write to outWebp.
async function deproject(srcImg, quad, W, H, coverRef, outWebp) {
  const H3 = solveH(quad);
  const { data: src, info } = await sharp(srcImg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const SW = info.width, SH = info.height, ch = info.channels;
  const dst = Buffer.alloc(W * H * 3);
  const sample = (x, y, oi) => {
    x = Math.max(0, Math.min(SW - 1.001, x)); y = Math.max(0, Math.min(SH - 1.001, y));
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
    for (let c = 0; c < 3; c++) {
      const i00 = (y0 * SW + x0) * ch + c, i10 = i00 + ch, i01 = i00 + SW * ch, i11 = i01 + ch;
      dst[oi + c] = (src[i00] * (1 - fx) + src[i10] * fx) * (1 - fy) + (src[i01] * (1 - fx) + src[i11] * fx) * fy;
    }
  };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = (i + 0.5) / W, v = (j + 0.5) / H, den = H3[6] * u + H3[7] * v + 1;
    sample((H3[0] * u + H3[1] * v + H3[2]) / den, (H3[3] * u + H3[4] * v + H3[5]) / den, (j * W + i) * 3);
  }
  const ref = coverRef ? statsFromRaw((await sharp(coverRef).removeAlpha().raw().toBuffer({ resolveWithObject: true })).data, 3) : null;
  if (ref) normalizeToward(dst, 3, statsFromRaw(dst, 3), ref, 0.82);
  await sharp(dst, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 86, effort: 4 }).toFile(outWebp);
}

// ---- EAN-13 barcode --------------------------------------------------------
const EAN = {
  L: ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'],
  G: ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'],
  R: ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'],
  P: ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'],
};
function ean13Digits(seed) {
  const d = ('400' + String(seed || 0).padStart(9, '0')).slice(0, 12).split('').map(Number);
  const sum = d.reduce((s, n, i) => s + n * (i % 2 ? 3 : 1), 0);
  d.push((10 - (sum % 10)) % 10); return d;
}
function ean13Modules(d) {
  let bits = '101'; const parity = EAN.P[d[0]];
  for (let i = 0; i < 6; i++) bits += EAN[parity[i]][d[1 + i]];
  bits += '01010';
  for (let i = 0; i < 6; i++) bits += EAN.R[d[7 + i]];
  return bits + '101';
}
// mode 'color' = printed barcode; 'bump' = white ink on nothing (height map)
function barcodeSVG(x, y, w, h, seed, mode = 'color') {
  const bump = mode === 'bump', ink = bump ? '#ffffff' : '#141414';
  const d = ean13Digits(seed), bits = ean13Modules(d), quiet = 9, mod = w / (bits.length + quiet * 2);
  const guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  let bars = '';
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== '1') continue;
    const bx = x + (quiet + i) * mod, bh = guard.has(i) ? h : h - Math.max(6, h * 0.12);
    bars += `<rect x="${bx.toFixed(2)}" y="${y.toFixed(2)}" width="${(mod * 0.92).toFixed(2)}" height="${bh.toFixed(2)}" fill="${ink}"/>`;
  }
  const dg = d.join(''), fs2 = Math.min(mod * 6, h * 0.3), dy = y + h + fs2 * 0.9;
  const digits = `<text x="${(x + quiet * mod).toFixed(2)}" y="${dy.toFixed(2)}" fill="${bump ? '#cccccc' : '#141414'}" font-family="monospace" font-size="${fs2.toFixed(1)}" letter-spacing="${(mod * 0.7).toFixed(2)}">${dg[0]}&#160;&#160;${dg.slice(1, 7)}&#160;&#160;${dg.slice(7)}</text>`;
  const panel = bump ? '' : `<rect x="${(x - mod * quiet * 0.4).toFixed(2)}" y="${(y - h * 0.14).toFixed(2)}" width="${(w * 1.02).toFixed(2)}" height="${(h * 1.5).toFixed(2)}" rx="4" fill="#f3efe6"/>`;
  return `${panel}${bars}${digits}`;
}

// ---- networking + concurrency ----------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchRetry(url, opts = {}, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, ...(opts.headers || {}) }, ...opts }); if (r.ok) return r; if (r.status === 429 || r.status >= 500) { await sleep(700 * (t + 1)); continue; } return r; }
    catch (e) { await sleep(700 * (t + 1)); }
  }
  return null;
}
async function grabBuffer(url) { const r = await fetchRetry(url); return r ? Buffer.from(await r.arrayBuffer()) : null; }
async function pool(items, concurrency, fn) {
  let idx = 0; const results = [];
  await Promise.all(Array.from({ length: concurrency }, async () => { while (idx < items.length) { const k = idx++; results[k] = await fn(items[k], k); } }));
  return results;
}

module.exports = {
  fs, path, sharp, ROOT, DATA, TEX, COVERS, CACHE, GALLERY, PX, UA,
  loadGames, saveGames, texDir, readAudit,
  esc, cleanPub, fitFont, clampHex, toHex, hexToRGB, mix, accentFromCover,
  svgToWebp, writeBump, coverBand,
  statsFromRaw, channelStats, normalizeToward, makePhotoFace,
  solveH, deproject, ean13Digits, ean13Modules, barcodeSVG,
  sleep, fetchRetry, grabBuffer, pool,
};
