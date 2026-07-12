import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { asset, type Game } from '../data';
import { acquire, release } from './textures';

// Soft pouches. Two kinds:
//  • foil pouch (Bag of Chips): a puffed rectangular "pillow" with the cover on it.
//  • fabric fish (Happy Salmon): the fish is cut out of the cover (cutout.webp,
//    transparent background) and puffed into a plush — the silhouette comes from
//    the texture's alpha, so the pouch is fish-shaped.
// The pillow = two bulged planes meeting at a flat perimeter (z→0 at the edges).
function puffPlane(W: number, H: number, puff: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(W, H, 32, 32);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const bx = Math.cos((p.getX(i) / (W / 2)) * Math.PI / 2);
    const by = Math.cos((p.getY(i) / (H / 2)) * Math.PI / 2);
    p.setZ(i, puff * Math.max(0, bx) * Math.max(0, by));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export default function Bag({ game, onClick, onPointerOver, onPointerOut, ...rest }: {
  game: Game; onClick?: (e: any) => void; onPointerOver?: (e: any) => void; onPointerOut?: (e: any) => void; [k: string]: any;
}) {
  const f = game.box.face || game.box.size;
  const fish = /happy-salmon|salmon/.test(game.id);           // fabric fish vs foil pouch
  const W = f.w / 10;
  const H = fish ? W * (344 / 618) : f.h / 10;                // fish plane matches the cutout aspect
  const puff = Math.min(W, H) * (fish ? 0.26 : 0.16);
  const url = asset(fish ? `/textures/${game.id}/cutout.webp` : game.textures.front.src);

  const geo = useMemo(() => puffPlane(W, H, puff), [W, H, puff]);
  const mats = useMemo(() => {
    const front = new THREE.MeshPhysicalMaterial({ color: '#ffffff' });
    const back = new THREE.MeshPhysicalMaterial({ color: fish ? '#ffffff' : (game.box.edgeColor || '#2a2a2e') });
    if (fish) {
      // plush fabric, texture drives the silhouette via alpha
      for (const m of [front, back]) { m.roughness = 0.92; m.metalness = 0; m.sheen = 0.7; m.sheenRoughness = 0.85; m.transparent = true; m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
    } else {
      front.roughness = back.roughness = 0.32; front.metalness = 0.25; back.metalness = 0.4;
      front.clearcoat = back.clearcoat = 0.5; front.clearcoatRoughness = 0.35;
    }
    return { front, back };
  }, [fish, game.box.edgeColor]);

  useLayoutEffect(() => {
    const tex = acquire(url, 'srgb');
    mats.front.map = tex; mats.front.needsUpdate = true;
    if (fish) { mats.back.map = tex; mats.back.needsUpdate = true; }
    return () => { release([url]); mats.front.dispose(); mats.back.dispose(); geo.dispose(); };
  }, [url, fish, mats, geo]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} {...rest}>
      <mesh geometry={geo} material={mats.front} castShadow />
      <mesh geometry={geo} material={mats.back} rotation={[0, Math.PI, 0]} castShadow />
    </group>
  );
}
