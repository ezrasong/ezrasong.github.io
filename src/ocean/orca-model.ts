/**
 * Orca anatomy as a point cloud in body-local coordinates.
 *
 * Every point hangs off a "station" (a position along the spine, s = 0 at the
 * snout, 1 at the tail stock) by three offsets: forward along the spine,
 * up, and lateral. Each frame the motion system gives every station a
 * position and an orthonormal frame, and the rasterizer places the points.
 *
 * Proportions follow an adult male: blunt rounded head, max girth around a
 * third of the way back, a tall straight dorsal fin (~18% of body length),
 * broad paddle flippers, and horizontal flukes. Markings (eye patch, white
 * chin and belly, flank lobe, grey saddle) are painted as albedo in (s, n)
 * space, where n is the vertical position around the body (-1 belly, 1 back).
 */

export const MAT_BLACK = 1;
export const MAT_GREY = 2;
export const MAT_WHITE = 3;
export const MAT_EYE = 4;

export const GRP_BODY = 0;
export const GRP_DORSAL = 1;
export const GRP_PEC = 2;
export const GRP_FLUKE = 3;

/** Max half-height of the body as a fraction of length. */
const H = 0.12;
const DORSAL_H = 0.2;
const PEC_STATION_S = 0.2;
const EYE_S = 0.112;

type Pts = ReadonlyArray<readonly [number, number]>;

