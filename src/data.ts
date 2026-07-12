import raw from './data/games.json';

export type Face = { src: string; source: string; normalized?: boolean };
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
// Case-insensitive, accent-insensitive, Greek↔Latin interchangeable, final
// sigma == sigma, punctuation/space-insensitive. So ΚΑΤΑΝ / Katan / κατάν all
// normalize to the same string.
const GR2LA: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k',
  λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't',
  υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};
export function norm(s?: string): string {
  if (!s) return '';
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')      // strip Latin + Greek accents
    .replace(/[α-ως]/g, (c) => GR2LA[c] || c) // transliterate Greek → Latin
    .replace(/[^a-z0-9]+/g, '');                            // drop spaces/punctuation
}

// cached per-game searchable blob (each field normalized, joined by a separator
// that a normalized token can never span)
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
