// CLI wrapper for a one-off perspective unwarp (the batch path is 13-apply-deproj.js).
//   node scripts/unwarp-face.js <srcImg> <tlx,tly;trx,try;brx,bry;blx,bly> <outW> <outH> <coverRef> <outWebp>
const { deproject } = require('./lib');

const [, , srcImg, quadStr, outW, outH, coverRef, outPath] = process.argv;
const quad = quadStr.split(';').map((p) => p.split(',').map(Number)); // px corners tl,tr,br,bl
deproject(srcImg, quad, +outW, +outH, coverRef, outPath)
  .then(() => console.log('wrote', outPath, `${outW}x${outH}`));
