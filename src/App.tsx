import { useState } from 'react';
import { HashRouter, useLocation, useNavigate } from 'react-router-dom';
import Scene from './Scene';
import { games } from './data';
import { GalleryOverlay, DetailOverlay } from './ui/Overlays';

// One persistent Canvas across both views; the route only drives which box is
// selected and which DOM overlay shows. The camera arc + fades live in Scene, so
// the 3D object has continuity between gallery and detail.
function Shell() {
  const loc = useLocation();
  const navigate = useNavigate();
  const m = loc.pathname.match(/^\/game\/(.+)$/);
  const slug = m ? decodeURIComponent(m[1]) : null;
  const selectedIndex = slug ? games.findIndex((g) => g.id === slug) : -1;
  const [center, setCenter] = useState(0);

  return (
    <div className="app">
      <Scene
        selectedIndex={selectedIndex}
        onOpen={(id) => navigate('/game/' + id)}
        onCenter={setCenter}
      />
      {slug
        ? <DetailOverlay key={slug} game={games[selectedIndex]} onBack={() => navigate('/')} />
        : <GalleryOverlay game={games[center]} />}
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
