import raw from './data/games.json';
import { transliterate } from 'transliteration';

export type Face = { src: string; source: string; normalized?: boolean; bump?: string };
export type Box = {
  size: { w: number; h: number; d: number };
  face?: { w: number; h: number; d: number };
  orientation?: string;
  sideColor: string;
  edgeColor: string;
};
export type Game = {
  id: string;
  title: string;
  bggUrl?: string;
  designers?: string[];
  year?: number;
  players?: { min: number; max: number };
  playtime?: { min: number; max: number };
  complexity?: number;
  minAge?: number;
  categories?: string[];
  shortDescription?: string;
  description?: string;
  box: Box;
  textures: Record<string, Face>;
  cover: string;
};

// assets live under Vite's base path (e.g. /board-games/) on GitHub Pages
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export const asset = (p: string) => BASE + (p.startsWith('/') ? p : '/' + p);

export const games: Game[] = ((raw as any).games || raw) as Game[];
export const bySlug = (slug: string) => games.find((g) => g.id === slug);

// ---- forgiving search normalization ----------------------------------------
// Romanize ANY script to ASCII (Greek, Cyrillic, CJK, accents, …) with the
// `transliteration` library, then fold case and drop non-alphanumerics — so
// ΚΑΤΑΝ / Katan / κατάν all normalize to "katan", café == cafe, etc.
export function norm(s?: string): string {
  if (!s) return '';
  return transliterate(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// cached per-game searchable blob (each field normalized, joined by a control
// char a normalized token can never span)
const SEP = '';
const blobs = new Map<string, string>();
export function searchBlob(g: Game): string {
  let b = blobs.get(g.id);
  if (b === undefined) {
    b = [g.title, g.id, ...(g.designers || []), ...(g.categories || []), String(g.year || '')]
      .map(norm).join(SEP);
    blobs.set(g.id, b);
  }
  return b;
}

// ---- facet filters ---------------------------------------------------------
export type Facet = { id: 'players' | 'age' | 'type'; label: string; values: { key: string; label: string }[] };

// Age buckets (condensed from the many distinct minAge values) → [lo,hi] on minAge.
const AGE_BUCKETS = [
  { key: 'age:0-7', label: '≤7', lo: 0, hi: 7 },
  { key: 'age:8-9', label: '8–9', lo: 8, hi: 9 },
  { key: 'age:10-11', label: '10–11', lo: 10, hi: 11 },
  { key: 'age:12-13', label: '12–13', lo: 12, hi: 13 },
  { key: 'age:14-99', label: '14+', lo: 14, hi: 99 },
];

export const facets: Facet[] = (() => {
  const players = [1, 2, 3, 4, 5, 6].map((n) => ({ key: 'players:' + n, label: n === 6 ? '6+' : String(n) }));
  const ages = AGE_BUCKETS.filter((b) => games.some((g) => g.minAge && g.minAge >= b.lo && g.minAge <= b.hi))
    .map((b) => ({ key: b.key, label: b.label }));
  const freq: Record<string, number> = {};
  for (const g of games) for (const c of g.categories || []) freq[c] = (freq[c] || 0) + 1;
  const types = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c]) => ({ key: 'type:' + c, label: c }));
  return [
    { id: 'players', label: 'Players', values: players },
    { id: 'age', label: 'Age', values: ages },
    { id: 'type', label: 'Type', values: types },
  ];
})();

// AND across facets, OR within a facet. Empty selection = no constraint.
export function matchesFilters(g: Game, sel: Set<string>): boolean {
  if (sel.size === 0) return true;
  const by: Record<string, string[]> = { players: [], age: [], type: [] };
  for (const k of sel) { const i = k.indexOf(':'); (by[k.slice(0, i)] ||= []).push(k.slice(i + 1)); }
  if (by.players.length && !by.players.some((v) => g.players && (v === '6' ? g.players.max >= 6 : g.players.min <= +v && +v <= g.players.max))) return false;
  if (by.age.length && !by.age.some((v) => { const [lo, hi] = v.split('-').map(Number); return g.minAge != null && g.minAge >= lo && g.minAge <= hi; })) return false;
  if (by.type.length && !by.type.some((v) => (g.categories || []).includes(v))) return false;
  return true;
}

// BGG text carries HTML entities (e.g. Nazg&ucirc;l); decode for display.
export function decode(s?: string): string {
  if (!s || typeof document === 'undefined') return s || '';
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}
