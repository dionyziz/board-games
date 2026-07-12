// Merge cached BGG data into games.json: metadata + complexity + accurate box
// dimensions (cm). Dimensions come from BGG per-version physical data, which is
// contributor-entered in MIXED units — normalized here and cross-checked by
// clustering across a game's editions.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, 'bgg-cache');
const data = require(path.join(ROOT, 'src/data/games.json'));

// ---------- helpers ----------
const IN2CM = 2.54;
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function stripHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#10;/g, '\n')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘').replace(/&rdquo;/g, '”').replace(/&ldquo;/g, '“')
    .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim();
}

// unit-normalize one raw version → cm triple [long, short, depth]
function toCm(v) {
  let l = +v.length, w = +v.width, d = +v.depth;
  if (!(l > 0 && w > 0 && d > 0)) return null;
  const maxd = Math.max(l, w, d);
  // >15 → already cm; otherwise inches (no boxed game side exceeds ~15in/38cm)
  if (maxd <= 15) { l *= IN2CM; w *= IN2CM; d *= IN2CM; }
  const face = [l, w].sort((a, b) => b - a); // long, short
  return { h: face[0], w: face[1], d: d, name: v.name || '', year: v.yearpublished };
}

const SIZE_VARIANT = /XXL|big box|bigbox|giant|jumbo|travel|pocket|mini\b|deluxe|anniversary|collector|kickstarter|legacy tin|tin\b|metal|20th|25th/i;
const GREEK = /[Ͱ-Ͽἀ-῿]/;
const GREEK_PUB = /kaissa|desyllas|greek/i;

// pick representative box for a game from its versions
function boxFromVersions(versions, title) {
  const cm = (versions || []).map(toCm).filter(Boolean);
  if (!cm.length) return null;

  const titleGreek = GREEK.test(title || '');
  let pool = cm;
  let source = 'bgg-median';

  // 0) if the OWNED copy's title names a size variant (Mini/XXL/Travel/Big Box/
  //    Deluxe…), match that variant edition rather than the standard box
  const variantWords = ['xxl', 'big box', 'giant', 'jumbo', 'travel', 'pocket', 'mini', 'deluxe', 'anniversary', 'collector'];
  const tl = (title || '').toLowerCase();
  const titleVariant = variantWords.find((w) => tl.includes(w));
  if (titleVariant) {
    const re = new RegExp(titleVariant.replace(' ', '\\s*'), 'i');
    const match = cm.filter((c) => re.test(c.name));
    if (match.length) { pool = match; source = 'bgg-variant:' + titleVariant; }
  }

  // 1) if the owned copy is Greek, prefer Greek editions when present
  if (source === 'bgg-median' && titleGreek) {
    const gr = cm.filter((c) => GREEK.test(c.name) || GREEK_PUB.test(c.name));
    if (gr.length) { pool = gr; source = 'bgg-greek-edition'; }
  }
  // 2) otherwise drop obvious size variants (XXL/travel/deluxe…) to get the standard box
  if (source === 'bgg-median') {
    const std = pool.filter((c) => !SIZE_VARIANT.test(c.name));
    if (std.length) pool = std;
  }

  // 3) cluster by longest side to reject unit-misentered outliers; keep the
  //    dominant cluster (versions within 20% of the modal longest side)
  const hs = pool.map((c) => c.h).sort((a, b) => a - b);
  const med = median(hs);
  const dominant = pool.filter((c) => Math.abs(c.h - med) <= 0.2 * med);
  const use = dominant.length ? dominant : pool;

  const h = median(use.map((c) => c.h));
  const w = median(use.map((c) => c.w));
  const d = median(use.map((c) => c.d));
  const spread = use.length > 1 ? (Math.max(...use.map((c) => c.h)) - Math.min(...use.map((c) => c.h))) / med : 0;

  return {
    size: { w: +w.toFixed(1), h: +h.toFixed(1), d: +d.toFixed(1) }, // cm
    unit: 'cm',
    source,
    versionsUsed: use.length,
    versionsWithDims: cm.length,
    agreement: +(1 - Math.min(spread, 1)).toFixed(2), // 1 = all editions agree
    estimatedSize: false,
  };
}

