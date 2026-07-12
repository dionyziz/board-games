import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { TrackballControls, ContactShadows } from '@react-three/drei';
import { EffectComposer, SMAA } from '@react-three/postprocessing';
import * as THREE from 'three';
import { games } from './data';
import GameBox from './three/GameBox';
import { Env, Lights } from './three/Lights';

const SPACING = 3.4;
const WINDOW = 4;
const GAL_POS = new THREE.Vector3(0, 0, 7);
const DET_POS = new THREE.Vector3(3.0, 2.1, 6.2);
const smooth = (t: number) => t * t * (3 - 2 * t);

// shared per-frame transition state, read by the box items
type Tr = { p: number; selected: number };

function Item({ index, tr, onOpen }: { index: number; tr: React.MutableRefObject<Tr>; onOpen: (id: string) => void }) {
  const g = games[index];
  const ref = useRef<THREE.Group>(null!);
  const [hover, setHover] = useState(false);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const grp = ref.current;
    if (!grp) return;
    const { p, selected } = tr.current;
    const isSel = selected === index;
    // scale: hover pop in gallery; the selected box stays full, others fade out as p→1
    let target = hover ? 1.06 : 1;
    if (selected >= 0) target = isSel ? 1 : 1 - p;
    const k = 1 - Math.pow(0.0015, dt);
    grp.scale.lerp(v.set(target, target, target), k);
    // tilt eases from the gallery 3/4 to the detail angle for the focused box
    const rot = isSel ? -0.5 : hover ? -0.35 : -0.6;
    grp.rotation.y += (rot - grp.rotation.y) * Math.min(1, dt * 6);
  });
  return (
    <group ref={ref} position={[0, -index * SPACING, 0]} rotation-y={-0.6}>
      <GameBox
        game={g}
        onClick={(e: any) => { e.stopPropagation(); onOpen(g.id); }}
        onPointerOver={(e: any) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto'; }}
      />
    </group>
  );
}

function SceneInner({ selectedIndex, onOpen, onCenter }: {
  selectedIndex: number; onOpen: (id: string) => void; onCenter: (i: number) => void;
}) {
  const { camera, gl } = useThree();
  const tr = useRef<Tr>({ p: selectedIndex >= 0 ? 1 : 0, selected: selectedIndex });
  const column = useRef<THREE.Group>(null!);
  const ground = useRef<any>(null!);
  const scroll = useRef(selectedIndex >= 0 ? selectedIndex : 0);
  const scrollTarget = useRef(scroll.current);
  const anchor = useRef(DET_POS.clone());     // detail-side camera pose to lerp against
  const lastSel = useRef(selectedIndex);
  const [settled, setSettled] = useState(selectedIndex >= 0);
  const lastCenter = useRef(-1);
  const camPos = useMemo(() => new THREE.Vector3(), []);

  // one-time camera pose (so a deep-linked detail starts at the 3/4 pose before
  // TrackballControls takes over, not the gallery front pose)
  useLayoutEffect(() => {
    camera.position.copy(selectedIndex >= 0 ? DET_POS : GAL_POS);
    camera.lookAt(0, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // wheel scroll (gallery only)
  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      if (tr.current.selected >= 0) return;
      scrollTarget.current = THREE.MathUtils.clamp(scrollTarget.current + e.deltaY * 0.0022, 0, games.length - 1);
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => el.removeEventListener('wheel', onWheel);
  }, [gl]);

  // react to route-driven selection changes: freeze an anchor + hand control back to the rig
  useEffect(() => {
    if (selectedIndex !== lastSel.current) {
      if (selectedIndex >= 0) { anchor.current.copy(DET_POS); scrollTarget.current = selectedIndex; }
      else { anchor.current.copy(camera.position); }         // avoid a jump when leaving trackball
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

    // scroll easing → focused box sits at world origin
    scroll.current += (scrollTarget.current - scroll.current) * Math.min(1, dt * 6);
    if (column.current) column.current.position.y = scroll.current * SPACING;

    // camera rig owns the camera except once we're fully settled in detail (trackball)
    const trackballOn = t.selected >= 0 && t.p > 0.995;
    if (trackballOn !== settled) setSettled(trackballOn);
    if (!trackballOn) { camPos.lerpVectors(GAL_POS, anchor.current, p); camera.position.copy(camPos); camera.lookAt(0, 0, 0); }

    // shift the subject into the left region so the right-side panel doesn't cover it
    const panel = Math.min(state.size.width * 0.42, 400);
    if (t.selected >= 0 && t.p > 0.001)
      camera.setViewOffset(state.size.width, state.size.height, (panel / 2) * p, 0, state.size.width, state.size.height);
    else camera.clearViewOffset();

    if (ground.current) ground.current.visible = t.selected >= 0 && camera.position.y > -0.2;

    const idx = Math.round(scroll.current);
    if (idx !== lastCenter.current) { lastCenter.current = idx; onCenter(idx); }
  });

  const center = Math.round(scroll.current);
  const lo = Math.max(0, Math.min(selectedIndex >= 0 ? selectedIndex : center, center) - WINDOW);
  const hi = Math.min(games.length - 1, Math.max(selectedIndex >= 0 ? selectedIndex : center, center) + WINDOW);
  const items: number[] = [];
  for (let i = lo; i <= hi; i++) items.push(i);
  // always keep the selected box mounted
  if (selectedIndex >= 0 && !items.includes(selectedIndex)) items.push(selectedIndex);

  return (
    <>
      <color attach="background" args={['#0b0b0c']} />
      <Env />
      <Lights follow={selectedIndex >= 0} />
      <group ref={column}>
        {items.map((i) => (
          <Suspense key={games[i].id} fallback={null}>
            <Item index={i} tr={tr} onOpen={onOpen} />
          </Suspense>
        ))}
      </group>
      <ContactShadows ref={ground} position={[0, -1.4, 0]} scale={12} blur={2.6} opacity={0.4} far={9} visible={false} />
      <TrackballControls enabled={settled} rotateSpeed={3} zoomSpeed={1.2} noPan minDistance={3.5} maxDistance={11} dynamicDampingFactor={0.12} />
    </>
  );
}

export default function Scene(props: { selectedIndex: number; onOpen: (id: string) => void; onCenter: (i: number) => void }) {
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
