import { Suspense } from 'react';
import type { Game } from '../data';
import GameBox from './GameBox';
import Cylinder from './Cylinder';
import Bag from './Bag';
import Model from './Model';

// Dispatch on the game's real packaging. A ready-made glTF (box.model) wins;
// then cylinders and bags get their own mesh; everything else (box, and the
// material-only tin-rect inside GameBox) renders as the rounded box.
export default function Package({ game, ...rest }: { game: Game; [k: string]: any }) {
  const shape = game.box.shape;
  if (game.box.model) return <Suspense fallback={null}><Model game={game} {...rest} /></Suspense>;
  if (shape === 'round-tin' || shape === 'tube') return <Cylinder game={game} {...rest} />;
  if (shape === 'bag') return <Bag game={game} {...rest} />;
  return <GameBox game={game} {...rest} />;
}
