import { expect, test } from '@playwright/test';
import { buildOrca } from '../src/ocean/orca-model';
import { OrcaMotion } from '../src/ocean/orca-motion';
import { PreyField } from '../src/ocean/prey';
import { createRoadMarkings } from '../src/seoul/world/RoadMarkings';
import * as THREE from 'three';
import { createTerrain } from '../src/seoul/world/Terrain';
import { createNamsan } from '../src/seoul/world/Landmarks';
import { rangeHeight } from '../src/seoul/world/Hills';

test('ground openings stay clear through both terrain layers with paving intact outside', () => {
  for (const angle of [0, Math.PI / 4, Math.PI / 2]) {
    const points = [[-2.7, -1.7], [2.5, -1.7], [2.5, 1.7], [-2.7, 1.7]];
    const opening = points.map(([x, z]) => new THREE.Vector2(9 + x * Math.cos(angle) + z * Math.sin(angle), 64 - x * Math.sin(angle) + z * Math.cos(angle)));
    const terrain = createTerrain({ width: 1, height: 1 } as HTMLCanvasElement, [opening]);
    for (const x of [-1, 0, 1]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(9 + x, 0.1, 64), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObjects([terrain.inner, terrain.apron])).toHaveLength(0);
    }
    const ray = new THREE.Raycaster(new THREE.Vector3(14, 0.1, 64), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(terrain.inner);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].point.y).toBeCloseTo(0);
    for (const mesh of [terrain.inner, terrain.apron]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
});

test('Namsan keeps its uneven summit and its foundation embeds into the slope', () => {
  const hill = createNamsan(0, 0).object;
  hill.updateMatrixWorld(true);
  const heights = [];
  for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI / 16;
    const ray = new THREE.Raycaster(new THREE.Vector3(Math.cos(angle) * 3.5, 40, Math.sin(angle) * 3.5), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(hill, true);
    expect(hits.length).toBeGreaterThan(0);
    heights.push(hits[0].point.y);
  }
  expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(1);
  const mesh = hill.children[0] as THREE.Mesh;
  const positions = mesh.geometry.attributes.position;
  const colors = mesh.geometry.attributes.color;
  const stone = new THREE.Color('#858176');
  let embedded = 0;
  for (let i = 0; i < positions.count; i++) {
    if (Math.abs(colors.getX(i) - stone.r) > 0.001 || Math.abs(colors.getY(i) - stone.g) > 0.001 || Math.abs(colors.getZ(i) - stone.b) > 0.001) continue;
    const x = positions.getX(i), z = positions.getZ(i);
    if (Math.hypot(x, z) < 3.3) continue; // Plaza top is narrower than the footing.
    const ground = rangeHeight({ x: 0, z: 0, hx: 16.6, hz: 16.6, height: 9.1, rock: 0, seed: 4.2 }, x, z);
    expect(positions.getY(i)).toBeLessThan(ground - 0.5);
    embedded++;
  }
  expect(embedded).toBeGreaterThanOrEqual(32);
  hill.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
});

test('orca turns back on the frame its boundary avoidance changes target', () => {
  const motion = new OrcaMotion(buildOrca(200, 8, 12));
  motion.zone = { x0: 0, x1: 900, y0: 0, y1: 600 };
  motion.place(850, 300, 0);
  motion.call(1000, 300);
  motion.update(1 / 30);
  expect(Math.abs(motion.yaw)).toBeGreaterThan(0);
});

test('road paint faces up, and a terminating street only points to available exits', () => {
  const mesh = createRoadMarkings();
  const positions = mesh.geometry.getAttribute('position');
  const indices = mesh.geometry.getIndex()!;
  for (let i = 0; i < indices.count; i += 3) {
    const [a, b, c] = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
    const normalY = (positions.getZ(b) - positions.getZ(a)) * (positions.getX(c) - positions.getX(a))
      - (positions.getX(b) - positions.getX(a)) * (positions.getZ(c) - positions.getZ(a));
    expect(normalY).toBeGreaterThan(0);
  }
  const hasVertex = (x: number, z: number) => {
    for (let i = 0; i < positions.count; i++) {
      if (Math.abs(positions.getX(i) - x) < 0.0001 && Math.abs(positions.getZ(i) - z) < 0.0001) return true;
    }
    return false;
  };
  // Hongdae's north end meets Namsan-ro: turn east/west, never into the lot.
  const x = -62.5;
  const z = -24.9;
  expect(hasVertex(x, z - 1.05)).toBe(false);
  expect(hasVertex(x - 0.95, z - 0.175)).toBe(true);
  expect(hasVertex(x + 0.95, z - 0.175)).toBe(true);
  mesh.geometry.dispose();
  (mesh.material as import('three').Material).dispose();
});

test('hunting catches prey on desktop and phone without drifting away in depth', () => {
  const random = Math.random;
  try {
    for (const [w, h, length] of [[1440, 900, 490], [390, 800, 214]]) {
      let seed = 12345;
      Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const tpl = buildOrca(length, 8, 12);
      const motion = new OrcaMotion(tpl);
      const zone = { x0: length * 0.35, x1: w - length * 0.35, y0: h * 0.12, y1: h * 0.86 };
      motion.zone = zone;
      motion.place(w * 0.6, h * 0.5, 0);
      const prey = new PreyField();
      prey.resize(w, h);
      let catches = 0;
      let fullFor = 6;
      let depth = 0;
      // Four minutes of simulated swimming, independent of browser speed.
      for (let i = 0; i < 240 * 60; i++) {
        const dt = 1 / 60;
        motion.update(dt);
        depth = Math.max(depth, Math.abs(motion.z));
        const x = motion.pose.cx[tpl.eyeStation]!;
        const y = h - motion.pose.cy[tpl.eyeStation]!;
        prey.update(dt, [{ x, y }], length * 0.6);
        const eaten = prey.eatNear(x, y, length * 0.09);
        catches += eaten;
        fullFor -= dt;
        if (eaten) fullFor = 5 + Math.random() * 6;
        const target = prey.nearest(x, y);
        if (fullFor <= 0 && target) motion.chase(
          Math.max(zone.x0, Math.min(zone.x1, target.x + target.vx * 0.5)),
          Math.max(zone.y0, Math.min(zone.y1, h - target.y - target.vy * 0.5)),
        );
      }
      expect(catches, `catches at ${w}px`).toBeGreaterThan(0);
      expect(depth, `depth at ${w}px`).toBeLessThan(length * 3);
    }
  } finally {
    Math.random = random;
  }
});
