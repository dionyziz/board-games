// Discover + download box-face candidate photos from the BGG user gallery
// (see BOX-ART-PIPELINE.md §3). Fully automated: fetch the gallery, score every
// image per face by caption + heuristics, and auto-download the best BACK photo
// (the only face reliably extractable without manual perspective work). Spine/
// top/bottom candidates are recorded in gallery.json for later manual de-project.
//
//   node scripts/8-fetch-gallery.js <gameId> [--refresh]
//
// Emits to stdout:  BACK=<abs path>   (empty if none found)
// Writes: scripts/gallery-cache/<id>/{gallery.json, back-src.<ext>}
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, 'gallery-cache');
const UA = 'Mozilla/5.0 (board-games texture pipeline; contact dionyziz)';
const PAGES = 5;

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

// caption scorers -----------------------------------------------------------
const BAD = /(gameplay|game ?state|setup|\bturn\b|\bwin\b|\bplay(ed|ing|through)?\b|board\b|\bcards?\b|meeple|miniature|\bminis?\b|component|insert|\binside\b|sleeve|token|\btable\b|unbox|review|\bwip\b|paint)/i;
const FACE = {
  back: /\b(back|rear|backside)\b/i,
  spine: /\b(spine|side|edge)\b/i,
  top: /\b(top|lid)\b/i,
  bottom: /\b(bottom|underside)\b/i,
};
const ourEdition = new RegExp('(english|' + (g.publishers || []).slice(0, 2).map((p) => p.replace(/[^a-z0-9]/gi, '.')).join('|') + ')', 'i');

function scoreFor(face, cap) {
  cap = cap || '';
  if (!FACE[face].test(cap)) return 0;
  let s = 1;
  if (/\b(box|edition)\b/i.test(cap)) s += 1;
  if (ourEdition.test(cap)) s += 1.5;
  if (BAD.test(cap)) s -= 2;
  return s;
}

(async () => {
  // resumable: reuse a cached decision unless --refresh
  if (!refresh && fs.existsSync(galleryFile)) {
    const prev = JSON.parse(fs.readFileSync(galleryFile, 'utf8'));
    if (prev.chosen && prev.chosen.back && prev.chosen.back.file && fs.existsSync(prev.chosen.back.file)) {
      console.log('BACK=' + prev.chosen.back.file); return;
    }
    if (prev.done) { console.log('BACK='); return; } // known-empty, don't refetch
  }
  if (!g.bggId) {
    fs.writeFileSync(galleryFile, JSON.stringify({ bggId: null, done: true, candidates: {}, chosen: {} }, null, 2));
    console.log('BACK='); return;
  }

  // fetch gallery pages
  const seen = new Map();
  for (let pg = 1; pg <= PAGES; pg++) {
    const url = `https://api.geekdo.com/api/images?ajax=1&foritempage=1&galleries%5B%5D=game&nosession=1&objectid=${g.bggId}&objecttype=thing&pageid=${pg}&showcount=50&size=crop100&sort=hot`;
    const r = await fetchRetry(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    if (!r) break;
    let j; try { j = await r.json(); } catch (e) { break; }
    const imgs = j.images || [];
    for (const im of imgs) seen.set(im.imageid, { imageid: im.imageid, caption: im.caption || '', url: im.imageurl_lg || im.imageurl });
    if (imgs.length < 50) break; // last page
    await sleep(150);
  }
  const all = [...seen.values()];

  // score per face
  const candidates = {};
  for (const face of Object.keys(FACE)) {
    candidates[face] = all
      .map((im) => ({ ...im, score: scoreFor(face, im.caption) }))
      .filter((im) => im.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 6);
  }

  // auto-download + validate the best BACK (aspect must roughly match the front)
  let chosenBack = null;
  const frontAspect = (g.imageWidth || 1) / (g.imageHeight || 1);
  for (const cand of candidates.back) {
    const r = await fetchRetry(cand.url, { headers: { 'User-Agent': UA } });
    if (!r) continue;
    const buf = Buffer.from(await r.arrayBuffer());
    const ext = (cand.url.split('.').pop().split('?')[0].slice(0, 4) || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
    const file = path.join(dir, 'back-src.' + ext);
    try {
      const meta = await sharp(buf).metadata();
      const aspect = meta.width / meta.height;
      // a flat back reads at ~ the front's aspect; reject portraits/odd crops/angled
      if (Math.abs(aspect - frontAspect) / frontAspect <= 0.25 && meta.width >= 500) {
        fs.writeFileSync(file, buf);
        chosenBack = { imageid: cand.imageid, url: cand.url, caption: cand.caption, score: cand.score, aspect: +aspect.toFixed(3), file };
        break;
      }
    } catch (e) { /* not an image */ }
    await sleep(120);
  }

  fs.writeFileSync(galleryFile, JSON.stringify({
    bggId: g.bggId, fetched: all.length, done: true,
    frontAspect: +frontAspect.toFixed(3),
    candidates, chosen: { back: chosenBack },
  }, null, 2));
  console.log('BACK=' + (chosenBack ? chosenBack.file : ''));
})();
