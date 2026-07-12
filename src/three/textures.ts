import * as THREE from 'three';

// Reference-counted, budget-bounded texture pool. drei's useTexture caches every
// URL forever and never disposes — scrolling the whole library then pins ~210×
// textures in VRAM. Here each mounted box acquire()s its textures and release()s
// them on unmount; once the live+idle count exceeds BUDGET we dispose the
// least-recently-used idle textures, so memory tracks the visible window, not
// the whole collection. Quality is unchanged (same full-res textures).
const loader = new THREE.TextureLoader();
const BUDGET = 88; // ~10 games' faces+bumps resident (window ±3 ≈ 7 live + margin)

type Kind = 'srgb' | 'data';
type Entry = { tex: THREE.Texture; refs: number; used: number };
const cache = new Map<string, Entry>();
let clock = 0;
let maxAniso = 8;
let notify: () => void = () => {};

export function setMaxAniso(a: number) { maxAniso = a; }
// register a repaint callback (frameloop="demand" needs a frame when a texture arrives)
export function onLoaded(fn: () => void) { notify = fn; }

function configure(tex: THREE.Texture, kind: Kind) {
  tex.colorSpace = kind === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = maxAniso;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
}

export function acquire(url: string, kind: Kind): THREE.Texture {
  let e = cache.get(url);
  if (!e) {
    const tex = loader.load(url, (t) => { configure(t, kind); notify(); });
    configure(tex, kind);
    e = { tex, refs: 0, used: clock++ };
    cache.set(url, e);
  }
  e.refs++; e.used = clock++;
  return e.tex;
}

export function release(urls: string[]) {
  for (const url of urls) { const e = cache.get(url); if (e) { e.refs = Math.max(0, e.refs - 1); e.used = clock++; } }
  if (cache.size <= BUDGET) return;
  const idle = [...cache.entries()].filter(([, e]) => e.refs <= 0).sort((a, b) => a[1].used - b[1].used);
  let over = cache.size - BUDGET;
  for (const [u, e] of idle) { if (over <= 0) break; e.tex.dispose(); cache.delete(u); over--; }
}
