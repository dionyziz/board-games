import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Local RoomEnvironment (no remote HDR) for the coated-cover reflections.
export function Env() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => { env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
}

// Studio key + rim + under-fill. When `follow`, a highlight light tracks the
// camera so whichever face you view catches a specular lobe (all-around sheen).
export function Lights({ follow = false }: { follow?: boolean }) {
  const followRef = useRef<THREE.DirectionalLight>(null!);
  const camDir = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3(0, 1, 0));

  useFrame(({ camera }) => {
    if (!follow || !followRef.current) return;
    camera.getWorldDirection(camDir.current);
    right.current.crossVectors(camDir.current, up.current).normalize();
    followRef.current.position
      .copy(camera.position)
      .addScaledVector(right.current, 2.5)
      .addScaledVector(up.current, 3.0);
  });

  return (
    <>
      <hemisphereLight args={['#cfd6e6', '#0a0a0b', 0.35]} />
      <directionalLight
        color="#fff6ec"
        intensity={2.4}
        position={[4, 7, 5]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
      />
      <directionalLight color="#8fb4ff" intensity={1.0} position={[-5, 3, -4]} />
      <directionalLight color="#aeb6c6" intensity={0.55} position={[-1.5, -5, 2.5]} />
      {follow && <directionalLight ref={followRef} color="#fff6ec" intensity={1.15} />}
    </>
  );
}
