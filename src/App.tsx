import { useMemo, useState } from 'react';
import { HashRouter, useLocation, useNavigate } from 'react-router-dom';
import Scene from './Scene';
import { games, bySlug, norm, searchBlob } from './data';
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
  // forgiving match: every normalized token must appear in the game's blob
  const filtered = useMemo(() => {
    const tokens = query.trim().split(/\s+/).map(norm).filter(Boolean);
    if (!tokens.length) return games;
    return games.filter((g) => { const b = searchBlob(g); return tokens.every((t) => b.includes(t)); });
  }, [query]);
  const [center, setCenterIdx] = useState(0);

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
        : <GalleryOverlay game={filtered[center]} count={filtered.length} query={query} onQuery={setQuery} />}
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
