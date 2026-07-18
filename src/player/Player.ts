import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { PLAYER_CONFIG as CFG } from '../config/player';
import type { Physics } from '../physics/Physics';
import type { Input } from '../input/Input';
import { clamp, damp, moveToward } from '../utils/math';

/**
 * The Poro. A dynamic sphere in the physics world drives a normalized,
 * animated GLB. Movement is arcade-style: analog throttle + steering with
 * momentum, procedural lean/bounce layered over the model's own clips.
 */
export class Player {
  readonly container = new THREE.Group();
  /** Inner group that carries procedural lean/bounce/squash. */
  private readonly rig = new THREE.Group();
  readonly body: CANNON.Body;

  yaw = CFG.spawn.yaw;
  speed = 0;
  /** 0..1 how fast we are relative to max — used by camera and audio. */
  speedRatio = 0;
  grounded = true;
  frozen = false;

  private mixer?: THREE.AnimationMixer;
  private actions: Record<string, THREE.AnimationAction> = {};
  private activeLocomotion?: THREE.AnimationAction;
  private idleTimer = 0;
  private fidgeting = false;
  private stuckTimer = 0;
  private bouncePhase = 0;
  private lean = 0;
  private reducedMotion: boolean;

  constructor(
    gltf: GLTF,
    physics: Physics,
    private input: Input
  ) {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- Normalize the model: scale to target height, feet at y=0 of rig.
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = CFG.targetHeight / size.y;
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    model.rotation.y = CFG.modelYaw;

    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = false;
        // Skinned mesh can wander outside its bind-pose bounds while animating.
        child.frustumCulled = false;
      }
    });

    this.rig.add(model);
    this.rig.position.y = CFG.groundOffset;
    this.container.add(this.rig);

    // --- Animations
    if (gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);
      for (const name of Object.values(CFG.clips)) {
        const clip = THREE.AnimationClip.findByName(gltf.animations, name);
        if (clip) this.actions[name] = this.mixer.clipAction(clip);
      }
      const idle = this.actions[CFG.clips.idle];
      if (idle) {
        idle.play();
        this.activeLocomotion = idle;
      }
      this.playOnce(CFG.clips.greeting);
    }

    // --- Physics body
    this.body = new CANNON.Body({
      mass: 6,
      material: physics.playerMaterial,
      shape: new CANNON.Sphere(CFG.bodyRadius),
      position: new CANNON.Vec3(CFG.spawn.x, CFG.bodyRadius + 0.4, CFG.spawn.z),
      fixedRotation: true,
      allowSleep: false,
    });
    this.body.linearDamping = 0.0;
    physics.world.addBody(this.body);
  }

  /** Plays a one-shot clip (interact, greeting…) over the locomotion layer. */
  playOnce(name: string): number {
    const action = this.actions[name];
    if (!action || !this.mixer) return 0;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
    action.fadeIn(0.15).play();
    const duration = action.getClip().duration;
    setTimeout(() => action.fadeOut(0.3), Math.max(0, duration * 1000 - 300));
    return duration;
  }

  private setLocomotion(name: string, timeScale = 1): void {
    const next = this.actions[name];
    if (!next) return;
    next.timeScale = timeScale;
    if (this.activeLocomotion === next) return;
    next.reset().fadeIn(0.25).play();
    this.activeLocomotion?.fadeOut(0.25);
    this.activeLocomotion = next;
  }

  update(dt: number): void {
    const throttle = this.frozen ? 0 : this.input.throttle;
    const steer = this.frozen ? 0 : this.input.steer;

    // --- Steering: weaker at standstill, reversed when backing up.
    const steerAuthority =
      CFG.turnSpeedStationaryFactor +
      (1 - CFG.turnSpeedStationaryFactor) * Math.min(1, Math.abs(this.speed) / 3);
    const reverseSign = this.speed < -0.3 ? -1 : 1;
    this.yaw += steer * CFG.turnSpeed * steerAuthority * reverseSign * dt;

    // --- Throttle with momentum.
    const target =
      throttle >= 0 ? throttle * CFG.maxSpeed : throttle * CFG.maxReverseSpeed;
    const opposing = Math.sign(target) !== Math.sign(this.speed) && Math.abs(this.speed) > 0.1;
    const rate =
      throttle === 0
        ? CFG.idleDeceleration
        : opposing
          ? CFG.brakingDeceleration
          : CFG.acceleration;
    this.speed = moveToward(this.speed, target, rate * dt);
    this.speedRatio = clamp(Math.abs(this.speed) / CFG.maxSpeed, 0, 1);

    // --- Drive the physics body horizontally; gravity keeps vertical honest.
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    this.body.velocity.x = fx * this.speed;
    this.body.velocity.z = fz * this.speed;

    this.grounded = this.body.position.y < CFG.bodyRadius + 0.15;

    // --- Visual placement
    this.container.position.set(
      this.body.position.x,
      this.body.position.y - CFG.bodyRadius,
      this.body.position.z
    );
    this.container.rotation.y = this.yaw;

    // --- Procedural flourish: lean into turns, bounce with speed.
    const motionScale = this.reducedMotion ? 0.25 : 1;
    this.lean = damp(this.lean, -steer * this.speedRatio * CFG.leanAmount, 8, dt);
    this.rig.rotation.z = this.lean * motionScale;
    this.rig.rotation.x = -this.speedRatio * 0.05 * motionScale;

    this.bouncePhase += dt * CFG.bounceFrequency * (0.5 + this.speedRatio);
    const bounce = Math.abs(Math.sin(this.bouncePhase)) * CFG.bounceAmount * this.speedRatio;
    this.rig.position.y = CFG.groundOffset + bounce * motionScale;
    const squash = 1 - Math.sin(this.bouncePhase * 2) * CFG.squashAmount * this.speedRatio * motionScale;
    this.rig.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));

    // --- Animation state
    if (this.mixer) {
      if (this.speedRatio > 0.05) {
        this.fidgeting = false;
        this.idleTimer = 0;
        const fast = this.speedRatio > 0.75 && this.actions[CFG.clips.runFast];
        this.setLocomotion(
          fast ? CFG.clips.runFast : CFG.clips.run,
          0.6 + this.speedRatio * 0.9
        );
      } else if (!this.fidgeting) {
        this.setLocomotion(CFG.clips.idle, 1);
        this.idleTimer += dt;
        if (this.idleTimer > CFG.idleFidgetDelay && !this.frozen) {
          this.idleTimer = 0;
          this.fidgeting = true;
          const dur = this.playOnce(CFG.clips.dance);
          setTimeout(() => (this.fidgeting = false), dur * 1000);
        }
      }
      this.mixer.update(dt);
    }

    // --- Recovery: out of bounds, fell through, or wedged against geometry.
    const p = this.body.position;
    const b = CFG.worldBounds;
    if (p.y < b.minY || p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) {
      this.reset();
    }
    const actualSpeed = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    const posDelta = Math.hypot(p.x - this.lastX, p.z - this.lastZ);
    if (Math.abs(this.speed) > 2 && posDelta < 0.5 * dt && actualSpeed > 1) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 2.5) {
        // Gentle unstick: hop up and kill momentum.
        this.body.position.y += 0.6;
        this.speed = 0;
        this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastX = p.x;
    this.lastZ = p.z;
  }

  private lastX: number = CFG.spawn.x;
  private lastZ: number = CFG.spawn.z;

  reset(): void {
    this.body.position.set(CFG.spawn.x, CFG.bodyRadius + 0.6, CFG.spawn.z);
    this.body.velocity.setZero();
    this.speed = 0;
    this.yaw = CFG.spawn.yaw;
    this.stuckTimer = 0;
  }

  get position(): THREE.Vector3 {
    return this.container.position;
  }

  get forward(): { x: number; z: number } {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }
}
