import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import Scene from './Scene';
import { games, bySlug, norm, searchBlob, matchesFilters, bgStops, weightOf } from './data';
import { GalleryOverlay, DetailOverlay } from './ui/Overlays';
import Spinner from './ui/Spinner';

// One persistent Canvas across both views; the route only drives which box is
// selected and which DOM overlay shows. Search + scroll live above the router,
// so they survive opening a game and coming back.
//
// Games are REAL paths (/g/<id>/), not hash routes, so a shared link is a URL a
// crawler can fetch — each is pre-rendered with its own OG card (scripts/gen-og.js).
// Search state lives in the query string (/?q=…&f=…&f=…&s=…) for the same reason;
// repeated `f` params avoid separator ambiguity in filter keys, and URLSearchParams
// handles the %-decoding.
const BASE = import.meta.env.BASE_URL;               // "/" in prod, "/board-games/" in preview
const SORTS = ['title', 'weight-asc', 'weight-desc'] as const;
type Sort = (typeof SORTS)[number];

function readUrlState(): { q: string; sel: Set<string>; sort: Sort } {
  const sp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const s = sp.get('s') as Sort;
  return { q: sp.get('q') || '', sel: new Set(sp.getAll('f')), sort: SORTS.includes(s) ? s : 'title' };
}

function Shell() {
  const loc = useLocation();
  const navigate = useNavigate();
  const m = loc.pathname.match(/^\/g\/(.+?)\/?$/);   // /g/<id> or /g/<id>/ (basename already stripped)
  const slug = m ? decodeURIComponent(m[1]) : null;

  // seed search + filters from the URL so a pasted/shared link restores them
  const [query, setQuery] = useState(() => readUrlState().q);
  const [sel, setSel] = useState<Set<string>>(() => readUrlState().sel);
  const [sort, setSort] = useState<Sort>(() => readUrlState().sort);
  const [searchFocused, setSearchFocused] = useState(false);
  const [center, setCenterIdx] = useState(0);
  // laptop/desktop: the filter pane is always open; mobile keeps the focus-driven behaviour
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 821px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 821px)');
    const on = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // the game most recently viewed/centered while browsing — hoisted to the top of
  // search results so it stays findable when you start a new query
  const focusId = useRef<string | null>(null);

  const filtered = useMemo(() => {
    const tokens = query.trim().split(/\s+/).map(norm).filter(Boolean);
    // no query + no pills = no constraint → the whole library (applied instantly).
    // `games` is pre-sorted by title, so 'title' needs no re-sort.
    const list = games.filter((g) => tokens.every((t) => searchBlob(g).includes(t)) && matchesFilters(g, sel));
    if (sort === 'weight-asc' || sort === 'weight-desc') {
      const dir = sort === 'weight-asc' ? 1 : -1;
      list.sort((a, b) => {
        const wa = weightOf(a), wb = weightOf(b);
        if (wa == null) return wb == null ? 0 : 1;   // unknown weight always sorts last
        if (wb == null) return -1;
        return (wa - wb) * dir;
      });
    } else if ((tokens.length || sel.size) && focusId.current) {
      // default (title) sort: hoist the last-viewed game so it stays findable
      const i = list.findIndex((g) => g.id === focusId.current);
      if (i > 0) list.unshift(list.splice(i, 1)[0]);
    }
    return list;
  }, [query, sel, sort]);

  const toggle = (key: string) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const focusSearch = () => setTimeout(() => {
    const input = document.querySelector('input[aria-label="Search games"]') as HTMLInputElement | null;
    if (input) { input.focus(); input.select(); }
  }, 0);

  // remember the open game as the focus for the next search; entering a detail view
  // unmounts the search input (which won't fire onBlur), so drop focus explicitly so
  // the filter panel isn't left open when we return to the gallery
  useEffect(() => { if (slug) { focusId.current = slug; setSearchFocused(false); } }, [slug]);

  // mirror the library's search + filters into the URL (copy/paste-able); a detail
  // view owns its own #/game/<id>, and an empty library strips the hash entirely so
  // the address bar shows just the clean root URL. replaceState (not push) keeps
  // filter tweaks out of history; the existing state object is preserved so the
  // router's own navigation bookkeeping stays intact.
  useEffect(() => {
    if (slug) return;
    const parts: string[] = [];
    if (query.trim()) parts.push('q=' + encodeURIComponent(query.trim()));
    for (const k of sel) parts.push('f=' + encodeURIComponent(k));
    if (sort !== 'title') parts.push('s=' + sort);
    // gallery lives at the app root; empty → clean base URL, else ?q=…&f=…&s=…
    window.history.replaceState(window.history.state, '', BASE + (parts.length ? '?' + parts.join('&') : ''));
  }, [query, sel, sort, slug]);

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
        onOpen={(id) => navigate('/g/' + id + '/')}
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
            filterOpen={isDesktop || searchFocused || sel.size > 0}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            sel={sel} onToggle={toggle}
            sort={sort} onSort={setSort}
            onClearFilters={() => { setSel(new Set()); setQuery(''); }}
          />}
    </div>
  );
}

export default function App() {
  // basename lets the same build run at the domain root (prod) or under /board-games/
  // (local preview); react-router strips it from the pathname Shell sees.
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Shell />
    </BrowserRouter>
  );
}
