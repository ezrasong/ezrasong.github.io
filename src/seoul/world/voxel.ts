import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CEL } from './CelShading';
import { ENV } from './Env';

const tmpColor = new THREE.Color();

/** Multiplies a hex color's value by `f` (cheap shade/tint). */
export function shade(hex: string, f: number): string {
  const c = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}


/**
 * Collects colored primitives and merges them into a single BufferGeometry
 * with vertex colors — one draw call per kit. This is the workhorse behind
 * every handcrafted structure in the diorama.
 *
 * Beyond plain boxes the kit offers chamfered boxes (rbox), wedges/prisms,
 * and cylinders/cones, so silhouettes read as modelled objects rather than
 * stacked cubes.
 */
export class VoxelKit {
  private parts: THREE.BufferGeometry[] = [];

  /** Adds a box of size w×h×d whose CENTER sits at (x, y, z). */
  box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: string,
    rotY = 0
  ): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (rotY !== 0) geo.rotateY(rotY);
    geo.translate(x, y, z);
    paint(geo, color);
    this.parts.push(geo);
  }

  /** Adds a box sitting ON the given y (its base at y). */
  boxOn(w: number, h: number, d: number, x: number, baseY: number, z: number, color: string, rotY = 0): void {
    this.box(w, h, d, x, baseY + h / 2, z, color, rotY);
  }

  /** Chamfered box (rounded edges) centered at (x, y, z). */
  rbox(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: string,
    radius = 0.08,
    rotY = 0
  ): void {
    const r = Math.min(radius, w / 2.01, h / 2.01, d / 2.01);
    const geo = new RoundedBoxGeometry(w, h, d, 1, r);
    if (rotY !== 0) geo.rotateY(rotY);
    geo.translate(x, y, z);
    paint(geo, color);
    this.parts.push(geo);
  }

  /** Chamfered box sitting ON the given y. */
  rboxOn(
    w: number,
    h: number,
    d: number,
    x: number,
    baseY: number,
    z: number,
    color: string,
    radius = 0.08,
    rotY = 0
  ): void {
    this.rbox(w, h, d, x, baseY + h / 2, z, color, radius, rotY);
  }

  /**
   * Triangular prism (gable/wedge). Width w along x, height h, depth d along
   * z; the ridge runs along z at the top. Centered at (x, y at base, z).
   */
  prism(w: number, h: number, d: number, x: number, baseY: number, z: number, color: string, rotY = 0): void {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    geo.translate(0, 0, -d / 2);
    if (rotY !== 0) geo.rotateY(rotY);
    geo.translate(x, baseY, z);
    paint(geo, color);
    this.parts.push(geo);
  }

  /**
   * Right-triangle wedge: a ramp rising from 0 at -x to h at +x, width w
   * along x, depth d along z, sitting on baseY. rotY reorients the rise.
   */
  wedge(w: number, h: number, d: number, x: number, baseY: number, z: number, color: string, rotY = 0): void {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2, h);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    geo.translate(0, 0, -d / 2);
    if (rotY !== 0) geo.rotateY(rotY);
    geo.translate(x, baseY, z);
    paint(geo, color);
    this.parts.push(geo);
  }

  /**
   * Straight square-section member between two points — stay cables,
   * struts, diagonal braces.
   */
  bar(
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    thickness: number,
    color: string
  ): void {
    const from = new THREE.Vector3(x1, y1, z1);
    const to = new THREE.Vector3(x2, y2, z2);
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 1e-5) return;
    const geo = new THREE.BoxGeometry(thickness, len, thickness);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize()
    );
    geo.applyQuaternion(quat);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    geo.translate(mid.x, mid.y, mid.z);
    paint(geo, color);
    this.parts.push(geo);
  }

  /** Cylinder for trunks, poles, towers. Center at (x,y,z). */
  cylinder(rTop: number, rBottom: number, h: number, x: number, y: number, z: number, color: string, segments = 8): void {
    const geo = new THREE.CylinderGeometry(rTop, rBottom, h, segments);
    geo.translate(x, y, z);
    paint(geo, color);
    this.parts.push(geo);
  }

  cone(r: number, h: number, x: number, y: number, z: number, color: string, segments = 8): void {
    const geo = new THREE.ConeGeometry(r, h, segments);
    geo.translate(x, y, z);
    paint(geo, color);
    this.parts.push(geo);
  }

  /** Flattened icosphere blob — canopies, clouds, bushes. */
  blob(r: number, x: number, y: number, z: number, color: string, squashY = 0.8, detail = 1): void {
    const geo = new THREE.IcosahedronGeometry(r, detail);
    geo.scale(1, squashY, 1);
    geo.translate(x, y, z);
    paint(geo, color);
    this.parts.push(geo);
  }

  /**
   * Adds a prebuilt geometry (curved roofs, extruded car bodies). With a
   * colour it is painted flat; without one it must carry its own `color`
   * attribute (e.g. per-vertex tile courses).
   */
  add(geo: THREE.BufferGeometry, color?: string): void {
    if (color) paint(geo, color);
    // Every primitive carries uv; merging needs matching attribute sets.
    if (!geo.attributes.uv) {
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    }
    this.parts.push(geo);
  }

  /**
   * Side-profile extrusion: `pts` is an (x, y) outline in the vertical
   * plane, extruded `depth` across z and centred on z. Car bodies, bus
   * silhouettes and stair stringers read as modelled objects this way
   * instead of stacked boxes.
   */
  profile(pts: [number, number][], depth: number, x: number, baseY: number, z: number, color: string, bevel = 0, rotY = 0): void {
    const shape = new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px, py)));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: depth - bevel * 2,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      curveSegments: 4,
    });
    geo.translate(0, 0, -(depth - bevel * 2) / 2);
    if (rotY !== 0) geo.rotateY(rotY);
    geo.translate(x, baseY, z);
    paint(geo, color);
    this.parts.push(geo);
  }

  /** Cylinder lying along local x (wheels, rolled awnings). Center at (x,y,z). */
  cylinderX(r: number, len: number, x: number, y: number, z: number, color: string, segments = 10, rotY = 0): void {
    const geo = new THREE.CylinderGeometry(r, r, len, segments);
    geo.rotateZ(Math.PI / 2);
    if (rotY !== 0) geo.rotateY(rotY);
    geo.translate(x, y, z);
    paint(geo, color);
    this.parts.push(geo);
  }

  /**
   * Moves every part of another kit into this one through `matrix`, so a
   * model built once in local space (a car, a house) can be stamped around
   * the world and still merge into a single draw call. `other` is spent.
   */
  absorb(other: VoxelKit, matrix: THREE.Matrix4): void {
    for (const p of other.parts) {
      p.applyMatrix4(matrix);
      this.parts.push(p);
    }
    other.parts = [];
  }

  /** Deep copy, so one local model can be absorbed many times. */
  clone(): VoxelKit {
    const k = new VoxelKit();
    k.parts = this.parts.map((p) => p.clone());
    return k;
  }

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  /** Merge everything into one geometry. The kit is spent afterwards. */
  merge(): THREE.BufferGeometry {
    // Primitives are a mix of indexed (Box/Cylinder) and non-indexed
    // (RoundedBox/Extrude/Icosahedron) geometries; normalize before merging.
    const parts = this.parts.map((p) => {
      if (!p.index) return p;
      const ni = p.toNonIndexed();
      p.dispose();
      return ni;
    });
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    this.parts = [];
    bakeAO(merged);
    return merged;
  }

  /** Convenience: merged mesh with the shared lit vertex-color material. */
  toMesh(material: THREE.Material, castShadow = true, receiveShadow = true): THREE.Mesh {
    const mesh = new THREE.Mesh(this.merge(), material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    return mesh;
  }
}

