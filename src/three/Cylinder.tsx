import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { asset, type Game } from '../data';
import { acquire, release } from './textures';

// Round tins (Dobble) and cardboard tubes (Chupacabra, Zombie Dice). A
// CylinderGeometry hands us three material groups — [side, topCap, bottomCap] —
// so caps and side get different textures/materials without a custom shader.
//   tube : cover art WRAPS the side, plain caps, matte cardboard.
//   tin  : cover art on the top LID cap (optionally cropped from an angled product
//          shot via box.capCrop), glossy metal band + base.
type Props = {
  game: Game;
  onClick?: (e: any) => void;
  onPointerOver?: (e: any) => void;
  onPointerOut?: (e: any) => void;
  [k: string]: any;
};

export default function Cylinder({ game, onClick, onPointerOver, onPointerOut, ...rest }: Props) {
  const box = game.box;
  const isTube = box.shape === 'tube';
  const cyl = box.cyl || { diameter: (box.size.w + box.size.h) / 2, height: box.size.d };
  const R = cyl.diameter / 2 / 10;
  const Hc = cyl.height / 10;
  const coverUrl = asset(game.textures.front.src);

  const mats = useMemo(() => {
    const mk = () => new THREE.MeshPhysicalMaterial({ color: '#ffffff' });
    const arr = [mk(), mk(), mk()]; // side, top cap, bottom cap
    arr.forEach((m) => (m.customProgramCacheKey = () => 'cyl'));
    return arr;
  }, []);

  useLayoutEffect(() => {
    const cover = acquire(coverUrl, 'srgb');
    const [side, top, bottom] = mats;
    const band = box.sideColor || '#c9c9cd';
    const edge = box.edgeColor || '#33333a';
    if (isTube) {
      side.map = cover; side.color.set('#ffffff');
      side.metalness = 0; side.roughness = 0.62; side.clearcoat = 0.22; side.clearcoatRoughness = 0.4;
      top.map = null; top.color.set(edge); top.metalness = 0; top.roughness = 0.72;
      bottom.map = null; bottom.color.set(edge); bottom.metalness = 0; bottom.roughness = 0.72;
    } else {
      top.map = cover; top.color.set('#ffffff');
      top.metalness = 0.12; top.roughness = 0.42; top.clearcoat = 0.5; top.clearcoatRoughness = 0.28; top.envMapIntensity = 1.1;
      side.map = null; side.color.set(band); side.metalness = 0.85; side.roughness = 0.3; side.clearcoat = 0.2;
      bottom.map = null; bottom.color.set(edge); bottom.metalness = 0.85; bottom.roughness = 0.35;
      // isolate the round lid art from an angled product shot (image-space cx,cy,r)
      if (box.capCrop) {
        const { cx, cy, r } = box.capCrop;
        cover.center.set(0.5, 0.5);
        // negative v scale: rotating the tin's +Y lid to face +Z maps the cap's
        // texture up-axis to world-down, so flip v here to keep the art upright.
        cover.repeat.set(2 * r, -2 * r);
        cover.offset.set(cx - 0.5, 0.5 - cy);
      }
    }
    mats.forEach((m) => (m.needsUpdate = true));
    return () => {
      cover.center.set(0, 0); cover.repeat.set(1, 1); cover.offset.set(0, 0); // leave the pooled texture clean
      release([coverUrl]);
    };
  }, [coverUrl, isTube, mats, box]);

  useLayoutEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);

  // tube stands upright (axis Y); tin faces the camera with its lid (axis → Z),
  // and is spun so the cover's centre (uv 0.5, at −Z) turns to face front.
  const rotation: [number, number, number] = isTube ? [0, Math.PI, 0] : [Math.PI / 2, 0, 0];
  return (
    <mesh
      rotation={rotation} castShadow material={mats}
      onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} {...rest}
    >
      <cylinderGeometry args={[R, R, Hc, 64, 1, false]} />
    </mesh>
  );
}
