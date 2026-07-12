import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { asset, type Game } from '../data';

// Render a ready-made glTF package (box.model) with OUR label re-textured onto it.
// The model keeps its own normal/roughness maps (the wrinkles that make a foil bag
// "flow"); only the base-colour is swapped for our re-labelled atlas
// (public/textures/<id>/chipbag-atlas.png — our cover pasted into the model's
// front-label UV region). The mesh is stood up (its front faces the camera) and
// scaled to the game's box slot.
const loader = new THREE.TextureLoader();

export default function Model({ game, onClick, onPointerOver, onPointerOut, ...rest }: {
  game: Game; onClick?: (e: any) => void; onPointerOver?: (e: any) => void; onPointerOut?: (e: any) => void; [k: string]: any;
}) {
  const { scene } = useGLTF(asset(game.box.model!));
  const f = game.box.face || game.box.size;

  const { root, disposables } = useMemo(() => {
    const root = (scene as THREE.Group).clone(true);
    const map = loader.load(asset(`/textures/${game.id}/chipbag-atlas.png`));
    map.flipY = false; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    const disposables: (THREE.Material | THREE.Texture)[] = [map];
    root.traverse((o: any) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const m = (o.material as THREE.MeshStandardMaterial).clone();
      m.map = map; m.metalness = Math.min(m.metalness ?? 0, 0.25); // keep a foil sheen, but let the print read
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
