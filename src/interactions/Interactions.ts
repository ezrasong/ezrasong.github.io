import * as THREE from 'three';
import { gsap } from 'gsap';
import type { InteractionTarget } from '../types';
import type { Player } from '../player/Player';
import type { FollowCamera } from '../camera/FollowCamera';
import type { World } from '../world/World';
import { PLAYER_CONFIG } from '../config/player';

export interface InteractionEvents {
  onPromptShow: (target: InteractionTarget) => void;
  onPromptHide: () => void;
  onOpen: (target: InteractionTarget) => void;
  onClose: () => void;
}

/**
 * Watches the player's distance to every entrance, shows the prompt and
 * highlight for the nearest one in range, and runs the enter/exit camera
 * cinematic around the HTML presentation panel.
 */
export class Interactions {
  active: InteractionTarget | null = null;
  presenting = false;
  private nearest: InteractionTarget | null = null;
  private transitioning = false;
  private reducedMotion: boolean;

  constructor(
    private targets: InteractionTarget[],
    private player: Player,
    private camera: FollowCamera,
    private world: World,
    private events: InteractionEvents
  ) {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  update(): void {
    if (this.presenting || this.transitioning) return;

    const p = this.player.position;
    let best: InteractionTarget | null = null;
    let bestDist = Infinity;
    for (const t of this.targets) {
      const dx = t.entrance.x - p.x;
      const dz = t.entrance.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < t.radius && d < bestDist) {
        best = t;
        bestDist = d;
      }
    }

    if (best !== this.nearest) {
      if (this.nearest) {
        const h = this.world.highlights.get(this.nearest.id);
        if (h) h.visible = false;
        this.events.onPromptHide();
      }
      this.nearest = best;
      if (best) {
        const h = this.world.highlights.get(best.id);
        if (h) h.visible = true;
        this.events.onPromptShow(best);
      }
    }
  }

  /** Called on E/Space. Returns true if an entrance was consumed. */
  tryEnter(): boolean {
    if (this.presenting || this.transitioning || !this.nearest) return false;
    this.enter(this.nearest);
    return true;
  }

  /** Direct open (menu navigation) — no cinematic, panel only. */
  openDirect(target: InteractionTarget): void {
    if (this.presenting) return;
    this.presenting = true;
    this.active = target;
    this.player.frozen = true;
    this.events.onOpen(target);
  }

  private enter(target: InteractionTarget): void {
    this.transitioning = true;
    this.active = target;
    this.player.frozen = true;
    this.events.onPromptHide();
    const h = this.world.highlights.get(target.id);
    if (h) h.visible = false;

    this.player.playOnce(PLAYER_CONFIG.clips.interact);

    // Dolly the camera to face the doorway.
    const cam = this.camera.camera;
    this.camera.detached = true;
    const a = target.approach;
    const goal = {
      pos: new THREE.Vector3(
        target.entrance.x + a.x * 5.2,
        2.6,
        target.entrance.z + a.z * 5.2
      ),
      look: new THREE.Vector3(target.entrance.x - a.x * 1.5, 2.0, target.entrance.z - a.z * 1.5),
    };

    const duration = this.reducedMotion ? 0.2 : 1.05;
    const startLook = new THREE.Vector3();
    cam.getWorldDirection(startLook).multiplyScalar(8).add(cam.position);
    const state = { t: 0 };
    const fromPos = cam.position.clone();
    gsap.to(state, {
      t: 1,
      duration,
      ease: 'power2.inOut',
      onUpdate: () => {
        cam.position.lerpVectors(fromPos, goal.pos, state.t);
        const look = new THREE.Vector3().lerpVectors(startLook, goal.look, state.t);
        cam.lookAt(look);
      },
      onComplete: () => {
        this.transitioning = false;
        this.presenting = true;
        this.events.onOpen(target);
      },
    });
  }

  /** Close the presentation and glide back to gameplay. */
  close(): void {
    if (!this.presenting) return;
    this.presenting = false;
    const wasDetached = this.camera.detached;
    this.events.onClose();
    this.active = null;

    if (!wasDetached) {
      // Menu-opened panel: nothing to fly back from.
      this.player.frozen = false;
      return;
    }

    this.transitioning = true;
    const cam = this.camera.camera;
    // Compute where the follow camera wants to be right now.
    const p = this.player.position;
    const f = this.player.forward;
    const dist = 7.5;
    const goalPos = new THREE.Vector3(p.x - f.x * dist, p.y + 4.2, p.z - f.z * dist);
    const goalLook = new THREE.Vector3(p.x, p.y + 1.1, p.z);

    const duration = this.reducedMotion ? 0.2 : 0.8;
    const fromPos = cam.position.clone();
    const fromLook = new THREE.Vector3();
    cam.getWorldDirection(fromLook).multiplyScalar(8).add(cam.position);
    const state = { t: 0 };
    gsap.to(state, {
      t: 1,
      duration,
      ease: 'power2.inOut',
      onUpdate: () => {
        cam.position.lerpVectors(fromPos, goalPos, state.t);
        const look = new THREE.Vector3().lerpVectors(fromLook, goalLook, state.t);
        cam.lookAt(look);
      },
      onComplete: () => {
        this.camera.snap();
        this.camera.detached = false;
        this.transitioning = false;
        this.player.frozen = false;
      },
    });
  }
}
