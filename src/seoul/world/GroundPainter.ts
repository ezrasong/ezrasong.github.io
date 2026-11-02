import { PALETTE as P } from '../config/palette';
import { shoreNorth, shoreSouth } from './Terrain';

/**
 * The whole ground — grass, roads, sidewalks, plaza paving, park paths,
 * riverbanks — is painted once into a single canvas texture that wraps the
 * displaced terrain grid (see Terrain.ts) and doubles as the minimap.
 *
 * World extent: x ∈ [-104, 104], z ∈ [-104, 104].
 * Layout (mini-Seoul, north = -z):
 *   z ≈ -104..-86  Bukhansan mountain backdrop band
 *   z ≈  -86..-42  Namsan hill + hanok alley (east)
 *   z  =  -34      Namsan-ro (east-west arterial)
 *   z ≈  -28..0    Starlight Plaza (spawn), Hongdae west, Insadong east
 *   z  =   8       Gangbyeon riverside boulevard (north bank)
 *   z ≈   12..20   Hangang park band + jogging path
 *   z ≈   20..48   THE HAN RIVER (curved shores; two bridges + pier)
 *   z ≈   48..53   south bank strip
 *   z  =   56      Olympic-daero (south riverside boulevard)
 *   z ≈   60..76   Gangnam blocks (east) / Yeouido + apartments (west)
 *   z  =   80      Teheran-ro
 *   z ≈   84..96   deep Gangnam second row
 */
const WORLD_W = 208;
const WORLD_D = 208;
const SCALE = 15; // canvas px per world unit (3120×3120)
const CW = WORLD_W * SCALE;
const CD = WORLD_D * SCALE;

function u(x: number): number {
  return (x + WORLD_W / 2) * SCALE;
}
function v(z: number): number {
  return (z + WORLD_D / 2) * SCALE;
}
function s(len: number): number {
  return len * SCALE;
}

/** Default sidewalk width either side of a road. */
const SIDEWALK = 2.0;

export const RIVER_NORTH_EDGE = 20;
export const RIVER_SOUTH_EDGE = 48;

/** World half-extent, for consumers mapping world coords onto the canvas. */
export const GROUND_EXTENT = WORLD_W / 2;

let paintedCanvas: HTMLCanvasElement | null = null;

/** The canvas painted by paintGroundCanvas — reused by the minimap. */
export function getGroundCanvas(): HTMLCanvasElement | null {
  return paintedCanvas;
}

/**
 * Road rectangles [x, z, w, d, sidewalkWidth?] shared by several layers.
 * Arterials run to the painted edge (±104) so no street ever dead-ends in
 * grass — the boundary wall sits at ±90 and gantry signs + tree belts carry
 * the roads into the fog. Exported for the 3D curb/signal/prop builders.
 */
export const ROADS: [number, number, number, number, number?][] = [
  // North bank, east-west
  [0, -34, 208, 6], // Namsan-ro
  [0, 8, 208, 6], // Gangbyeon riverside boulevard
  // South bank, east-west
  [0, 56, 208, 6], // Olympic-daero
  [0, 80, 208, 6], // Teheran-ro
  // North bank, north-south
  [0, -11, 6, 58], // spine: Namsan gate → bridge
  [-32, -13, 6, 42], // Hongdae street
  [-64, -13, 6, 42], // Hongdae west street
  [32, -13, 6, 42], // Insadong street
  [64, -13, 6, 42], // east street
  [-48, 11, 6, 14], // Yanghwa bridge connector
  // South bank, north-south
  [0, 66.5, 6, 33], // spine south: bridge → Teheran-ro (T-junction)
  [32, 66, 6, 28], // Gangnam street
  [64, 66, 6, 28], // Gangnam east street
  [-48, 66, 6, 28], // Yeouido street
];

/**
 * Junctions where arterials meet cross streets. `n`/`s` say whether the
 * north-south street actually continues north/south of the box (many are
 * T-junctions) — markings and signals must never spill onto the lots.
 */