/**
 * Baked ambient occlusion in the vertex colours. Structures are built in
 * local space with the ground at y=0, so height is a good proxy for contact:
 * the bottom ~0.6 m of every wall darkens toward the pavement, and faces
 * pointing down (eave and sill undersides, awnings, balconies) sit in their
 * own shade. Cheap, no extra geometry, and it gives every box a footing.
 */
function bakeAO(geo: THREE.BufferGeometry): void {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const col = geo.attributes.color;
  if (!pos || !nor || !col) return;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const ny = nor.getY(i);
    const contact = y < 0.6 ? 0.72 + 0.28 * Math.max(0, y / 0.6) : 1;
    const under = ny < -0.5 ? 0.7 : 1;
    const k = contact * under;
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
}

function paint(geo: THREE.BufferGeometry, color: string): void {
  tmpColor.set(color);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Shared materials — created once, reused by every structure. `lit` is the
 * cel-shaded successor of the old Lambert material; `glow` stays unlit for
 * windows, neon, and lamps.
 */
export const MATERIALS = {
  lit: CEL.lit,
  litMetal: CEL.litMetal,
  foliage: CEL.foliage,
  glassWall: CEL.glass,
  glow: makeGlowMaterial(),
  paper: makePaperMaterial(),
};

/**
 * Hanji paper in lattice doors and lanterns: matte cream by day (paper does
 * not turn into dark glass the way window panes do), warm and bright at
 * night when the room behind it is lit.
 */
function makePaperMaterial(): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDaylight = ENV.daylight;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uDaylight;`)
      .replace('#include <opaque_fragment>', `
        outgoingLight *= mix( 1.0, 0.8, uDaylight );
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'paper-daylight';
  return mat;
}

/**
 * Lit windows, neon and lamps. At night they show their own colour at full
 * strength; by day a window is glass, so the colour sinks toward a dark
 * reflective tone with a faint sky sheen and only a trace of the interior
 * light. Without this, every lit pane read as a flat cream sticker at noon.
 */
function makeGlowMaterial(): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDaylight = ENV.daylight;
    shader.uniforms.uSky = ENV.skyZenith;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uDaylight;
        uniform vec3 uSky;`)
      .replace('#include <opaque_fragment>', `{
          // By day every pane is glass: dark, reflecting a little sky, with
          // only a trace of the room colour. The threshold sits low so pale
          // cool panes sink too (they read as white tiles otherwise).
          float lum = dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) );
          // Linear-space values: 0.1 here is already a mid-dark grey on screen.
          vec3 glass = mix( vec3( 0.025, 0.03, 0.042 ), uSky, 0.2 ) + outgoingLight * 0.03;
          outgoingLight = mix( outgoingLight, glass, uDaylight * smoothstep( 0.12, 0.45, lum ) );
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'glow-daylight';
  return mat;
}
