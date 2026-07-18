import * as THREE from 'three';
import { PALETTE as P } from '../config/palette';
import { PROJECTS } from '../config/projects';
import { PLACES, DISTRICTS } from '../config/places';
import type { InteractionTarget, DistrictId } from '../types';
import type { Physics } from '../physics/Physics';
import type { QualityPreset } from '../core/Quality';
import { createGround } from './GroundPainter';
import { buildStructure, facingToYaw, type BuiltStructure } from './VoxelBuilding';
import {
  createTrees,
  createStreetlights,
  createCars,
  createStreetFurniture,
  createFillerBlocks,
  type FillerSpec,
} from './Props';
import {
  createGate,
  createNamsan,
  createRiver,
  createPier,
  createFootbridge,
  createSignpost,
} from './Landmarks';
import { makeDecal } from './SignTexture';

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

  private sun!: THREE.DirectionalLight;
  private riverUpdate?: (t: number) => void;

  constructor(private physics: Physics) {
    this.scene.background = new THREE.Color(P.sky);
    this.scene.fog = new THREE.Fog(P.fog, 45, 210);

    this.setLights();
    this.scene.add(createGround());
    this.addLandmarks();
    this.addStructures();
    this.addFiller();
    this.addProps();
    this.addBoundaries();
    this.addPlazaDressing();
  }

  /* ---------------------------------------------------------------- */

  private setLights(): void {
    const hemi = new THREE.HemisphereLight(P.ambient, '#6b6252', 1.35);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight(P.sun, 2.4);
    this.sun.position.set(-48, 55, 30);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -85;
    cam.right = 85;
    cam.top = 85;
    cam.bottom = -85;
    cam.near = 10;
    cam.far = 180;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
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
    const gate = createGate(0, -14);
    this.scene.add(gate.object);
    this.registerColliders(gate);

    const namsan = createNamsan(0, -46);
    this.scene.add(namsan.object);
    this.registerColliders(namsan);

    const river = createRiver();
    this.scene.add(river.object);
    this.riverUpdate = river.update;

    const pier = createPier(0);
    this.scene.add(pier.object);
    this.registerColliders(pier);

    const bridge = createFootbridge(-34, 31);
    this.scene.add(bridge.object);
    this.registerColliders(bridge);

    const signpost = createSignpost(6, -4);
    this.scene.add(signpost.object);
    this.registerColliders(signpost);
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
      // Hongdae back row (west edge): low colorful creative blocks
      { x: -62, z: -14, w: 7, d: 8, floors: 3, wall: '#b06a5a', window: P.windowWarm },
      { x: -62, z: -4, w: 7, d: 7, floors: 2, wall: '#7a6a8f', window: P.windowWarm },
      { x: -62, z: 10, w: 7, d: 9, floors: 3, wall: '#5f7a6a', window: P.windowWarm },
      { x: -52, z: 14, w: 8, d: 6, floors: 2, wall: P.brick, window: P.windowWarm },
      { x: -36, z: 18, w: 9, d: 5, floors: 3, wall: '#8f6a50', window: P.windowWarm },
      { x: -48, z: -14, w: 8, d: 7, floors: 2, wall: '#a08360', window: P.windowWarm },
      // Hongdae north strip, south of the north road
      { x: -34, z: -21, w: 8, d: 4, floors: 2, wall: '#96595f', window: P.neonPink, windowChance: 0.8 },
      { x: -46, z: -21, w: 8, d: 4, floors: 3, wall: '#5c6e8f', window: P.windowWarm },
      // Gangnam skyline (east edge): tall glass towers
      { x: 63, z: -10, w: 8, d: 10, floors: 10, wall: '#4e6076', window: P.windowCool, windowChance: 0.75 },
      { x: 63, z: 12, w: 8, d: 9, floors: 8, wall: '#5b6d84', window: P.windowWarm, windowChance: 0.7 },
      { x: 44, z: 16, w: 8, d: 6, floors: 6, wall: '#61748c', window: P.windowCool, windowChance: 0.7 },
      { x: 30, z: -21, w: 9, d: 4, floors: 5, wall: '#54667c', window: P.windowCool },
      { x: 44, z: -21, w: 8, d: 4, floors: 7, wall: '#4e6076', window: P.windowWarm },
      // North street frame (either side of Namsan's base)
      { x: -22, z: -31, w: 9, d: 6, floors: 4, wall: P.concrete, window: P.windowWarm },
      { x: -33, z: -31, w: 8, d: 6, floors: 3, wall: '#9a8a76', window: P.windowWarm },
      { x: 22, z: -31, w: 7, d: 5, floors: 3, wall: '#9a8a76', window: P.windowWarm },
      // Hanok alley neighbours (low traditional-ish blocks)
      { x: 26, z: -36, w: 7, d: 6, floors: 1, wall: P.hanokWall, window: P.windowWarm },
      { x: 48, z: -36, w: 7, d: 6, floors: 1, wall: P.hanokWall, window: P.windowWarm },
      { x: 56, z: -35, w: 6, d: 6, floors: 1, wall: '#dcd0b6', window: P.windowWarm },
      { x: 36, z: -24.5, w: 9, d: 4, floors: 2, wall: '#c9b896', window: P.windowWarm },
      { x: 50, z: -24.5, w: 8, d: 4, floors: 2, wall: '#b8a888', window: P.windowWarm },
    ];
    const built = createFillerBlocks(filler);
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
      { x: -10, z: -6 }, { x: 10, z: -6 }, { x: -12, z: 8 }, { x: 13, z: 6 },
      // Riverside park rows
      { x: -56, z: 27 }, { x: -46, z: 29 }, { x: -36, z: 27 }, { x: -26, z: 29 },
      { x: -16, z: 27 }, { x: -8, z: 29 }, { x: 8, z: 29 }, { x: 16, z: 27 },
      { x: 26, z: 29 }, { x: 36, z: 27 }, { x: 46, z: 29 }, { x: 56, z: 27 },
      { x: -50, z: 34 }, { x: -30, z: 34.5 }, { x: 24, z: 34.5 }, { x: 44, z: 34 },
      // Streets
      { x: -30, z: -18.5 }, { x: -42, z: -18.5 }, { x: 30, z: -18.5 }, { x: 42, z: -18.5 },
      { x: -28, z: 14 }, { x: 28, z: 15 },
      // Hanok alley
      { x: 30, z: -27.5 }, { x: 44, z: -27.5 },
      // Namsan foot
      { x: -14, z: -34 }, { x: 14, z: -34 },
    ]);
    this.scene.add(trees.object);
    this.addPropColliders(trees.colliders);

    const lights = createStreetlights([
      { x: -12, z: -20.7, ry: -Math.PI / 2 }, { x: 12, z: -20.7, ry: Math.PI },
      { x: -34, z: -20.7 }, { x: 34, z: -20.7, ry: Math.PI },
      { x: -52, z: -20.7 }, { x: 52, z: -20.7, ry: Math.PI },
      { x: -12, z: 17.6 }, { x: 12, z: 17.6, ry: Math.PI },
      { x: -36, z: 17.6 }, { x: 36, z: 17.6, ry: Math.PI },
      { x: -20.6, z: -10, ry: Math.PI / 2 }, { x: 20.6, z: -10, ry: -Math.PI / 2 },
      { x: -20.6, z: 8, ry: Math.PI / 2 }, { x: 20.6, z: 8, ry: -Math.PI / 2 },
      { x: 3.6, z: 28, ry: -Math.PI / 2 }, { x: -3.6, z: 32, ry: Math.PI / 2 },
    ]);
    this.scene.add(lights.object);
    this.addPropColliders(lights.colliders);

    const cars = createCars([
      { x: -14, z: -27.6, ry: 0, color: '#7ba3c4' },
      { x: 16, z: -22.4, ry: Math.PI, color: '#c47b7b' },
      { x: 27.4, z: -8, ry: Math.PI / 2, color: '#d9c37a' },
      { x: -27.4, z: 4, ry: -Math.PI / 2, color: '#8fae8a' },
      { x: -10, z: 24.6, ry: 0, color: '#b0b4bd' },
      { x: 40, z: 19.4, ry: Math.PI, color: '#7ba3c4' },
    ]);
    this.scene.add(cars.object);
    this.addPropColliders(cars.colliders);

    const furniture = createStreetFurniture(
      [
        { x: -6, z: 10, ry: 0.6 }, { x: 6, z: 11, ry: -0.6 },
        { x: -20, z: 30.5, ry: Math.PI }, { x: 20, z: 30.5, ry: Math.PI },
        { x: -44, z: 30.5, ry: Math.PI }, { x: 48, z: 30.5, ry: Math.PI },
        { x: 38, z: -28.2, ry: 0 },
      ],
      [
        { x: -16, z: -2 }, { x: 16, z: -2 },
        { x: -29, z: -12 }, { x: 29, z: 12 },
        { x: -47, z: 8 }, { x: 47, z: -8 },
      ]
    );
    this.scene.add(furniture.object);
    this.addPropColliders(furniture.colliders);
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
    // Perimeter walls (invisible)
    this.physics.addStaticBox(0, 2, -58, 150, 8, 2); // behind Namsan
    this.physics.addStaticBox(-66, 2, 0, 2, 8, 140); // west
    this.physics.addStaticBox(66, 2, 0, 2, 8, 140); // east
    this.physics.addStaticBox(0, 2, 64, 150, 8, 2); // far river (unreachable backstop)

    // Riverbank: keep the poro dry, with a gap for the pier at x ∈ [-2.1, 2.1]
    this.physics.addStaticBox(-35, 1, 37.6, 66, 3, 1); // -68..-2
    this.physics.addStaticBox(35, 1, 37.6, 66, 3, 1); // 2..68

    // Low riverbank rail meshes so the boundary is visible, not magic
    const railGeo = new THREE.BoxGeometry(66, 0.65, 0.18);
    const railMat = new THREE.MeshLambertMaterial({ color: '#5b727f' });
    for (const sx of [-35, 35]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(sx, 0.5, 37.6);
      rail.castShadow = true;
      this.scene.add(rail);
    }
  }

  /* ---------------------------------------------------------------- */

  private addPlazaDressing(): void {
    // Movement tutorial painted on the plaza stones near spawn
    const tutorial = makeDecal(
      (ctx, w, h) => {
        ctx.fillStyle = 'rgba(29,31,42,0.55)';
        roundRect(ctx, 0, 0, w, h, 14);
        ctx.fill();
        ctx.fillStyle = '#f5ead2';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const key = (x: number, y: number, label: string) => {
          ctx.strokeStyle = '#f5ead2';
          ctx.lineWidth = 3;
          roundRect(ctx, x - 24, y - 24, 48, 48, 8);
          ctx.stroke();
          ctx.font = '700 26px "Silkscreen", monospace';
          ctx.fillText(label, x, y + 2);
        };
        key(w * 0.18, h * 0.62, 'W');
        key(w * 0.08, h * 0.62, 'A');
        key(w * 0.28, h * 0.62, 'D');
        ctx.font = '700 30px "IBM Plex Sans KR", sans-serif';
        ctx.fillText('움직이기 · MOVE', w * 0.18, h * 0.2);
        key(w * 0.72, h * 0.62, 'E');
        ctx.fillText('들어가기 · ENTER', w * 0.74, h * 0.2);
      },
      10,
      3.4
    );
    tutorial.position.set(0, 0.05, 7.5);
    this.scene.add(tutorial);
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
    this.riverUpdate?.(elapsed);
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
