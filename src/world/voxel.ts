import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tmpColor = new THREE.Color();

/**
 * Collects colored boxes and merges them into a single BufferGeometry with
 * vertex colors — one draw call per kit. This is the workhorse behind every
 * handcrafted structure in the diorama.
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
  // Slight per-part value jitter keeps large same-color surfaces alive.
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** Shared materials — created once, reused by every structure. */
export const MATERIALS = {
  lit: new THREE.MeshLambertMaterial({ vertexColors: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
};
