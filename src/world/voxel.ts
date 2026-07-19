import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CEL } from './CelShading';

const tmpColor = new THREE.Color();

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
    const geo = new RoundedBoxGeometry(w, h, d, 2, r);
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

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  /** Merge everything into one geometry. The kit is spent afterwards. */
  merge(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
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
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
};
