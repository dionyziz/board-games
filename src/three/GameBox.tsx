import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBox, useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { asset, type Game } from '../data';
import { makePaperBump } from './paperBump';
import { attachBoxShader } from './boxShader';

type Props = {
  game: Game;
  onClick?: (e: any) => void;
  onPointerOver?: (e: any) => void;
  onPointerOut?: (e: any) => void;
  [k: string]: any;
};

// One MeshPhysicalMaterial for the whole box; per-face art via the injected
// box-projection shader. Coated-cardboard realism: clearcoat + paper bump +
// in-shader roughness jitter + rounded bevels.
export default function GameBox({ game, onClick, onPointerOver, onPointerOut, ...rest }: Props) {
  const f = game.box.face || game.box.size;
  const W = f.w / 10, H = f.h / 10, D = f.d / 10;
  const t = game.textures;
  const tex = useTexture({
    front: asset(t.front.src), back: asset(t.back.src), spine: asset(t.spine.src),
    top: asset(t.top.src), bottom: asset(t.bottom.src),
  }) as any;

  const bump = useMemo(() => makePaperBump(), []);
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null!);

  useLayoutEffect(() => {
    for (const k of ['front', 'back', 'spine', 'top', 'bottom']) {
      const tx = tex[k] as THREE.Texture;
      tx.colorSpace = THREE.SRGBColorSpace;
      tx.anisotropy = maxAniso;
      tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
      tx.needsUpdate = true;
    }
    const m = matRef.current;
    m.bumpMap = bump;
    m.bumpScale = 0.9;
    attachBoxShader(m, tex, new THREE.Vector3(W / 2, H / 2, D / 2));
  }, [tex, bump, maxAniso, W, H, D]);

  const radius = Math.min(W, H, D) * 0.06;
  return (
    <RoundedBox
      args={[W, H, D]}
      radius={radius}
      smoothness={6}
      castShadow
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      {...rest}
    >
      <meshPhysicalMaterial
        ref={matRef}
        color="#ffffff"
        roughness={0.6}
        metalness={0}
        clearcoat={0.45}
        clearcoatRoughness={0.34}
        envMapIntensity={1.0}
      />
    </RoundedBox>
  );
}
