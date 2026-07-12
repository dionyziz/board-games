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

// BGG text carries HTML entities (e.g. Nazg&ucirc;l); decode for display.
export function decode(s?: string): string {
  if (!s || typeof document === 'undefined') return s || '';
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}