export const JUNCTIONS: { x: number; z: number; n: boolean; s: boolean }[] = [
  { x: -64, z: -34, n: false, s: true },
  { x: -32, z: -34, n: false, s: true },
  { x: 0, z: -34, n: true, s: true },
  { x: 32, z: -34, n: false, s: true },
  { x: 64, z: -34, n: false, s: true },
  { x: -64, z: 8, n: true, s: false },
  { x: -48, z: 8, n: false, s: true },
  { x: -32, z: 8, n: true, s: false },
  { x: 0, z: 8, n: true, s: true },
  { x: 32, z: 8, n: true, s: false },
  { x: 64, z: 8, n: true, s: false },
  { x: -48, z: 56, n: false, s: true },
  { x: 0, z: 56, n: true, s: true },
  { x: 32, z: 56, n: false, s: true },
  { x: 64, z: 56, n: false, s: true },
  { x: -48, z: 80, n: true, s: false },
  { x: 0, z: 80, n: true, s: false },
  { x: 32, z: 80, n: true, s: false },
  { x: 64, z: 80, n: true, s: false },
];

export function paintGroundCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CD;
  const ctx = canvas.getContext('2d')!;
  const rng = mulberry32(7);

  // ---------------------------------------------------------------- grass
  ctx.fillStyle = P.grass;
  ctx.fillRect(0, 0, CW, CD);
  // Macro mottling: layered soft blobs in darker/lighter tones read as
  // meadow variation instead of a single flat green (or square patches).
  const mottle = (color: string, alpha: number, count: number, rMin: number, rMax: number) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const px = rng() * CW;
      const py = rng() * CD;
      const r = s(rMin + rng() * (rMax - rMin));
      ctx.beginPath();
      ctx.ellipse(px, py, r, r * (0.55 + rng() * 0.6), rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  mottle(P.grassDark, 0.5, 260, 2.5, 9);
  mottle('#659a5e', 0.4, 220, 1.5, 6);
  mottle('#527e4e', 0.35, 200, 1, 4);
  mottle('#6ea360', 0.25, 140, 0.8, 2.6);

  // --- Northern mountain band (under the Bukhansan backdrop meshes)
  ctx.fillStyle = '#3f6a41';
  ctx.fillRect(0, v(-104), CW, s(18));
  ctx.fillStyle = '#456f44';
  ctx.fillRect(0, v(-88), CW, s(4));

  // ------------------------------------------------------------- riverside
  // Hangang park band north of the river (brighter green)
  ctx.fillStyle = '#639461';
  ctx.fillRect(u(-104), v(11), s(208), s(8));
  mottleBand(ctx, rng, v(11), v(19), '#578a55', 90);

  // Sandy banks follow the curved shoreline. North bank: sand from the
  // park edge down to the waterline; the water fill comes after.
  fillShoreBand(ctx, (x) => shoreNorth(x) - 2.2, (x) => shoreNorth(x) + 0.3, P.sand);
  fillShoreBand(ctx, (x) => shoreNorth(x) - 2.4, (x) => shoreNorth(x) - 1.5, '#b7a67f');
  // South bank
  fillShoreBand(ctx, (x) => shoreSouth(x) - 0.3, (x) => shoreSouth(x) + 2.2, P.sand);
  fillShoreBand(ctx, (x) => shoreSouth(x) + 1.5, (x) => shoreSouth(x) + 2.4, '#b7a67f');
  ctx.fillStyle = '#639461';
  fillShoreBand(ctx, (x) => shoreSouth(x) + 2.2, () => 53.4, '#639461');

  // Water base under the animated river shader (fills the curved channel,
  // so terrain never shows through between waves).
  fillShoreBand(ctx, (x) => shoreNorth(x) - 0.4, (x) => shoreSouth(x) + 0.4, P.waterDeep);
  // Riverbed shading: darker center channel.
  fillShoreBand(ctx, (x) => shoreNorth(x) + 6, (x) => shoreSouth(x) - 6, '#2e5570');

  // Curved jogging path through the park band.
  strokePath(
    ctx,
    (t) => {
      const x = -104 + t * 208;
      return [x, 15.2 + Math.sin(x * 0.05 + 1.2) * 1.1 + Math.sin(x * 0.017) * 0.7];
    },
    1.5,
    P.sand
  );
  // South bank riverside path.
  strokePath(
    ctx,
    (t) => {
      const x = -104 + t * 208;
      return [x, 51.6 + Math.sin(x * 0.045 + 3.0) * 0.7];
    },
    1.3,
    '#c0b08b'
  );

  // --- Namsan foothill shading
  ctx.fillStyle = '#4e7d4c';
  ctx.beginPath();
  ctx.ellipse(u(0), v(-58), s(20), s(17), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#457244';
  ctx.beginPath();
  ctx.ellipse(u(2), v(-56), s(14), s(12), 0.3, 0, Math.PI * 2);
  ctx.fill();

  // ------------------------------------------------------------ city blocks
  // Seoul blocks are paved, not lawn: each district gets its own lot paving
  // painted under the buildings before the roads go on top. Grass survives
  // only where Seoul actually has it — the Han park bands, Namsan, the
  // apartment-complex courtyards, and small pocket parks.
  const paveLot = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    base: string,
    opts: { joints?: number; patches?: boolean; tiles?: boolean } = {}
  ) => {
    ctx.fillStyle = base;
    roundRectPath(ctx, u(x0), v(z0), s(x1 - x0), s(z1 - z0), s(1.2));
    ctx.fill();
    ctx.save();
    roundRectPath(ctx, u(x0), v(z0), s(x1 - x0), s(z1 - z0), s(1.2));
    ctx.clip();
    // Tone mottling so big lots never read as one flat fill.
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < ((x1 - x0) * (z1 - z0)) / 42; i++) {
      ctx.fillStyle = rng() < 0.5 ? '#6e6b64' : '#9b978e';
      const px = u(x0 + rng() * (x1 - x0));
      const py = v(z0 + rng() * (z1 - z0));
      const r = s(1.2 + rng() * 3.2);
      ctx.beginPath();
      ctx.ellipse(px, py, r, r * 0.6, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Concrete joint grid (alley slabs) or plaza tile grid.
    const pitch = opts.joints ?? (opts.tiles ? 2.0 : 3.2);
    ctx.strokeStyle = opts.tiles ? 'rgba(0,0,0,0.09)' : 'rgba(0,0,0,0.07)';
    ctx.lineWidth = s(0.06);
    for (let x = x0 + pitch; x < x1; x += pitch) {
      ctx.beginPath();
      ctx.moveTo(u(x), v(z0));
      ctx.lineTo(u(x), v(z1));
      ctx.stroke();
    }
    for (let z = z0 + pitch; z < z1; z += pitch) {
      ctx.beginPath();
      ctx.moveTo(u(x0), v(z));
      ctx.lineTo(u(x1), v(z));
      ctx.stroke();
    }
    // Asphalt repair patches (the classic Seoul alley look).
    if (opts.patches) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#5d6068';
      for (let i = 0; i < ((x1 - x0) * (z1 - z0)) / 130; i++) {
        const px = x0 + rng() * (x1 - x0 - 3);
        const pz = z0 + rng() * (z1 - z0 - 2.4);
        roundRectPath(ctx, u(px), v(pz), s(1.6 + rng() * 2.6), s(1.2 + rng() * 1.8), s(0.5));
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };
  // Parking pads with white stall lines (Korean lots mark them in white).
  const parkingPad = (x0: number, z0: number, x1: number, z1: number, stallsAlongX: boolean) => {
    ctx.fillStyle = '#61656e';
    roundRectPath(ctx, u(x0), v(z0), s(x1 - x0), s(z1 - z0), s(0.6));
    ctx.fill();
    ctx.strokeStyle = 'rgba(235,230,215,0.65)';
    ctx.lineWidth = s(0.09);
    if (stallsAlongX) {
      for (let x = x0 + 2.2; x < x1 - 0.5; x += 2.2) {
        ctx.beginPath();
        ctx.moveTo(u(x), v(z0 + 0.3));
        ctx.lineTo(u(x), v(z1 - 0.3));
        ctx.stroke();
      }
    } else {
      for (let z = z0 + 2.2; z < z1 - 0.5; z += 2.2) {
        ctx.beginPath();
        ctx.moveTo(u(x0 + 0.3), v(z));
        ctx.lineTo(u(x1 - 0.3), v(z));
        ctx.stroke();
      }
    }
  };

  // Hongdae / west blocks (Yeonnam-style alley concrete with patches)
  paveLot(-84, -28.5, -8.5, 2.5, '#84817a', { patches: true });
  // Insadong / Euljiro east blocks (older concrete, tighter joints)
  paveLot(8.5, -28.5, 84, 2.5, '#87837b', { patches: true, joints: 2.6 });
  // Backs of the north row along Namsan-ro (stops clear of Namsan's skirt)
  paveLot(-84, -48, -24, -37.8, '#807d76', { patches: true });
  // Hanok quarter: packed sandy earth under the stone alley
  paveLot(22, -56, 80, -37.8, '#c2b090', { joints: 5 });
  // Gangnam: bright plaza tiles (Teheran-ro streetscape)
  paveLot(8.5, 59.5, 84, 76.5, '#96928a', { tiles: true });
  paveLot(8.5, 83.5, 84, 96.5, '#94908a', { tiles: true });
  // Yeouido office forecourts
  paveLot(-84, 59.5, -47, 96.5, '#908c85', { tiles: true, joints: 2.4 });
  // Apartment-complex courtyards stay green; give them paths + parking rows
  ctx.fillStyle = '#5f8f5c';
  roundRectPath(ctx, u(-44.5), v(59.5), s(33.5), s(37), s(1.2));
  ctx.fill();
  paveLot(-40, 68, -13, 70.4, P.sidewalk, { joints: 2.4 }); // complex spine path
  paveLot(-27.6, 60, -25.4, 96, P.sidewalk, { joints: 2.4 });
  parkingPad(-40, 76.5, -14, 80.5, true);
  parkingPad(-40, 92, -14, 96, true);
  // Hongdae + Insadong pocket parks (the only green in the alley blocks)
  ctx.fillStyle = '#5f8f5c';
  roundRectPath(ctx, u(-30.5), v(-17), s(9), s(21.5), s(2.2));
  ctx.fill();
  roundRectPath(ctx, u(21.5), v(-17), s(9), s(21.5), s(2.2));
  ctx.fill();
  // Small surface lots tucked into the commercial blocks
  parkingPad(-60, -24, -50, -19, false);
  parkingPad(44, -8, 52, -3, true);
  parkingPad(48, 62, 56, 66.5, true);
  // Green tree pits under the plaza ring trees (they stand on paving now)
  ctx.fillStyle = '#5f8f5c';
  for (const [tx, tz] of [[-15, -6], [15, -6], [-13, -22], [13, -22]] as const) {
    ctx.beginPath();
    ctx.arc(u(tx), v(tz), s(2.0), 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------------------------------------------------------- roads
  // Painted in layers: sidewalk aprons (rounded), curbs, then all asphalt
  // cores (rounded) so junctions merge into smooth fillets.
  for (const [x, z, w, d, sidewalk = SIDEWALK] of ROADS) {
    ctx.fillStyle = P.sidewalk;
    roundRectPath(
      ctx,
      u(x - w / 2 - sidewalk),
      v(z - d / 2 - sidewalk),
      s(w + sidewalk * 2),
      s(d + sidewalk * 2),
      s(2.2)
    );
    ctx.fill();
  }
  // Sidewalk block paving (보도블럭): small staggered blocks with a per-block
  // tone shift and a darker band at the kerb, then the yellow tactile strip
  // (점자블록) that runs along every Seoul sidewalk.
  for (const [x, z, w, d, sidewalk = SIDEWALK] of ROADS) {
    const horizontal = w > d;
    const len = horizontal ? w : d;
    const a0 = (horizontal ? x : z) - len / 2 - sidewalk;
    const total = len + sidewalk * 2;
    for (const side of [-1, 1]) {
      const c0 = (horizontal ? z : x) + side * ((horizontal ? d : w) / 2);
      // Rectangle at along-offset `al` (length `ll`), `ac` metres out from
      // the road edge (width `lc`).
      const rect = (al: number, ac: number, ll: number, lc: number) => {
        const c1 = c0 + side * ac;
        const c2 = c0 + side * (ac + lc);
        const lo = Math.min(c1, c2);
        if (horizontal) ctx.fillRect(u(al), v(lo), s(ll), s(lc));
        else ctx.fillRect(u(lo), v(al), s(lc), s(ll));
      };
      const rows = Math.floor((sidewalk - 0.3) / 0.3);
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? 0.3 : 0;
        for (let t = a0 - off; t < a0 + total; t += 0.6) {
          const n = rng();
          if (n > 0.22 && n < 0.86) continue;
          ctx.fillStyle = n <= 0.22 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)';
          rect(t + 0.03, 0.62 + r * 0.3, 0.54, 0.26);
        }
      }
      // Kerb-side band of darker blocks
      ctx.fillStyle = '#86807a';
      rect(a0, 0.3, total, 0.3);
      // Tactile guide strip, partway out from the kerb
      ctx.fillStyle = '#b39a55';
      rect(a0 + 2, 0.3 + (sidewalk - 0.3) * 0.6, total - 4, 0.22);
    }
  }
  // Curbs: a darker rim just outside the asphalt.
  for (const [x, z, w, d] of ROADS) {
    ctx.fillStyle = P.curb;
    roundRectPath(ctx, u(x - w / 2 - 0.3), v(z - d / 2 - 0.3), s(w + 0.6), s(d + 0.6), s(1.7));
    ctx.fill();
  }
  // Asphalt cores.
  for (const [x, z, w, d] of ROADS) {
    ctx.fillStyle = P.asphalt;
    roundRectPath(ctx, u(x - w / 2), v(z - d / 2), s(w), s(d), s(1.5));
    ctx.fill();
  }
  // Asphalt wear: patches and tone variation over the road network.
  ctx.save();
  for (const [x, z, w, d] of ROADS) {
    roundRectPath(ctx, u(x - w / 2), v(z - d / 2), s(w), s(d), s(1.5));
    ctx.clip();
    // patch clip accumulates — draw immediately per road
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < Math.max(6, (w * d) / 80); i++) {
      ctx.fillStyle = rng() < 0.5 ? '#4f545e' : P.asphaltLight;
      const px = u(x - w / 2 + rng() * w);
      const py = v(z - d / 2 + rng() * d);
      const r = s(0.8 + rng() * 2.2);
      ctx.beginPath();
      ctx.ellipse(px, py, r, r * 0.6, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.save();
  }
  ctx.restore();

  // Tyre tracks: faintly darker bands where years of wheels have polished
  // the aggregate, two per lane.
  ctx.fillStyle = 'rgba(30,32,36,0.10)';
  for (const [x, z, w, d] of ROADS) {
    const horizontal = w > d;
    for (const lane of [-1.5, 1.5]) {
      for (const wheel of [-0.55, 0.55]) {
        const o = lane + wheel;
        if (horizontal) ctx.fillRect(u(x - w / 2), v(z + o - 0.22), s(w), s(0.44));
        else ctx.fillRect(u(x + o - 0.22), v(z - d / 2), s(0.44), s(d));
      }
    }
  }
  // Crack-seal lines: thin black tar squiggles across the asphalt.
  ctx.strokeStyle = 'rgba(28,30,34,0.35)';
  ctx.lineWidth = s(0.07);
  for (const [x, z, w, d] of ROADS) {
    const horizontal = w > d;
    const n = Math.floor((horizontal ? w : d) / 9);
    for (let i = 0; i < n; i++) {
      let pa = (horizontal ? x - w / 2 : z - d / 2) + rng() * (horizontal ? w : d);
      let pc = (horizontal ? z : x) + (rng() - 0.5) * 4;
      ctx.beginPath();
      ctx.moveTo(horizontal ? u(pa) : u(pc), horizontal ? v(pc) : v(pa));
      for (let k = 0; k < 5; k++) {
        pa += 0.4 + rng() * 0.9;
        pc += (rng() - 0.5) * 0.9;
        ctx.lineTo(horizontal ? u(pa) : u(pc), horizontal ? v(pc) : v(pa));
      }
      ctx.stroke();
    }
  }

  // Paved aprons where the bridge ramps land on the south bank.
  ctx.fillStyle = P.asphalt;
  ctx.fillRect(u(-3.8), v(48), s(7.6), s(5.2)); // Hangang bridge landing
  ctx.fillRect(u(-51.4), v(48), s(6.8), s(5.2)); // Yanghwa bridge landing

  // Lane lines, zebras, stop lines and arrows are geometry (RoadMarkings.ts):
  // painted into this canvas at 15 px/m they blurred as soon as the camera
  // came close. Only the tactile pads stay painted, on the sidewalks.
  // Yellow dotted tactile pads where each crosswalk meets the kerb.
  const pad = (x: number, z: number) => {
    ctx.fillStyle = '#c4a446';
    ctx.fillRect(u(x - 0.45), v(z - 0.45), s(0.9), s(0.9));
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(u(x - 0.3 + i * 0.3), v(z - 0.3 + k * 0.3), s(0.07), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  for (const j of JUNCTIONS) {
    for (const sx of [-1, 1]) {
      pad(j.x - 4.2, j.z + sx * 3.75);
      pad(j.x + 4.2, j.z + sx * 3.75);
      if (j.n) pad(j.x + sx * 3.75, j.z - 4.2);
      if (j.s) pad(j.x + sx * 3.75, j.z + 4.2);
    }
  }
  // Manholes + storm drains scattered along the asphalt.
  for (const [x, z, w, d] of ROADS) {
    const horizontal = w > d;
    const count = Math.floor((horizontal ? w : d) / 22);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count + (rng() - 0.5) * 0.06;
      const mx = horizontal ? x - w / 2 + t * w : x + (rng() - 0.5) * (w * 0.4);
      const mz = horizontal ? z + (rng() - 0.5) * (d * 0.4) : z - d / 2 + t * d;
      ctx.fillStyle = '#494e57';
      ctx.beginPath();
      ctx.arc(u(mx), v(mz), s(0.34), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3d434c';
      ctx.lineWidth = s(0.07);
      ctx.beginPath();
      ctx.arc(u(mx), v(mz), s(0.22), 0, Math.PI * 2);
      ctx.stroke();
    }
    // storm drains near junction curbs
    if (horizontal) {
      ctx.fillStyle = '#41464f';
      for (const jx of [-64, -32, 0, 32, 64]) {
        if (Math.abs(jx) > w / 2 - 4) continue;
        ctx.fillRect(u(jx + 4.2), v(z - d / 2 + 0.15), s(0.9), s(0.3));
        ctx.fillRect(u(jx - 5.1), v(z + d / 2 - 0.45), s(0.9), s(0.3));
      }
    }
  }

  // -------------------------------------------------------------- hanok alley
  // The alley is stone-paved with joint lines and slightly wavy edges.
  const alley = { x0: 26, x1: 66, z: -44, w: 4.6 };
  ctx.fillStyle = P.stone;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = alley.x0 + t * (alley.x1 - alley.x0);
    const zz = alley.z - alley.w / 2 - Math.sin(x * 0.35) * 0.25;
    if (i === 0) ctx.moveTo(u(x), v(zz));
    else ctx.lineTo(u(x), v(zz));
  }
  for (let i = 40; i >= 0; i--) {
    const t = i / 40;
    const x = alley.x0 + t * (alley.x1 - alley.x0);
    const zz = alley.z + alley.w / 2 + Math.sin(x * 0.3 + 2) * 0.25;
    ctx.lineTo(u(x), v(zz));
  }
  ctx.closePath();
  ctx.fill();
  // Stone joints
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = s(0.07);
  for (let x = alley.x0 + 1; x < alley.x1; x += 1.5) {
    ctx.beginPath();
    ctx.moveTo(u(x), v(alley.z - alley.w / 2));
    ctx.lineTo(u(x + 0.3), v(alley.z + alley.w / 2));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.beginPath();
  ctx.moveTo(u(alley.x0), v(alley.z - 0.6));
  ctx.lineTo(u(alley.x1), v(alley.z - 0.4));
  ctx.stroke();

  // Alley connector from the east street.
  ctx.fillStyle = P.stone;
  ctx.fillRect(u(29.2), v(-46), s(5.6), s(12.2));

  // ------------------------------------------------------------------ plaza
  // Granite civic paving like Gwanghwamun Square: a grid of 1.2 m slabs in
  // two greys, each slab its own shade, inside a darker border course.
  const px0 = u(0);
  const pz0 = v(-14);
  ctx.save();
  ctx.beginPath();
  ctx.arc(px0, pz0, s(12), 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#a8a39a';
  ctx.fillRect(px0 - s(12), pz0 - s(12), s(24), s(24));
  for (let gx = -12; gx < 12; gx += 1.2) {
    for (let gz = -12; gz < 12; gz += 1.2) {
      const n = rng();
      ctx.fillStyle = n < 0.3 ? '#a39e95' : n < 0.55 ? '#aca79e' : n < 0.6 ? '#9c9489' : '#a8a39a';
      ctx.fillRect(px0 + s(gx + 0.03), pz0 + s(gz + 0.03), s(1.14), s(1.14));
    }
  }
  // A cross of darker granite bands aligned with the spine, as Seoul squares
  // mark their axes.
  ctx.fillStyle = 'rgba(80,74,66,0.12)';
  ctx.fillRect(px0 - s(1.8), pz0 - s(12), s(3.6), s(24));
  ctx.restore();
  ctx.strokeStyle = '#857f75';
  ctx.lineWidth = s(0.6);
  ctx.beginPath();
  ctx.arc(px0, pz0, s(11.7), 0, Math.PI * 2);
  ctx.stroke();

  // Curved footpath: plaza → Hongdae pocket park.
  strokePath(
    ctx,
    (t) => [-12 - t * 12.5, -14 + Math.sin(t * 2.2) * 2.4 + t * 6],
    1.2,
    '#a89a7f'
  );

  paintedCanvas = canvas;
  return canvas;
}

/** Fills the band between two curved z(x) edges across the full width. */
function fillShoreBand(
  ctx: CanvasRenderingContext2D,
  top: (x: number) => number,
  bottom: (x: number) => number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  const steps = 90;
  for (let i = 0; i <= steps; i++) {
    const x = -104 + (i / steps) * 208;
    const z = top(x);
    if (i === 0) ctx.moveTo(u(x), v(z));
    else ctx.lineTo(u(x), v(z));
  }
  for (let i = steps; i >= 0; i--) {
    const x = -104 + (i / steps) * 208;
    ctx.lineTo(u(x), v(bottom(x)));
  }
  ctx.closePath();
  ctx.fill();
}

/** Strokes a parametric path (t 0..1 → world x,z) with a given width. */
function strokePath(
  ctx: CanvasRenderingContext2D,
  fn: (t: number) => [number, number],
  width: number,
  color: string
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = s(width);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const [x, z] = fn(i / steps);
    if (i === 0) ctx.moveTo(u(x), v(z));
    else ctx.lineTo(u(x), v(z));
  }
  ctx.stroke();
}

/** Horizontal band of soft mottling between two canvas-y values. */
function mottleBand(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  y0: number,
  y1: number,
  color: string,
  count: number
): void {
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const px = rng() * CW;
    const py = y0 + rng() * (y1 - y0);
    const r = s(0.8 + rng() * 2.4);
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.6, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
