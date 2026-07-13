import { useEffect, useMemo, useRef, useState } from 'react';
import { HashRouter, useLocation, useNavigate } from 'react-router-dom';
import Scene from './Scene';
import { games, bySlug, norm, searchBlob, matchesFilters, bgStops } from './data';
import { GalleryOverlay, DetailOverlay } from './ui/Overlays';
import Spinner from './ui/Spinner';

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
  const [searchFocused, setSearchFocused] = useState(false);
  const [center, setCenterIdx] = useState(0);

  // the game most recently viewed/centered while browsing — hoisted to the top of
  // search results so it stays findable when you start a new query
  const focusId = useRef<string | null>(null);

  const filtered = useMemo(() => {
    const tokens = query.trim().split(/\s+/).map(norm).filter(Boolean);
    // no query + no pills = no constraint → the whole library (applied instantly)
    const list = games.filter((g) => tokens.every((t) => searchBlob(g).includes(t)) && matchesFilters(g, sel));
    if ((tokens.length || sel.size) && focusId.current) {
      const i = list.findIndex((g) => g.id === focusId.current);
      if (i > 0) list.unshift(list.splice(i, 1)[0]);
    }
    return list;
  }, [query, sel]);

  const toggle = (key: string) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const focusSearch = () => setTimeout(() => {
    const input = document.querySelector('input[aria-label="Search games"]') as HTMLInputElement | null;
    if (input) { input.focus(); input.select(); }
  }, 0);

  // remember the open game as the focus for the next search; entering a detail view
  // unmounts the search input (which won't fire onBlur), so drop focus explicitly so
  // the filter panel isn't left open when we return to the gallery
  useEffect(() => { if (slug) { focusId.current = slug; setSearchFocused(false); } }, [slug]);

  // "/" jumps to the library (if in a detail view) and focuses+selects the search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      if (slug) navigate('/');
      focusSearch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slug, navigate]);

  // in a detail view, Esc / ← return to the library
  useEffect(() => {
    if (!slug) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'ArrowLeft') { e.preventDefault(); navigate('/'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slug, navigate]);

  // in the library, Esc clears the search query + all filter pills — even when the
  // search box isn't focused (when it is, this also blurs it)
  useEffect(() => {
    if (slug) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setQuery(''); setSel(new Set()); setSearchFocused(false);
      const el = document.activeElement as HTMLElement | null;
      if (el && el.tagName === 'INPUT') el.blur();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slug]);

  const selectedIndex = slug ? filtered.findIndex((g) => g.id === slug) : -1;

  // background follows the focused game (open game, else the centered one)
  const focusGame = slug ? bySlug(slug) : filtered[center];
  const bg = bgStops(focusGame);

  return (
    <div className="app">
      <div className="bg-grad" style={{ ['--bg-a' as any]: bg.a, ['--bg-b' as any]: bg.b }} />
      <Spinner />
      <Scene
        list={filtered}
        selectedIndex={selectedIndex}
        onOpen={(id) => navigate('/game/' + id)}
        onCenter={(i) => { setCenterIdx(i); if (!query.trim() && sel.size === 0) focusId.current = filtered[i]?.id ?? focusId.current; }}
      />
      {slug
        ? <DetailOverlay key={slug} game={bySlug(slug)} onBack={() => navigate('/')} />
        : <GalleryOverlay
            game={filtered[center]} count={filtered.length}
            atEnd={filtered.length > 0 && center >= filtered.length - 1}
            query={query} onQuery={setQuery}
            // the filter panel is shown while the search is engaged or filters are
            // active — derived, so clearing the query (×) or leaving the search
            // always resolves it correctly (no sticky "open" flag to get stranded)
            filterOpen={searchFocused || sel.size > 0}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
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
