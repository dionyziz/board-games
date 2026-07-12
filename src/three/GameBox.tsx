import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { asset, type Game } from '../data';
import { makePaperBump } from './paperBump';
import { attachBoxShader, type FaceMap } from './boxShader';
import { acquire, release } from './textures';
import Flap from './Flap';

// 1×1 black "no bump" texture for faces without a text bump map (photos).
const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
BLACK.needsUpdate = true;
const FACES = ['front', 'back', 'spine', 'top', 'bottom'] as const;

// Rectangular metal tin (Sushi Go!, Forbidden Island): a rounded-rectangle
// profile extruded along the depth — rounded corners on the sides, but a FLAT
// front/back with crisp (un-bevelled) edges, so face-on it reads as a rounded
// rectangle without the front art bending over the edges.
function tinGeometry(W: number, H: number, D: number, cornerR = 0.07): THREE.ExtrudeGeometry {
  const r = Math.min(W, H) * cornerR, x = -W / 2, y = -H / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + W - r, y); s.quadraticCurveTo(x + W, y, x + W, y + r);
  s.lineTo(x + W, y + H - r); s.quadraticCurveTo(x + W, y + H, x + W - r, y + H);
  s.lineTo(x + r, y + H); s.quadraticCurveTo(x, y + H, x, y + H - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false, curveSegments: 8, steps: 1 });
  g.translate(0, 0, -D / 2); // centre on z: flat front at +D/2, back at −D/2
  g.computeVertexNormals();
  return g;
}

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
    // rectangular metal tins (Forbidden Island, Sushi Go!): a glossier, smoother
    // sheen than coated cardboard — kept non-metallic so the printed art survives.
    if (game.box.shape === 'tin-rect') { m.roughness = 0.34; m.clearcoat = 0.6; m.clearcoatRoughness = 0.2; m.envMapIntensity = 1.25; m.bumpScale = 0.4; }
    return () => release(urls); // dispose-eligible once this box unmounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls, paper, W, H, D]);

  const isTin = game.box.shape === 'tin-rect';
  const geom = useMemo(() => (isTin ? tinGeometry(W, H, D, game.box.cornerR) : null), [isTin, W, H, D, game.box.cornerR]);
  useEffect(() => () => geom?.dispose(), [geom]);

  const material = (
    <meshPhysicalMaterial ref={matRef} color="#ffffff" roughness={0.6} metalness={0} clearcoat={0.45} clearcoatRoughness={0.34} envMapIntensity={1.0} />
  );
  const radius = Math.min(W, H, D) * 0.06;
  const boxMesh = geom
    ? <mesh geometry={geom} castShadow>{material}</mesh>
    : <RoundedBox args={[W, H, D]} radius={radius} smoothness={6} castShadow>{material}</RoundedBox>;

  // group so events cover the box + any hang-tab flap, and the flap rides along
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} {...rest}>
      {boxMesh}
      {game.box.flap ? <Flap game={game} /> : null}
    </group>
  );
}
