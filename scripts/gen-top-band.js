// Generate the box TOP and BOTTOM faces as darkened, blurred bands of the real
// cover art (used when no photographic top/bottom exists — the common case; box
// tops/bottoms are almost never photographed). Both derive from the front cover
// so they stay tonally consistent with the photographic faces:
//   top    -> cover-art band + title (accent stripe on top edge)
//   bottom -> darker cover-art band + barcode + legal line (accent on bottom edge)
//   node scripts/gen-top-band.js <gameId>
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const gameId = process.argv[2] || 'the-lord-of-the-rings-fate-of-the-fellowship-436217';
const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/games.json'), 'utf8'));
const list = Array.isArray(games) ? games : games.games;
const g = list.find((x) => x.id === gameId);
if (!g) throw new Error('game not found: ' + gameId);
const dir = path.join(ROOT, 'public/textures', g.id);
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
// first real publisher (BGG stores "(Unknown)" for missing ones — skip those)
const cleanPub = (arr) => (arr || []).find((p) => p && !/^\(unknown\)$/i.test(String(p).trim())) || '';

// ---- a real EAN-13 barcode (correct check digit + L/G/R encoding) ----------
const EAN = {
  L: ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'],
  G: ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'],
  R: ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'],
  P: ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'],
};
function ean13Digits(seed) {
  let d = ('400' + String(seed || 0).padStart(9, '0')).slice(0, 12).split('').map(Number);
  const sum = d.reduce((s, n, i) => s + n * (i % 2 ? 3 : 1), 0);
  d.push((10 - (sum % 10)) % 10);
  return d; // 13 digits
}
function ean13Modules(d) {
  let bits = '101'; // start guard
  const parity = EAN.P[d[0]];
  for (let i = 0; i < 6; i++) bits += EAN[parity[i]][d[1 + i]];
  bits += '01010'; // center guard
  for (let i = 0; i < 6; i++) bits += EAN.R[d[7 + i]];
  bits += '101'; // end guard
  return bits; // 95 modules
}
// SVG barcode with taller guard bars + human-readable digits below.
// mode 'color' = printed barcode; mode 'bump' = white ink on nothing (height map).
function barcodeSVG(x, y, w, h, seed, mode = 'color') {
  const bump = mode === 'bump';
  const ink = bump ? '#ffffff' : '#141414';
  const d = ean13Digits(seed);
  const bits = ean13Modules(d);
  const quiet = 9;
  const mod = w / (bits.length + quiet * 2);
  const guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  let bars = '';
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== '1') continue;
    const bx = x + (quiet + i) * mod;
    const bh = guard.has(i) ? h : h - Math.max(6, h * 0.12);
    bars += `<rect x="${bx.toFixed(2)}" y="${y.toFixed(2)}" width="${(mod * 0.92).toFixed(2)}" height="${bh.toFixed(2)}" fill="${ink}"/>`;
  }
  const digStr = d.join('');
  const fs2 = Math.min(mod * 6, h * 0.3);
  const dy = y + h + fs2 * 0.9;
  const digits = `<text x="${(x + quiet * mod).toFixed(2)}" y="${dy.toFixed(2)}" fill="${bump ? '#cccccc' : '#141414'}" font-family="monospace" font-size="${fs2.toFixed(1)}" letter-spacing="${(mod * 0.7).toFixed(2)}">${digStr[0]}&#160;&#160;${digStr.slice(1, 7)}&#160;&#160;${digStr.slice(7)}</text>`;
  const panel = bump ? '' : `<rect x="${(x - mod * quiet * 0.4).toFixed(2)}" y="${(y - h * 0.14).toFixed(2)}" width="${(w * 1.02).toFixed(2)}" height="${(h * 1.5).toFixed(2)}" rx="4" fill="#f3efe6"/>`;
  return `${panel}${bars}${digits}`;
}
// TEXT/INK bump map: printed elements white on black, softly blurred for a bevel
async function writeBump(inner, w, h, out) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#000000"/>${inner}</svg>`;
  // LOSSLESS (no compression ringing around the high-contrast text edges) + soft bevel
  await sharp(Buffer.from(svg)).resize(w, h).blur(1.8).webp({ lossless: true, effort: 4 }).toFile(out);
}

async function accentFromCover() {
  const { data, info } = await sharp(path.join(dir, 'cover.webp')).resize(48, 48, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  let best = '#eb752e', score = -1;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], gr = data[i + 1], b = data[i + 2], mx = Math.max(r, gr, b), mn = Math.min(r, gr, b);
    const s = (mx === 0 ? 0 : (mx - mn) / mx) * (mx / 255);
    if (s > score) { score = s; best = '#' + [r, gr, b].map((c) => c.toString(16).padStart(2, '0')).join(''); }
  }
  return best;
}

