import { useMemo, useState } from 'react';
import { HashRouter, useLocation, useNavigate } from 'react-router-dom';
import Scene from './Scene';
import { games, bySlug, norm, searchBlob, matchesFilters } from './data';
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
    const active = tokens.length > 0 || sel.size > 0;
    // filter mode engaged (search focused) but nothing chosen → hide everything
    if (filterOpen && !active) return [];
    return games.filter((g) => tokens.every((t) => searchBlob(g).includes(t)) && matchesFilters(g, sel));
  }, [query, sel, filterOpen]);

  const toggle = (key: string) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const selectedIndex = slug ? filtered.findIndex((g) => g.id === slug) : -1;

  return (
    <div className="app">
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
