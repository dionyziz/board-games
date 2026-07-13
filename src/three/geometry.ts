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

// Closed pouch (Happy Salmon) from the measured silhouette (box.bagOutline): two
// domed caps of the fish polygon that share ONE boundary ring, so they meet exactly
// at the silhouette edge — a single watertight, closed solid (no side wall to gap,
// no bevel to overshoot into the background). The caps are triangulated from a grid
// clipped to the polygon and bulged toward the middle (→0 at the rim) for a soft,
// puffy pouch. Planar UVs map the cutout straight on; the rim samples the outline,
// which is 2px inside the fish, so no white edge is ever shown.
export function pouchGeometry(poly: number[][], W: number, H: number, puff: number): THREE.BufferGeometry {
  const pts = poly.map(([fx, fy]) => [(fx - 0.5) * W, (0.5 - fy) * H] as [number, number]);
  if (polyArea(pts) < 0) pts.reverse();
  const inside = (x: number, y: number) => pointInPoly(x, y, pts);
  // signed distance to the boundary (approx via nearest edge) → bulge profile
  const edgeDist = (x: number, y: number) => {
    let d = Infinity;
    for (let i = 0, n = pts.length; i < n; i++) d = Math.min(d, segDist(x, y, pts[i], pts[(i + 1) % n]));
    return d;
  };

  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
  const step = Math.min(maxX - minX, maxY - minY) / 26;
  const nx = Math.ceil((maxX - minX) / step) + 1, ny = Math.ceil((maxY - minY) / step) + 1;
  const dmax = Math.max(step, Math.min(W, H) * 0.22);
  const bulge = (x: number, y: number) => puff * Math.sin(Math.min(1, edgeDist(x, y) / dmax) * Math.PI / 2);

  // grid of interior points (front z=+bulge) + the exact boundary ring (z=0)
  const gid = new Int32Array(nx * ny).fill(-1);
  const pos: number[] = [], uv: number[] = [];
  const add = (x: number, y: number, z: number) => { pos.push(x, y, z); uv.push(x / W + 0.5, y / H + 0.5); return pos.length / 3 - 1; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = minX + i * step, y = minY + j * step;
    if (inside(x, y) && edgeDist(x, y) > step * 0.5) gid[j * nx + i] = add(x, y, bulge(x, y));
  }
  const base = pos.length / 3;               // boundary-ring start
  for (const [x, y] of pts) add(x, y, 0);
  const nInterior = base, nBoundary = pts.length;
  const idx: number[] = [];
  // triangulate interior grid quads (both diagonals present ⇒ dense mesh)
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = gid[j * nx + i], b = gid[j * nx + i + 1], c = gid[(j + 1) * nx + i], d = gid[(j + 1) * nx + i + 1];
    if (a >= 0 && b >= 0 && c >= 0) idx.push(a, c, b);
    if (b >= 0 && c >= 0 && d >= 0) idx.push(b, c, d);
  }
  // stitch the boundary ring to the nearest interior point → closes the rim
  for (let k = 0; k < nBoundary; k++) {
    const b0 = base + k, b1 = base + (k + 1) % nBoundary;
    let best = 0, bd = Infinity;
    for (let m = 0; m < nInterior; m++) { const dx = pos[m * 3] - pos[b0 * 3], dy = pos[m * 3 + 1] - pos[b0 * 3 + 1]; const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = m; } }
    idx.push(b0, best, b1);
  }

  // mirror everything to the back (z→−z), reversed winding, then merge boundary rings
  const nFront = pos.length / 3;
  for (let m = 0; m < nFront; m++) { pos.push(pos[m * 3], pos[m * 3 + 1], -pos[m * 3 + 2]); uv.push(uv[m * 2], uv[m * 2 + 1]); }
  const tris = idx.length;
  for (let t = 0; t < tris; t += 3) idx.push(idx[t] + nFront, idx[t + 2] + nFront, idx[t + 1] + nFront);
  // weld the two boundary rings (they coincide at z=0) so the seam is watertight
  for (let k = 0; k < nBoundary; k++) idx.forEach((v, ii) => { if (v === nFront + base + k) idx[ii] = base + k; });

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function polyArea(p: [number, number][]) { let a = 0; for (let i = 0, n = p.length; i < n; i++) { const j = (i + 1) % n; a += p[i][0] * p[j][1] - p[j][0] * p[i][1]; } return a / 2; }
function pointInPoly(x: number, y: number, p: [number, number][]) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if (((p[i][1] > y) !== (p[j][1] > y)) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
  }
  return inside;
}
function segDist(px: number, py: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}
