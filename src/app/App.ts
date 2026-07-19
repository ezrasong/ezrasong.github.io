import * as THREE from 'three';
import { Time } from '../core/Time';
import { Sizes } from '../core/Sizes';
import { AssetLoader } from '../core/AssetLoader';
import { Quality } from '../core/Quality';
import { Physics } from '../physics/Physics';
import { Input } from '../input/Input';
import { Player } from '../player/Player';
import { FollowCamera } from '../camera/FollowCamera';
import { World } from '../world/World';
import { Weather, WEATHER_LABEL } from '../world/Weather';
import { getGroundCanvas } from '../world/GroundPainter';
import { setTimeOverride } from '../world/Env';
import { Interactions } from '../interactions/Interactions';
import { AudioManager } from '../audio/AudioManager';
import { UI } from '../ui/UI';
import { Panel } from '../ui/Panel';
import { MenuOverlay } from '../ui/MenuOverlay';
import { MapOverlay } from '../ui/MapOverlay';
import { DISTRICTS, PLACES } from '../config/places';
import { PROJECTS } from '../config/projects';
import type { DistrictId, InteractionTarget } from '../types';

/**
 * Application root: owns every subsystem and the frame loop.
 */
export class App {
  private renderer!: THREE.WebGLRenderer;
  private time = new Time();
  private sizes = new Sizes();
  private quality = new Quality();
  private loader = new AssetLoader();
  private audio = new AudioManager();
  private input = new Input();
  private physics!: Physics;
  private world!: World;
  private weather!: Weather;
  private player!: Player;
  private followCam!: FollowCamera;
  private interactions!: Interactions;
  private ui!: UI;
  private panel!: Panel;
  private menu!: MenuOverlay;
  private mapOverlay!: MapOverlay;
  private currentDistrict: DistrictId | null = 'plaza';
  private started = false;
  /** Seconds the player's body has spent inside a static collision volume. */
  private insideTimer = 0;
  /** Frames rendered since the scene last changed; lets tick() skip identical frames. */
  private stillFrames = 0;

  async init(canvasHost: HTMLElement, uiHost: HTMLElement): Promise<void> {
    this.ui = new UI(uiHost);

    // --- WebGL support gate
    let webgl = true;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      webgl = false;
    }
    if (!webgl) {
      this.buildNoWebglFallback(uiHost);
      return;
    }

