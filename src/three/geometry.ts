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

// Closed pouch (Happy Salmon) from the measured silhouette (box.bagOutline). Built
// watertight BY CONSTRUCTION: ear-clip the polygon into a full triangulation, then
// uniformly subdivide it (every triangle → 4, sharing deduped edge midpoints) so the
// cap has interior vertices to bulge. The front cap (z=+bulge) and back cap (z=−bulge)
// are welded on their shared boundary ring (bulge→0 at the rim), so the whole thing is
// one closed solid — no ad-hoc stitching, no annular gap, no missing triangles. Planar
// UVs map the cutout straight on; the rim samples the outline (2px inside the fish).
export function pouchGeometry(poly: number[][], W: number, H: number, puff: number): THREE.BufferGeometry {
  const contour = poly.map(([fx, fy]) => new THREE.Vector2((fx - 0.5) * W, (0.5 - fy) * H));
  if (THREE.ShapeUtils.area(contour) < 0) contour.reverse(); // CCW ⇒ front faces +z
  const edge = contour.map((v) => [v.x, v.y] as [number, number]);
  const edgeDist = (x: number, y: number) => {
    let d = Infinity;
    for (let i = 0, n = edge.length; i < n; i++) d = Math.min(d, segDist(x, y, edge[i], edge[(i + 1) % n]));
    return d;
  };
  const dmax = Math.min(W, H) * 0.22;
  const bulge = (x: number, y: number) => puff * Math.sin(Math.min(1, edgeDist(x, y) / dmax) * Math.PI / 2);

  // full triangulation of the silhouette, then subdivide for a smooth dome
  const verts = contour.map((v) => v.clone());
  let faces = THREE.ShapeUtils.triangulateShape(contour, []);
  for (let s = 0; s < 3; s++) {
    const mid = new Map<number, number>();
    const getMid = (i: number, j: number) => {
      const k = i < j ? i * 1e7 + j : j * 1e7 + i;
      let m = mid.get(k);
      if (m === undefined) { m = verts.length; verts.push(verts[i].clone().add(verts[j]).multiplyScalar(0.5)); mid.set(k, m); }
      return m;
    };
    const nf: number[][] = [];
    for (const [a, b, c] of faces) { const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a); nf.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
    faces = nf;
  }

  // weld both caps by rounded position: shared rim verts (z≈0) coincide → watertight
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const eps = Math.min(W, H) * 1e-3, map = new Map<string, number>();
  const push = (x: number, y: number, z: number) => {
    const key = `${Math.round(x / eps)}_${Math.round(y / eps)}_${Math.round(z / eps)}`;
    let id = map.get(key);
    if (id === undefined) { id = pos.length / 3; pos.push(x, y, z); uv.push(x / W + 0.5, y / H + 0.5); map.set(key, id); }
    return id;
  };
  for (const [a, b, c] of faces) {
    const va = verts[a], vb = verts[b], vc = verts[c];
    const ia = push(va.x, va.y, bulge(va.x, va.y)), ib = push(vb.x, vb.y, bulge(vb.x, vb.y)), ic = push(vc.x, vc.y, bulge(vc.x, vc.y));
    idx.push(ia, ib, ic); // front (CCW → +z)
    const ja = push(va.x, va.y, -bulge(va.x, va.y)), jb = push(vb.x, vb.y, -bulge(vb.x, vb.y)), jc = push(vc.x, vc.y, -bulge(vc.x, vc.y));
    idx.push(ja, jc, jb); // back (flipped → −z)
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function segDist(px: number, py: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}
