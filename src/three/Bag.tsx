import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { asset, type Game } from '../data';
import { acquire, release } from './textures';
import { pillowGeometry, pouchGeometry } from './geometry';

// Soft pouches, kind from box.bag:
//  • 'foil' (Bag of Chips): a creased pillow with the cover printed on it.
//  • 'fish' (Happy Salmon): a closed puffed pouch of the measured fish silhouette
//    (box.bagOutline) textured with the fish cutout.
// Both render a front + a back (rotated) mesh sharing one geometry, so the two
// bulged faces meet at the silhouette/edge — a real closed pouch, not two planes.
export default function Bag({ game, onClick, onPointerOver, onPointerOut, ...rest }: {
  game: Game; onClick?: (e: any) => void; onPointerOver?: (e: any) => void; onPointerOut?: (e: any) => void; [k: string]: any;
}) {
  const box = game.box;
  const f = box.face || box.size;
  const fish = box.bag === 'fish';
  const outline = box.bagOutline;
  const W = f.w / 10;
  const H = fish && outline ? W / outline.aspect : f.h / 10;
  const puff = Math.min(W, H) * (fish ? 0.22 : 0.18);
  const url = asset(fish ? `/textures/${game.id}/cutout.webp` : game.textures.front.src);

  const geo = useMemo(
    () => (fish && outline ? pouchGeometry(outline.poly, W, H, puff) : pillowGeometry(W, H, puff, !fish)),
    [fish, outline, W, H, puff],
  );
  const mats = useMemo(() => {
    const front = new THREE.MeshPhysicalMaterial({ color: '#ffffff' });
    const back = new THREE.MeshPhysicalMaterial({ color: fish ? '#ffffff' : (box.edgeColor || '#2a2a2e') });
    if (fish) {
      // closed pouch is one opaque mesh; alphaTest clips any edge overshoot (no
      // transparency sorting), DoubleSide guards against winding surprises
      for (const m of [front, back]) { m.roughness = 0.9; m.sheen = 0.7; m.sheenRoughness = 0.85; m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
    } else {
      front.roughness = back.roughness = 0.32; front.metalness = 0.25; back.metalness = 0.4;
      front.clearcoat = back.clearcoat = 0.5; front.clearcoatRoughness = 0.35;
    }
    return { front, back };
  }, [fish, box.edgeColor]);

  useLayoutEffect(() => {
    const tex = acquire(url, 'srgb');
    mats.front.map = tex; mats.front.needsUpdate = true;
    if (fish) { mats.back.map = tex; mats.back.needsUpdate = true; }
    return () => { release([url]); mats.front.dispose(); mats.back.dispose(); geo.dispose(); };
  }, [url, fish, mats, geo]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} {...rest}>
      <mesh geometry={geo} material={mats.front} castShadow />
      {/* fish is a single watertight pouch (both caps in one geometry); the foil
          pillow needs a mirrored back plane to close it */}
      {fish ? null : <mesh geometry={geo} material={mats.back} scale={[1, 1, -1]} castShadow />}
    </group>
  );
}
