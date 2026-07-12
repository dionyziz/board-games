import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { asset, type Game } from '../data';
import { acquire, release } from './textures';

// Soft pouches. Kind comes from box.bag (never hard-coded here):
//  • 'foil' (Bag of Chips): a puffed rectangular "pillow" with the cover on it.
//  • 'fish' (Happy Salmon): a CLOSED puffed pouch extruded from the measured fish
//    silhouette (box.bagOutline), textured with the fish cutout — a real volume,
//    not two loose planes.
function pillowGeometry(W: number, H: number, puff: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(W, H, 32, 32);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const bx = Math.cos((p.getX(i) / (W / 2)) * Math.PI / 2);
    const by = Math.cos((p.getY(i) / (H / 2)) * Math.PI / 2);
    p.setZ(i, puff * Math.max(0, bx) * Math.max(0, by));
  }
  p.needsUpdate = true; g.computeVertexNormals();
  return g;
}
function pouchGeometry(poly: number[][], W: number, H: number, puff: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  poly.forEach(([fx, fy], i) => { const x = (fx - 0.5) * W, y = (0.5 - fy) * H; i ? shape.lineTo(x, y) : shape.moveTo(x, y); });
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: puff, bevelEnabled: true, bevelThickness: puff, bevelSize: puff, bevelSegments: 4, steps: 1 });
  g.translate(0, 0, -puff); // centre the puff on z
  g.computeVertexNormals();
  return g;
}

export default function Bag({ game, onClick, onPointerOver, onPointerOut, ...rest }: {
  game: Game; onClick?: (e: any) => void; onPointerOver?: (e: any) => void; onPointerOut?: (e: any) => void; [k: string]: any;
}) {
  const box = game.box;
  const f = box.face || box.size;
  const fish = box.bag === 'fish';
  const outline = box.bagOutline;
  const W = f.w / 10;
  const H = fish && outline ? W / outline.aspect : f.h / 10;
  const puff = Math.min(W, H) * (fish ? 0.18 : 0.16);
  const url = asset(fish ? `/textures/${game.id}/cutout.webp` : game.textures.front.src);

  const geo = useMemo(
    () => (fish && outline ? pouchGeometry(outline.poly, W, H, puff) : pillowGeometry(W, H, puff)),
    [fish, outline, W, H, puff],
  );
  const mats = useMemo(() => {
    const front = new THREE.MeshPhysicalMaterial({ color: '#ffffff' });
    const back = new THREE.MeshPhysicalMaterial({ color: fish ? '#ffffff' : (box.edgeColor || '#2a2a2e') });
    if (fish) {
      for (const m of [front, back]) { m.roughness = 0.9; m.metalness = 0; m.sheen = 0.7; m.sheenRoughness = 0.85; m.transparent = true; m.alphaTest = 0.35; m.side = THREE.DoubleSide; }
    } else {
      front.roughness = back.roughness = 0.32; front.metalness = 0.25; back.metalness = 0.4;
      front.clearcoat = back.clearcoat = 0.5; front.clearcoatRoughness = 0.35;
    }
    return { front, back };
  }, [fish, box.edgeColor]);

  useLayoutEffect(() => {
    const tex = acquire(url, 'srgb');
    if (fish && outline) {
      // ExtrudeGeometry cap UVs are raw local (x,y); map the cutout onto the bbox
      tex.center.set(0, 0); tex.repeat.set(1 / W, 1 / H); tex.offset.set(0.5, 0.5);
    }
    mats.front.map = tex; mats.front.needsUpdate = true;
    if (fish) { mats.back.map = tex; mats.back.needsUpdate = true; }
    return () => {
      if (fish && outline) { tex.center.set(0.5, 0.5); tex.repeat.set(1, 1); tex.offset.set(0, 0); }
      release([url]); mats.front.dispose(); mats.back.dispose(); geo.dispose();
    };
  }, [url, fish, outline, mats, geo, W, H]);

  // extruded pouch is a single closed solid; the pillow is two bulged planes
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} {...rest}>
      <mesh geometry={geo} material={mats.front} castShadow />
      {fish && outline ? null : <mesh geometry={geo} material={mats.back} rotation={[0, Math.PI, 0]} castShadow />}
    </group>
  );
}
