import { useEffect, useMemo, useState } from 'react';
import { HashRouter, useLocation, useNavigate } from 'react-router-dom';
import Scene from './Scene';
import { games, bySlug, norm, searchBlob, matchesFilters, bgStops } from './data';
import { GalleryOverlay, DetailOverlay } from './ui/Overlays';

// One persistent Canvas across both views; the route only drives which box is
// selected and which DOM overlay shows. Search + scroll live above the router,
// so they survive opening a game and coming back.
function Shell() {
  const loc = useLocation();
  const navigate = useNavigate();
  const m = loc.pathname.match(/^\/game\/(.+)$/);
  const slug = m ? decodeURIComponent(m[1]) : null;

  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [center, setCenterIdx] = useState(0);

  const filtered = useMemo(() => {
    const tokens = query.trim().split(/\s+/).map(norm).filter(Boolean);
    // no query + no pills = no constraint → the whole library (applied instantly)
    return games.filter((g) => tokens.every((t) => searchBlob(g).includes(t)) && matchesFilters(g, sel));
  }, [query, sel]);

  const toggle = (key: string) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // "/" focuses the search box and selects its text (unless already typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const input = document.querySelector('input[aria-label="Search games"]') as HTMLInputElement | null;
      if (input) { e.preventDefault(); input.focus(); input.select(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // in a detail view, Esc / ← return to the library
  useEffect(() => {
    if (!slug) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'ArrowLeft') { e.preventDefault(); navigate('/'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slug, navigate]);

  const selectedIndex = slug ? filtered.findIndex((g) => g.id === slug) : -1;

  // background follows the focused game (open game, else the centered one)
  const focusGame = slug ? bySlug(slug) : filtered[center];
  const bg = bgStops(focusGame);

  return (
    <div className="app">
      <div className="bg-grad" style={{ ['--bg-a' as any]: bg.a, ['--bg-b' as any]: bg.b }} />
      <Scene
        list={filtered}
        selectedIndex={selectedIndex}
        onOpen={(id) => navigate('/game/' + id)}
        onCenter={setCenterIdx}
      />
      {slug
        ? <DetailOverlay key={slug} game={bySlug(slug)} onBack={() => navigate('/')} />
        : <GalleryOverlay
            game={filtered[center]} count={filtered.length}
            query={query} onQuery={setQuery}
            filterOpen={filterOpen}
            onFocus={() => setFilterOpen(true)}
            onBlur={() => { if (!query.trim() && sel.size === 0) setFilterOpen(false); }}
            sel={sel} onToggle={toggle}
            onClearFilters={() => { setSel(new Set()); setQuery(''); }}
          />}
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
