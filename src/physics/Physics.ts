import * as CANNON from 'cannon-es';

/**
 * Thin cannon-es wrapper. The world is almost entirely static boxes plus the
 * one dynamic player sphere, stepped at a fixed 60Hz with substeps so thin
 * colliders don't tunnel.
 */
export class Physics {
  readonly world: CANNON.World;
  readonly groundMaterial: CANNON.Material;
  readonly playerMaterial: CANNON.Material;

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
    body.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2)));
    body.position.set(cx, cy, cz);
    if (rotationY !== 0) body.quaternion.setFromEuler(0, rotationY, 0);
    this.world.addBody(body);
    return body;
  }

  /** Static cylinder, used for tree trunks, poles, and the Namsan hill. */
  addStaticCylinder(cx: number, cy: number, cz: number, radius: number, height: number): CANNON.Body {
    const body = new CANNON.Body({ mass: 0, material: this.groundMaterial });
    body.addShape(new CANNON.Cylinder(radius, radius, height, 12));
    body.position.set(cx, cy, cz);
    this.world.addBody(body);
    return body;
  }

  step(dt: number): void {
    this.world.step(1 / 60, dt, 3);
  }
}
