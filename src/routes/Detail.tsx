import { Suspense, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { TrackballControls, ContactShadows } from '@react-three/drei';
import { EffectComposer, SMAA } from '@react-three/postprocessing';
import * as THREE from 'three';
import { bySlug } from '../data';
import GameBox from '../three/GameBox';
import { Env, Lights } from '../three/Lights';
import DetailPanel from '../ui/DetailPanel';

function Stage({ game }: { game: any }) {
  const f = game.box.face || game.box.size;
  const H = f.h / 10;
  const grp = useRef<THREE.Group>(null!);
  const ground = useRef<any>(null!);
  const spun = useRef(false);
  useFrame(({ camera }) => {
    if (!spun.current && grp.current) grp.current.rotation.y += 0.0025;
    if (ground.current) ground.current.visible = camera.position.y > -H / 2 + 0.02;
  });
  return (
    <>
      <group ref={grp} rotation-y={-0.5} onPointerDown={() => (spun.current = true)}>
        <GameBox game={game} />
      </group>
      <ContactShadows ref={ground} position={[0, -H / 2 - 0.01, 0]} scale={12} blur={2.6} opacity={0.42} far={9} />
    </>
  );
}

export default function Detail() {
  const { slug } = useParams();
  const game = bySlug(slug!);
  if (!game) return <div className="empty">Game not found. <Link to="/">← Back to gallery</Link></div>;
  return (
    <div className="detail">
      <div className="stage">
        <Link to="/" className="back">← All games</Link>
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ fov: 35, position: [3, 2.1, 6.2] }}
          gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, antialias: false }}
        >
          <color attach="background" args={['#0b0b0c']} />
          <Suspense fallback={null}>
            <Env />
            <Lights follow />
            <Stage game={game} />
          </Suspense>
          <TrackballControls rotateSpeed={3} zoomSpeed={1.2} noPan minDistance={3.5} maxDistance={11} dynamicDampingFactor={0.12} />
          <EffectComposer multisampling={4}><SMAA /></EffectComposer>
        </Canvas>
        <div className="hint">drag to rotate · scroll to zoom</div>
        <div className="dims">{game.box.size.w} × {game.box.size.h} × {game.box.size.d} cm</div>
      </div>
      <DetailPanel game={game} />
    </div>
  );
}
