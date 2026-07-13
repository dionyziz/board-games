import { facets, type Game } from '../data';
import DetailPanel from './DetailPanel';

const SORT_KEYS: { key: string; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'weight', label: 'Weight' },
];

export function GalleryOverlay({ game, count, atEnd, query, onQuery, filterOpen, onFocus, onBlur, sel, onToggle, sort, onSort, onClearFilters }: {
  game?: Game; count: number; atEnd: boolean; query: string; onQuery: (q: string) => void;
  filterOpen: boolean; onFocus: () => void; onBlur: () => void;
  sel: Set<string>; onToggle: (k: string) => void; sort: string; onSort: (s: any) => void; onClearFilters: () => void;
}) {
  const hasFilters = sel.size > 0;
  return (
    <div className="gallery-overlay fade-in">
      <div className="top">
        <div className="brand">Jason's board games</div>
        <div className="search">
          <div className="searchbox">
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
              placeholder="Search title, designer, category…"
              aria-label="Search games"
              autoComplete="off"
              spellCheck={false}
            />
            {query ? <button className="clear" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => onQuery('')}>×</button> : null}
          </div>
          <span className="count">{count} {count === 1 ? 'game' : 'games'}</span>
        </div>
      </div>

      {filterOpen ? (
        <div className="sidebar" onMouseDown={(e) => e.preventDefault()}>
          <div className="sidebar-head">
            <span>Filters</span>
            {hasFilters ? <button className="clear-pills" onClick={onClearFilters}>Clear ×</button> : null}
          </div>
          <div className="facet">
            <span className="facet-label">Sort by</span>
            <div className="pills">
              {SORT_KEYS.map((o) => {
                const [key, dir] = sort.split('-');
                const active = key === o.key;
                // click sets ascending; clicking the active key again flips direction.
                // .cur = the direction active now; .hov (shown on hover) = the one a
                // click would switch to (flip if active, else ascending).
                const cur = active ? (dir === 'asc' ? ' ↑' : ' ↓') : '';
                const hov = active ? (dir === 'asc' ? ' ↓' : ' ↑') : ' ↑';
                return (
                  <button key={o.key} className={'pill' + (active ? ' on' : '')}
                    onClick={() => onSort(active ? `${o.key}-${dir === 'asc' ? 'desc' : 'asc'}` : `${o.key}-asc`)}>
                    {o.label}<span className="dir-cur">{cur}</span><span className="dir-hov">{hov}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {facets.map((f) => (
            <div className="facet" key={f.id}>
              <span className="facet-label">{f.label}</span>
              <div className={'pills' + (f.id === 'players' || f.id === 'rec' ? ' nums' : '')}>
                {f.values.map((v) => (
                  <button key={v.key} className={'pill' + (sel.has(v.key) ? ' on' : '')} onClick={() => onToggle(v.key)}>{v.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="centered">
        {game ? <h2>{game.title}</h2> : <h2 className="none">No matches</h2>}
        {game?.designers?.length ? <div className="by">{game.designers.join(', ')}</div> : null}
      </div>
      {count > 1 ? <div className="scrollhint">scroll {atEnd ? '↑' : '↓'} · click a box to open</div> : null}
    </div>
  );
}

export function DetailOverlay({ game, onBack }: { game?: Game; onBack: () => void }) {
  if (!game) {
    return <div className="empty">Game not found. <button className="linkbtn" onClick={onBack}>← Back to gallery</button></div>;
  }
  return (
    <>
      <div className="hint">drag to rotate · scroll to zoom</div>
      <div className="panel-wrap"><DetailPanel game={game} onBack={onBack} /></div>
    </>
  );
}
