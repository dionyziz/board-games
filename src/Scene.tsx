import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { TrackballControls, ContactShadows } from '@react-three/drei';
import { EffectComposer, SMAA } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { Game } from './data';
import Package from './three/Package';
import { Env, Lights } from './three/Lights';
import { onLoaded, setMaxAniso } from './three/textures';

const SPACING = 3.4;
const WINDOW = 3; // boxes mounted each side of the focused one (only ~3 are ever on-screen)
const GAL_POS = new THREE.Vector3(0, 0, 7);
const DET_POS = new THREE.Vector3(3.0, 2.1, 6.2);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const smooth = (t: number) => t * t * (3 - 2 * t);
type Tr = { p: number; selected: number; focus: number; reveal: number };

function Item({ game, index, tr, onOpen }: { game: Game; index: number; tr: React.MutableRefObject<Tr>; onOpen: (id: string) => void }) {
  const ref = useRef<THREE.Group>(null!);
  const [hover, setHover] = useState(false);
  const v = useMemo(() => new THREE.Vector3(), []);
  const invalidate = useThree((s) => s.invalidate);
  const opac = useRef(1);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05); // clamp: after demand-mode idle rawDt is huge → would snap animations
    const grp = ref.current;
    if (!grp) return;
    const t = tr.current;
    const { p, selected } = t;
    const isSel = selected === index;
    const focal = index === t.focus;
    // during the open/close arc (and in detail) only the focal box is shown, so
    // neighbours don't swing weirdly around the screen edges as the camera resets
    grp.visible = p < 0.05 || focal;
    // …then fade the neighbours back in once the gallery has settled (reveal ramps
    // in SceneInner; snaps to 1 the instant the user scrolls/uses j-k)
    const targetO = focal ? 1 : t.reveal;
    if (Math.abs(targetO - opac.current) > 0.002) {
      opac.current = targetO;
      grp.traverse((c: any) => {
        const m = c.material; if (!m) return;
        (Array.isArray(m) ? m : [m]).forEach((mm: any) => { mm.transparent = targetO < 0.999; mm.opacity = targetO; });
      });
    }
    let target = hover ? 1.06 : 1;
    if (selected >= 0) target = isSel ? 1 : 1 - p;
    grp.scale.lerp(v.set(target, target, target), 1 - Math.pow(0.0015, dt));
    const rot = isSel ? -0.5 : hover ? -0.35 : -0.6;
    grp.rotation.y += (rot - grp.rotation.y) * Math.min(1, dt * 6);
    // keep animating (demand mode) until the hover pop/tilt settles
    if (Math.abs(grp.scale.x - target) > 0.001 || Math.abs(grp.rotation.y - rot) > 0.001) invalidate();
  });
  return (
    <group ref={ref} position={[0, -index * SPACING, 0]} rotation-y={-0.6}>
      <Package
        game={game}
        onClick={(e: any) => { e.stopPropagation(); onOpen(game.id); }}
        onPointerOver={(e: any) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; invalidate(); }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto'; invalidate(); }}
      />
    </group>
  );
}

