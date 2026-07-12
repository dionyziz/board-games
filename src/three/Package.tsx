import type { Game } from '../data';
import GameBox from './GameBox';
import Cylinder from './Cylinder';
import Bag from './Bag';

// Dispatch on the game's real packaging shape. Cylinders and bags get their own
// mesh; everything else (box, and the material-only tin-rect, handled inside
// GameBox) renders as the rounded box.
export default function Package({ game, ...rest }: { game: Game; [k: string]: any }) {
  const shape = game.box.shape;
  if (shape === 'round-tin' || shape === 'tube') return <Cylinder game={game} {...rest} />;
  if (shape === 'bag') return <Bag game={game} {...rest} />;
  return <GameBox game={game} {...rest} />;
}
