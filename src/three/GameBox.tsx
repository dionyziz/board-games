import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { asset, type Game } from '../data';
import { makePaperBump } from './paperBump';
import { attachBoxShader, type FaceMap } from './boxShader';
import { acquire, release } from './textures';

// 1×1 black "no bump" texture for faces without a text bump map (photos).
const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
BLACK.needsUpdate = true;
const FACES = ['front', 'back', 'spine', 'top', 'bottom'] as const;

type Props = {
  game: Game;
  onClick?: (e: any) => void;
  onPointerOver?: (e: any) => void;
  onPointerOut?: (e: any) => void;
  [k: string]: any;
};

export default function GameBox({ game, onClick, onPointerOver, onPointerOut, ...rest }: Props) {
  const f = game.box.face || game.box.size;
  const W = f.w / 10, H = f.h / 10, D = f.d / 10;
  const t = game.textures;
  const paper = useMemo(() => makePaperBump(), []);
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null!);

  // all texture URLs this box needs (faces + any per-face bump maps)
  const urls = useMemo(() => {
    const u: string[] = [];
    for (const k of FACES) u.push(asset(t[k].src));
    for (const k of FACES) if (t[k]?.bump) u.push(asset(t[k].bump!));
    return u;
  }, [t]);

  useLayoutEffect(() => {
    const tex: FaceMap = {} as any, bump: FaceMap = {} as any;
    for (const k of FACES) (tex as any)[k] = acquire(asset(t[k].src), 'srgb');
    for (const k of FACES) (bump as any)[k] = t[k]?.bump ? acquire(asset(t[k].bump!), 'data') : BLACK;
    const m = matRef.current;
    m.bumpMap = paper; m.bumpScale = 0.9;
    m.customProgramCacheKey = () => 'gamebox'; // all boxes share one compiled program
    attachBoxShader(m, tex, bump, new THREE.Vector3(W / 2, H / 2, D / 2));
    return () => release(urls); // dispose-eligible once this box unmounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls, paper, W, H, D]);

  const radius = Math.min(W, H, D) * 0.06;
  return (
    <RoundedBox
      args={[W, H, D]} radius={radius} smoothness={6} castShadow
      onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} {...rest}
    >
      <meshPhysicalMaterial ref={matRef} color="#ffffff" roughness={0.6} metalness={0} clearcoat={0.45} clearcoatRoughness={0.34} envMapIntensity={1.0} />
    </RoundedBox>
  );
}
