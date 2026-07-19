import * as THREE from 'three';
import { PALETTE as P } from '../config/palette';
import { PROJECTS } from '../config/projects';
import { PLACES, DISTRICTS } from '../config/places';
import type { InteractionTarget, DistrictId } from '../types';
import type { Physics } from '../physics/Physics';
import type { QualityPreset } from '../core/Quality';
import { paintGroundCanvas } from './GroundPainter';
import { createTerrain } from './Terrain';
import { createSky } from './Sky';
import { createWater } from './Water';
import { ENV, timeOverride } from './Env';
import { celMaterial } from './CelShading';
import { buildStructure, facingToYaw, type BuiltStructure } from './VoxelBuilding';
import {
  createTrees,
  createStreetlights,
  createCars,
  createStreetFurniture,
  createFillerBlocks,
  createCityDetails,
  type FillerSpec,
} from './Props';
import {
  createGate,
  createNamsan,
  createPier,
  createSignpost,
  createBridge,
  createMountains,
  NAMSAN_BASE_RADIUS,
} from './Landmarks';
import { makeDecal, KOREAN_FONT } from './SignTexture';

/**
 * Assembles the whole miniature Seoul: ground, landmarks, project buildings,
 * portfolio places, background city mass, props, physics colliders, lights,
 * and the interaction-target list handed to Interactions.
 */
export class World {
  readonly scene = new THREE.Scene();
  readonly targets: InteractionTarget[] = [];
  readonly occluders: THREE.Object3D[] = [];
  readonly highlights = new Map<string, THREE.Group>();

  /** 0..1 gloom from the weather system; mutes sun, sky, and fog. */
  weatherDim = 0;
  /** 0..1 daylight amount, updated every frame; consumed by Weather's clouds. */
  daylight = 0;

  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private sunMesh!: THREE.Mesh;
  private moonMesh!: THREE.Mesh;
  private skyColor = new THREE.Color();
  private fogColor = new THREE.Color();

  constructor(private physics: Physics) {
    this.scene.background = new THREE.Color(P.sky);
    this.scene.fog = new THREE.Fog(P.fog, 55, 260);

    this.setLights();
    // Place the sun/moon discs immediately: world.update() only runs after
    // Start, and until then both spheres would sit at the origin — the sun
    // disc filling the whole intro camera view as a featureless blob.
    this.updateDayNight();
    this.scene.add(createSky());
    const terrain = createTerrain(paintGroundCanvas());
    this.scene.add(terrain.inner, terrain.apron);
    this.addLandmarks();
    this.addStructures();
    this.addFiller();
    this.addProps();
    this.addBoundaries();
    this.addPlazaDressing();
    this.addWayfinding();
    this.freezeStaticMatrices();
  }

  /**
   * Almost everything in the city never moves — skip per-frame matrix
   * recomposition for all of it. Animated subtrees (entrance highlights,
   * the river) are excluded.
   */
  private freezeStaticMatrices(): void {
    const animatedRoots = new Set<THREE.Object3D>(this.highlights.values());
    animatedRoots.add(this.sunMesh);
    animatedRoots.add(this.moonMesh);
    this.scene.traverse((obj) => {
      for (let p: THREE.Object3D | null = obj; p; p = p.parent) {
        if (animatedRoots.has(p)) return;
      }
      if ((obj as THREE.Mesh).isMesh || obj instanceof THREE.Group) {
        obj.updateMatrix();
        obj.matrixAutoUpdate = false;
      }
    });
  }

  /* ---------------------------------------------------------------- */

