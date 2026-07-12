import * as THREE from 'three';

// Custom package geometries, kept out of the components so they're easy to test
// and reuse. All take dimensions already in world units (cm/10).

// Rounded-rectangle profile (rounded corners, flat faces).
export function roundedRectShape(W: number, H: number, r: number): THREE.Shape {
  const x = -W / 2, y = -H / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + W - r, y); s.quadraticCurveTo(x + W, y, x + W, y + r);
  s.lineTo(x + W, y + H - r); s.quadraticCurveTo(x + W, y + H, x + W - r, y + H);
  s.lineTo(x + r, y + H); s.quadraticCurveTo(x, y + H, x, y + H - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// Metal tin: rounded-corner profile extruded along depth, flat crisp faces.
export function tinGeometry(W: number, H: number, D: number, cornerR = 0.07): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(roundedRectShape(W, H, Math.min(W, H) * cornerR), { depth: D, bevelEnabled: false, curveSegments: 8, steps: 1 });
  g.translate(0, 0, -D / 2);
  g.computeVertexNormals();
  return g;
}

// Hang-tab flap: a thin tab with rounded free (top) corners + optional punched hole.
export function flapGeometry(W: number, hFlap: number, thick: number, cornerR: number, hole?: { cx: number; cy: number; rx: number; ry: number }): THREE.ExtrudeGeometry {
  const r = Math.min(W, hFlap) * cornerR, x0 = -W / 2, x1 = W / 2;
  const s = new THREE.Shape();
  s.moveTo(x0, 0); s.lineTo(x1, 0); s.lineTo(x1, hFlap - r);
  s.quadraticCurveTo(x1, hFlap, x1 - r, hFlap);
  s.lineTo(x0 + r, hFlap); s.quadraticCurveTo(x0, hFlap, x0, hFlap - r);
  s.lineTo(x0, 0);
  if (hole) {
    const p = new THREE.Path();
    p.absellipse((hole.cx - 0.5) * W, (1 - hole.cy) * hFlap, hole.rx * W, hole.ry * hFlap, 0, Math.PI * 2, true, 0);
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, steps: 1, curveSegments: 8 });
  g.translate(0, 0, -thick / 2);
  return g;
}

// Puffed "pillow" pouch (foil bag): a bulged plane, z→0 at the edges. With
// `creases`, adds crimped side-seals (fast ridges near the L/R edges) + soft body
// wrinkles, like a real snack bag.
export function pillowGeometry(W: number, H: number, puff: number, creases = false): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(W, H, creases ? 48 : 32, creases ? 48 : 32);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const nx = p.getX(i) / (W / 2), ny = p.getY(i) / (H / 2);
    let z = puff * Math.max(0, Math.cos(nx * Math.PI / 2)) * Math.max(0, Math.cos(ny * Math.PI / 2));
    if (creases) {
      const edge = Math.max(0, (Math.abs(nx) - 0.5)) / 0.5; // 0 in the middle → 1 at the seals
      z += puff * 0.3 * edge * Math.sin(ny * Math.PI * 6.5); // crimped side seals
      z += puff * 0.1 * Math.sin(nx * 5.0) * Math.cos(ny * 2.5); // soft body wrinkles
    }
    p.setZ(i, z);
  }
  p.needsUpdate = true; g.computeVertexNormals();
  return g;
}

// Fish (or any silhouette) pouch: a bulged plane whose bulge is the distance
// INSIDE the measured outline — so it's flat (z≈0) exactly at the silhouette and
// bulges in the middle. Rendered front + back (rotated) it's a closed puffed
// pouch of that shape (the texture's alpha clips everything outside the outline).
function pointDistInside(px: number, py: number, poly: number[][]): number {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  if (!inside) return -1;
  let md = 1e9;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    md = Math.min(md, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return md;
}
export function pouchGeometry(poly: number[][], W: number, H: number, puff: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(W, H, 44, 44);
  const p = g.attributes.position as THREE.BufferAttribute;
  const reach = 0.16;
  for (let i = 0; i < p.count; i++) {
    const fx = p.getX(i) / W + 0.5, fy = 0.5 - p.getY(i) / H; // image space
    const d = pointDistInside(fx, fy, poly);
    p.setZ(i, d > 0 ? puff * Math.sqrt(Math.min(1, d / reach)) : 0);
  }
  p.needsUpdate = true; g.computeVertexNormals();
  return g;
}
