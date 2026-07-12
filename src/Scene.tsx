import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { TrackballControls, ContactShadows } from '@react-three/drei';
import { EffectComposer, SMAA } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { Game } from './data';
import GameBox from './three/GameBox';
import { Env, Lights } from './three/Lights';

const SPACING = 3.4;
const WINDOW = 4;
const GAL_POS = new THREE.Vector3(0, 0, 7);
const DET_POS = new THREE.Vector3(3.0, 2.1, 6.2);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const smooth = (t: number) => t * t * (3 - 2 * t);
type Tr = { p: number; selected: number };

function Item({ game, index, tr, onOpen }: { game: Game; index: number; tr: React.MutableRefObject<Tr>; onOpen: (id: string) => void }) {
  const ref = useRef<THREE.Group>(null!);
  const [hover, setHover] = useState(false);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const grp = ref.current;
    if (!grp) return;
    const { p, selected } = tr.current;
    const isSel = selected === index;
    let target = hover ? 1.06 : 1;
    if (selected >= 0) target = isSel ? 1 : 1 - p;
    grp.scale.lerp(v.set(target, target, target), 1 - Math.pow(0.0015, dt));
    const rot = isSel ? -0.5 : hover ? -0.35 : -0.6;
    grp.rotation.y += (rot - grp.rotation.y) * Math.min(1, dt * 6);
  });
  return (
    <group ref={ref} position={[0, -index * SPACING, 0]} rotation-y={-0.6}>
      <GameBox
        game={game}
        onClick={(e: any) => { e.stopPropagation(); onOpen(game.id); }}
        onPointerOver={(e: any) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto'; }}
      />
    </group>
  );
}

function SceneInner({ list, selectedIndex, onOpen, onCenter }: {
  list: Game[]; selectedIndex: number; onOpen: (id: string) => void; onCenter: (i: number) => void;
}) {
  const { camera, gl } = useThree();
  const tr = useRef<Tr>({ p: selectedIndex >= 0 ? 1 : 0, selected: selectedIndex });
  const column = useRef<THREE.Group>(null!);
  const ground = useRef<any>(null!);
  const scroll = useRef(selectedIndex >= 0 ? selectedIndex : 0);
  const scrollTarget = useRef(scroll.current);
  const anchor = useRef(DET_POS.clone());
  const lastSel = useRef(selectedIndex);
  const [settled, setSettled] = useState(selectedIndex >= 0);
  const lastCenter = useRef(-1);
  const camPos = useMemo(() => new THREE.Vector3(), []);
  const [center, setCenter] = useState(selectedIndex >= 0 ? selectedIndex : 0);

  useLayoutEffect(() => {
    camera.position.copy(selectedIndex >= 0 ? DET_POS : GAL_POS);
    camera.lookAt(0, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // wheel + touch scroll (gallery only)
  useEffect(() => {
    const el = gl.domElement;
    const N = () => list.length;
    const onWheel = (e: WheelEvent) => {
      if (tr.current.selected >= 0) return;
      scrollTarget.current = THREE.MathUtils.clamp(scrollTarget.current + e.deltaY * 0.0022, 0, N() - 1);
    };
    let lastY = 0;
    const onTouchStart = (e: TouchEvent) => { lastY = e.touches[0].clientY; };
    const onTouchMove = (e: TouchEvent) => {
      if (tr.current.selected >= 0) return;
      const y = e.touches[0].clientY;
      scrollTarget.current = THREE.MathUtils.clamp(scrollTarget.current + (lastY - y) * 0.01, 0, N() - 1);
      lastY = y;
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => { el.removeEventListener('wheel', onWheel); el.removeEventListener('touchstart', onTouchStart); el.removeEventListener('touchmove', onTouchMove); };
  }, [gl, list]);

  // clamp scroll when the filtered list shrinks
  useEffect(() => {
    scrollTarget.current = THREE.MathUtils.clamp(scrollTarget.current, 0, Math.max(0, list.length - 1));
  }, [list.length]);

  useEffect(() => {
    if (selectedIndex !== lastSel.current) {
      if (selectedIndex >= 0) { anchor.current.copy(DET_POS); scrollTarget.current = selectedIndex; }
      else { anchor.current.copy(camera.position); }
      lastSel.current = selectedIndex;
      setSettled(false);
    }
    tr.current.selected = selectedIndex;
  }, [selectedIndex, camera]);

  useFrame((state, dt) => {
    const t = tr.current;
    const goal = t.selected >= 0 ? 1 : 0;
    t.p += (goal - t.p) * Math.min(1, dt * 3.2);
    if (Math.abs(t.p - goal) < 0.002) t.p = goal;
    const p = smooth(t.p);

    scroll.current += (scrollTarget.current - scroll.current) * Math.min(1, dt * 6);
    if (column.current) column.current.position.y = scroll.current * SPACING;

    const trackballOn = t.selected >= 0 && t.p > 0.995;
    if (trackballOn !== settled) setSettled(trackballOn);
    if (!trackballOn) {
      camPos.lerpVectors(GAL_POS, anchor.current, p);
      camera.position.copy(camPos);
      // TrackballControls tumbles the up-vector for free rotation; restore it so
      // the gallery (and any re-entry) isn't left rolled after a detail rotate.
      camera.up.lerp(WORLD_UP, Math.min(1, dt * 5)).normalize();
      camera.lookAt(0, 0, 0);
    }

    // reserve room for the info panel: shift subject left (landscape) or up (portrait)
    const { width, height } = state.size;
    const portrait = width <= 820;
    if (t.selected >= 0 && t.p > 0.001) {
      if (portrait) camera.setViewOffset(width, height, 0, (height * 0.46 / 2) * p, width, height);
      else camera.setViewOffset(width, height, (Math.min(width * 0.42, 400) / 2) * p, 0, width, height);
    } else camera.clearViewOffset();

    if (ground.current) ground.current.visible = t.selected >= 0 && camera.position.y > -0.2;

    const idx = Math.round(scroll.current);
    if (idx !== lastCenter.current) { lastCenter.current = idx; setCenter(idx); onCenter(idx); }
  });

  const focus = selectedIndex >= 0 ? selectedIndex : center;
  const lo = Math.max(0, Math.min(focus, center) - WINDOW);
  const hi = Math.min(list.length - 1, Math.max(focus, center) + WINDOW);
  const items: number[] = [];
  for (let i = lo; i <= hi; i++) items.push(i);
  if (selectedIndex >= 0 && !items.includes(selectedIndex)) items.push(selectedIndex);

  return (
    <>
      <color attach="background" args={['#0b0b0c']} />
      <Env />
      <Lights follow={selectedIndex >= 0} />
      <group ref={column}>
        {items.map((i) => (
          <Suspense key={list[i].id} fallback={null}>
            <Item game={list[i]} index={i} tr={tr} onOpen={onOpen} />
          </Suspense>
        ))}
      </group>
      <ContactShadows ref={ground} position={[0, -1.4, 0]} scale={12} blur={2.6} opacity={0.4} far={9} visible={false} />
      <TrackballControls enabled={settled} rotateSpeed={3} zoomSpeed={1.2} noPan minDistance={3.5} maxDistance={11} dynamicDampingFactor={0.12} />
    </>
  );
}

export default function Scene(props: { list: Game[]; selectedIndex: number; onOpen: (id: string) => void; onCenter: (i: number) => void }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 35, position: [0, 0, 7] }}
      gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, antialias: false }}
    >
      <Suspense fallback={null}>
        <SceneInner {...props} />
      </Suspense>
      <EffectComposer multisampling={4}><SMAA /></EffectComposer>
    </Canvas>
  );
}