  private setLights(): void {
    this.hemi = new THREE.HemisphereLight(P.ambient, '#6b6252', 1.35);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(P.sun, 2.4);
    this.sun.position.set(-48, 55, 30);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -145;
    cam.right = 145;
    cam.top = 145;
    cam.bottom = -145;
    cam.near = 10;
    cam.far = 500;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    // Visible sun + moon discs riding the same arc as the light.
    const sunMat = new THREE.MeshBasicMaterial({ color: '#ffe9b0' });
    sunMat.fog = false;
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), sunMat);
    const moonMat = new THREE.MeshBasicMaterial({ color: '#dfe6f4' });
    moonMat.fog = false;
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(4.2, 14, 10), moonMat);
    this.scene.add(this.sunMesh, this.moonMesh);
  }

  /**
   * Time-of-day, 1:1 with the real clock in Seoul (matching the live Seoul
   * weather): the in-world sun sits where the real one does over the city —
   * noon KST overhead, midnight KST below the horizon — and the sky, fog,
   * and light colors follow its elevation. Nights are carried by the warm
   * windows and neon.
   */
  private updateDayNight(): void {
    const dayFrac = timeOverride ?? seoulDayFraction();
    // 06:00 → sunrise (e=0 rising), 12:00 → noon (e=1), 18:00 → sunset.
    const angle = (dayFrac - 0.25) * Math.PI * 2;
    const e = Math.sin(angle); // sun elevation, -1..1

    const sunPos = new THREE.Vector3(Math.cos(angle) * 170, Math.sin(angle) * 130, 65);
    const moonPos = new THREE.Vector3(-sunPos.x, -sunPos.y, 50);
    this.sunMesh.position.copy(sunPos).multiplyScalar(1.25);
    this.moonMesh.position.copy(moonPos).multiplyScalar(1.25);
    // Overcast skies hide the discs
    this.sunMesh.visible = e > -0.12 && this.weatherDim < 0.5;
    this.moonMesh.visible = e < 0.12 && this.weatherDim < 0.5;

    // The shadow-casting light hands over from sun to moon at the horizon.
    const daylight = smoothstep(-0.06, 0.18, e);
    this.daylight = daylight;
    if (e > -0.06) {
      this.sun.position.copy(sunPos);
      this.sun.intensity = 0.3 + daylight * 2.3;
      this.sun.color.lerpColors(SUN_HORIZON, SUN_NOON, smoothstep(0.02, 0.55, e));
    } else {
      this.sun.position.copy(moonPos);
      this.sun.intensity = 0.5;
      this.sun.color.set('#8fa3d8');
    }

    // Sky / fog / ambient follow the elevation. The night floor stays high
    // enough that real-time midnight visitors can still read the city.
    const dusk = smoothstep(-0.22, 0.08, e);
    const day = smoothstep(0.1, 0.5, e);
    this.skyColor.copy(NIGHT_SKY).lerp(DUSK_SKY, dusk).lerp(DAY_SKY, day);
    this.fogColor.copy(NIGHT_FOG).lerp(DUSK_FOG, dusk).lerp(DAY_FOG, day);
    // Weather gloom: pull the sky toward the fog tone and mute the lights.
    const gloom = this.weatherDim;
    this.skyColor.lerp(this.fogColor, gloom * 0.6);
    this.sun.intensity *= 1 - gloom * 0.55;
    (this.scene.background as THREE.Color).copy(this.skyColor);
    (this.scene.fog as THREE.Fog).color.copy(this.fogColor);
    this.hemi.intensity = (0.68 + smoothstep(-0.12, 0.45, e) * 0.85) * (1 - gloom * 0.28);

    // --- Feed the shared shader uniforms (sky dome, water, grass, cel rims)
    ENV.sunDir.value.copy(this.sun.position).normalize();
    ENV.sunColor.value.copy(this.sun.color);
    ENV.daylight.value = daylight;
    ENV.gloom.value = gloom;
    ENV.fogColor.value.copy(this.fogColor);
    ENV.skyZenith.value.copy(this.skyColor);
    // Horizon: sky pulled toward fog, blushing toward the sun at dusk.
    ENV.skyHorizon.value
      .copy(this.skyColor)
      .lerp(this.fogColor, 0.7)
      .lerp(SUN_HORIZON, Math.max(0, dusk - day) * 0.28 * (1 - gloom));
    ENV.shadowTint.value.lerpColors(SHADOW_NIGHT, SHADOW_DAY, daylight);
    ENV.windStrength.value = 1 + gloom * 1.4;
  }

  applyQuality(preset: QualityPreset): void {
    this.sun.castShadow = preset.shadows;
    this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    (this.scene.fog as THREE.Fog).far = preset.fogFar;
  }

  /* ---------------------------------------------------------------- */

  private place(built: BuiltStructure, x: number, z: number, yaw: number): void {
    built.group.position.set(x, 0, z);
    built.group.rotation.y = yaw;
    this.scene.add(built.group);

    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    for (const c of built.colliders) {
      const wx = x + c.x * cos + c.z * sin;
      const wz = z - c.x * sin + c.z * cos;
      this.physics.addStaticBox(wx, c.y, wz, c.w, c.h, c.d, yaw);
    }
    for (const o of built.occluders) this.occluders.push(o);
  }

  private addStructures(): void {
    for (const project of PROJECTS) {
      const yaw = facingToYaw(project.facing) + project.rotation;
      const built = buildStructure({
        type: project.buildingType,
        width: project.size.width,
        depth: project.size.depth,
        floors: project.size.floors,
        accent: project.accent,
        signText: project.koreanTitle,
        signSubtext: project.title.toUpperCase(),
      });
      this.place(built, project.position.x, project.position.z, yaw);

      built.highlight.position.copy(built.group.position);
      built.highlight.rotation.y = yaw;
      this.scene.add(built.highlight);
      this.highlights.set(project.id, built.highlight);

      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const ex = project.position.x + built.entranceLocal.x * cos + built.entranceLocal.z * sin;
      const ez = project.position.z - built.entranceLocal.x * sin + built.entranceLocal.z * cos;
      this.targets.push({
        id: project.id,
        kind: 'project',
        title: project.title,
        koreanTitle: project.koreanTitle,
        accent: project.accent,
        entrance: { x: ex, y: 0, z: ez },
        approach: { x: cos, z: -sin },
        radius: 3.4,
        project,
      });
    }

    for (const placeData of PLACES) {
      const yaw = facingToYaw(placeData.facing) + placeData.rotation;
      const built = buildStructure({
        type: placeData.buildingType,
        width: placeData.size.width,
        depth: placeData.size.depth,
        floors: placeData.size.floors,
        accent: placeData.accent,
        signText: placeData.koreanTitle,
        signSubtext: placeData.title.toUpperCase(),
      });
      this.place(built, placeData.position.x, placeData.position.z, yaw);

      built.highlight.position.copy(built.group.position);
      built.highlight.rotation.y = yaw;
      this.scene.add(built.highlight);
      this.highlights.set(placeData.id, built.highlight);

      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const ex = placeData.position.x + built.entranceLocal.x * cos + built.entranceLocal.z * sin;
      const ez = placeData.position.z - built.entranceLocal.x * sin + built.entranceLocal.z * cos;
      this.targets.push({
        id: placeData.id,
        kind: 'place',
        title: placeData.title,
        koreanTitle: placeData.koreanTitle,
        accent: placeData.accent,
        entrance: { x: ex, y: 0, z: ez },
        approach: { x: cos, z: -sin },
        radius: placeData.buildingType === 'phone-booth' ? 2.6 : 3.4,
        place: placeData,
      });
    }
  }

  /* ---------------------------------------------------------------- */

  private addLandmarks(): void {
    const gate = createGate(0, -38.5);
    this.scene.add(gate.object);
    this.registerColliders(gate);

    const namsan = createNamsan(0, -58);
    this.scene.add(namsan.object);
    this.registerColliders(namsan);
    // The cylinder collider matches the hill footprint so the player can
    // never wade into the mesh.
    this.physics.addStaticCylinder(0, 6, -58, NAMSAN_BASE_RADIUS + 0.3, 12);

    const water = createWater();
    this.scene.add(water.object);

    // Two road bridges cross the Han: the main cable-stayed Hangang bridge
    // on the spine and the girder Yanghwa bridge linking Hongdae to Yeouido.
    const hangangBridge = createBridge(0, 7, '한강대교 HANGANG BR.', 15, 49.5, 'cable');
    this.scene.add(hangangBridge.object);
    this.registerColliders(hangangBridge);

    const yanghwaBridge = createBridge(-48, 6, '양화대교 YANGHWA BR.', 15, 49.5, 'girder');
    this.scene.add(yanghwaBridge.object);
    this.registerColliders(yanghwaBridge);

    const pier = createPier(14);
    this.scene.add(pier.object);
    this.registerColliders(pier);

    const signpost = createSignpost(6, -22);
    this.scene.add(signpost.object);
    this.registerColliders(signpost);

    const mountains = createMountains();
    this.scene.add(mountains.object);
  }

  private registerColliders(result: {
    colliders: { x: number; z: number; ry?: number; spec: { w: number; h: number; d: number; x: number; y: number; z: number } }[];
    occluders?: THREE.Mesh[];
  }): void {
    for (const c of result.colliders) {
      this.physics.addStaticBox(
        c.x + c.spec.x,
        c.spec.y,
        c.z + c.spec.z,
        c.spec.w,
        c.spec.h,
        c.spec.d,
        c.ry ?? 0
      );
    }
    if (result.occluders) this.occluders.push(...result.occluders);
  }

  /* ---------------------------------------------------------------- */

  private addFiller(): void {
    const filler: FillerSpec[] = [
      // --- Hongdae west column (between the west street and the edge)
      { x: -72, z: -26, w: 7, d: 8, floors: 3, wall: '#b06a5a', window: P.windowWarm },
      { x: -72, z: -14, w: 7, d: 7, floors: 2, wall: '#7a6a8f', window: P.neonPink, windowChance: 0.8 },
      { x: -72, z: -1, w: 7, d: 9, floors: 3, wall: '#5f7a6a', window: P.windowWarm },
      // --- Hongdae backs, north of Namsan-ro
      { x: -44, z: -44, w: 8, d: 6, floors: 2, wall: P.brick, window: P.windowWarm },
      { x: -56, z: -44, w: 8, d: 6, floors: 3, wall: '#8f6a50', window: P.windowWarm },
      { x: -70, z: -44, w: 8, d: 7, floors: 2, wall: '#a08360', window: P.windowWarm },
      // --- Insadong-ish mid-rises (north bank east, between the east streets)
      { x: 41.5, z: -24, w: 8, d: 7, floors: 3, wall: '#9a8a76', window: P.windowWarm },
      { x: 54, z: -24, w: 9, d: 7, floors: 4, wall: P.concrete, window: P.windowWarm },
      { x: 41.5, z: -6, w: 8, d: 8, floors: 3, wall: '#8f7a68', window: P.windowWarm },
      { x: 54, z: -6, w: 9, d: 8, floors: 2, wall: '#9a8a76', window: P.windowWarm },
      { x: 74, z: -24, w: 8, d: 7, floors: 5, wall: '#54667c', window: P.windowCool },
      { x: 74, z: -6, w: 8, d: 8, floors: 4, wall: '#5b6d84', window: P.windowWarm, windowChance: 0.7 },
      // --- Hanok alley neighbours (low traditional blocks)
      { x: 28, z: -51, w: 7, d: 6, floors: 1, wall: P.hanokWall, window: P.windowWarm },
      { x: 54, z: -51, w: 7, d: 6, floors: 1, wall: P.hanokWall, window: P.windowWarm },
      { x: 63, z: -50, w: 6, d: 6, floors: 1, wall: '#dcd0b6', window: P.windowWarm },
      { x: 74, z: -50, w: 7, d: 6, floors: 1, wall: P.hanokWall, window: P.windowWarm },
      // --- Gangnam second row, south of Teheran-ro: glass towers
      { x: 12, z: 90, w: 7, d: 7, floors: 6, wall: '#4e6076', window: P.windowCool, windowChance: 0.75 },
      { x: 28, z: 90, w: 8, d: 8, floors: 5, wall: '#54667c', window: P.windowCool },
      { x: 60, z: 90, w: 8, d: 7, floors: 6, wall: '#5b6d84', window: P.windowWarm, windowChance: 0.7 },
      { x: 76, z: 90, w: 9, d: 8, floors: 7, wall: '#4e6076', window: P.windowCool, windowChance: 0.75 },
      // --- Yeouido skyline (south bank west): the gold tower + neighbours
      { x: -58, z: 68, w: 9, d: 9, floors: 12, wall: '#b8934a', window: P.windowWarm, windowChance: 0.8 },
      { x: -72, z: 67, w: 8, d: 8, floors: 9, wall: '#5b6d84', window: P.windowCool, windowChance: 0.7 },
      { x: -58, z: 90, w: 9, d: 8, floors: 10, wall: '#4e6076', window: P.windowCool, windowChance: 0.7 },
      { x: -72, z: 90, w: 8, d: 8, floors: 8, wall: '#61748c', window: P.windowWarm, windowChance: 0.7 },
      // --- Riverside apartment slabs (the classic Korean 아파트 rows)
      { x: -20, z: 65, w: 12, d: 5, floors: 5, wall: '#c9c2b4', window: P.windowWarm },
      { x: -33, z: 65, w: 10, d: 5, floors: 5, wall: '#bdb6a8', window: P.windowWarm },
      { x: -20, z: 72.5, w: 12, d: 5, floors: 5, wall: '#c9c2b4', window: P.windowWarm },
      { x: -33, z: 72.5, w: 10, d: 5, floors: 5, wall: '#bdb6a8', window: P.windowWarm },
      { x: -20, z: 88, w: 12, d: 5, floors: 5, wall: '#c9c2b4', window: P.windowWarm },
      { x: -33, z: 88, w: 10, d: 5, floors: 5, wall: '#bdb6a8', window: P.windowWarm },
    ];

    // --- Backdrop city mass past the playable edge, so the map never reads
    // as ending abruptly: low-detail rows just outside the perimeter walls.
    const backdrop: FillerSpec[] = [
      { x: -97, z: -30, w: 8, d: 10, floors: 4, wall: '#6b6a7a', window: P.windowWarm, windowChance: 0.4 },
      { x: -97, z: -12, w: 8, d: 9, floors: 3, wall: '#7a6a5f', window: P.windowWarm, windowChance: 0.4 },
      { x: -97, z: 4, w: 8, d: 9, floors: 5, wall: '#5b6d84', window: P.windowWarm, windowChance: 0.4 },
      { x: -97, z: 64, w: 8, d: 10, floors: 8, wall: '#54667c', window: P.windowCool, windowChance: 0.4 },
      { x: -97, z: 84, w: 8, d: 9, floors: 7, wall: '#61748c', window: P.windowWarm, windowChance: 0.4 },
      { x: 97, z: -28, w: 8, d: 9, floors: 4, wall: '#7a6a5f', window: P.windowWarm, windowChance: 0.4 },
      { x: 97, z: -8, w: 8, d: 9, floors: 6, wall: '#6b6a7a', window: P.windowWarm, windowChance: 0.4 },
      { x: 97, z: 64, w: 8, d: 10, floors: 9, wall: '#4e6076', window: P.windowCool, windowChance: 0.4 },
      { x: 97, z: 86, w: 8, d: 9, floors: 7, wall: '#5b6d84', window: P.windowWarm, windowChance: 0.4 },
      { x: -76, z: 101, w: 10, d: 8, floors: 6, wall: '#54667c', window: P.windowWarm, windowChance: 0.4 },
      { x: -56, z: 101, w: 9, d: 8, floors: 8, wall: '#4e6076', window: P.windowCool, windowChance: 0.4 },
      { x: -34, z: 101, w: 10, d: 8, floors: 5, wall: '#61748c', window: P.windowWarm, windowChance: 0.4 },
      { x: -10, z: 101, w: 10, d: 8, floors: 6, wall: '#5b6d84', window: P.windowWarm, windowChance: 0.4 },
      { x: 12, z: 101, w: 9, d: 8, floors: 8, wall: '#4e6076', window: P.windowCool, windowChance: 0.4 },
      { x: 34, z: 101, w: 10, d: 8, floors: 7, wall: '#54667c', window: P.windowWarm, windowChance: 0.4 },
      { x: 58, z: 101, w: 9, d: 8, floors: 9, wall: '#4e6076', window: P.windowCool, windowChance: 0.4 },
      { x: 80, z: 101, w: 10, d: 8, floors: 6, wall: '#61748c', window: P.windowWarm, windowChance: 0.4 },
    ];

    const built = createFillerBlocks([...filler, ...backdrop]);
    this.scene.add(built.object);
    this.occluders.push(...built.occluders);
    for (const c of built.colliders) {
      this.physics.addStaticBox(c.x + c.spec.x, c.spec.y, c.z + c.spec.z, c.spec.w, c.spec.h, c.spec.d);
    }
  }

  /* ---------------------------------------------------------------- */

  private addProps(): void {
    const trees = createTrees([
      // Plaza ring
      { x: -15, z: -6 }, { x: 15, z: -6 }, { x: -13, z: -22 }, { x: 13, z: -22 },
      // Hangang park, north bank (either side of the jogging path)
      { x: -76, z: 13.5 }, { x: -66, z: 16.8 }, { x: -56, z: 13.5 }, { x: -42, z: 16.8 },
      { x: -36, z: 13.5 }, { x: -26, z: 16.8 }, { x: -16, z: 13.5 }, { x: -8, z: 16.8 },
      { x: 8, z: 16.8 }, { x: 16, z: 13.5 }, { x: 26, z: 16.8 }, { x: 36, z: 13.5 },
      { x: 46, z: 16.8 }, { x: 56, z: 13.5 }, { x: 66, z: 16.8 }, { x: 76, z: 13.5 },
      // South bank strip along the water
      { x: -76, z: 50.3 }, { x: -64, z: 50.3 }, { x: -28, z: 50.3 }, { x: -16, z: 50.3 },
      { x: 8, z: 50.3 }, { x: 20, z: 50.3 }, { x: 32, z: 50.3 }, { x: 44, z: 50.3 },
      { x: 56, z: 50.3 }, { x: 68, z: 50.3 }, { x: 80, z: 50.3 },
      // Namsan-ro roadside
      { x: -76, z: -40 }, { x: -50, z: -40 }, { x: 20, z: -40 }, { x: 70, z: -40 },
      // Hongdae pocket park
      { x: -26, z: -12 }, { x: -26, z: 0 },
      // Hanok alley courtyards
      { x: 33.5, z: -50 }, { x: 47.5, z: -50 }, { x: 30, z: -40 }, { x: 46, z: -40 }, { x: 60, z: -40 },
      // Gangnam street greenery
      { x: 7, z: 70 }, { x: 26, z: 62 }, { x: 37, z: 74 }, { x: 52, z: 62 }, { x: 26, z: 74 }, { x: 55, z: 74 },
      // Yeouido / apartment greenery
      { x: -12, z: 62 }, { x: -40, z: 62 }, { x: -64, z: 62 }, { x: -14, z: 70 },
    ]);
    this.scene.add(trees.object);
    this.addPropColliders(trees.colliders);

    // Arm direction: local +X maps to (cos ry, -sin ry) — point arms at roads.
    const ARM_N = Math.PI / 2;
    const ARM_S = -Math.PI / 2;
    const ARM_E = 0;
    const ARM_W = Math.PI;
    const lights = createStreetlights([
      // Namsan-ro (z=-34), south side: arms north
      { x: -72, z: -29.9, ry: ARM_N }, { x: -48, z: -29.9, ry: ARM_N }, { x: -24, z: -29.9, ry: ARM_N },
      { x: 24, z: -29.9, ry: ARM_N }, { x: 48, z: -29.9, ry: ARM_N }, { x: 72, z: -29.9, ry: ARM_N },
      // Gangbyeon boulevard (z=8), north side: arms south
      { x: -72, z: 3.9, ry: ARM_S }, { x: -40, z: 3.9, ry: ARM_S }, { x: -16, z: 3.9, ry: ARM_S },
      { x: 16, z: 3.9, ry: ARM_S }, { x: 40, z: 3.9, ry: ARM_S }, { x: 72, z: 3.9, ry: ARM_S },
      // Olympic-daero (z=56), south side: arms north
      { x: -76, z: 60.9, ry: ARM_N }, { x: -56, z: 60.9, ry: ARM_N }, { x: -28, z: 60.9, ry: ARM_N },
      { x: -12, z: 60.9, ry: ARM_N }, { x: 16, z: 60.9, ry: ARM_N }, { x: 46, z: 60.9, ry: ARM_N },
      { x: 76, z: 60.9, ry: ARM_N },
      // Teheran-ro (z=80), north side: arms south
      { x: -60, z: 74.9, ry: ARM_S }, { x: -24, z: 74.9, ry: ARM_S }, { x: 8, z: 74.9, ry: ARM_S },
      { x: 54, z: 74.9, ry: ARM_S }, { x: 72, z: 74.9, ry: ARM_S },
      // North-south streets
      { x: -27.9, z: -24, ry: ARM_W }, { x: -36.1, z: 1, ry: ARM_E },
      { x: -59.9, z: -24, ry: ARM_W }, { x: -68.1, z: -6, ry: ARM_E },
      { x: 27.9, z: -22, ry: ARM_E }, { x: 36.1, z: -4, ry: ARM_W },
      { x: 59.9, z: -22, ry: ARM_E }, { x: 68.1, z: -4, ry: ARM_W },
      { x: 27.9, z: 62, ry: ARM_E }, { x: 36.1, z: 72, ry: ARM_W },
      { x: 59.9, z: 64, ry: ARM_E }, { x: 68.1, z: 74, ry: ARM_W },
      { x: -43.9, z: 64, ry: ARM_W }, { x: -52.1, z: 72, ry: ARM_E },
      // Spine (south bank; the north stretch is lit by the boulevard lights)
      { x: 3.9, z: 62, ry: ARM_W }, { x: -3.9, z: 72, ry: ARM_E }, { x: 3.9, z: 88, ry: ARM_W },
    ]);
    this.scene.add(lights.object);
    this.addPropColliders(lights.colliders);

    // Parked fully on the asphalt, clear of every junction box.
    const cars = createCars([
      { x: -22, z: -35.5, ry: 0, color: '#7ba3c4' },
      { x: 18, z: -32.5, ry: Math.PI, color: '#c47b7b' },
      { x: 58, z: -35.5, ry: 0, color: '#d9c37a' },
      { x: -58, z: 6.5, ry: 0, color: '#8fae8a' },
      { x: 22, z: 9.5, ry: Math.PI, color: '#b0b4bd' },
      { x: 54, z: 6.5, ry: 0, color: '#7ba3c4' },
      { x: -30, z: 54.5, ry: 0, color: '#c4b57b' },
      { x: 20, z: 57.5, ry: Math.PI, color: '#7ba3c4' },
      { x: 74, z: 54.5, ry: 0, color: '#b0b4bd' },
      { x: -20, z: 78.5, ry: 0, color: '#c47b7b' },
      { x: 40, z: 81.5, ry: Math.PI, color: '#8fae8a' },
      { x: -33.5, z: -16, ry: Math.PI / 2, color: '#d9c37a' },
      { x: 30.5, z: -18, ry: -Math.PI / 2, color: '#7ba3c4' },
      { x: 65.5, z: 66, ry: Math.PI / 2, color: '#c47b7b' },
      { x: -49.5, z: 68, ry: -Math.PI / 2, color: '#b0b4bd' },
      { x: 1.5, z: 64, ry: -Math.PI / 2, color: '#8fae8a' },
      { x: -1.5, z: 88, ry: Math.PI / 2, color: '#d9c37a' },
    ]);
    this.scene.add(cars.object);
    this.addPropColliders(cars.colliders);

    const furniture = createStreetFurniture(
      [
        // Plaza (clear of the painted wayfinding text)
        { x: 11, z: -8, ry: -0.6 }, { x: -4, z: -21, ry: 0.3 },
        // Hangang park, facing the water
        { x: -40, z: 17.2, ry: Math.PI }, { x: -12, z: 17.2, ry: Math.PI },
        { x: 12, z: 17.2, ry: Math.PI }, { x: 40, z: 17.2, ry: Math.PI }, { x: 64, z: 17.2, ry: Math.PI },
        // Hanok alley + south bank
        { x: 36, z: -41.8, ry: 0 },
        { x: 26, z: 61.8, ry: 0 }, { x: -56, z: 61.8, ry: 0 },
      ],
      [
        { x: -26, z: -6 }, { x: 26, z: -12 }, { x: 26, z: 0 },
        { x: -16, z: -25 }, { x: 16, z: -25 },
        { x: -68, z: 13.5 }, { x: 68, z: 13.5 },
      ]
    );
    this.scene.add(furniture.object);
    this.addPropColliders(furniture.colliders);

    // Street-level dressing so the city reads lived-in rather than flat.
    const details = createCityDetails({
      shelters: [
        { x: -22, z: 4.1, ry: 0 }, // Gangbyeon blvd, north side — opens south to the road
        { x: 48, z: 4.1, ry: 0 },
        { x: -20, z: 59.9, ry: Math.PI }, // Olympic-daero, south side — opens north
        { x: 60, z: 59.9, ry: Math.PI },
      ],
      carts: [
        { x: -24, z: -21, ry: 0.4 }, // Hongdae side of the plaza
        { x: -35, z: 2, ry: -0.3 }, // by the arcade
      ],
      boats: [
        { x: -28, z: 32, ry: 0.3 },
        { x: 30, z: 40, ry: -0.5 },
        { x: 66, z: 27, ry: 0.15 },
      ],
      hedges: [
        { x: -66, z: 13.2, len: 8 },
        { x: -31, z: 13.2, len: 8 },
        { x: 22, z: 13.2, len: 8 },
        { x: 62, z: 13.2, len: 8 },
      ],
      beds: [
        { x: -14, z: -2 }, { x: 14, z: -2 }, { x: -14, z: -26 }, { x: 14, z: -26 },
      ],
      poles: [
        { x: 26, z: -41.3 }, { x: 44, z: -41.3 }, { x: 56, z: -41.3 },
      ],
      postboxes: [{ x: 11, z: -18, ry: -0.5 }],
    });
    this.scene.add(details.object);
    this.addPropColliders(details.colliders);
  }

  private addPropColliders(
    colliders: { x: number; z: number; spec: { w: number; h: number; d: number; x: number; y: number; z: number } }[]
  ): void {
    for (const c of colliders) {
      this.physics.addStaticBox(c.x + c.spec.x, c.spec.y, c.z + c.spec.z, c.spec.w, c.spec.h, c.spec.d);
    }
  }

  /* ---------------------------------------------------------------- */

  private addBoundaries(): void {
    // Perimeter walls (invisible; the visible edge is carried by the
    // mountain backdrop, the backdrop skyline rows, and the fog)
    this.physics.addStaticBox(0, 2, -90, 190, 8, 2); // north, past Namsan
    this.physics.addStaticBox(-90, 2, 4, 2, 8, 196); // west
    this.physics.addStaticBox(90, 2, 4, 2, 8, 196); // east
    this.physics.addStaticBox(0, 2, 98, 190, 8, 2); // south, behind deep Gangnam

    // Riverbanks: keep the poro dry. Gaps for the Hangang bridge (x -4..4),
    // the Yanghwa bridge (x -52..-44), and the pier (x 11.9..16.1).
    const northSegs: [number, number][] = [
      [-90, -52.2], [-43.8, -4], [4, 11.9], [16.1, 90],
    ];
    const southSegs: [number, number][] = [
      [-90, -52.2], [-43.8, -4], [4, 90],
    ];
    // Low parapet walls sitting on the ground (a floating rail bar reads as
    // a glitch at night), in a muted tone that blends with the banks.
    const railMat = celMaterial({ profile: 'concrete', color: '#46545e' });
    const capMat = celMaterial({ profile: 'concrete', color: '#55646f' });
    const addBank = (segs: [number, number][], z: number) => {
      for (const [a, b] of segs) {
        const len = b - a;
        const cx = (a + b) / 2;
        this.physics.addStaticBox(cx, 1, z, len, 3, 1);
        const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 0.52, 0.22), railMat);
        wall.position.set(cx, 0.26, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(len, 0.09, 0.3), capMat);
        cap.position.set(cx, 0.56, z);
        this.scene.add(wall, cap);
      }
    };
    addBank(northSegs, 19.4);
    addBank(southSegs, 48.6);
    // (The water plane itself now runs to the fog horizon east and west.)
  }

  /* ---------------------------------------------------------------- */

  private addPlazaDressing(): void {
    // Controls tutorial painted on the plaza stones near spawn: the full
    // WASD cluster (S included), the three action keys, and the extras.
    const tutorial = makeDecal(
      (ctx, w, h) => {
        // All sizes are proportional to the canvas so the layout survives
        // resolution changes.
        const s = h / 275;
        ctx.fillStyle = 'rgba(29,31,42,0.55)';
        roundRect(ctx, 0, 0, w, h, 16 * s);
        ctx.fill();
        ctx.fillStyle = '#f5ead2';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const key = (x: number, y: number, label: string) => {
          const size = 46 * s;
          ctx.strokeStyle = '#f5ead2';
          ctx.lineWidth = 3 * s;
          roundRect(ctx, x - size / 2, y - size / 2, size, size, 8 * s);
          ctx.stroke();
          ctx.font = `700 ${Math.round(26 * s)}px "IBM Plex Sans KR", sans-serif`;
          ctx.fillText(label, x, y + s);
        };
        const label = (x: number, y: number, text: string, px = 26) => {
          ctx.font = `700 ${Math.round(px * s)}px "IBM Plex Sans KR", sans-serif`;
          ctx.fillText(text, x, y);
        };
        // Movement cluster, laid out like a real keyboard (S included)
        label(w * 0.16, h * 0.14, 'MOVE · 움직이기', 24);
        key(w * 0.16, h * 0.37, 'W');
        key(w * 0.095, h * 0.61, 'A');
        key(w * 0.16, h * 0.61, 'S');
        key(w * 0.225, h * 0.61, 'D');
        // Action keys: short header, key, Korean caption
        label(w * 0.47, h * 0.14, 'ENTER', 24);
        key(w * 0.47, h * 0.42, 'E');
        label(w * 0.47, h * 0.67, '들어가기', 19);
        label(w * 0.64, h * 0.14, 'MAP', 24);
        key(w * 0.64, h * 0.42, 'M');
        label(w * 0.64, h * 0.67, '지도', 19);
        label(w * 0.81, h * 0.14, 'RESET', 24);
        key(w * 0.81, h * 0.42, 'R');
        label(w * 0.81, h * 0.67, '리셋', 19);
        // Everything else
        ctx.globalAlpha = 0.85;
        label(w * 0.5, h * 0.885, 'SHIFT sprint · SPACE jump · drag to look around', 22);
        ctx.globalAlpha = 1;
      },
      11.5,
      4.3,
      96,
      true
    );
    tutorial.position.set(0, 0.05, -5.2);
    this.scene.add(tutorial);
  }

  /**
   * Street-name wayfinding: crisp floating decals hovering just above the
   * roads (the ground canvas is far too coarse for legible lettering).
   * `flip` rotates the text for readers walking south.
   */
  private addWayfinding(): void {
    const labels: { text: string; x: number; z: number; w: number; flip?: boolean }[] = [
      { text: '남산 ↑', x: 0, z: -29.5, w: 6.5 }, // read walking north to the gate
      { text: '한강 · 강남 ↑', x: 0, z: 2.5, w: 11, flip: true }, // walking south to the bridge
      { text: '← 홍대', x: -8.5, z: -13, w: 6 }, // plaza paving
      { text: '한옥골목 →', x: 8.5, z: -13, w: 9 }, // plaza paving
      { text: '한옥골목 →', x: 40, z: -33.7, w: 9 }, // on Namsan-ro heading east
      { text: '← 여의도', x: -59, z: 55.7, w: 7.5 }, // on Olympic-daero
      { text: '강남 →', x: 40, z: 55.7, w: 6 },
    ];
    const H = 2.4;
    for (const label of labels) {
      const decal = makeDecal(
        (ctx, w, h) => {
          if (label.flip) {
            ctx.translate(w / 2, h / 2);
            ctx.rotate(Math.PI);
            ctx.translate(-w / 2, -h / 2);
          }
          // Soft dark plate so the lettering pops off any road tone
          ctx.fillStyle = 'rgba(22,25,34,0.42)';
          roundRect(ctx, h * 0.1, h * 0.1, w - h * 0.2, h * 0.8, h * 0.24);
          ctx.fill();
          ctx.fillStyle = '#f5efdc';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          let size = h * 0.5;
          ctx.font = `700 ${size}px ${KOREAN_FONT}`;
          const tw = ctx.measureText(label.text).width;
          if (tw > w * 0.88) {
            size *= (w * 0.88) / tw;
            ctx.font = `700 ${size}px ${KOREAN_FONT}`;
          }
          ctx.fillText(label.text, w / 2, h * 0.52);
        },
        label.w,
        H,
        96,
        true
      );
      decal.position.set(label.x, 0.07, label.z);
      this.scene.add(decal);
    }
  }

  /* ---------------------------------------------------------------- */

  districtAt(x: number, z: number): DistrictId | null {
    for (const d of DISTRICTS) {
      const b = d.bounds;
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return d.id;
    }
    return null;
  }

  update(elapsed: number): void {
    ENV.time.value = elapsed;
    this.updateDayNight();
    // Pulse whichever highlight is visible
    for (const h of this.highlights.values()) {
      if (!h.visible) continue;
      const s = 1 + Math.sin(elapsed * 4) * 0.12;
      h.children[0]?.scale.setScalar(s);
      const beacon = h.children[1];
      if (beacon) beacon.position.y = 2.1 + Math.sin(elapsed * 3) * 0.15;
    }
  }
}

