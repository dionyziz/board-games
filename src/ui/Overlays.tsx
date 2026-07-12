import { games, type Game } from '../data';
import DetailPanel from './DetailPanel';

export function GalleryOverlay({ game }: { game?: Game }) {
  return (
    <div className="gallery-overlay fade-in">
      <div className="top">
        <div className="brand">Jason's board games</div>
        <div className="count">{games.length} games</div>
      </div>
      <div className="centered">
        <h2>{game?.title}</h2>
        {game?.designers?.length ? <div className="by">{game.designers.join(', ')}</div> : null}
      </div>
      <div className="scrollhint">scroll ↓ · click a box to open</div>
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
      <div className="dims">{game.box.size.w} × {game.box.size.h} × {game.box.size.d} cm</div>
      <div className="panel-wrap"><DetailPanel game={game} /></div>
    </>
  );
}
