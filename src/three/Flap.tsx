import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { asset, type Game } from '../data';
import { acquire, release } from './textures';

// The retail hang-tab flap (Uno, Ναι ή Όχι, …) as a thin 3D tab standing up from
// the top of the box — its art was split off the front cover by 14-fix-fronts, so
// it's no longer part of the front face. A thin box: front/back = flap art, the
// rim = the box's side colour.
export default function Flap({ game }: { game: Game }) {
  const f = game.box.face || game.box.size;
  const W = f.w / 10, H = f.h / 10, D = f.d / 10;
  const flapH = H * (game.box.flap!.hFrac || 0.15);
  const url = asset(game.box.flap!.src);
  const thick = Math.max(D * 0.14, 0.03);

  const geo = useMemo(() => new THREE.BoxGeometry(W, flapH, thick), [W, flapH, thick]);
  const mats = useMemo(() => {
    const art = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.34 });
    const band = new THREE.MeshPhysicalMaterial({ color: game.box.sideColor || '#cccccc', roughness: 0.6 });
    return { art, band };
  }, [game.box.sideColor]);

  useLayoutEffect(() => {
    const t = acquire(url, 'srgb');
    mats.art.map = t; mats.art.needsUpdate = true;
    return () => { release([url]); mats.art.dispose(); mats.band.dispose(); geo.dispose(); };
  }, [url, mats, geo]);

  // BoxGeometry material order: +x, −x, +y, −y, +z, −z → art on the ±z faces
  const material = [mats.band, mats.band, mats.band, mats.band, mats.art, mats.art];
  return <mesh geometry={geo} material={material} position={[0, H / 2 + flapH / 2, 0]} castShadow />;
}
