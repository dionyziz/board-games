import * as THREE from 'three';

// Procedural tiling paper-grain bump map (ported from the practice render).
// Fine fractal noise so the coated-cardboard surface catches light unevenly.
// Mipmapped so the grain doesn't shimmer under minification / motion.
let cached: THREE.DataTexture | null = null;

export function makePaperBump(size = 256): THREE.DataTexture {
  if (cached) return cached;
  let s = 0x2f6e2b1;
  const rng = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const base = new Float32Array(size * size);
  for (let i = 0; i < base.length; i++) base[i] = rng();
  const sample = (x: number, y: number) =>
    base[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const smooth = (fx: number, fy: number) => {
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const l = (a: number, b: number, t: number) => a + (b - a) * (t * t * (3 - 2 * t));
    return l(l(sample(x0, y0), sample(x0 + 1, y0), tx), l(sample(x0, y0 + 1), sample(x0 + 1, y0 + 1), tx), ty);
  };
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.5, freq = size / 8;
      for (let o = 0; o < 4; o++) { v += smooth((x / size) * freq, (y / size) * freq) * amp; freq *= 2; amp *= 0.5; }
      const c = Math.max(0, Math.min(255, Math.round(v * 255)));
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = c;
      data[i + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 7);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}
