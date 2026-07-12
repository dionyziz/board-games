// Generate the box TOP and BOTTOM faces as darkened, blurred bands of the real
// cover art (used when no photographic top/bottom exists — the common case):
//   top    -> cover-art band + title (accent stripe on top edge)
//   bottom -> darker cover-art band + real EAN-13 barcode + legal line
// Each also gets a dedicated text bump map. Skips a face already set to a real
// photo by 10-gen-faces.
//   node scripts/gen-top-band.js <gameId>
const L = require('./lib');
const { fs, path, sharp, esc, cleanPub, accentFromCover, writeBump, coverBand, barcodeSVG, loadGames, saveGames, texDir } = L;

const gameId = process.argv[2] || 'the-lord-of-the-rings-fate-of-the-fellowship-436217';
const { games, list } = loadGames();
const g = list.find((x) => x.id === gameId);
if (!g) throw new Error('game not found: ' + gameId);
const dir = texDir(g.id);

(async () => {
  const W = Math.round((g.box.face?.w || g.box.size.w) * 40);
  const H = Math.round((g.box.face?.d || g.box.size.d) * 40);
  const accent = await accentFromCover(dir);
  const title = esc(g.title);
  const darkGrad = `<defs><linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.15"/><stop offset="0.5" stop-color="#000" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.15"/></linearGradient></defs>`;
  const keepTB = (f) => g.textures && g.textures[f] && g.textures[f].source === 'photo' && fs.existsSync(path.join(dir, f + '.webp'));
  const compose = (band, svg, out) => sharp(band).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).webp({ quality: 88, effort: 4 }).toFile(out);

  // ---- TOP: cover-art band + title ----------------------------------------
  if (!keepTB('top')) {
    const band = await coverBand(dir, W, H, 0.5, 0.5, 3);
    const font = Math.min(64, Math.floor((W * 0.82) / (0.5 * title.length)));
    const t = (fill, extra) => `<text x="${W / 2}" y="${H * 0.57}" fill="${fill}" font-family="Georgia, serif" font-weight="500" font-size="${font}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1"${extra || ''}>${title}</text>`;
    await compose(band, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${darkGrad}
      <rect width="${W}" height="${H}" fill="url(#v)"/><rect x="${W * 0.04}" y="0" width="${W * 0.92}" height="${H * 0.06}" fill="${accent}"/>
      ${t('#f3efe6', ' style="paint-order:stroke;stroke:#000;stroke-width:3;stroke-opacity:0.5"')}</svg>`, path.join(dir, 'top.webp'));
    await writeBump(t('#ffffff'), W, H, path.join(dir, 'top-bump.webp'));
  }

  // ---- BOTTOM: darker cover-art band + barcode + legal --------------------
  if (!keepTB('bottom')) {
    const band = await coverBand(dir, W, H, 0.72, 0.3, 5);
    const cr = ['©', g.year || '', cleanPub(g.publishers)].filter(Boolean).join(' ');
    const legal = esc([cr === '©' ? '' : cr, g.title].filter(Boolean).join('   ·   '));
    const legalX = W * 0.37, legalFont = Math.min(Math.round(H * 0.19), Math.floor((W * 0.96 - legalX) / (0.5 * legal.length)));
    const t = (fill, extra) => `<text x="${legalX}" y="${H * 0.54}" fill="${fill}" font-family="Georgia, serif" font-size="${legalFont}" dominant-baseline="middle"${extra || ''}>${legal}</text>`;
    await compose(band, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${darkGrad}
      <rect width="${W}" height="${H}" fill="url(#v)"/><rect x="${W * 0.04}" y="${H * 0.94}" width="${W * 0.92}" height="${H * 0.06}" fill="${accent}"/>
      ${barcodeSVG(W * 0.05, H * 0.24, W * 0.26, H * 0.4, g.bggId || 1)}
      ${t('#d7d1c4', ' style="paint-order:stroke;stroke:#000;stroke-width:2;stroke-opacity:0.5"')}</svg>`, path.join(dir, 'bottom.webp'));
    await writeBump(`${barcodeSVG(W * 0.05, H * 0.24, W * 0.26, H * 0.4, g.bggId || 1, 'bump')}${t('#dddddd')}`, W, H, path.join(dir, 'bottom-bump.webp'));
  }

  g.textures = g.textures || {};
  if (!keepTB('top')) g.textures.top = { src: `/textures/${g.id}/top.webp`, source: 'cover-derived', bump: `/textures/${g.id}/top-bump.webp`, note: 'darkened cover-art band + title (no photo of top exists)' };
  if (!keepTB('bottom')) g.textures.bottom = { src: `/textures/${g.id}/bottom.webp`, source: 'cover-derived', bump: `/textures/${g.id}/bottom-bump.webp`, note: 'darkened cover-art band + barcode + legal (no photo of bottom exists)' };
  saveGames(games);
  console.log('wrote top + bottom', W + 'x' + H, 'accent', accent);
})();
