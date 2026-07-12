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

  // ---- TOP: cover-art band + title ----------------------------------------
  {
    const band = await coverBand(W, H, 0.5, 0.5, 3);
    const font = Math.min(64, Math.floor(W * 0.82 / (0.5 * title.length)));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${darkGrad}
      <rect width="${W}" height="${H}" fill="url(#v)"/>
      <rect x="${W * 0.04}" y="0" width="${W * 0.92}" height="${H * 0.06}" fill="${accent}"/>
      <text x="${W / 2}" y="${H * 0.57}" fill="#f3efe6" font-family="Georgia, serif" font-weight="500"
        font-size="${font}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1"
        style="paint-order:stroke;stroke:#000;stroke-width:3;stroke-opacity:0.5">${title}</text></svg>`;
    await sharp(band).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).webp({ quality: 88, effort: 4 }).toFile(path.join(dir, 'top.webp'));
  }

  // ---- BOTTOM: darker cover-art band + barcode + legal --------------------
  {
    const band = await coverBand(W, H, 0.72, 0.3, 5); // dimmer + softer -> reads as underside
    const seed = g.bggId || 1;
    let bars = '', x = W * 0.06;
    for (let i = 0; x < W * 0.30; i++) {
      const bw = 2 + ((seed >> (i % 12)) & 3);
      if (i % 2 === 0) bars += `<rect x="${x.toFixed(1)}" y="${H * 0.28}" width="${bw}" height="${H * 0.44}" fill="#e9e4d8"/>`;
      x += bw + 2;
    }
    const legal = esc(`© ${g.year || ''} ${(g.publishers && g.publishers[0]) || ''} · ${g.title}`);
    const legalX = W * 0.36, legalW = W * 0.96 - legalX; // fit between barcode and right margin
    const legalFont = Math.min(Math.round(H * 0.2), Math.floor(legalW / (0.5 * legal.length)));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${darkGrad}
      <rect width="${W}" height="${H}" fill="url(#v)"/>
      <rect x="${W * 0.04}" y="${H * 0.94}" width="${W * 0.92}" height="${H * 0.06}" fill="${accent}"/>
      <rect x="${W * 0.045}" y="${H * 0.22}" width="${W * 0.27}" height="${H * 0.56}" rx="6" fill="#0d0b08" opacity="0.55"/>
      ${bars}
      <text x="${legalX}" y="${H * 0.54}" fill="#d7d1c4" font-family="Georgia, serif"
        font-size="${legalFont}" dominant-baseline="middle"
        style="paint-order:stroke;stroke:#000;stroke-width:2;stroke-opacity:0.5">${legal}</text></svg>`;
    await sharp(band).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).webp({ quality: 88, effort: 4 }).toFile(path.join(dir, 'bottom.webp'));
  }

  // update provenance so the faces are tagged cover-derived (and thus protected
  // by 10-gen-faces.js's idempotency guard on future re-runs)
  g.textures = g.textures || {};
  g.textures.top = { src: `/textures/${g.id}/top.webp`, source: 'cover-derived', note: 'darkened cover-art band + title (no photo of top exists)' };
  g.textures.bottom = { src: `/textures/${g.id}/bottom.webp`, source: 'cover-derived', note: 'darkened cover-art band + barcode + legal (no photo of bottom exists)' };
  fs.writeFileSync(path.join(ROOT, 'src/data/games.json'), JSON.stringify(games, null, 2) + '\n');

  console.log('wrote top.webp + bottom.webp', W + 'x' + H, 'accent', accent);
})();
