import { facets, type Game } from '../data';
import DetailPanel from './DetailPanel';

export function GalleryOverlay({ game, count, query, onQuery, filterOpen, onFocus, onBlur, onEscape, sel, onToggle, onClearFilters }: {
  game?: Game; count: number; query: string; onQuery: (q: string) => void;
  filterOpen: boolean; onFocus: () => void; onBlur: () => void; onEscape: () => void;
  sel: Set<string>; onToggle: (k: string) => void; onClearFilters: () => void;
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
              onKeyDown={(e) => { if (e.key === 'Escape') { (e.target as HTMLInputElement).blur(); onEscape(); } }}
              placeholder="Search title, designer, category…"
              aria-label="Search games"
              autoComplete="off"
              spellCheck={false}
            />
            {query ? <button className="clear" aria-label="Clear search" onClick={() => onQuery('')}>×</button> : null}
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
          {facets.map((f) => (
            <div className="facet" key={f.id}>
              <span className="facet-label">{f.label}</span>
              <div className="pills">
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
      {count > 1 ? <div className="scrollhint">scroll ↓ · click a box to open</div> : null}
    </div>
  );
}

export function DetailOverlay({ game, onBack }: { game?: Game; onBack: () => void }) {
  if (!game) {
    return <div className="empty">Game not found. <button className="linkbtn" onClick={onBack}>← Back to gallery</button></div>;
  }
  return (
    <>
      <button className="back" onClick={onBack}>← All games</button>
      <div className="hint">drag to rotate · scroll to zoom</div>
      <div className="panel-wrap"><DetailPanel game={game} /></div>
    </>
  );
}
