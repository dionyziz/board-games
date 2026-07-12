import type { Game } from '../data';
import GameBox from './GameBox';
import Cylinder from './Cylinder';

// Dispatch on the game's real packaging shape. Cylindrical shapes get their own
// mesh; everything else (box, and the material-only variants tin-rect/blister/
// bag/other, handled inside GameBox) renders as the rounded box.
export default function Package({ game, ...rest }: { game: Game; [k: string]: any }) {
  const shape = game.box.shape;
  if (shape === 'round-tin' || shape === 'tube') return <Cylinder game={game} {...rest} />;
  return <GameBox game={game} {...rest} />;
}