// Day-cycle color stops
const NIGHT_SKY = new THREE.Color('#171c33');
const DUSK_SKY = new THREE.Color('#4a4471');
const DAY_SKY = new THREE.Color('#6f93c9');
const NIGHT_FOG = new THREE.Color('#232945');
const DUSK_FOG = new THREE.Color('#54507a');
const DAY_FOG = new THREE.Color('#8299bd');
const SUN_HORIZON = new THREE.Color('#ff9a5c');
const SUN_NOON = new THREE.Color('#fff2dc');
const SHADOW_NIGHT = new THREE.Color('#454b78');
const SHADOW_DAY = new THREE.Color('#6b70a0');

// Seoul wall-clock as a fraction of the day, recomputed at most once per
// second (Intl formatting is too costly to run every frame).
const SEOUL_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hour12: false,
});
let seoulCacheAt = -1;
let seoulCached = 0;
function seoulDayFraction(): number {
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec !== seoulCacheAt) {
    seoulCacheAt = nowSec;
    let h = 0;
    let m = 0;
    let s = 0;
    for (const part of SEOUL_TIME.formatToParts(new Date())) {
      if (part.type === 'hour') h = Number(part.value) % 24;
      else if (part.type === 'minute') m = Number(part.value);
      else if (part.type === 'second') s = Number(part.value);
    }
    seoulCached = (h * 3600 + m * 60 + s) / 86400;
  }
  return seoulCached;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