function SceneInner({ list, selectedIndex, onOpen, onCenter }: {
  list: Game[]; selectedIndex: number; onOpen: (id: string) => void; onCenter: (i: number) => void;
}) {
  const { camera, gl, invalidate } = useThree();

  // demand rendering: repaint when a pooled texture finishes loading
  useEffect(() => { setMaxAniso(gl.capabilities.getMaxAnisotropy()); onLoaded(invalidate); }, [gl, invalidate]);
  const tr = useRef<Tr>({ p: selectedIndex >= 0 ? 1 : 0, selected: selectedIndex, focus: Math.max(0, selectedIndex), reveal: selectedIndex >= 0 ? 0 : 1 });
  const column = useRef<THREE.Group>(null!);
  const ground = useRef<any>(null!);
  const scroll = useRef(selectedIndex >= 0 ? selectedIndex : 0);
  const scrollTarget = useRef(scroll.current);
  const anchor = useRef(DET_POS.clone());
  const lastSel = useRef(selectedIndex);
  const userControl = useRef(false); // user grabbed/zoomed → the rig yields to TrackballControls
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
      tr.current.reveal = 1; // user is navigating → show neighbours immediately, no fade wait
      invalidate();
    };
    let lastY = 0;
    const onTouchStart = (e: TouchEvent) => { lastY = e.touches[0].clientY; };
    const onTouchMove = (e: TouchEvent) => {
      if (tr.current.selected >= 0) return;
      const y = e.touches[0].clientY;
      scrollTarget.current = THREE.MathUtils.clamp(scrollTarget.current + (lastY - y) * 0.01, 0, N() - 1);
      tr.current.reveal = 1;
      lastY = y; invalidate();
    };
    // in detail, the first pointerdown/wheel means "I'm driving now" → rig yields
    const takeover = () => { if (tr.current.selected >= 0) { userControl.current = true; invalidate(); } };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('wheel', takeover, { passive: true });
    el.addEventListener('pointerdown', takeover);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel); el.removeEventListener('wheel', takeover);
      el.removeEventListener('pointerdown', takeover);
      el.removeEventListener('touchstart', onTouchStart); el.removeEventListener('touchmove', onTouchMove);
    };
  }, [gl, list]);

  // keyboard navigation (gallery only): j/↓ next, k/↑ prev — always snapping to
  // the EXACT adjacent game even from a fractional (mid-scroll) position;
  // →/Enter opens the centered game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tr.current.selected >= 0) return;                       // gallery only
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return; // don't hijack search typing
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const N = list.length; if (!N) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'j' || key === 'ArrowDown') {
        e.preventDefault();
        scrollTarget.current = THREE.MathUtils.clamp(Math.floor(scrollTarget.current + 1e-3) + 1, 0, N - 1);
        tr.current.reveal = 1; invalidate();
      } else if (key === 'k' || key === 'ArrowUp') {
        e.preventDefault();
        scrollTarget.current = THREE.MathUtils.clamp(Math.ceil(scrollTarget.current - 1e-3) - 1, 0, N - 1);
        tr.current.reveal = 1; invalidate();
      } else if (key === 'ArrowRight' || key === 'Enter') {
        e.preventDefault();
        const idx = THREE.MathUtils.clamp(Math.round(scroll.current), 0, N - 1);
        if (list[idx]) onOpen(list[idx].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list, onOpen, invalidate]);

  // clamp scroll when the filtered list shrinks
  useEffect(() => {
    scrollTarget.current = THREE.MathUtils.clamp(scrollTarget.current, 0, Math.max(0, list.length - 1));
  }, [list.length]);

  useEffect(() => {
    if (selectedIndex !== lastSel.current) {
      // snap the column straight to the target (deep-link / pasted #-URL / jump to
      // another game) instead of animating a long scroll through the library
      if (selectedIndex >= 0) { anchor.current.copy(DET_POS); scrollTarget.current = selectedIndex; scroll.current = selectedIndex; }
      else { anchor.current.copy(camera.position); }        // freeze current pose so back doesn't jump
      lastSel.current = selectedIndex;
      userControl.current = false;                          // new view state: rig drives again
      invalidate();                                         // kick the transition arc
    }
    tr.current.selected = selectedIndex;
  }, [selectedIndex, camera, invalidate]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05); // clamp: demand-mode idle makes rawDt huge, snapping every lerp
    const t = tr.current;
    const goal = t.selected >= 0 ? 1 : 0;
    t.p += (goal - t.p) * Math.min(1, dt * 3.2);
    if (Math.abs(t.p - goal) < 0.002) t.p = goal;
    const p = smooth(t.p);
    // neighbours fade back in (0→1 over ~0.28s) once the gallery has settled
    t.reveal = t.p < 0.05 ? Math.min(1, t.reveal + dt / 0.28) : 0;

    scroll.current += (scrollTarget.current - scroll.current) * Math.min(1, dt * 6);
    if (column.current) column.current.position.y = scroll.current * SPACING;

    // the rig owns the camera in the gallery and during the (un-grabbed) arc;
    // once the user grabs/zooms in detail, TrackballControls takes over entirely.
    const rigActive = t.selected < 0 || (!userControl.current && t.p < 0.999);
    if (rigActive) {
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

    // contact shadow: show it only from near-eye-level views. From straight above
    // it reads as a floating dark "ground" plane (and from below you'd see its
    // underside), so hide it there — keeps the box feeling like it's just floating.
    if (ground.current) {
      const camN = camera.position.y / (camera.position.length() || 1); // sin(elevation)
      ground.current.visible = t.selected >= 0 && camN > -0.12 && camN < 0.5;
    }

    const idx = Math.round(scroll.current);
    t.focus = t.selected >= 0 ? t.selected : idx; // focal box (kept visible through the arc)
    if (idx !== lastCenter.current) { lastCenter.current = idx; setCenter(idx); onCenter(idx); }

    // demand rendering: keep requesting frames only while something is moving
    const moving = Math.abs(scroll.current - scrollTarget.current) > 0.0005
      || (!userControl.current && Math.abs(t.p - goal) > 0.0005) // keep the open/close arc alive in both directions
      || t.reveal < 0.999;                                       // …and while neighbours are fading in
    if (moving) invalidate();
  });

  const focus = selectedIndex >= 0 ? selectedIndex : center;
  const lo = Math.max(0, Math.min(focus, center) - WINDOW);
  const hi = Math.min(list.length - 1, Math.max(focus, center) + WINDOW);
  const items: number[] = [];
  for (let i = lo; i <= hi; i++) items.push(i);
  if (selectedIndex >= 0 && !items.includes(selectedIndex)) items.push(selectedIndex);

  return (
    <>
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
      {/* staticMoving off → the release keeps its angular velocity and friction
          (dynamicDampingFactor) glides it to a halt: a quick, natural spin-down. */}
      <TrackballControls enabled={selectedIndex >= 0} makeDefault rotateSpeed={3} zoomSpeed={1.4} noPan dynamicDampingFactor={0.12} minDistance={2.5} maxDistance={16} />
    </>
  );
}

export default function Scene(props: { list: Game[]; selectedIndex: number; onOpen: (id: string) => void; onCenter: (i: number) => void }) {
  return (
    <Canvas
      shadows
      frameloop={props.selectedIndex >= 0 ? 'always' : 'demand'}
      dpr={[1, 1.75]}
      camera={{ fov: 35, position: [0, 0, 7] }}
      gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, antialias: false, powerPreference: 'high-performance', alpha: true }}
    >
      <Suspense fallback={null}>
        <SceneInner {...props} />
      </Suspense>
      <EffectComposer multisampling={4}><SMAA /></EffectComposer>
    </Canvas>
  );
}
