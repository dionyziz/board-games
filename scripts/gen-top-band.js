// Generate the box TOP face as a darkened, blurred band of the real cover art
// with the title overlaid. Used when no photographic top exists (the common
// case — box tops/bottoms are almost never photographed). Uses the front cover
// as its source, so it stays tonally consistent with the photographic faces.
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

(async () => {
  // face aspect w:d (wide, short); render at 40 px/cm
  const W = Math.round((g.box.face?.w || g.box.size.w) * 40);
  const H = Math.round((g.box.face?.d || g.box.size.d) * 40);
  const accent = await accentFromCover();
  const title = esc(g.title);
  const rb = await sharp(path.join(dir, 'cover.webp')).resize({ width: W }).toBuffer({ resolveWithObject: true });
  const top = Math.max(0, Math.round(rb.info.height * 0.5) - Math.round(H / 2));
  const h = Math.min(H, rb.info.height - top);
  const band = await sharp(rb.data).extract({ left: 0, top, width: W, height: h })
    .resize(W, H, { fit: 'fill' }).modulate({ brightness: 0.5 }).blur(3).toBuffer();
  const font = Math.min(64, Math.floor(W * 0.82 / (0.5 * title.length)));
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.15"/>
      <stop offset="0.5" stop-color="#000" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.15"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#v)"/>
    <rect x="${W * 0.04}" y="0" width="${W * 0.92}" height="${H * 0.06}" fill="${accent}"/>
    <text x="${W / 2}" y="${H * 0.57}" fill="#f3efe6" font-family="Georgia, serif" font-weight="500"
      font-size="${font}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1"
      style="paint-order:stroke;stroke:#000;stroke-width:3;stroke-opacity:0.5">${title}</text>
  </svg>`);
  await sharp(band).composite([{ input: overlay, top: 0, left: 0 }]).webp({ quality: 88, effort: 4 }).toFile(path.join(dir, 'top.webp'));
  console.log('wrote top.webp', W + 'x' + H, 'accent', accent);
})();
