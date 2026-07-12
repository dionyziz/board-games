import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { asset, type Game } from '../data';
import { acquire, release } from './textures';

// The retail hang-tab flap (Uno, Ναι ή Όχι, …) as a thin 3D tab on top of the box.
// Its shape is driven by measured params (box.flap): the tab's free (top) corners
// are rounded by cornerR, and — when the texture has a clean punched hang-hole
// (box.flap.hole) — an aligned elliptical cut-out is punched through. Nothing here
// is game-specific; it all reads from box.flap.
function flapShape(W: number, hFlap: number, cornerR: number, hole?: { cx: number; cy: number; rx: number; ry: number }): THREE.Shape {
  const r = Math.min(W, hFlap) * cornerR, x0 = -W / 2, x1 = W / 2;
  const s = new THREE.Shape();
  s.moveTo(x0, 0);
  s.lineTo(x1, 0);
  s.lineTo(x1, hFlap - r);
  s.quadraticCurveTo(x1, hFlap, x1 - r, hFlap);
  s.lineTo(x0 + r, hFlap);
  s.quadraticCurveTo(x0, hFlap, x0, hFlap - r);
  s.lineTo(x0, 0);
  if (hole) {
    const hx = (hole.cx - 0.5) * W, hy = (1 - hole.cy) * hFlap;
    const p = new THREE.Path();
    p.absellipse(hx, hy, hole.rx * W, hole.ry * hFlap, 0, Math.PI * 2, true, 0);
    s.holes.push(p);
  }
  return s;
}

export default function Flap({ game }: { game: Game }) {
  const f = game.box.face || game.box.size;
  const W = f.w / 10, H = f.h / 10, D = f.d / 10;
  const flap = game.box.flap!;
  const hFlap = H * (flap.hFrac || 0.15);
  const thick = Math.max(D * 0.12, 0.03);
  const url = asset(flap.src);

  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(flapShape(W, hFlap, flap.cornerR ?? 0.28, flap.hole), { depth: thick, bevelEnabled: false, steps: 1, curveSegments: 8 });
    g.translate(0, 0, -thick / 2);
    return g;
  }, [W, hFlap, thick, flap.cornerR, flap.hole]);
  const mats = useMemo(() => {
    const art = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.34 });
    const band = new THREE.MeshPhysicalMaterial({ color: game.box.sideColor || '#cccccc', roughness: 0.6 });
    return { art, band };
  }, [game.box.sideColor]);

  useLayoutEffect(() => {
    const t = acquire(url, 'srgb');
    t.center.set(0, 0); t.repeat.set(1 / W, 1 / hFlap); t.offset.set(0.5, 0); // extrude cap UV = local (x,y)
    mats.art.map = t; mats.art.needsUpdate = true;
    return () => { t.repeat.set(1, 1); t.offset.set(0, 0); release([url]); mats.art.dispose(); mats.band.dispose(); geo.dispose(); };
  }, [url, mats, geo, W, hFlap]);

  // ExtrudeGeometry material groups: 0 = caps (front+back → art), 1 = walls (rim)
  return <mesh geometry={geo} material={[mats.art, mats.band]} position={[0, H / 2, 0]} castShadow />;
}
