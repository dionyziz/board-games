import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { asset, type Game } from '../data';

// Render a ready-made glTF package (box.model). Our label is baked into the GLB's
// base-colour (scripts/bake-chipbag-glb.js), so it ships only the textures we use
// (our art + the model's normal/roughness wrinkle maps) — nothing to swap at
// runtime. The mesh is stood up (its front faces the camera) and scaled to the slot.
export default function Model({ game, onClick, onPointerOver, onPointerOut, ...rest }: {
  game: Game; onClick?: (e: any) => void; onPointerOver?: (e: any) => void; onPointerOut?: (e: any) => void; [k: string]: any;
}) {
  const { scene } = useGLTF(asset(game.box.model!));
  const f = game.box.face || game.box.size;

  const { root, disposables } = useMemo(() => {
    const root = (scene as THREE.Group).clone(true);
    const disposables: THREE.Material[] = [];
    root.traverse((o: any) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const m = (o.material as THREE.MeshStandardMaterial).clone();
      m.metalness = Math.min(m.metalness ?? 0, 0.25); // keep a foil sheen, but let the print read
      m.needsUpdate = true;
      o.material = m; disposables.push(m);
    });
    // the model's own node transforms already stand it upright with the front
    // facing +z, so no extra rotation — just centre + uniformly scale to the slot
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), size = new THREE.Vector3(), ctr = new THREE.Vector3();
    box.getSize(size); box.getCenter(ctr);
    const s = Math.min((f.w / 10) / size.x, (f.h / 10) / size.y);
    root.scale.setScalar(s);
    root.position.copy(ctr).multiplyScalar(-s);
    return { root, disposables };
  }, [scene, game.id, f.w, f.h]);

  useEffect(() => () => disposables.forEach((d) => d.dispose()), [disposables]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} {...rest}>
      <primitive object={root} />
    </group>
  );
}
