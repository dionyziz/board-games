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

// A retail "keyhole" hang-hole = a rounded-rectangle (stadium) slot with a small
// circle centred on top. Built as ONE connected path: march rays out from the
// rect centre and take the farthest point still inside either shape (their union).
export type Hole = { x1: number; y1: number; x2: number; y2: number; cr: number; rr?: number };
function keyholePath(cx: number, cy: number, hw: number, hh: number, rr: number, ccx: number, ccy: number, cr: number): THREE.Path {
  const insideRect = (px: number, py: number) => {
    const qx = Math.abs(px - cx) - (hw - rr), qy = Math.abs(py - cy) - (hh - rr);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr <= 0;
  };
  const inside = (px: number, py: number) => insideRect(px, py) || Math.hypot(px - ccx, py - ccy) <= cr;
  const reach = Math.max(hw, hh) + 2 * cr + Math.hypot(ccx - cx, ccy - cy), step = Math.max(0.0005, Math.min(hh, cr) / 8);
  const N = 120, p = new THREE.Path();
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2, dx = Math.cos(th), dy = Math.sin(th);
    let last = 0;
    for (let t = 0; t <= reach; t += step) if (inside(cx + dx * t, cy + dy * t)) last = t;
    const px = cx + dx * last, py = cy + dy * last;
    i === 0 ? p.moveTo(px, py) : p.lineTo(px, py);
  }
  p.closePath();
  return p;
}

// Hang-tab flap: a thin tab with rounded free (top) corners + optional keyhole cut-out.
// Hole params are texture-normalised (y measured downward from the top).
export function flapGeometry(W: number, hFlap: number, thick: number, cornerR: number, hole?: Hole): THREE.ExtrudeGeometry {
  const r = Math.min(W, hFlap) * cornerR, x0 = -W / 2, x1 = W / 2;
  const s = new THREE.Shape();
  s.moveTo(x0, 0); s.lineTo(x1, 0); s.lineTo(x1, hFlap - r);
  s.quadraticCurveTo(x1, hFlap, x1 - r, hFlap);
  s.lineTo(x0 + r, hFlap); s.quadraticCurveTo(x0, hFlap, x0, hFlap - r);
  s.lineTo(x0, 0);
  if (hole) {
    const toX = (fx: number) => (fx - 0.5) * W, toY = (fy: number) => (1 - fy) * hFlap;
    const rxl = toX(hole.x1), rxr = toX(hole.x2), ryt = toY(hole.y1), ryb = toY(hole.y2);
    const cx = (rxl + rxr) / 2, cy = (ryt + ryb) / 2, hw = Math.abs(rxr - rxl) / 2, hh = Math.abs(ryt - ryb) / 2;
    const rr = Math.min(hw, hh) * (hole.rr ?? 1); // stadium by default
    // circle: centred horizontally, its centre exactly on the stadium's upper edge
    s.holes.push(keyholePath(cx, cy, hw, hh, rr, cx, Math.max(ryt, ryb), hole.cr * hFlap));
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
      // crimped side seals — different phase L vs R so it isn't mirror-symmetric
      const edge = Math.max(0, (Math.abs(nx) - 0.5)) / 0.5;
      z += puff * 0.3 * edge * Math.sin(ny * Math.PI * 6.5 + (nx < 0 ? 0 : 1.3));
      // irregular, asymmetric body wrinkles (incommensurate sines, off-centre)
      z += puff * 0.13 * Math.sin(nx * 7.7 + ny * 5.3 + 1.9) * Math.cos(ny * 4.1 - nx * 2.2);
      z += puff * 0.07 * Math.sin(nx * 13.1 - ny * 3.7);
    }
    p.setZ(i, z);
  }
  p.needsUpdate = true; g.computeVertexNormals();
  return g;
}

// Closed pouch (Happy Salmon) from the measured silhouette (box.bagOutline).
// ExtrudeGeometry gives a watertight, single-piece solid for any SIMPLE polygon —
// front cap + back cap + a rounded bevel rim — so the pouch can't come apart or
// leave holes. Planar UVs map the cutout onto it; the bevel gives it a soft, puffy
// edge rather than a flat card.
export function pouchGeometry(poly: number[][], W: number, H: number, puff: number): THREE.ExtrudeGeometry {
  const pts = poly.map(([fx, fy]) => new THREE.Vector2((fx - 0.5) * W, (0.5 - fy) * H));
  if (THREE.ShapeUtils.area(pts) < 0) pts.reverse(); // CCW
  const shape = new THREE.Shape(pts);
  const depth = puff * 0.5;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: puff, bevelSize: puff * 0.9, bevelSegments: 4, steps: 1 });
  g.translate(0, 0, -(depth / 2 + puff)); // centre the solid on z
  // planar UVs from local x,y so the cutout maps straight onto the faces
  const p = g.attributes.position as THREE.BufferAttribute, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / W + 0.5; uv[i * 2 + 1] = p.getY(i) / H + 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
