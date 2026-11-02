import * as CANNON from 'cannon-es';

/**
 * Thin cannon-es wrapper. The world is almost entirely static boxes plus the
 * one dynamic player sphere, stepped at a fixed 60Hz with substeps so thin
 * colliders don't tunnel.
 */
/** Collision group for statics the follow camera should treat as walls. */
export const CAMERA_SOLID = 2;

export class Physics {
  readonly world: CANNON.World;
  readonly groundMaterial: CANNON.Material;
  readonly playerMaterial: CANNON.Material;

  /** Static volumes kept for point-containment checks (stuck detection). */
  private boxVolumes: { body: CANNON.Body; half: CANNON.Vec3 }[] = [];
  private cylinderVolumes: { x: number; y: number; z: number; radius: number; height: number }[] =
    [];

  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -22, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;

    this.groundMaterial = new CANNON.Material('ground');
    this.playerMaterial = new CANNON.Material('player');
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.groundMaterial, this.playerMaterial, {
        friction: 0.0,
        restitution: 0.05,
      })
    );
    this.world.defaultContactMaterial.friction = 0;
    this.world.defaultContactMaterial.restitution = 0.05;

    // Ground plane
    const ground = new CANNON.Body({ mass: 0, material: this.groundMaterial });
    ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
  }

  /** Static axis-aligned (optionally Y-rotated) box collider. */
  addStaticBox(
    cx: number,
    cy: number,
    cz: number,
    width: number,
    height: number,
    depth: number,
    rotationY = 0
  ): CANNON.Body {
    const body = new CANNON.Body({ mass: 0, material: this.groundMaterial });
    // Tall, wide solids block the camera; thin poles and low props don't.
    if (height >= 1.8 && Math.max(width, depth) >= 0.9) body.collisionFilterGroup = 1 | CAMERA_SOLID;
    const half = new CANNON.Vec3(width / 2, height / 2, depth / 2);
    body.addShape(new CANNON.Box(half));
    body.position.set(cx, cy, cz);
    if (rotationY !== 0) body.quaternion.setFromEuler(0, rotationY, 0);
    this.world.addBody(body);
    this.boxVolumes.push({ body, half });
    return body;
  }

  /** Static cylinder, used for tree trunks, poles, and the Namsan hill. */
  addStaticCylinder(cx: number, cy: number, cz: number, radius: number, height: number): CANNON.Body {
    const body = new CANNON.Body({ mass: 0, material: this.groundMaterial });
    body.addShape(new CANNON.Cylinder(radius, radius, height, 12));
    if (radius >= 1) body.collisionFilterGroup = 1 | CAMERA_SOLID;
    body.position.set(cx, cy, cz);
    this.world.addBody(body);
    this.cylinderVolumes.push({ x: cx, y: cy, z: cz, radius, height });
    return body;
  }

  /**
   * True when `p` sits meaningfully inside a static collider — a state normal
   * contact resolution never allows, so it means the body is wedged (e.g. a
   * teleport landed inside furniture). `margin` keeps surface contact from
   * counting.
   */
  isInsideStatic(point: { x: number; y: number; z: number }, margin = 0.05): boolean {
    const p = new CANNON.Vec3(point.x, point.y, point.z);
    const local = new CANNON.Vec3();
    for (const v of this.boxVolumes) {
      v.body.pointToLocalFrame(p, local);
      if (
        Math.abs(local.x) < v.half.x - margin &&
        Math.abs(local.y) < v.half.y - margin &&
        Math.abs(local.z) < v.half.z - margin
      ) {
        return true;
      }
    }
    for (const c of this.cylinderVolumes) {
      if (
        Math.abs(p.y - c.y) < c.height / 2 - margin &&
        Math.hypot(p.x - c.x, p.z - c.z) < c.radius - margin
      ) {
        return true;
      }
    }
    return false;
  }

  private rayFrom = new CANNON.Vec3();
  private rayTo = new CANNON.Vec3();

  /**
   * Distance from `from` to the first static solid along `to`, or Infinity.
   * The follow camera uses this for occlusion: a few hundred boxes through
   * the broadphase instead of every triangle of the merged city meshes.
   * Only bodies in the CAMERA_SOLID group count, so kerbs, benches and
   * thin poles never shove the camera around.
   */
  raycastSolid(
    fx: number, fy: number, fz: number,
    tx: number, ty: number, tz: number
  ): number {
    this.rayFrom.set(fx, fy, fz);
    this.rayTo.set(tx, ty, tz);
    let best = Infinity;
    this.world.raycastAll(this.rayFrom, this.rayTo, { skipBackfaces: true, collisionFilterMask: CAMERA_SOLID }, (r) => {
      if (r.distance < best) best = r.distance;
    });
    return best;
  }

  step(dt: number): void {
    // Generous substep budget so slow machines (or software rendering)
    // simulate the full wall-clock time instead of moving in slow motion.
    // With one dynamic body the extra substeps are effectively free.
    this.world.step(1 / 60, dt, 20);
  }
}
