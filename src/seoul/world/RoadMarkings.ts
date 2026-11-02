import * as THREE from 'three';
import { ROADS, JUNCTIONS } from './GroundPainter';

/**
 * Road paint as real geometry: thin quads a few millimetres above the
 * asphalt, one merged mesh for the whole city. The ground canvas is only
 * 15 px per metre, so painted markings smeared into blurry stripes as soon
 * as the camera got close; geometry stays sharp at any distance.
 *
 * The layout follows Korean practice on a two-lane street:
 *  - double yellow centre line (중앙선) on every street, solid
 *  - white edge line along both kerbs
 *  - every line STOPS at the stop line before a junction and resumes past
 *    the crosswalk on the far side, so nothing runs under a zebra
 *  - zebra (횡단보도) on each leg, a white stop line across the approach
 *    half of each leg, and a straight/turn arrow behind each stop line
 *  - Teheran-ro's south lane is a bus-only lane: blue line, 버스전용
 */

const YELLOW = new THREE.Color('#d6a536');
const WHITE = new THREE.Color('#e6e3d9');
const BLUE = new THREE.Color('#3a6fc4');
const Y = 0.012;

/** Distance from a junction centre to the near edge of its stop line. */
const STOP = 5.7;

class Paint {
  pos: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  /** Axis-aligned rectangle centred at (x, z). */
  rect(x: number, z: number, w: number, d: number, c: THREE.Color, y = Y): void {
    this.quad([
      [x - w / 2, z - d / 2],
      [x + w / 2, z - d / 2],
      [x + w / 2, z + d / 2],
      [x - w / 2, z + d / 2],
    ], c, y);
  }

  quad(p: [number, number][], c: THREE.Color, y = Y): void {
    const b = this.pos.length / 3;
    for (const [x, z] of p) {
      this.pos.push(x, y, z);
      this.col.push(c.r, c.g, c.b);
    }
    this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }

  /** Polygon in local frame (x right, z forward) rotated by yaw and placed. */
  poly(pts: [number, number][], ox: number, oz: number, yaw: number, c: THREE.Color): void {
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const b = this.pos.length / 3;
    for (const [lx, lz] of pts) {
      this.pos.push(ox + lx * cs + lz * sn, Y, oz - lx * sn + lz * cs);
      this.col.push(c.r, c.g, c.b);
    }
    // Mirroring a turn arrow reverses its winding. Keep every face upward.
    const area = pts.reduce((sum, [x, z], i) => {
      const next = pts[(i + 1) % pts.length];
      return sum + x * next[1] - next[0] * z;
    }, 0);
    for (let i = 1; i + 1 < pts.length; i++) {
      this.idx.push(b, b + (area > 0 ? i + 1 : i), b + (area > 0 ? i : i + 1));
    }
  }

  build(): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(this.pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(this.idx);
    const m = new THREE.Mesh(
      g,
      new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    );
    m.receiveShadow = true;
    m.renderOrder = 1;
    return m;
  }
}

/** Arrow pointing along +z, with only the exits that the junction permits. */
function arrowShape(straight: boolean, turns: (-1 | 1)[]): [number, number][][] {
  const out: [number, number][][] = [
    [[-0.12, -1.4], [0.12, -1.4], [0.12, 0.3], [-0.12, 0.3]],
  ];
  if (straight) out.push([[0, 1.05], [-0.42, 0.3], [0.42, 0.3]]);
  for (const s of turns) {
    out.push([[0, 0.05], [s * 0.55, 0.05], [s * 0.55, 0.3], [0, 0.3]]);
    out.push([[s * 0.95, 0.175], [s * 0.5, 0.48], [s * 0.5, -0.13]]);
  }
  return out;
}