// a darkened/blurred horizontal slice of the cover, sized W x H
async function coverBand(W, H, sliceCenter, brightness, blur) {
  const rb = await sharp(path.join(dir, 'cover.webp')).resize({ width: W }).toBuffer({ resolveWithObject: true });
  const top = Math.max(0, Math.round(rb.info.height * sliceCenter) - Math.round(H / 2));
  const h = Math.min(H, rb.info.height - top);
  return sharp(rb.data).extract({ left: 0, top, width: W, height: h })
    .resize(W, H, { fit: 'fill' }).modulate({ brightness }).blur(blur).toBuffer();
}

(async () => {
  // both faces share the w:d (wide, short) aspect at 40 px/cm
  const W = Math.round((g.box.face?.w || g.box.size.w) * 40);
  const H = Math.round((g.box.face?.d || g.box.size.d) * 40);
  const accent = await accentFromCover();
  const title = esc(g.title);
  const darkGrad = `<defs><linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.15"/>
      <stop offset="0.5" stop-color="#000" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.15"/></linearGradient></defs>`;

  // don't overwrite a face that already has a real photo (set by 10-gen-faces)
  const keepTB = (f) => g.textures && g.textures[f] && g.textures[f].source === 'photo' && fs.existsSync(path.join(dir, f + '.webp'));

  // ---- TOP: cover-art band + title ----------------------------------------
  if (!keepTB('top')) {
    const band = await coverBand(W, H, 0.5, 0.5, 3);
    const font = Math.min(64, Math.floor(W * 0.82 / (0.5 * title.length)));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${darkGrad}
      <rect width="${W}" height="${H}" fill="url(#v)"/>
      <rect x="${W * 0.04}" y="0" width="${W * 0.92}" height="${H * 0.06}" fill="${accent}"/>
      <text x="${W / 2}" y="${H * 0.57}" fill="#f3efe6" font-family="Georgia, serif" font-weight="500"
        font-size="${font}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1"
        style="paint-order:stroke;stroke:#000;stroke-width:3;stroke-opacity:0.5">${title}</text></svg>`;
    await sharp(band).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).webp({ quality: 88, effort: 4 }).toFile(path.join(dir, 'top.webp'));
    await writeBump(`<text x="${W / 2}" y="${H * 0.57}" fill="#ffffff" font-family="Georgia, serif" font-weight="500" font-size="${font}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">${title}</text>`, W, H, path.join(dir, 'top-bump.webp'));
  }

  // ---- BOTTOM: darker cover-art band + real barcode + legal ---------------
  if (!keepTB('bottom')) {
    const band = await coverBand(W, H, 0.72, 0.3, 5); // dimmer + softer -> reads as underside
    const bar = barcodeSVG(W * 0.05, H * 0.24, W * 0.26, H * 0.4, g.bggId || 1);
    // build the legal line from non-empty parts only (skip missing year / "(Unknown)")
    const pub = cleanPub(g.publishers);
    const cr = ['©', g.year || '', pub].filter(Boolean).join(' ');
    const legal = esc([cr === '©' ? '' : cr, g.title].filter(Boolean).join('   ·   '));
    const legalX = W * 0.37, legalW = W * 0.96 - legalX;
    const legalFont = Math.min(Math.round(H * 0.19), Math.floor(legalW / (0.5 * legal.length)));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${darkGrad}
      <rect width="${W}" height="${H}" fill="url(#v)"/>
      <rect x="${W * 0.04}" y="${H * 0.94}" width="${W * 0.92}" height="${H * 0.06}" fill="${accent}"/>
      ${bar}
      <text x="${legalX}" y="${H * 0.54}" fill="#d7d1c4" font-family="Georgia, serif"
        font-size="${legalFont}" dominant-baseline="middle"
        style="paint-order:stroke;stroke:#000;stroke-width:2;stroke-opacity:0.5">${legal}</text></svg>`;
    await sharp(band).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).webp({ quality: 88, effort: 4 }).toFile(path.join(dir, 'bottom.webp'));
    const barB = barcodeSVG(W * 0.05, H * 0.24, W * 0.26, H * 0.4, g.bggId || 1, 'bump');
    await writeBump(`${barB}<text x="${legalX}" y="${H * 0.54}" fill="#dddddd" font-family="Georgia, serif" font-size="${legalFont}" dominant-baseline="middle">${legal}</text>`, W, H, path.join(dir, 'bottom-bump.webp'));
  }

  // update provenance so the faces are tagged cover-derived (and thus protected
  // by 10-gen-faces.js's idempotency guard on future re-runs)
  g.textures = g.textures || {};
  if (!keepTB('top')) g.textures.top = { src: `/textures/${g.id}/top.webp`, source: 'cover-derived', bump: `/textures/${g.id}/top-bump.webp`, note: 'darkened cover-art band + title (no photo of top exists)' };
  if (!keepTB('bottom')) g.textures.bottom = { src: `/textures/${g.id}/bottom.webp`, source: 'cover-derived', bump: `/textures/${g.id}/bottom-bump.webp`, note: 'darkened cover-art band + barcode + legal (no photo of bottom exists)' };
  fs.writeFileSync(path.join(ROOT, 'src/data/games.json'), JSON.stringify(games, null, 2) + '\n');

  console.log('wrote top.webp + bottom.webp', W + 'x' + H, 'accent', accent);
})();
