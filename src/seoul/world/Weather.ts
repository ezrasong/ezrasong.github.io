import * as THREE from 'three';
import { VoxelKit } from './voxel';
import { celMaterial } from './CelShading';

/**
 * Weather for the miniature Seoul. The current condition mirrors the real
 * Seoul sky via Open-Meteo (no API key); if the fetch fails the system
 * falls back to a gentle procedural cycle. Rain and snow are lightweight
 * instanced particle boxes that follow the player; clouds are voxel puffs
 * drifting over the city. `dim` (0..1) is consumed by World to mute the
 * sun, sky, and fog while the weather is grim.
 */
export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'snow';

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: '맑음 CLEAR',
  cloudy: '흐림 CLOUDY',
  rain: '비 RAIN',
  snow: '눈 SNOW',
};

const DIM_TARGET: Record<WeatherKind, number> = {
  clear: 0,
  cloudy: 0.45,
  rain: 0.72,
  snow: 0.5,
};

const DROPS = 420;
const AREA = 46; // particle box follows the player, this wide
const CEIL = 24; // particles fall from this height

export class Weather {
  kind: WeatherKind = 'clear';
  /** Eased 0..1 gloom factor, consumed by World's lighting. */
  dim = 0;

  private targetDim = 0;
  private rain: THREE.InstancedMesh;
  private snow: THREE.InstancedMesh;
  private drops = new Float32Array(DROPS * 3); // local offsets in the box
  private clouds: { group: THREE.Group; speed: number }[] = [];
  private cloudMat: THREE.MeshToonMaterial;
  private dummy = new THREE.Object3D();
  private cycleTimer = 0;
  private usingFallback = false;
  private enabled = true;
  private onChange?: (kind: WeatherKind) => void;

