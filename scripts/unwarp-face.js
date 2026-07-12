// Perspective-unwarp a quad out of an angled photo into a flat face rectangle,
// then photometrically normalize it to the front cover (SIDES-PLAN.md §3–4).
//   node scripts/unwarp-face.js <srcImg> <tlx,tly;trx,try;brx,bry;blx,bly> <outW> <outH> <coverRef> <outWebp>
const sharp = require('sharp');

const [, , srcImg, quadStr, outWs, outHs, coverRef, outPath] = process.argv;
const outW = +outWs, outH = +outHs;
const quad = quadStr.split(';').map((p) => p.split(',').map(Number)); // [tl,tr,br,bl] -> (u,v)=(0,0),(1,0),(1,1),(0,1)

// solve 8x8 for homography H mapping (u,v)->(x,y): x=(h0u+h1v+h2)/(h6u+h7v+1)
function solveH(corr) {
  const A = [], b = [];
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let k = 0; k < 4; k++) {
    const [u, v] = uv[k], [x, y] = corr[k];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  // Gaussian elimination
  for (let i = 0; i < 8; i++) {
    let p = i; for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = 0; r < 8; r++) { if (r === i) continue; const f = A[r][i] / A[i][i]; for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
  }
  return b.map((v, i) => v / A[i][i]);
}

function statsFromRaw(data, ch) {
  const n = data.length / ch, mean = [0, 0, 0], m2 = [0, 0, 0];
  for (let i = 0; i < data.length; i += ch) for (let c = 0; c < 3; c++) mean[c] += data[i + c];
  for (let c = 0; c < 3; c++) mean[c] /= n;
  for (let i = 0; i < data.length; i += ch) for (let c = 0; c < 3; c++) { const d = data[i + c] - mean[c]; m2[c] += d * d; }
  return { mean, std: m2.map((v) => Math.sqrt(v / n)) };
}
function normalizeToward(data, ch, src, ref, strength = 0.8) {
  for (let i = 0; i < data.length; i += ch) for (let c = 0; c < 3; c++) {
    const s = src.std[c] > 1e-3 ? src.std[c] : 1;
    const matched = (data[i + c] - src.mean[c]) * (ref.std[c] / s) + ref.mean[c];
    data[i + c] = Math.max(0, Math.min(255, data[i + c] + (matched - data[i + c]) * strength));
  }
}

(async () => {
  const H = solveH(quad);
  const { data: src, info } = await sharp(srcImg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const SW = info.width, SH = info.height, ch = info.channels;
  const sample = (x, y, out, oi) => {
    x = Math.max(0, Math.min(SW - 1.001, x)); y = Math.max(0, Math.min(SH - 1.001, y));
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
    for (let c = 0; c < 3; c++) {
      const i00 = (y0 * SW + x0) * ch + c, i10 = i00 + ch, i01 = i00 + SW * ch, i11 = i01 + ch;
      out[oi + c] = (src[i00] * (1 - fx) + src[i10] * fx) * (1 - fy) + (src[i01] * (1 - fx) + src[i11] * fx) * fy;
    }
  };
  const dst = Buffer.alloc(outW * outH * 3);
  for (let j = 0; j < outH; j++) for (let i = 0; i < outW; i++) {
    const u = (i + 0.5) / outW, v = (j + 0.5) / outH;
    const den = H[6] * u + H[7] * v + 1;
    sample((H[0] * u + H[1] * v + H[2]) / den, (H[3] * u + H[4] * v + H[5]) / den, dst, (j * outW + i) * 3);
  }
  // normalize to the front cover
  const ref = statsFromRaw((await sharp(coverRef).removeAlpha().raw().toBuffer({ resolveWithObject: true })).data, 3);
  normalizeToward(dst, 3, statsFromRaw(dst, 3), ref, 0.82);
  await sharp(dst, { raw: { width: outW, height: outH, channels: 3 } }).webp({ quality: 86, effort: 4 }).toFile(outPath);
  console.log('wrote', outPath, outW + 'x' + outH);
})();
