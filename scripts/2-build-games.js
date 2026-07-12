const fs = require('fs');
const d = require('./airtable-raw.json').data;

const schema = d.tableSchemas[0];
const cols = schema.columns;
const td = d.tableDatas[0];
const signed = td.signedUserContentUrls || {};

const byName = {};
for (const c of cols) byName[c.name] = c;

// choice id -> name maps for select/multiSelect columns
function choiceMap(col) {
  const m = {};
  const ch = col.typeOptions && col.typeOptions.choices;
  if (ch) for (const id of Object.keys(ch)) m[id] = ch[id].name;
  return m;
}
const maps = {};
for (const c of cols) if (c.type === 'select' || c.type === 'multiSelect') maps[c.name] = choiceMap(c);

const sign = (u) => (u && signed[u]) || u;

function bggId(url) {
  if (!url) return null;
  const m = String(url).match(/boardgame\/(\d+)/);
  return m ? Number(m[1]) : null;
}

// slugify with Greek transliteration fallback
const GR = { α:'a',ά:'a',β:'v',γ:'g',δ:'d',ε:'e',έ:'e',ζ:'z',η:'i',ή:'i',θ:'th',ι:'i',ί:'i',ϊ:'i',ΐ:'i',κ:'k',λ:'l',μ:'m',ν:'n',ξ:'x',ο:'o',ό:'o',π:'p',ρ:'r',σ:'s',ς:'s',τ:'t',υ:'y',ύ:'y',ϋ:'y',ΰ:'y',φ:'f',χ:'ch',ψ:'ps',ω:'o',ώ:'o' };
function slugify(str) {
  let s = (str || '').toLowerCase();
  s = s.split('').map((ch) => GR[ch] ?? ch).join('');
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s;
}

const C = {
  name: byName['Name'].id,
  notes: byName['Notes'].id,
  players: byName['Optimal Players'].id,
  weight: byName['Weight'].id,
  bgg: byName['BoardGameGeek'].id,
  image: byName['Image'].id,
  expansions: byName['Expansions'] && byName['Expansions'].id,
  sleeves: byName['Sleeves'] && byName['Sleeves'].id,
  tags: byName['Tags'] && byName['Tags'].id,
};

function richText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  // richText may be {documentValue:[...]} — extract plain text
  if (v.documentValue) {
    return v.documentValue.map((n) => (n.insert || (n.children ? n.children.map((c) => c.insert || '').join('') : ''))).join('').trim();
  }
  return '';
}

const usedSlugs = {};
const games = td.rows.map((row, i) => {
  const cv = row.cellValuesByColumnId || {};
  const title = cv[C.name] || `Game ${i + 1}`;
  const bgg = cv[C.bgg] || null;
  const id = bggId(bgg);

  // best image: prefer full-size url, then large/full thumb; sign it
  let image = null, thumb = null, imgW = null, imgH = null;
  const atts = cv[C.image];
  if (Array.isArray(atts) && atts.length) {
    const a = atts[0];
    image = sign(a.url) || sign(a.fullThumbUrl) || sign(a.largeThumbUrl);
    thumb = sign(a.largeThumbUrl) || sign(a.fullThumbUrl) || image;
    imgW = a.width || a.fullThumbWidth || null;
    imgH = a.height || a.fullThumbHeight || null;
  }

  let slug = id ? slugify(title) + '-' + id : slugify(title) || 'game-' + (i + 1);
  if (usedSlugs[slug]) slug = slug + '-' + (i + 1);
  usedSlugs[slug] = true;

  const players = (cv[C.players] || []).map((s) => maps['Optimal Players'][s]).filter(Boolean);
  const weight = cv[C.weight] ? Number(maps['Weight'][cv[C.weight]]) : null;
  const tags = C.tags && cv[C.tags] ? (cv[C.tags] || []).map((s) => maps['Tags'][s]).filter(Boolean) : [];
  const sleeves = C.sleeves && cv[C.sleeves] ? (cv[C.sleeves] || []).map((s) => maps['Sleeves'][s]).filter(Boolean) : [];

  return {
    id: slug,
    recordId: row.id,
    title,
    bggId: id,
    bggUrl: bgg,
    optimalPlayers: players,
    weight,
    notes: richText(cv[C.notes]),
    expansions: C.expansions ? richText(cv[C.expansions]) : '',
    sleeves,
    tags,
    image,
    thumb,
    imageWidth: imgW,
    imageHeight: imgH,
  };
});

const out = {
  source: 'Airtable — Jason\'s tabletop games',
  fetchedAt: '2026-07-12',
  count: games.length,
  fields: cols.map((c) => ({ name: c.name, type: c.type })),
  games,
};
fs.writeFileSync(__dirname + '/games.json', JSON.stringify(out, null, 2));

// quick stats
const withImg = games.filter((g) => g.image).length;
const withBgg = games.filter((g) => g.bggId).length;
console.log('games:', games.length, '| with image:', withImg, '| with bgg:', withBgg);
console.log('weights:', JSON.stringify(games.reduce((a, g) => { const k = g.weight || 'none'; a[k] = (a[k] || 0) + 1; return a; }, {})));
console.log('\nfirst 5 titles:', games.slice(0, 5).map((g) => g.title).join(' | '));
