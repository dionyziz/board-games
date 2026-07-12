// Detect + trim uniform whitespace/letterbox borders on the photographic faces
// (front cover, back, spine) so the art fills the box face with no empty margin.
// Uses sharp's border-trim (matches the corner colour within a threshold), so it
// only ever removes a uniform frame — it never crops into real content. The
// trimmed content is refit to the face's texture size. Generated faces (procedural
// spine, cover-derived top/bottom) are skipped — their layout is intentional.
//
//   node scripts/12-trim-whitespace.js [--apply] [gameId]
// Without --apply it only reports; with --apply it rewrites the .webp in place.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const apply = process.argv.includes('--apply');
const only = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/games.json'), 'utf8'));
const list = (Array.isArray(games) ? games : games.games).filter((g) => !only || g.id === only);

const PHOTO = new Set(['airtable', 'bgg-hires', 'photo']); // faces that can carry scan/photo whitespace
const MIN = 0.04, MAX = 0.55; // trim only a meaningful-but-not-destructive border

(async () => {
  const hits = [];
  for (const g of list) {
    for (const face of ['front', 'back', 'spine']) {
      const t = g.textures && g.textures[face];
      if (!t || !PHOTO.has(t.source)) continue;
      const file = path.join(ROOT, 'public', t.src.replace(/^\//, ''));
      if (!fs.existsSync(file)) continue;
      try {
        const input = fs.readFileSync(file); // buffer so we can rewrite in place safely
        const meta = await sharp(input).metadata();
        const { info } = await sharp(input).trim({ threshold: 14 }).toBuffer({ resolveWithObject: true });
        const removed = 1 - (info.width * info.height) / (meta.width * meta.height);
        if (removed > MIN && removed < MAX) {
          hits.push({ id: g.id, face, removed, w: meta.width, h: meta.height });
          if (apply) {
            await sharp(input)
              .trim({ threshold: 14 })
              .resize(meta.width, meta.height, { fit: 'fill' }) // refit content to the same face-texture size
              .webp({ quality: face === 'front' ? 82 : 86, effort: 4 })
              .toFile(file);
          }
        }
      } catch (e) { /* skip unreadable */ }
    }
  }
  hits.sort((a, b) => b.removed - a.removed);
  console.log(`${apply ? 'TRIMMED' : 'would trim'} ${hits.length} face(s):`);
  for (const h of hits.slice(0, 40)) console.log(`  ${(h.removed * 100).toFixed(0)}%  ${h.id}  [${h.face}]`);
  if (hits.length > 40) console.log(`  … +${hits.length - 40} more`);
})();
