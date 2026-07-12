import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { asset, type Game } from '../data';
import { acquire, release } from './textures';
import { flapGeometry } from './geometry';

// The retail hang-tab flap (Uno, Ναι ή Όχι, …) as a thin 3D tab on top of the box.
// Its shape is driven by measured params (box.flap): rounded free (top) corners
// (cornerR) and an optional punched hang-hole (hole). Nothing game-specific here.
export default function Flap({ game }: { game: Game }) {
  const f = game.box.face || game.box.size;
  const W = f.w / 10, H = f.h / 10, D = f.d / 10;
  const flap = game.box.flap!;
  const hFlap = H * (flap.hFrac || 0.15);
  const thick = Math.max(D * 0.12, 0.03);
  const url = asset(flap.src);
  // narrow the tab to just the central hang-tab band (wFrac) so the strip's side
  // margins (white/branding) are cut off; the box-width UV scale is kept, so the
  // narrower tab samples only that central band of the texture.
  const wf = flap.wFrac ?? 1, Wt = W * wf, lo = 0.5 - wf / 2;
  const hole = flap.hole ? { ...flap.hole, x1: (flap.hole.x1 - lo) / wf, x2: (flap.hole.x2 - lo) / wf } : undefined;

  const geo = useMemo(() => flapGeometry(Wt, hFlap, thick, flap.cornerR ?? 0.28, hole), [Wt, hFlap, thick, flap.cornerR, flap.hole]);
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
