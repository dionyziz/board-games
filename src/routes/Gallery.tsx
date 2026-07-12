import { Suspense, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { ScrollControls, useScroll } from '@react-three/drei';
import { EffectComposer, SMAA } from '@react-three/postprocessing';
import * as THREE from 'three';
import { games } from '../data';
import GameBox from '../three/GameBox';
import { Env, Lights } from '../three/Lights';

const SPACING = 3.4;
const WINDOW = 4; // boxes rendered on each side of the focused one (virtualization)

function GalleryItem({ game, y }: { game: any; y: number }) {
  const navigate = useNavigate();
  const ref = useRef<THREE.Group>(null!);
  const [hover, setHover] = useState(false);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const s = hover ? 1.06 : 1;
    const k = 1 - Math.pow(0.0015, dt);
    ref.current.scale.lerp(new THREE.Vector3(s, s, s), k);
    const target = hover ? -0.35 : -0.6;
    ref.current.rotation.y += (target - ref.current.rotation.y) * Math.min(1, dt * 6);
  });
  return (
    <group ref={ref} position={[0, y, 0]} rotation-y={-0.6}>
      <GameBox
        game={game}
        onClick={(e: any) => { e.stopPropagation(); navigate('/game/' + game.id); }}
        onPointerOver={(e: any) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto'; }}
      />
    </group>
  );
}

function Column({ onCenter }: { onCenter: (i: number) => void }) {
  const scroll = useScroll();
  const grp = useRef<THREE.Group>(null!);
  const [center, setCenter] = useState(0);
  const last = useRef(-1);
  useFrame(() => {
    const c = scroll.offset * (games.length - 1);
    if (grp.current) grp.current.position.y = c * SPACING;
    const idx = Math.round(c);
    if (idx !== last.current) { last.current = idx; setCenter(idx); onCenter(idx); }
  });
  const lo = Math.max(0, center - WINDOW), hi = Math.min(games.length - 1, center + WINDOW);
  const items: number[] = [];
  for (let i = lo; i <= hi; i++) items.push(i);
  return (
    <group ref={grp}>
      {items.map((i) => (
        <Suspense key={games[i].id} fallback={null}>
          <GalleryItem game={games[i]} y={-i * SPACING} />
        </Suspense>
      ))}
    </group>
  );
}

export default function Gallery() {
  const [center, setCenter] = useState(0);
  const g = games[center];
  return (
    <div className="gallery">
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 35, position: [0, 0, 7] }}
        gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, antialias: false }}
      >
        <color attach="background" args={['#0b0b0c']} />
        <Suspense fallback={null}>
          <Env />
          <Lights />
          <ScrollControls pages={Math.max(2, games.length * 0.6)} damping={0.25}>
            <Column onCenter={setCenter} />
          </ScrollControls>
        </Suspense>
        <EffectComposer multisampling={4}><SMAA /></EffectComposer>
      </Canvas>
      <div className="gallery-overlay">
        <div className="top">
          <div className="brand">Jason's board games</div>
          <div className="count">{games.length} games</div>
        </div>
        <div className="centered">
          <h2>{g?.title}</h2>
          {g?.designers?.length ? <div className="by">{g.designers.join(', ')}</div> : null}
        </div>
        <div className="scrollhint">scroll ↓ · click a box to open</div>
      </div>
    </div>
  );
}