/** Catmull-Rom through control points, clamped at the ends. */
function curve(pts: Pts): (s: number) => number {
  return (s: number) => {
    if (s <= pts[0]![0]) return pts[0]![1];
    const last = pts[pts.length - 1]!;
    if (s >= last[0]) return last[1];
    let i = 0;
    while (s > pts[i + 1]![0]) i++;
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const t = (s - p1[0]) / (p2[0] - p1[0]);
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      0.5 *
      (2 * p1[1] +
        (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
    );
  };
}

/* Side profile above and below the spine, and half-breadth, in units of H. */
const top = curve([
  [0, 0.12], [0.02, 0.48], [0.06, 0.72], [0.12, 0.86], [0.22, 0.95], [0.36, 0.98],
  [0.5, 0.88], [0.62, 0.68], [0.74, 0.46], [0.84, 0.3], [0.93, 0.18], [1, 0.1],
]);
const bottom = curve([
  [0, 0.04], [0.02, 0.4], [0.06, 0.66], [0.12, 0.88], [0.24, 1.06], [0.36, 1.1],
  [0.48, 1.0], [0.6, 0.76], [0.72, 0.5], [0.83, 0.3], [0.92, 0.17], [1, 0.08],
]);
const breadth = curve([
  [0, 0], [0.03, 0.36], [0.1, 0.66], [0.25, 0.86], [0.42, 0.86], [0.6, 0.66],
  [0.75, 0.38], [0.86, 0.18], [1, 0.08],
]);

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const ALB_BLACK = 0.12;
const ALB_GREY = 0.55;
const ALB_WHITE = 1;

/** Albedo of the body skin at spine position s, height n (-1..1), side |l| (0..1). */
function skin(s: number, n: number, l: number): number {
  // Eye patch: an oval above and behind the eye, rising toward its rear end.
  // A long white oval just above and behind the eye, tilted up toward the
  // rear: the single most recognisable orca mark.
  const es = (s - 0.165) / 0.07;
  const en = (n - 0.3 - (s - 0.165) * 1.8) / 0.17;
  const eye = (1 - smooth(0.8, 1.05, es * es + en * en)) * smooth(0.12, 0.32, l);

  // White underside: chin, throat, belly band, then the flank lobe sweeping
  // up behind the dorsal fin and ending in a point toward the tail.
  let line: number;
  if (s < 0.025) line = -2;
  else if (s < 0.13) line = -0.18 - (s - 0.025) * 0.6;
  else if (s < 0.23) line = -0.24 - smooth(0.13, 0.23, s) * 0.42;
  else if (s < 0.47) line = -0.66;
  else if (s < 0.65) line = -0.66 + smooth(0.47, 0.65, s) * 0.92;
  else if (s < 0.76) line = 0.26 - smooth(0.65, 0.76, s) * 1.25;
  else line = -2;
  const under = 1 - smooth(line - 0.07, line + 0.07, n);

  // Grey saddle just behind the dorsal fin.
  const saddle =
    smooth(0.455, 0.5, s) * (1 - smooth(0.585, 0.645, s)) * smooth(0.48, 0.78, n);

  const white = Math.max(eye, under);
  const base = ALB_BLACK + (ALB_GREY - ALB_BLACK) * saddle;
  return base + (ALB_WHITE - base) * white;
}

const matOf = (alb: number): number =>
  alb > 0.75 ? MAT_WHITE : alb > 0.42 ? MAT_GREY : MAT_BLACK;

export interface OrcaTemplate {
  /** Body length in px. */
  length: number;
  /** Spine position (0..1) of each station. */
  stations: Float32Array;
  count: number;
  st: Uint16Array;
  /** Offsets along (forward, up, lateral), px. */
  of: Float32Array;
  ou: Float32Array;
  ol: Float32Array;
  /** Local normal (forward, up, lateral). */
  nf: Float32Array;
  nu: Float32Array;
  nl: Float32Array;
  alb: Float32Array;
  mat: Uint8Array;
  grp: Uint8Array;
  pecStation: number;
  /** Flipper hinge (forward, up) offsets; both sides share them. */
  pecPivotF: number;
  pecPivotU: number;
  flukeStation: number;
  eyeStation: number;
  eyeU: number;
  eyeL: number;
  blowStation: number;
  blowU: number;
}

/**
 * Build the point cloud for a body of `length` px, sampled finely enough
 * that a raster grid of `subW` x `subH` px has no holes.
 */
export function buildOrca(length: number, subW: number, subH: number): OrcaTemplate {
  const L = length;
  const step = Math.min(subW, subH) * 0.62;
  const nStations = Math.max(48, Math.ceil(L / step));
  const stations = new Float32Array(nStations);
  for (let i = 0; i < nStations; i++) stations[i] = i / (nStations - 1);
  const stationAt = (s: number): number => Math.round(Math.min(1, Math.max(0, s)) * (nStations - 1));

  const st: number[] = [];
  const of: number[] = [];
  const ou: number[] = [];
  const ol: number[] = [];
  const nf: number[] = [];
  const nu: number[] = [];
  const nl: number[] = [];
  const alb: number[] = [];
  const mat: number[] = [];
  const grp: number[] = [];

  const push = (
    k: number, f: number, u: number, l: number,
    nF: number, nU: number, nL: number, a: number, m: number, g: number,
  ): void => {
    st.push(k); of.push(f); ou.push(u); ol.push(l);
    const len = Math.hypot(nF, nU, nL) || 1;
    nf.push(nF / len); nu.push(nU / len); nl.push(nL / len);
    alb.push(a); mat.push(m); grp.push(g);
  };

  // Body: elliptical cross-sections with separate top and bottom radii.
  const maxR = H * 1.06 * L;
  const nPhi = Math.max(28, Math.min(120, Math.ceil(((2 * Math.PI * maxR) / step) * 0.9)));
  const ds = 1 / (nStations - 1);
  // One elliptical ring of skin at spine position sv, attached to station k
  // and offset fOff px along the spine (negative = toward the tail).
  const ring = (k: number, sv: number, fOff: number): void => {
    const ht = top(sv) * H * L;
    const hb = bottom(sv) * H * L;
    const b = breadth(sv) * H * L;
    // Taper slope tilts the normals: where the body widens toward the tail
    // (the head) the skin faces forward, where it narrows (the tail stock)
    // it faces back. The sign matters: inverted, the whole head was culled
    // as a back face whenever the orca turned toward the viewer.
    const s0 = Math.max(0, sv - ds);
    const s1 = Math.min(1, sv + ds);
    const slope = ((top(s1) + bottom(s1) - top(s0) - bottom(s0)) * 0.5 * H) / (s1 - s0);
    const count = Math.max(10, Math.ceil((nPhi * Math.max(ht, hb, b)) / maxR));
    for (let j = 0; j < count; j++) {
      const phi = (j / count) * Math.PI * 2;
      const n = Math.sin(phi);
      const c = Math.cos(phi);
      const hs = n > 0 ? ht : hb;
      const u = n * hs;
      const l = c * b;
      const qU = hs > 0 ? n / hs : 0;
      const qL = b > 0 ? c / b : 0;
      const qLen = Math.hypot(qU, qL) || 1;
      const al = skin(sv, n, Math.abs(c));
      push(k, fOff, u, l, slope, qU / qLen, qL / qLen, al, matOf(al), GRP_BODY);
    }
  };
  const radius = (sv: number): number => Math.max(top(sv), bottom(sv), breadth(sv)) * H * L;
  for (let k = 0; k < nStations; k++) {
    const sv = stations[k]!;
    ring(k, sv, 0);
    if (k === nStations - 1) break;
    // Where the radius changes fast (snout, tail stock), consecutive rings
    // sit far apart radially and a view along the spine sees through the
    // gaps. Fill them with sub-rings between the stations.
    const gap = Math.abs(radius(stations[k + 1]!) - radius(sv));
    const subs = Math.min(8, Math.ceil(gap / (step * 0.8)) - 1);
    for (let j = 1; j <= subs; j++) {
      const t = j / (subs + 1);
      ring(k, sv + t * ds, -t * ds * L);
    }
  }
  // Snout cap: a filled ellipse closing the very front, facing forward.
  {
    const ht = top(0) * H * L;
    const hb = bottom(0) * H * L;
    const b = breadth(0.012) * H * L;
    for (let u = -hb; u <= ht; u += step * 0.8) {
      for (let l = -b; l <= b; l += step * 0.8) {
        const hs = u > 0 ? ht : hb;
        if ((hs > 0 ? (u / hs) ** 2 : 0) + (b > 0 ? (l / b) ** 2 : 0) > 1) continue;
        const al = skin(0, hs > 0 ? u / hs : 0, b > 0 ? Math.abs(l / b) : 0);
        push(0, step * 0.3, u, l, 1, u / (hs || 1) * 0.3, l / (b || 1) * 0.3, al, matOf(al), GRP_BODY);
      }
    }
  }

  // Dorsal fin: tall, nearly straight triangle; a single two-sided sheet.
  const d0 = 0.39;
  const dApex = 0.472;
  const d1 = 0.545;
  for (let k = stationAt(d0); k <= stationAt(d1); k++) {
    const s = stations[k]!;
    const lead = (s - d0) / (dApex - d0);
    const trail = Math.pow(Math.max(0, (d1 - s) / (d1 - dApex)), 1.12);
    const edge = DORSAL_H * Math.min(1, lead, trail, 0.985) * L;
    const root = top(s) * H * L - step;
    for (let h = 0; h <= edge + step; h += step * 0.9) {
      const a = ALB_BLACK + 0.03 * (h / (DORSAL_H * L));
      push(k, 0, root + Math.min(h, edge + step * 0.5), 0, 0, 0, 1, a, MAT_BLACK, GRP_DORSAL);
    }
  }

  // Pectoral flippers: broad rounded paddles hinged low behind the head,
  // lying almost flat against the flank and pointing down and back.
  const pecStation = stationAt(PEC_STATION_S);
  const ps = stations[pecStation]!;
  const pecPivotF = 0;
  const pecPivotU = -0.55 * bottom(ps) * H * L;
  const pecBase = 0.78 * breadth(ps) * H * L;
  const pecLen = 0.15 * L;
  const pecWid = 0.07 * L;
  const pa = (55 * Math.PI) / 180;
  const axF = -Math.cos(pa);
  const axU = -Math.sin(pa);
  const wF = -Math.sin(pa);
  const wU = Math.cos(pa);
  for (const side of [1, -1]) {
    for (let a = 0; a <= pecLen; a += step * 0.9) {
      const t = a / pecLen;
      const tip = t > 0.82 ? Math.sqrt(Math.max(0, 1 - ((t - 0.82) / 0.18) ** 2)) : 1;
      const half = pecWid * 0.5 * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * tip;
      for (let w = -half; w <= half; w += step * 0.9) {
        const f = pecPivotF + axF * a + wF * w;
        const u = pecPivotU + axU * a + wU * w;
        const l = side * (pecBase + t * pecLen * 0.32);
        push(pecStation, f, u, l, 0, 0, side, ALB_BLACK, MAT_BLACK, GRP_PEC);
      }
    }
  }

  // Flukes: horizontal, swept-back blades with a median notch.
  const flukeStation = nStations - 1;
  const span = 0.145 * L;
  for (let w = -1; w <= 1; w += (step * 0.85) / span) {
    const aw = Math.abs(w);
    const lead = (0.012 + 0.075 * Math.pow(aw, 1.6)) * L;
    const chord = (0.072 * Math.pow(Math.max(0, 1 - Math.pow(aw, 2.2)), 0.6) + 0.006) * L;
    const notch = 0.03 * Math.exp(-((w / 0.12) ** 2)) * L;
    const tail = lead + chord - notch;
    for (let d = 0; d <= tail; d += step * 0.85) {
      const behind = Math.max(d, aw < 0.2 ? 0 : lead * 0.6);
      push(flukeStation, -behind, 0, w * span, 0, 1, 0, ALB_BLACK, MAT_BLACK, GRP_FLUKE);
    }
  }

  const es = stationAt(EYE_S);
  const eyeN = -0.02;
  const blowStation = stationAt(0.17);

  return {
    length: L,
    stations,
    count: st.length,
    st: Uint16Array.from(st),
    of: Float32Array.from(of),
    ou: Float32Array.from(ou),
    ol: Float32Array.from(ol),
    nf: Float32Array.from(nf),
    nu: Float32Array.from(nu),
    nl: Float32Array.from(nl),
    alb: Float32Array.from(alb),
    mat: Uint8Array.from(mat),
    grp: Uint8Array.from(grp),
    pecStation,
    pecPivotF,
    pecPivotU,
    flukeStation,
    eyeStation: es,
    eyeU: eyeN * top(EYE_S) * H * L,
    eyeL: Math.sqrt(1 - eyeN * eyeN) * breadth(EYE_S) * H * L,
    blowStation,
    blowU: top(0.17) * H * L,
  };
}
