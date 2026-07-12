// Discover + download box-face candidate photos from the BGG user gallery
// (see BOX-ART-PIPELINE.md §3). Fully automated: fetch the gallery, score every
// image per face by caption + heuristics, and auto-download+validate the best
// photo for EACH face (back, spine, top, bottom) the same way. A face is only
// accepted if the downloaded image passes a geometry check for that face:
//   back            -> flat, aspect ~ the front cover
//   spine/top/bottom -> a long thin strip (elongated), i.e. a real edge photo
// Angled 3/4 box shots fail the strip check and are left to the generated
// fallback (procedural spine / cover-derived top+bottom).
//
//   node scripts/8-fetch-gallery.js <gameId> [--refresh]
//
// Emits: BACK=<path> SPINE=<path> TOP=<path> BOTTOM=<path>  (empty if none)
// Writes: scripts/gallery-cache/<id>/{gallery.json, <face>-src.<ext>}
// Incremental: reuses cached gallery candidates; only decides faces not yet decided.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, 'gallery-cache');
const UA = 'Mozilla/5.0 (board-games texture pipeline; contact dionyziz)';
const PAGES = 5;
const FACES = ['back', 'spine', 'top', 'bottom'];

const refresh = process.argv.includes('--refresh');
const gameId = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/games.json'), 'utf8'));
const list = Array.isArray(games) ? games : games.games;
const g = list.find((x) => x.id === gameId);
if (!g) { console.error('game not found: ' + gameId); process.exit(1); }

const dir = path.join(CACHE, g.id);
fs.mkdirSync(dir, { recursive: true });
const galleryFile = path.join(dir, 'gallery.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchRetry(url, opts, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url, opts);
      if (r.ok) return r;
      if (r.status === 429 || r.status >= 500) { await sleep(800 * (t + 1)); continue; }
      return r;
    } catch (e) { await sleep(800 * (t + 1)); }
  }
  return null;
}

const BAD = /(gameplay|game ?state|setup|\bturn\b|\bwin\b|\bplay(ed|ing|through)?\b|board\b|\bcards?\b|meeple|miniature|\bminis?\b|component|insert|\binside\b|sleeve|token|\btable\b|unbox|review|\bwip\b|paint)/i;
const FACE_KW = {
  back: /\b(back|rear|backside)\b/i,
  spine: /\b(spine|side|edge)\b/i,
  top: /\b(top|lid)\b/i,
  bottom: /\b(bottom|underside)\b/i,
};
const ourEdition = new RegExp('(english|' + (g.publishers || []).slice(0, 2).map((p) => p.replace(/[^a-z0-9]/gi, '.')).join('|') + ')', 'i');
function scoreFor(face, cap) {
  cap = cap || '';
  if (!FACE_KW[face].test(cap)) return 0;
  let s = 1;
  if (/\b(box|edition)\b/i.test(cap)) s += 1;
  if (ourEdition.test(cap)) s += 1.5;
  if (BAD.test(cap)) s -= 2;
  return s;
}

const frontAspect = (g.imageWidth || 1) / (g.imageHeight || 1);
// per-face geometry validator on the downloaded image's dims
function validGeom(face, w, h) {
  if (w < 300) return false;
  const a = w / h;
  if (face === 'back') return Math.abs(a - frontAspect) / frontAspect <= 0.25;
  // spine/top/bottom: a real edge photo is a long thin strip in either orientation
  const elong = Math.max(a, 1 / a);
  return elong >= 2.2;
}

// download candidates in score order; keep the first that passes the geom check
async function pickFace(face, cands) {
  for (const c of cands || []) {
    const r = await fetchRetry(c.url, { headers: { 'User-Agent': UA } });
    if (!r) continue;
    const buf = Buffer.from(await r.arrayBuffer());
    try {
      const m = await sharp(buf).metadata();
      if (validGeom(face, m.width, m.height)) {
        const ext = (c.url.split('.').pop().split('?')[0].slice(0, 4) || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
        const file = path.join(dir, `${face}-src.${ext}`);
        fs.writeFileSync(file, buf);
        return { imageid: c.imageid, url: c.url, caption: c.caption, score: c.score, aspect: +(m.width / m.height).toFixed(3), file };
      }
    } catch (e) { /* not an image */ }
    await sleep(120);
  }
  return null;
}

(async () => {
  let prev = null;
  if (fs.existsSync(galleryFile) && !refresh) { try { prev = JSON.parse(fs.readFileSync(galleryFile, 'utf8')); } catch (e) {} }

  let candidates = prev && prev.candidates;
  let chosen = (prev && prev.chosen) || {};

  // fetch + score only if we don't already have candidates cached
  if (!candidates) {
    chosen = {};
    if (!g.bggId) {
      fs.writeFileSync(galleryFile, JSON.stringify({ bggId: null, candidates: {}, chosen: {}, done: true }, null, 2));
      console.log('BACK= SPINE= TOP= BOTTOM='); return;
    }
    const seen = new Map();
    for (let pg = 1; pg <= PAGES; pg++) {
      const url = `https://api.geekdo.com/api/images?ajax=1&foritempage=1&galleries%5B%5D=game&nosession=1&objectid=${g.bggId}&objecttype=thing&pageid=${pg}&showcount=50&size=crop100&sort=hot`;
      const r = await fetchRetry(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
      if (!r) break;
      let j; try { j = await r.json(); } catch (e) { break; }
      const imgs = j.images || [];
      for (const im of imgs) seen.set(im.imageid, { imageid: im.imageid, caption: im.caption || '', url: im.imageurl_lg || im.imageurl });
      if (imgs.length < 50) break;
      await sleep(150);
    }
    const all = [...seen.values()];
    candidates = {};
    for (const face of FACES) {
      candidates[face] = all
        .map((im) => ({ ...im, score: scoreFor(face, im.caption) }))
        .filter((im) => im.score > 0).sort((x, y) => y.score - x.score).slice(0, 6);
    }
  }

  // decide any face not yet decided (undefined). null = decided-as-none.
  for (const face of FACES) {
    if (chosen[face] === undefined) chosen[face] = await pickFace(face, candidates[face]);
  }

  fs.writeFileSync(galleryFile, JSON.stringify({
    bggId: g.bggId, frontAspect: +frontAspect.toFixed(3), candidates, chosen, done: true,
  }, null, 2));
  console.log(FACES.map((f) => `${f.toUpperCase()}=${chosen[f] ? chosen[f].file : ''}`).join(' '));
})();
