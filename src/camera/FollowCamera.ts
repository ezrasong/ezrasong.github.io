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
  private reducedMotion: boolean;

  // Manual orbit (mouse / touch drag on the canvas)
  private orbitYaw = 0;
  private orbitPitch = 0;
  private dragging = false;

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
    this.currentDist = CFG.distance;
    this.currentBaseY = p.y;
    this.revealBoost = 0;
    this.currentLook.set(p.x, p.y + CFG.lookHeight, p.z);
    const pos = new THREE.Vector3();
    this.composePosition(pos, this.followYaw, this.pitchFor(CFG.distance, CFG.height), CFG.distance);
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
    if (!this.dragging && s > 0.12) {
      this.orbitYaw = damp(this.orbitYaw, 0, 1.6, dt);
      this.orbitPitch = damp(this.orbitPitch, 0, 1.6, dt);
    }

    const dist = CFG.distance + s * CFG.speedDistance + this.revealBoost * CFG.districtRevealDistance;
    const height = CFG.height + s * CFG.speedHeight + this.revealBoost * 2.2;
    this.currentDist = damp(this.currentDist, dist, posDamp, dt);
    this.currentBaseY = damp(this.currentBaseY, p.y, posDamp, dt);

    const effYaw = this.followYaw + this.orbitYaw;
    const pitch = this.pitchFor(dist, height);
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

    this.camera.position.copy(this.applyOcclusion(targetPos));
    this.camera.lookAt(this.currentLook);
  }

  /**
   * Occlusion: if a building sits between the look target and the camera,
   * pull the camera in front of the hit so the view never fills with the
   * inside of a mesh.
   */
  private applyOcclusion(pos: THREE.Vector3): THREE.Vector3 {
    if (this.occluders.length === 0) return pos;
    const dir = new THREE.Vector3().subVectors(pos, this.currentLook);
    const len = dir.length();
    if (len < 1e-4) return pos;
    dir.normalize();
    this.ray.set(this.currentLook, dir);
    this.ray.far = len;
    const hits = this.ray.intersectObjects(this.occluders, false);
    if (hits.length === 0) return pos;
    return this.currentLook.clone().addScaledVector(dir, Math.max(1.6, hits[0].distance - 0.4));
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
