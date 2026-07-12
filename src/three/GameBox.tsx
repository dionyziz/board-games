import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBox, useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { asset, type Game } from '../data';
import { makePaperBump } from './paperBump';
import { attachBoxShader, type FaceMap } from './boxShader';

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

  const tex = useTexture({
    front: asset(t.front.src), back: asset(t.back.src), spine: asset(t.spine.src),
    top: asset(t.top.src), bottom: asset(t.bottom.src),
  }) as any;
  // only load the bump maps that exist (procedural/cover-derived faces)
  const bumpUrls = useMemo(() => {
    const o: Record<string, string> = {};
    for (const k of FACES) if (t[k]?.bump) o[k] = asset(t[k].bump!);
    return o;
  }, [t]);
  const bumpLoaded = useTexture(bumpUrls) as any;

  const paper = useMemo(() => makePaperBump(), []);
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null!);

  useLayoutEffect(() => {
    for (const k of FACES) {
      const tx = tex[k] as THREE.Texture;
      tx.colorSpace = THREE.SRGBColorSpace;
      tx.anisotropy = maxAniso;
      tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
      tx.needsUpdate = true;
    }
    const bumpMap: FaceMap = {} as any;
    for (const k of FACES) {
      const b = bumpLoaded[k] as THREE.Texture | undefined;
      if (b) { b.colorSpace = THREE.NoColorSpace; b.anisotropy = maxAniso; b.wrapS = b.wrapT = THREE.ClampToEdgeWrapping; b.needsUpdate = true; }
      (bumpMap as any)[k] = b || BLACK;
    }
    const m = matRef.current;
    m.bumpMap = paper;      // global paper grain (whole box)
    m.bumpScale = 0.9;
    attachBoxShader(m, tex as FaceMap, bumpMap, new THREE.Vector3(W / 2, H / 2, D / 2));
  }, [tex, bumpLoaded, paper, maxAniso, W, H, D]);

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
