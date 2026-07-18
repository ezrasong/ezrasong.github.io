import * as THREE from 'three';
import { CAMERA_CONFIG as CFG } from '../config/player';
import type { Player } from '../player/Player';
import { damp, dampAngle } from '../utils/math';

/**
 * Third-person follow camera: sits behind and above the Poro, looks slightly
 * ahead of travel, widens with speed and on district reveals, and pulls in
 * when buildings would block the view. `detached` hands control to GSAP
 * during building-entry cinematics.
 */
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  detached = false;

  private followYaw: number;
  private currentPos = new THREE.Vector3();
  private currentLook = new THREE.Vector3();
  private revealBoost = 0;
  private occluders: THREE.Object3D[] = [];
  private ray = new THREE.Raycaster();
  private reducedMotion: boolean;

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

  /** Briefly widens the shot; called when the player enters a new district. */
  reveal(): void {
    if (this.reducedMotion) return;
    this.revealBoost = 1;
  }

  snap(): void {
    const p = this.player.position;
    const f = this.player.forward;
    this.followYaw = this.player.yaw;
    this.currentPos.set(p.x - f.x * CFG.distance, p.y + CFG.height, p.z - f.z * CFG.distance);
    this.currentLook.set(p.x, p.y + CFG.lookHeight, p.z);
    this.camera.position.copy(this.currentPos);
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

    const s = this.player.speedRatio;
    const dist = CFG.distance + s * CFG.speedDistance + this.revealBoost * CFG.districtRevealDistance;
    const height = CFG.height + s * CFG.speedHeight + this.revealBoost * 2.2;

    const bx = Math.sin(this.followYaw);
    const bz = Math.cos(this.followYaw);
    const targetPos = new THREE.Vector3(p.x - bx * dist, p.y + height, p.z - bz * dist);

    const f = this.player.forward;
    const ahead = CFG.lookAhead * (0.4 + s);
    const targetLook = new THREE.Vector3(
      p.x + f.x * ahead,
      p.y + CFG.lookHeight,
      p.z + f.z * ahead
    );

    this.currentPos.x = damp(this.currentPos.x, targetPos.x, posDamp, dt);
    this.currentPos.y = damp(this.currentPos.y, targetPos.y, posDamp, dt);
    this.currentPos.z = damp(this.currentPos.z, targetPos.z, posDamp, dt);
    this.currentLook.x = damp(this.currentLook.x, targetLook.x, posDamp * 1.6, dt);
    this.currentLook.y = damp(this.currentLook.y, targetLook.y, posDamp * 1.6, dt);
    this.currentLook.z = damp(this.currentLook.z, targetLook.z, posDamp * 1.6, dt);

    // Occlusion: if a building sits between the look target and the camera,
    // pull the camera in front of the hit.
    let finalPos = this.currentPos;
    if (this.occluders.length > 0) {
      const dir = new THREE.Vector3().subVectors(this.currentPos, this.currentLook);
      const len = dir.length();
      dir.normalize();
      this.ray.set(this.currentLook, dir);
      this.ray.far = len;
      const hits = this.ray.intersectObjects(this.occluders, false);
      if (hits.length > 0) {
        finalPos = this.currentLook.clone().addScaledVector(dir, Math.max(1.2, hits[0].distance - 0.4));
      }
    }

    this.camera.position.copy(finalPos);
    this.camera.lookAt(this.currentLook);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
