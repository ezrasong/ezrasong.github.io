import * as THREE from 'three';
import { CAMERA_CONFIG as CFG } from '../config/player';
import type { Player } from '../player/Player';
import { clamp, damp, dampAngle } from '../utils/math';

/**
 * Third-person follow camera: sits behind and above the Poro, looks slightly
 * ahead of travel, widens with speed and on district reveals, and pulls in
 * when buildings would block the view. `detached` hands control to GSAP
 * during building-entry cinematics.
 *
 * The rig is polar: the camera position is always composed from a yaw, a
 * pitch, and a distance around the player. Yaw and distance are damped as
 * scalars, never as a Cartesian position — chasing a rotating point with a
 * positional lerp makes the camera spiral in toward the player (and read as
 * pitching) during drags and teleports.
 */
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  detached = false;

  private followYaw: number;
  private currentDist: number = CFG.distance;
  private currentBaseY = 0;
  private currentLook = new THREE.Vector3();
  private revealBoost = 0;
  private occluders: THREE.Object3D[] = [];
  private ray = new THREE.Raycaster();
  /** 0..1, how far occlusion has pulled the camera in (damped). */
  private blocked = 0;
  private reducedMotion: boolean;

  // Manual orbit (mouse / touch drag on the canvas)
  private orbitYaw = 0;
  private orbitPitch = 0;
  private dragging = false;

  // Scroll-wheel zoom: a damped multiplier on the follow distance.
  private zoomTarget = 1;
  private zoomCurrent = 1;

  /** Effective camera yaw (follow + manual orbit) — the minimap rotates with it. */
  get yaw(): number {
    return this.followYaw + this.orbitYaw;
  }

  constructor(
    aspect: number,
    private player: Player
  ) {
    this.camera = new THREE.PerspectiveCamera(CFG.fov, aspect, CFG.near, CFG.far);
    this.followYaw = player.yaw;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.snap();
  }

  setOccluders(list: THREE.Object3D[]): void {
    this.occluders = list;
  }

  /** Drag on the canvas to look around; recenters itself once you move. */
  attachOrbitControls(dom: HTMLElement): void {
    let pointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', (e) => {
      if (pointerId !== null) return;
      pointerId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      this.dragging = true;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      // Horizontal motion is yaw only; vertical motion is pitch only.
      this.orbitYaw -= (e.clientX - lastX) * 0.0062;
      this.orbitPitch = clamp(this.orbitPitch + (e.clientY - lastY) * 0.004, -0.42, 0.6);
      lastX = e.clientX;
      lastY = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      this.dragging = false;
    };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    // Scroll to zoom the shot in/out (persists across teleports).
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomTarget = clamp(this.zoomTarget * Math.exp(e.deltaY * 0.0011), 0.55, 2.1);
      },
      { passive: false }
    );
  }

  /** Briefly widens the shot; called when the player enters a new district. */
  reveal(): void {
    if (this.reducedMotion) return;
    this.revealBoost = 1;
  }

  /** Effective pitch (radians above horizontal), clamped to a sane range. */
  private pitchFor(dist: number, height: number): number {
    const base = Math.atan2(height - CFG.lookHeight, dist);
    return clamp(base + this.orbitPitch, CFG.pitchMin, CFG.pitchMax);
  }

  private composePosition(out: THREE.Vector3, effYaw: number, pitch: number, dist: number): void {
    const p = this.player.position;
    const horiz = Math.cos(pitch) * dist;
    out.set(
      p.x - Math.sin(effYaw) * horiz,
      this.currentBaseY + CFG.lookHeight + Math.sin(pitch) * dist,
      p.z - Math.cos(effYaw) * horiz
    );
  }

  /** Instantly place the camera behind the player (teleports, respawns). */
  snap(): void {
    const p = this.player.position;
    this.followYaw = this.player.yaw;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.currentDist = CFG.distance * this.zoomCurrent;
    this.currentBaseY = p.y;
    this.revealBoost = 0;
    this.currentLook.set(p.x, p.y + CFG.lookHeight, p.z);
    const pos = new THREE.Vector3();
    this.composePosition(pos, this.followYaw, this.pitchFor(this.currentDist, CFG.height), this.currentDist);
    this.camera.position.copy(this.applyOcclusion(pos));
    this.camera.lookAt(this.currentLook);
  }

  update(dt: number): void {
    if (this.detached) return;

    const p = this.player.position;
    this.revealBoost = damp(this.revealBoost, 0, 0.8, dt);

    // The camera's own yaw lags the player's so turns read as arcs.
    const rotDamp = this.reducedMotion ? CFG.rotationDamping * 2.2 : CFG.rotationDamping;
    const posDamp = this.reducedMotion ? CFG.positionDamping * 2.2 : CFG.positionDamping;
    this.followYaw = dampAngle(this.followYaw, this.player.yaw, rotDamp, dt);

    // Manual orbit relaxes back to the follow direction while moving.
    const s = clamp(this.player.speedRatio, 0, 1.2);
    if (!this.dragging && s > 0.12 && this.blocked < 0.3) {
      this.orbitYaw = damp(this.orbitYaw, 0, 1.6, dt);
      this.orbitPitch = damp(this.orbitPitch, 0, 1.6, dt);
    }

    this.zoomCurrent = damp(this.zoomCurrent, this.zoomTarget, 8, dt);
    const dist =
      (CFG.distance + s * CFG.speedDistance + this.revealBoost * CFG.districtRevealDistance) *
      this.zoomCurrent;
    const height = (CFG.height + s * CFG.speedHeight + this.revealBoost * 2.2) * (0.75 + 0.25 * this.zoomCurrent);
    this.currentDist = damp(this.currentDist, dist, posDamp, dt);
    this.currentBaseY = damp(this.currentBaseY, p.y, posDamp, dt);

    const effYaw = this.followYaw + this.orbitYaw;
    // When a wall forces the camera in, raise it so the shot looks over the
    // obstacle at the poro instead of straight into the wall behind it.
    const pitch = Math.min(CFG.pitchMax, this.pitchFor(dist, height) + this.blocked * 0.5);
    const targetPos = new THREE.Vector3();
    this.composePosition(targetPos, effYaw, pitch, this.currentDist);

    const f = this.player.forward;
    const ahead = CFG.lookAhead * (0.4 + s);
    const targetLook = new THREE.Vector3(
      p.x + f.x * ahead,
      p.y + CFG.lookHeight,
      p.z + f.z * ahead
    );
    this.currentLook.x = damp(this.currentLook.x, targetLook.x, posDamp * 1.6, dt);
    this.currentLook.y = damp(this.currentLook.y, targetLook.y, posDamp * 1.6, dt);
    this.currentLook.z = damp(this.currentLook.z, targetLook.z, posDamp * 1.6, dt);

    // Backed against a wall: slide the orbit toward whichever side has more
    // room, the way a game camera rolls around a corner, instead of
    // hovering straight above the poro.
    if (this.blocked > 0.55 && !this.dragging) {
      const probe = (yawOff: number): number => {
        const q = new THREE.Vector3();
        this.composePosition(q, effYaw + yawOff, pitch, this.currentDist);
        return this.applyOcclusion(q).distanceTo(this.currentLook);
      };
      const left = probe(0.7);
      const right = probe(-0.7);
      if (Math.abs(left - right) > 0.4) this.orbitYaw += Math.sign(left - right) * Math.min(1.6 * dt, 0.05);
    }

    const safe = this.applyOcclusion(targetPos);
    // Pull in fast (never show the inside of a wall), ease back out slowly.
    const want = 1 - safe.distanceTo(this.currentLook) / Math.max(0.01, targetPos.distanceTo(this.currentLook));
    this.blocked = want > this.blocked ? want : damp(this.blocked, want, 2.2, dt);
    this.camera.position.copy(safe);
    this.camera.lookAt(this.currentLook);
  }

  /**
   * Occlusion: if solid geometry sits between the look target and the
   * camera, put the camera in front of the nearest hit. Five rays (centre,
   * both sides, above, below) approximate the near plane's footprint, so a
   * wall the centre ray just misses still can't fill the frame. The camera
   * keeps a clearance from the hit; if that leaves almost no room it rises
   * above the look point instead of pressing into the poro.
   */
  private applyOcclusion(pos: THREE.Vector3): THREE.Vector3 {
    if (this.occluders.length === 0) return pos;
    const dir = new THREE.Vector3().subVectors(pos, this.currentLook);
    const len = dir.length();
    if (len < 1e-4) return pos;
    dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.6);
    const up = new THREE.Vector3(0, 0.45, 0);
    let nearest = Infinity;
    const origin = new THREE.Vector3();
    for (const [s, u] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      origin.copy(this.currentLook).addScaledVector(side, s).addScaledVector(up, u);
      this.ray.set(origin, dir);
      this.ray.far = len + 0.6;
      const hits = this.ray.intersectObjects(this.occluders, false);
      if (hits.length > 0) nearest = Math.min(nearest, hits[0].distance);
    }
    if (!isFinite(nearest)) return pos;
    const d = nearest - 0.6;
    if (d >= 2.4) return this.currentLook.clone().addScaledVector(dir, Math.min(len, d));
    // Too little room behind the poro (backed against a wall): lift the
    // camera over it and look down, instead of pressing into the fur.
    const lifted = this.currentLook.clone().addScaledVector(dir, Math.max(0.9, d));
    lifted.y = this.currentLook.y + 3.4 - Math.max(0, d) * 0.6;
    return lifted;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