  constructor(scene: THREE.Scene) {
    // Shared drop offsets: x/z fixed per drop, y cycles downward.
    for (let i = 0; i < DROPS; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * AREA;
      this.drops[i * 3 + 1] = Math.random() * CEIL;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * AREA;
    }

    const rainGeo = new THREE.BoxGeometry(0.03, 0.65, 0.03);
    const rainMat = new THREE.MeshBasicMaterial({
      color: '#a8bccf',
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.rain = new THREE.InstancedMesh(rainGeo, rainMat, DROPS);
    this.rain.visible = false;
    this.rain.frustumCulled = false;

    const snowGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const snowMat = new THREE.MeshBasicMaterial({
      color: '#eef3f8',
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.snow = new THREE.InstancedMesh(snowGeo, snowMat, DROPS);
    this.snow.visible = false;
    this.snow.frustumCulled = false;

    scene.add(this.rain, this.snow);

    // Stylized blob clouds: each cloud is a cluster of flattened icospheres
    // with a brighter cap and a shaded belly (baked as vertex colors), on
    // four base silhouettes at varying altitude and scale. One shared cel
    // material lets the day cycle and weather tint every cloud at once.
    this.cloudMat = celMaterial({ profile: 'foliage', vertexColors: true });
    const rng = mulberry32(2026);
    const TOP = '#ffffff';
    const BELLY = '#c3cbd9';
    const buildVariant = (variant: number, kit: VoxelKit) => {
      const puffs = 4 + (variant % 3);
      let cx = 0;
      for (let p = 0; p < puffs; p++) {
        const r = 2.6 + rng() * 2.6 * (1 - Math.abs(p - puffs / 2) / puffs);
        const y = rng() * 1.4 + r * 0.15;
        const z = (rng() - 0.5) * 3.5;
        kit.blob(r, cx, y, z, TOP, 0.62, 1);
        kit.blob(r * 0.78, cx + 0.4, y - r * 0.35, z + 0.3, BELLY, 0.5, 1);
        cx += r * (1.05 + rng() * 0.3);
      }
      // A trailing wisp
      kit.blob(1.5 + rng(), cx + 0.8, 0.4, (rng() - 0.5) * 3, BELLY, 0.45, 1);
    };
    const variants: THREE.BufferGeometry[] = [];
    for (let v = 0; v < 4; v++) {
      const kit = new VoxelKit();
      buildVariant(v, kit);
      variants.push(kit.merge());
    }
    for (let i = 0; i < 11; i++) {
      const geo = variants[i % 4];
      const mesh = new THREE.Mesh(geo, this.cloudMat);
      const group = new THREE.Group();
      group.add(mesh);
      const s = 0.8 + rng() * 1.3;
      group.scale.setScalar(s);
      group.rotation.y = rng() * Math.PI;
      group.position.set(-130 + rng() * 260, 36 + rng() * 22, -110 + rng() * 215);
      this.clouds.push({ group, speed: (0.5 + rng() * 0.9) / Math.sqrt(s) });
      scene.add(group);
    }
  }

  /** Quality presets cap how many clusters are visible. */
  applyCloudCount(count: number): void {
    this.clouds.forEach((c, i) => {
      c.group.visible = this.enabled && i < count;
    });
  }

  /**
   * Turn the whole weather system on/off. Off (the low preset) hides every
   * particle and cloud, pins the sky to clear, and short-circuits the
   * per-frame particle/cloud work — weather is pure overdraw with no gameplay
   * value, so it is the first thing to go on weak hardware.
   */
  setEnabled(on: boolean): void {
    if (this.enabled === on) return;
    this.enabled = on;
    if (!on) {
      this.rain.visible = false;
      this.snow.visible = false;
      for (const c of this.clouds) c.group.visible = false;
      this.targetDim = 0;
      this.dim = 0;
    } else {
      this.rain.visible = this.kind === 'rain';
      this.snow.visible = this.kind === 'snow';
      this.targetDim = DIM_TARGET[this.kind];
      // Cloud visibility is restored by the caller via applyCloudCount().
    }
  }

  /** Start following the real Seoul sky, with a procedural fallback. */
  init(onChange: (kind: WeatherKind) => void): void {
    this.onChange = onChange;
    void this.fetchSeoulWeather();
    window.setInterval(() => void this.fetchSeoulWeather(), 15 * 60 * 1000);
    onChange(this.kind);
  }

  private async fetchSeoulWeather(): Promise<void> {
    try {
      const r = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&current=weather_code',
        { signal: AbortSignal.timeout(6000) }
      );
      const data = (await r.json()) as { current?: { weather_code?: number } };
      const code = data.current?.weather_code;
      if (typeof code !== 'number') throw new Error('no code');
      this.usingFallback = false;
      this.setKind(codeToKind(code));
    } catch {
      this.usingFallback = true;
    }
  }

  setKind(kind: WeatherKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.targetDim = this.enabled ? DIM_TARGET[kind] : 0;
    this.rain.visible = this.enabled && kind === 'rain';
    this.snow.visible = this.enabled && kind === 'snow';
    this.onChange?.(kind);
  }

  update(dt: number, px: number, pz: number, daylight = 1): void {
    // Disabled (low preset): clear sky, nothing to animate.
    if (!this.enabled) {
      this.dim = 0;
      return;
    }

    // Ease the gloom in/out
    this.dim += (this.targetDim - this.dim) * Math.min(1, dt * 0.8);

    // Fallback cycle when the real sky is unreachable
    if (this.usingFallback) {
      this.cycleTimer += dt;
      if (this.cycleTimer > 180) {
        this.cycleTimer = 0;
        const month = new Date().getMonth();
        const winter = month === 11 || month === 0 || month === 1;
        const pool: WeatherKind[] = winter
          ? ['clear', 'cloudy', 'snow', 'clear']
          : ['clear', 'clear', 'cloudy', 'rain'];
        this.setKind(pool[Math.floor(Math.random() * pool.length)]);
      }
    }

    // Particles
    const active = this.rain.visible ? this.rain : this.snow.visible ? this.snow : null;
    if (active) {
      const speed = active === this.rain ? 22 : 3.2;
      const t = performance.now() / 1000;
      for (let i = 0; i < DROPS; i++) {
        let y = this.drops[i * 3 + 1] - speed * dt;
        if (y < 0) y += CEIL;
        this.drops[i * 3 + 1] = y;
        const sway = active === this.snow ? Math.sin(t * 1.4 + i) * 0.5 : 0;
        this.dummy.position.set(px + this.drops[i * 3] + sway, y, pz + this.drops[i * 3 + 2]);
        this.dummy.updateMatrix();
        active.setMatrixAt(i, this.dummy.matrix);
      }
      active.instanceMatrix.needsUpdate = true;
    }

    // Clouds drift east, gray over with the weather, and darken with the
    // sky at night (a bright Lambert slab against a night sky reads as a
    // rendering glitch, not a cloud).
    for (const c of this.clouds) {
      c.group.position.x += c.speed * dt;
      if (c.group.position.x > 140) c.group.position.x = -140;
    }
    this.cloudMat.color
      .lerpColors(CLOUD_WHITE, CLOUD_GRAY, this.dim)
      .multiplyScalar(0.18 + daylight * 0.82);
  }
}

const CLOUD_WHITE = new THREE.Color('#e9edf3');
const CLOUD_GRAY = new THREE.Color('#7d8694');

function codeToKind(code: number): WeatherKind {
  if (code <= 1) return 'clear';
  if (code <= 3 || code === 45 || code === 48) return 'cloudy';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  return 'rain';
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
