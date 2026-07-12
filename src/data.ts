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

// BGG text carries HTML entities (e.g. Nazg&ucirc;l); decode for display.
export function decode(s?: string): string {
  if (!s || typeof document === 'undefined') return s || '';
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}