// category/format fallback footprint (cm) when no version dims exist
function estimateBox(g, meta, complexity) {
  const cats = (meta && meta.links && meta.links.boardgamecategory || []).map((c) => c.name.toLowerCase());
  const isCard = cats.some((c) => c.includes('card'));
  const isParty = cats.some((c) => c.includes('party') || c.includes('word') || c.includes('deduction'));
  const isChildrens = cats.some((c) => c.includes("children"));
  const heavy = (complexity || 0) >= 3 || (+((meta && meta.maxplaytime) || 0) >= 90);
  let size;
  if (isCard && !heavy) size = { w: 10.0, h: 13.0, d: 3.5 };
  else if (isParty) size = { w: 13.5, h: 19.0, d: 4.5 };
  else if (isChildrens) size = { w: 27.0, h: 27.0, d: 6.5 };
  else if (heavy) size = { w: 30.0, h: 30.0, d: 7.5 };
  else size = { w: 26.5, h: 26.5, d: 5.5 };
  return { size, unit: 'cm', source: 'estimated', estimatedSize: true, agreement: 0 };
}

// ---------- merge ----------
let enriched = 0, realDims = 0, estDims = 0, noBgg = 0;
const report = [];

for (const g of data.games) {
  const file = g.bggId ? path.join(CACHE, g.bggId + '.json') : null;
  let meta = null, dyn = null, versions = null;
  if (file && fs.existsSync(file)) {
    const rec = JSON.parse(fs.readFileSync(file));
    meta = rec.meta && !rec.meta._status ? rec.meta : null;
    dyn = rec.dynamic && !rec.dynamic._status ? rec.dynamic : null;
    versions = rec.versions;
  }

  if (meta) {
    enriched++;
    g.year = meta.yearpublished ? +meta.yearpublished : null;
    g.players = { min: +meta.minplayers || null, max: +meta.maxplayers || null };
    g.playtime = { min: +meta.minplaytime || null, max: +meta.maxplaytime || null };
    g.minAge = +meta.minage || null;
    g.designers = (meta.links && meta.links.boardgamedesigner || []).map((x) => x.name);
    g.artists = (meta.links && meta.links.boardgameartist || []).map((x) => x.name);
    g.publishers = (meta.links && meta.links.boardgamepublisher || []).map((x) => x.name).slice(0, 6);
    g.categories = (meta.links && meta.links.boardgamecategory || []).map((x) => x.name);
    g.mechanics = (meta.links && meta.links.boardgamemechanic || []).map((x) => x.name);
    g.families = (meta.links && meta.links.boardgamefamily || []).map((x) => x.name).slice(0, 8);
    g.shortDescription = stripHtml(meta.short_description);
    g.description = stripHtml(meta.description);
  }
  const complexity = dyn && dyn.stats ? +(+dyn.stats.avgweight).toFixed(2) : null;
  if (complexity) g.complexity = complexity;
  if (dyn && dyn.stats) {
    g.bggRating = +(+dyn.stats.average).toFixed(2);
    g.bggRank = dyn.rankinfo && dyn.rankinfo[0] ? +dyn.rankinfo[0].rank || null : null;
  }

  let box = boxFromVersions(versions, g.title);
  if (box) realDims++;
  else { box = estimateBox(g, meta, complexity); g.bggId ? estDims++ : noBgg++; }
  g.box = box;

  report.push({ title: g.title, bggId: g.bggId, size: box.size, source: box.source, agree: box.agreement, nver: box.versionsWithDims || 0 });
}

data.enrichedAt = '2026-07-12';
data.enrichment = {
  source: 'BoardGameGeek (api.geekdo.com JSON API)',
  dimensionsMethod: 'per-version physical data, unit-normalized (cm) + cross-checked by clustering across editions',
  metadataFor: enriched,
  realDimensions: realDims,
  estimatedDimensions: estDims + noBgg,
};

fs.writeFileSync(path.join(ROOT, 'src/data/games.json'), JSON.stringify(data, null, 2));
fs.writeFileSync(path.join(__dirname, 'enrich-report.json'), JSON.stringify(report, null, 2));

console.log(`enriched meta: ${enriched}/${data.games.length}`);
console.log(`box dims — real(BGG): ${realDims}, estimated: ${estDims + noBgg}`);
const bySrc = report.reduce((a, r) => ((a[r.source] = (a[r.source] || 0) + 1), a), {});
console.log('dim sources:', JSON.stringify(bySrc));
const lowAgree = report.filter((r) => r.source !== 'estimated' && r.agree < 0.8);
console.log(`low-agreement (edition sizes vary) to review: ${lowAgree.length}`);
console.log('\nsamples:');
report.slice(0, 8).forEach((r) => console.log(`  ${r.size.w}x${r.size.h}x${r.size.d}cm [${r.source} n=${r.nver} agree=${r.agree}] ${r.title}`));
