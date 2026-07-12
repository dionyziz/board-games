import { decode, type Game } from '../data';

export default function DetailPanel({ game }: { game: Game }) {
  const players = game.players && game.players.max != null
    ? game.players.min === game.players.max ? `${game.players.max}` : `${game.players.min}–${game.players.max}`
    : '—';
  const time = game.playtime && game.playtime.max != null
    ? game.playtime.min === game.playtime.max ? `${game.playtime.max}` : `${game.playtime.min}–${game.playtime.max}`
    : null;
  return (
    <aside className="panel">
      <div className="eyebrow">Jason's board games</div>
      <h1>{game.title}</h1>
      {game.designers?.length ? <div className="byline">{game.designers.join(', ')}</div> : null}
      <div className="meta">
        <div><div className="k">Players</div><div className="v">{players}</div></div>
        <div><div className="k">Play time</div><div className="v">{time ? time + ' min' : '—'}</div></div>
        <div><div className="k">Complexity</div><div className="v">{game.complexity ? game.complexity.toFixed(1) + ' / 5' : '—'}</div></div>
        <div><div className="k">Published</div><div className="v">{game.year || '—'}</div></div>
      </div>
      {game.categories?.length ? (
        <div className="chips">{game.categories.slice(0, 6).map((c) => <span className="chip" key={c}>{c}</span>)}</div>
      ) : null}
      {(game.description || game.shortDescription) ? (
        <div className="desc"><p>{decode(game.description || game.shortDescription)}</p></div>
      ) : null}
      {game.bggUrl ? <a className="bgg" href={game.bggUrl} target="_blank" rel="noreferrer">View on BoardGameGeek →</a> : null}
    </aside>
  );
}
