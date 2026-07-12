import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { asset, type Game } from '../data';
import { acquire, release } from './textures';

// Soft pouches (Bag of Chips foil pouch, Happy Salmon fabric bag). A true bag is
// out of scope, so we approximate with a "pillow": two bulged planes that meet at
// a flat perimeter (z→0 at the edges), giving a puffy cushion. The cover art sits
// on the front bulge; the back is a plain panel. Foil = glossy, cloth = matte.
function puffPlane(W: number, H: number, puff: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(W, H, 28, 28);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const bx = Math.cos((p.getX(i) / (W / 2)) * Math.PI / 2);
    const by = Math.cos((p.getY(i) / (H / 2)) * Math.PI / 2);
    p.setZ(i, puff * Math.max(0, bx) * Math.max(0, by)); // 1 in the centre, 0 at every edge
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export default function Bag({ game, onClick, onPointerOver, onPointerOut, ...rest }: {
  game: Game; onClick?: (e: any) => void; onPointerOver?: (e: any) => void; onPointerOut?: (e: any) => void; [k: string]: any;
}) {
  const f = game.box.face || game.box.size;
  const W = f.w / 10, H = f.h / 10;
  const puff = Math.min(W, H) * 0.16;
  const coverUrl = asset(game.textures.front.src);
  const cloth = /happy-salmon|salmon/.test(game.id); // fabric pouch vs foil pouch

  const geo = useMemo(() => puffPlane(W, H, puff), [W, H, puff]);
  const mats = useMemo(() => {
    const front = new THREE.MeshPhysicalMaterial({ color: '#ffffff' });
    const back = new THREE.MeshPhysicalMaterial({ color: game.box.edgeColor || '#2a2a2e' });
    if (cloth) {
      front.roughness = back.roughness = 0.9; front.metalness = back.metalness = 0; front.sheen = 0.6; front.sheenRoughness = 0.8;
    } else {
      front.roughness = back.roughness = 0.32; front.metalness = 0.25; back.metalness = 0.4; front.clearcoat = back.clearcoat = 0.5; front.clearcoatRoughness = 0.35;
    }
    return { front, back };
  }, [cloth, game.box.edgeColor]);

  useLayoutEffect(() => {
    const cover = acquire(coverUrl, 'srgb');
    mats.front.map = cover; mats.front.needsUpdate = true;
    return () => { release([coverUrl]); mats.front.dispose(); mats.back.dispose(); geo.dispose(); };
  }, [coverUrl, mats, geo]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} {...rest}>
      <mesh geometry={geo} material={mats.front} castShadow />
      <mesh geometry={geo} material={mats.back} rotation={[0, Math.PI, 0]} castShadow />
    </group>
  );
}