    this.renderer.shadowMap.enabled = this.quality.current.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(this.sizes.pixelRatio, this.quality.current.pixelRatioCap));
    canvasHost.appendChild(this.renderer.domElement);

    this.ui.setProgress(0.05);

    // --- Load assets (model + fonts) with real progress
    this.loader.onProgress((p) => this.ui.setProgress(0.1 + p.ratio * 0.7));
    let gltf;
    try {
      const [gltfResult] = await Promise.all([
        this.loader.loadGLTF('models/poro.glb'),
        this.loader.loadFonts(),
      ]);
      gltf = gltfResult;
    } catch (err) {
      console.error('Asset load failed', err);
      this.ui.showLoadError('Could not load the 3D assets. Try refreshing.');
      return;
    }
    this.ui.setProgress(0.85);

    // --- Build the world
    this.physics = new Physics();
    this.world = new World(this.physics);
    this.world.applyQuality(this.quality.current);
    this.player = new Player(gltf, this.physics, this.input);
    this.world.scene.add(this.player.container);
    this.followCam = new FollowCamera(this.sizes.aspect, this.player);
    this.followCam.setOccluders(this.world.occluders);
    this.followCam.attachOrbitControls(this.renderer.domElement);

    this.weather = new Weather(this.world.scene);
    this.weather.init((kind) => this.ui.setWeather(WEATHER_LABEL[kind]));
    this.weather.applyCloudCount(this.quality.current.clouds);
    this.ui.initMinimap(getGroundCanvas(), this.world.targets);

    this.ui.setProgress(1);

    // --- Interactions + panels
    this.panel = new Panel(uiHost, () => {
      this.audio.closeBuilding();
      this.interactions.close();
    });
    this.interactions = new Interactions(
      this.world.targets,
      this.player,
      this.followCam,
      this.world,
      {
        onPromptShow: (t) => this.ui.showPrompt(t),
        onPromptHide: () => this.ui.hidePrompt(),
        onOpen: (t) => this.panel.open(t),
        onClose: () => {
          /* panel closes itself; interactions handles camera */
        },
      }
    );

    this.menu = new MenuOverlay(
      uiHost,
      this.world.targets,
      {
        onOpen: (t) => {
          this.menu.close();
          this.audio.enterBuilding();
          this.interactions.openDirect(t);
        },
        onTravel: (t) => {
          this.menu.close();
          this.travelTo(t);
        },
        onClose: () => {
          if (this.started) this.player.frozen = false;
        },
      },
      true
    );

    this.mapOverlay = new MapOverlay(uiHost, getGroundCanvas(), this.world.targets, DISTRICTS, {
      onTravel: (t) => {
        this.mapOverlay.close();
        this.travelTo(t);
        this.player.frozen = false;
      },
      onClose: () => {
        if (this.started) this.player.frozen = false;
      },
    });
    this.ui.bindMinimap(() => {
      if (!this.started || this.interactions.busy || this.panel.isOpen || this.menu.isOpen) return;
      this.player.frozen = true;
      this.mapOverlay.open(this.player.position.x, this.player.position.z, this.player.yaw);
      this.audio.uiBlip();
    });

    this.wireInput();
    this.wireUi();
    this.wireResize();

    // --- Ready: show title card
    this.ui.showTitle(() => {
      this.started = true;
      if (this.audio.enabled) this.audio.startAmbience();
    });

    this.time.onTick((t) => this.tick(t.delta, t.elapsed));
    this.time.start();

    // Debug/testing handle (also used by the smoke test)
    (window as unknown as Record<string, unknown>).__voxelSeoul = {
      app: this,
      player: this.player,
      weather: this.weather,
      targets: this.world.targets,
      teleport: (x: number, z: number, yaw?: number) => this.teleport(x, z, yaw),
      setTime: (frac: number | null) => {
        setTimeOverride(frac);
        this.stillFrames = 0;
      },
      stats: () => ({
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        geometries: this.renderer.info.memory.geometries,
        textures: this.renderer.info.memory.textures,
      }),
      setQuality: (level: 'low' | 'medium' | 'high') => {
        while (this.quality.current.level !== level) this.quality.cycle();
        this.applyQuality();
      },
      isPanelOpen: () => this.panel.isOpen,
      start: () => (document.querySelector('.title-start') as HTMLButtonElement | null)?.click(),
      pressInteract: () => this.input.triggerInteract(),
    };
  }

  /* ---------------------------------------------------------------- */

  private tick(dt: number, elapsed: number): void {
    // Pause the heavy work while a panel hides the world
    const presenting = this.panel?.isOpen || this.menu?.isOpen || this.mapOverlay?.isOpen;

    // Gameplay keys (and their scroll-prevention) only while actually playing,
    // so Space/E keep working as button keys in menus and on the title card.
    this.input.enabled = this.started && !presenting;

    if (this.started && !presenting) {
      this.input.update();
      this.physics.step(dt);
      this.player.update(dt);
      this.checkStuck(dt);
      this.interactions.update();
      this.followCam.update(dt);
      this.weather.update(dt, this.player.position.x, this.player.position.z, this.world.daylight);
      this.world.weatherDim = this.weather.dim;
      this.world.update(elapsed);
      this.ui.updateMinimap(this.player.position.x, this.player.position.z, this.player.yaw);
      this.audio.updateMovement(this.player.speedRatio, dt, this.player.grounded);
      if (this.player.justLanded) this.audio.land();
      this.trackDistrict();
      if (this.player.speedRatio > 0.2) this.ui.hideControlsHint();
    }

    // The scene is frozen while a modal covers it (and before Start) — after a
    // couple of settle frames there is nothing new to draw, so skip the GPU work.
    const sceneAnimating = (this.started && !presenting) || this.interactions.busy;
    if (sceneAnimating) this.stillFrames = 0;
    if (this.stillFrames < 3) {
      this.renderer.render(this.world.scene, this.followCam.camera);
      if (!sceneAnimating) this.stillFrames++;
    }
  }

  private trackDistrict(): void {
    const d = this.world.districtAt(this.player.position.x, this.player.position.z);
    if (d && d !== this.currentDistrict) {
      this.currentDistrict = d;
      const info = DISTRICTS.find((x) => x.id === d);
      if (info) {
        this.ui.showToast(info.koreanName, info.name);
        this.followCam.reveal();
        this.audio.districtChime();
      }
    }
  }

  private teleport(x: number, z: number, yaw?: number): void {
    this.player.body.position.set(x, 1.2, z);
    this.player.body.velocity.setZero();
    this.player.speed = 0;
    if (yaw !== undefined) this.player.face(yaw);
    // Sync the visual container before snapping, or the camera reads the
    // pre-teleport position and swims across the whole map to catch up.
    this.player.syncVisual();
    this.followCam.snap();
    this.stillFrames = 0;
  }

  private travelTo(t: InteractionTarget): void {
    // Land on the interaction ring (it is centered on the entrance point),
    // facing the door, so the E prompt is live immediately.
    const dist = 1.0;
    const x = t.entrance.x + t.approach.x * dist;
    const z = t.entrance.z + t.approach.z * dist;
    this.player.face(Math.atan2(-t.approach.x, -t.approach.z));
    this.teleport(x, z);
    this.player.frozen = false;
    this.ui.showToast(t.koreanTitle, `${t.title} 앞 · at the door`);
  }

  /**
   * Safety net: a visitor must never stay stuck. If the body sits inside a
   * static collision volume for over a second (wedged, a state contact
   * resolution can't fix), or falls below the ground plane, respawn at the
   * nearest travel point. Ordinary wall presses never trigger this — the
   * body's center stays outside the volume when contacts are resolving.
   */
  private checkStuck(dt: number): void {
    const p = this.player.body.position;
    this.insideTimer = this.physics.isInsideStatic(p) ? this.insideTimer + dt : 0;
    const fell = p.y < -1;
    // In the Han without a bridge or pier underfoot: standing on the riverbed
    // puts the body center at y ≈ 0.52, while the lowest walkable deck puts it
    // at ≈ 0.81 — fish the poro out rather than leaving it stranded behind
    // the bank rails.
    const swimming = p.z > 20.5 && p.z < 47.5 && p.y < 0.7;
    if (this.insideTimer < 1 && !fell && !swimming) return;
    this.insideTimer = 0;
    let best: InteractionTarget | null = null;
    let bestDist = Infinity;
    for (const t of this.world.targets) {
      const d = Math.hypot(t.entrance.x - p.x, t.entrance.z - p.z);
      if (d < bestDist) {
        best = t;
        bestDist = d;
      }
    }
    if (best) this.travelTo(best);
    else {
      this.player.reset();
      this.followCam.snap();
    }
  }

  /* ---------------------------------------------------------------- */

  private wireInput(): void {
    this.input.onInteract(() => {
      if (!this.started || this.panel.isOpen || this.menu.isOpen) return;
      if (this.interactions.tryEnter()) this.audio.enterBuilding();
    });
    this.input.onEscape(() => {
      if (this.panel.isOpen) this.panel.close();
      else if (this.menu.isOpen) {
        this.menu.close();
        this.player.frozen = false;
      } else if (this.mapOverlay.isOpen) {
        this.mapOverlay.close();
        this.player.frozen = false;
      }
    });
    this.input.onJump(() => {
      if (this.started && this.player.grounded && !this.player.frozen) this.audio.jump();
    });
    this.input.onReset(() => {
      if (!this.started || this.panel.isOpen || this.menu.isOpen || this.interactions.busy) return;
      this.player.reset();
      this.followCam.snap();
      this.ui.showToast('광장', 'back at the plaza');
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && this.started && !this.panel.isOpen && !this.interactions.busy) {
        if (this.menu.isOpen) {
          this.menu.close();
          this.player.frozen = false;
        } else {
          this.player.frozen = true;
          this.menu.open();
        }
      }
    });

    if (this.input.isTouch) {
      this.input.attachTouchControls(this.ui.root);
    }
  }

  private wireUi(): void {
    this.ui.bindButtons({
      onSound: () => {
        const on = this.audio.toggle();
        this.ui.setSoundState(on);
      },
      onQuality: () => {
        const preset = this.quality.cycle();
        this.applyQuality();
        this.ui.setQualityLabel(preset.label);
        this.audio.uiBlip();
      },
      onMenu: () => {
        if (!this.started || this.interactions.busy) return;
        this.player.frozen = true;
        this.menu.open();
        this.audio.uiBlip();
      },
      onReset: () => {
        if (!this.started || this.interactions.busy) return;
        this.player.reset();
        this.followCam.snap();
        this.audio.uiBlip();
        this.ui.showToast('광장', 'back at the plaza');
      },
    });
    this.ui.setSoundState(this.audio.enabled);
    this.ui.setQualityLabel(this.quality.current.label);
  }

  private applyQuality(): void {
    this.stillFrames = 0;
    const preset = this.quality.current;
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.setPixelRatio(Math.min(this.sizes.pixelRatio, preset.pixelRatioCap));
    this.world.applyQuality(preset);
    this.weather.applyCloudCount(preset.clouds);
    // Force material recompile for shadow toggle
    this.world.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) m.needsUpdate = true;
      }
    });
  }

  private wireResize(): void {
    this.sizes.onResize((s) => {
      this.stillFrames = 0;
      this.renderer.setSize(s.width, s.height);
      this.renderer.setPixelRatio(Math.min(s.pixelRatio, this.quality.current.pixelRatioCap));
      this.followCam.resize(s.aspect);
    });
  }

  /* ---------------------------------------------------------------- */

  private buildNoWebglFallback(uiHost: HTMLElement): void {
    // The 3D city can't run, but the portfolio must remain readable:
    // build the same panel + menu against a static backdrop.
    this.panel = new Panel(uiHost, () => {});
    const targets: InteractionTarget[] = [
      ...PROJECTS.map((p) => ({
        id: p.id,
        kind: 'project' as const,
        title: p.title,
        koreanTitle: p.koreanTitle,
        accent: p.accent,
        entrance: { x: 0, y: 0, z: 0 },
        approach: { x: 1, z: 0 },
        radius: 0,
        project: p,
      })),
      ...PLACES.map((p) => ({
        id: p.id,
        kind: 'place' as const,
        title: p.title,
        koreanTitle: p.koreanTitle,
        accent: p.accent,
        entrance: { x: 0, y: 0, z: 0 },
        approach: { x: 1, z: 0 },
        radius: 0,
        place: p,
      })),
    ];
    this.menu = new MenuOverlay(
      uiHost,
      targets,
      {
        onOpen: (t) => {
          this.menu.close();
          this.panel.open(t);
        },
        onTravel: () => {},
        onClose: () => {},
      },
      false
    );
    this.ui.showFallback(() => this.menu.open());
  }
}