export function createRoadMarkings(): THREE.Mesh {
  const P = new Paint();

  // Junction stop zones along each road's axis, so lines break cleanly.
  const breaksH = new Map<number, number[]>(); // z of road -> junction xs
  const breaksV = new Map<number, number[]>(); // x of road -> junction zs
  for (const j of JUNCTIONS) {
    (breaksH.get(j.z) ?? breaksH.set(j.z, []).get(j.z)!).push(j.x);
    (breaksV.get(j.x) ?? breaksV.set(j.x, []).get(j.x)!).push(j.z);
  }
  /** Split [a0, a1] around each junction centre ±STOP. */
  const runs = (a0: number, a1: number, cuts: number[]): [number, number][] => {
    const out: [number, number][] = [];
    let cur = a0;
    for (const c of [...cuts].sort((p, q) => p - q)) {
      if (c + STOP < a0 || c - STOP > a1) continue;
      if (c - STOP > cur) out.push([cur, c - STOP]);
      cur = Math.max(cur, c + STOP);
    }
    if (a1 > cur) out.push([cur, a1]);
    return out.filter(([p, q]) => q - p > 0.5);
  };

  for (const [x, z, w, d] of ROADS) {
    const horizontal = w > d;
    const half = (horizontal ? d : w) / 2;
    let a0 = (horizontal ? x - w / 2 : z - d / 2) + 0.4;
    let a1 = (horizontal ? x + w / 2 : z + d / 2) - 0.4;
    // Streets that meet the river hand over to the bridge markings.
    if (!horizontal) {
      if (a0 < 10.5 && a1 > 10.5) a1 = Math.min(a1, 10.6);
      if (a0 > 20 && a0 < 54.2) a0 = 54.2;
      // The spine crosses the plaza as flush paving: no paint there.
    }
    const cuts = horizontal ? breaksH.get(z) ?? [] : breaksV.get(x) ?? [];
    const spans = runs(a0, a1, cuts).flatMap(([p, q]): [number, number][] => {
      if (!horizontal && Math.abs(x) < 4 && p < -1.8 && q > -26.2) {
        const r: [number, number][] = [];
        if (p < -26.2) r.push([p, -26.4]);
        if (q > -1.8) r.push([-1.6, q]);
        return r;
      }
      return [[p, q]];
    });
    const c = horizontal ? z : x;
    for (const [p, q] of spans) {
      const len = q - p;
      const mid = (p + q) / 2;
      const line = (off: number, width: number, col: THREE.Color) =>
        horizontal ? P.rect(mid, c + off, len, width, col) : P.rect(c + off, mid, width, len, col);
      // Double yellow centre line
      line(-0.11, 0.1, YELLOW);
      line(0.11, 0.1, YELLOW);
      // White edge lines 0.35 m in from each kerb
      line(-(half - 0.35), 0.12, WHITE);
      line(half - 0.35, 0.12, WHITE);
    }
  }

  // Bus-only lane on Teheran-ro (south half): blue line + lettering marks
  for (const [p, q] of runs(-103.6, 103.6, breaksH.get(80) ?? [])) {
    P.rect((p + q) / 2, 80.3, q - p, 0.12, BLUE);
  }

  // Junctions: zebras, stop lines, arrows
  for (const j of JUNCTIONS) {
    const legs: { dir: [number, number]; exists: boolean }[] = [
      { dir: [1, 0], exists: true }, // east leg
      { dir: [-1, 0], exists: true }, // west leg
      { dir: [0, -1], exists: j.n }, // north leg
      { dir: [0, 1], exists: j.s }, // south leg
    ];
    for (const leg of legs) {
      if (!leg.exists) continue;
      const [dx, dz] = leg.dir;
      const alongX = dx !== 0;
      // Zebra: 0.45 m bars, 0.45 m gaps, 3 m deep, across the full 6 m road
      const zc = 4.2;
      for (let i = -2.475; i <= 2.48; i += 0.9) {
        if (alongX) P.rect(j.x + dx * zc, j.z + i, 2.6, 0.45, WHITE);
        else P.rect(j.x + i, j.z + dz * zc, 0.45, 2.6, WHITE);
      }
      // Right-hand traffic: the lane approaching the junction on this leg
      // is on the driver's right, i.e. rotated -90 degrees from the inbound
      // direction. Inbound = -dir.
      const inX = -dx;
      const inZ = -dz;
      const rightX = -inZ;
      const rightZ = inX;
      const sx = j.x + dx * STOP + rightX * 1.5;
      const sz = j.z + dz * STOP + rightZ * 1.5;
      if (alongX) P.rect(sx, sz, 0.35, 2.9, WHITE);
      else P.rect(sx, sz, 2.9, 0.35, WHITE);
      // Arrow behind the stop line, in the approach lane, pointing inbound.
      // Skip legs where the arrow would land on the flush plaza paving.
      const ax = j.x + dx * (STOP + 3.4) + rightX * 1.5;
      const az = j.z + dz * (STOP + 3.4) + rightZ * 1.5;
      const onPlaza = Math.hypot(ax, az + 14) < 13;
      const yaw = Math.atan2(inX, inZ);
      // The opposite leg is the straight exit. A terminating street gets
      // left/right arrows; arterial approaches may turn into the side road.
      const straight = alongX || (dz > 0 ? j.n : j.s);
      const turns: (-1 | 1)[] = alongX
        ? [j.n ? (dx > 0 ? -1 : 1) : null, j.s ? (dx > 0 ? 1 : -1) : null].filter((s): s is -1 | 1 => s !== null)
        : [-1, 1];
      if (!onPlaza) for (const shape of arrowShape(straight, turns)) P.poly(shape, ax, az, yaw, WHITE);
    }
  }

  return P.build();
}
