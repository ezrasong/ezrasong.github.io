import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { PLAYER_CONFIG as CFG } from '../config/player';
import type { Physics } from '../physics/Physics';
import type { Input } from '../input/Input';
import { clamp, damp, dampAngle, moveToward } from '../utils/math';
import { celMaterial } from '../world/CelShading';

function unwrap<T>(arr: T[]): T | T[] {
  return arr.length === 1 ? arr[0] : arr;
}

/** Radial-gradient blob shadow plane, hovering just above the ground. */
function makeBlobShadow(): THREE.Mesh {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(20,24,40,0.42)');
  g.addColorStop(0.7, 'rgba(20,24,40,0.22)');
  g.addColorStop(1, 'rgba(20,24,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.04;
  mesh.renderOrder = 1;
  return mesh;
}

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
  private headingTarget: number = CFG.spawn.yaw;
  private turnedAround = false;
  speed = 0;
  /** 0..1 how fast we are relative to max — used by camera and audio. */
  speedRatio = 0;
  grounded = true;
  frozen = false;

  private blobShadow!: THREE.Mesh;
  private mixer?: THREE.AnimationMixer;
  private actions: Record<string, THREE.AnimationAction> = {};
  private activeLocomotion?: THREE.AnimationAction;
  private idleTimer = 0;
  private fidgeting = false;
  private stuckTimer = 0;
  private bouncePhase = 0;
  private lean = 0;
  private wantJump = false;
  private jumpBuffer = 0;
  private landSquash = 0;
  /** True on the frame the poro touches down; consumed by App for audio. */
  justLanded = false;
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
        // Cel-shade the poro while preserving its textures: soft character
        // bands + a warm rim so it sits in the stylized world instead of
        // reading as a PBR import.
        const mesh = child as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mesh.material = unwrap(
          mats.map((m) => {
            const std = m as THREE.MeshStandardMaterial;
            if (!std.isMaterial) return m;
            const toon = celMaterial({
              profile: 'character',
              map: (std as THREE.MeshStandardMaterial).map ?? null,
              color: std.color ?? '#ffffff',
              transparent: std.transparent,
              opacity: std.opacity,
            });
            toon.normalMap = std.normalMap ?? null;
            toon.side = std.side;
            return toon;
          })
        );
      }
    });

    this.rig.add(model);
    this.rig.position.y = CFG.groundOffset;
    this.container.add(this.rig);

    // Soft blob contact shadow: grounds the poro on any surface, fading as
    // it jumps. Cheap and always coherent with the cel look.
    this.blobShadow = makeBlobShadow();
    this.container.add(this.blobShadow);

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

    input.onJump(() => {
      this.wantJump = true;
    });

    this.syncVisual();
  }

  /**
   * Copies the physics body pose onto the visual container immediately.
   * Must run after any direct body reposition (teleport, respawn) so the
   * follow camera's snap() reads the new location, not last frame's.
   */
  syncVisual(): void {
    this.container.position.set(
      this.body.position.x,
      this.body.position.y - CFG.bodyRadius,
      this.body.position.z
    );
    this.container.rotation.y = this.yaw;
    this.lastX = this.body.position.x;
    this.lastZ = this.body.position.z;
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
    const sprint = !this.frozen && this.input.sprint;

    // --- Steering rotates the heading target; weaker at a standstill.
    const steerAuthority =
      CFG.turnSpeedStationaryFactor +
      (1 - CFG.turnSpeedStationaryFactor) * Math.min(1, this.speed / 3);
    this.headingTarget += steer * CFG.turnSpeed * steerAuthority * dt;

    // --- Throttle. No reverse gear: S brakes, then swings the poro around.
    const sprintMult = sprint ? CFG.sprintMultiplier : 1;
    let speedTarget = 0;
    let rate: number = CFG.idleDeceleration;
    if (throttle > 0.05) {
      this.turnedAround = false;
      speedTarget = throttle * CFG.maxSpeed * sprintMult;
      rate = CFG.acceleration;
    } else if (throttle < -0.05) {
      if (this.speed > 2 && !this.turnedAround) {
        // Still rolling forward: brake first.
        speedTarget = 0;
        rate = CFG.brakingDeceleration;
      } else {
        if (!this.turnedAround) {
          this.turnedAround = true;
          this.headingTarget += Math.PI;
        }
        speedTarget = -throttle * CFG.maxSpeed * sprintMult;
        rate = CFG.acceleration;
      }
    } else {
      this.turnedAround = false;
    }
    this.speed = moveToward(this.speed, speedTarget, rate * dt);
    this.yaw = dampAngle(this.yaw, this.headingTarget, CFG.facingLambda, dt);
    this.speedRatio = clamp(this.speed / CFG.maxSpeed, 0, 1.6);

    // --- Jump (buffered: a press just before landing still jumps)
    if (this.wantJump) {
      if (this.grounded && !this.frozen) {
        this.body.velocity.y = CFG.jumpSpeed;
        this.grounded = false;
        this.wantJump = false;
        this.jumpBuffer = 0;
      } else {
        this.jumpBuffer += dt;
        if (this.jumpBuffer > 0.22) {
          this.wantJump = false;
          this.jumpBuffer = 0;
        }
      }
    }

    // --- Drive the physics body horizontally; gravity keeps vertical honest.
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    this.body.velocity.x = fx * this.speed;
    this.body.velocity.z = fz * this.speed;

    const wasGrounded = this.grounded;
    this.grounded =
      this.body.position.y < CFG.bodyRadius + 0.2 && this.body.velocity.y <= 0.5;
    this.justLanded = !wasGrounded && this.grounded;
    if (this.justLanded) this.landSquash = 0.28;
    this.landSquash = damp(this.landSquash, 0, 9, dt);

    // --- Visual placement. The physics world steps at a fixed 60Hz while
    // rendering runs at the display's rate; reading the raw body position
    // aliases the two clocks and makes walking shake. cannon-es keeps an
    // interpolated pose for exactly this — the camera follows this
    // container, so it smooths both the poro and the view.
    const ip = this.body.interpolatedPosition;
    this.container.position.set(ip.x, ip.y - CFG.bodyRadius, ip.z);
    this.container.rotation.y = this.yaw;

    // --- Procedural flourish: lean into turns, bounce with speed.
    const motionScale = this.reducedMotion ? 0.25 : 1;
    this.lean = damp(this.lean, -steer * this.speedRatio * CFG.leanAmount, 8, dt);
    this.rig.rotation.z = this.lean * motionScale;
    this.rig.rotation.x = -this.speedRatio * 0.05 * motionScale;

    // Contact shadow: fade and shrink while airborne.
    const blobMat = this.blobShadow.material as THREE.MeshBasicMaterial;
    blobMat.opacity = damp(blobMat.opacity, this.grounded ? 1 : 0.35, 10, dt);
    const blobScale = this.grounded ? 1 : 0.7;
    this.blobShadow.scale.setScalar(damp(this.blobShadow.scale.x, blobScale, 10, dt));

    this.bouncePhase += dt * CFG.bounceFrequency * (0.5 + this.speedRatio);
    const bounce = this.grounded
      ? Math.abs(Math.sin(this.bouncePhase)) * CFG.bounceAmount * this.speedRatio
      : 0;
    this.rig.position.y = CFG.groundOffset + bounce * motionScale;
    let squash =
      1 - Math.sin(this.bouncePhase * 2) * CFG.squashAmount * this.speedRatio * motionScale;
    squash *= 1 - this.landSquash * motionScale; // touchdown squish
    if (!this.grounded) squash *= 1.04; // slight stretch in the air
    this.rig.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));

    // --- Animation state
    if (this.mixer) {
      if (this.speedRatio > 0.05) {
        this.fidgeting = false;
        this.idleTimer = 0;
        const fast = this.speedRatio > 1.02 && this.actions[CFG.clips.runFast];
        this.setLocomotion(
          fast ? CFG.clips.runFast : CFG.clips.run,
          0.6 + Math.min(this.speedRatio, 1.3) * 0.9
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
    if (this.speed > 2 && posDelta < 0.5 * dt && actualSpeed > 1) {
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

  /** Snap heading and facing at once (teleports, tests). */
  face(yaw: number): void {
    this.yaw = yaw;
    this.headingTarget = yaw;
    this.turnedAround = false;
  }

  reset(): void {
    this.body.position.set(CFG.spawn.x, CFG.bodyRadius + 0.6, CFG.spawn.z);
    this.body.velocity.setZero();
    this.speed = 0;
    this.yaw = CFG.spawn.yaw;
    this.headingTarget = CFG.spawn.yaw;
    this.turnedAround = false;
    this.stuckTimer = 0;
    this.syncVisual();
  }

  get position(): THREE.Vector3 {
    return this.container.position;
  }

  get forward(): { x: number; z: number } {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }
}
