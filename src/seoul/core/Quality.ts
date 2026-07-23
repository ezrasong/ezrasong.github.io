import type * as THREE from 'three';
import type { QualityLevel } from '../types';

export interface QualityPreset {
  level: QualityLevel;
  label: string;
  pixelRatioCap: number;
  shadows: boolean;
  shadowMapSize: number;
  fogFar: number;
  /** 0..1 fraction of grass/reed instances rendered. */
  grassDensity: number;
  /** Cloud cluster count. */
  clouds: number;
  /** Stylized water sky-reflection strength on/off. */
  waterReflections: boolean;
  /** Weather system (rain/snow particles, clouds, gloom) on/off. */
  weather: boolean;
}

const PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    level: 'low', label: '낮음 LOW', pixelRatioCap: 1, shadows: false, shadowMapSize: 512,
    fogFar: 150, grassDensity: 0.3, clouds: 5, waterReflections: false, weather: false,
  },
  medium: {
    level: 'medium', label: '중간 MED', pixelRatioCap: 1.5, shadows: true, shadowMapSize: 1024,
    fogFar: 200, grassDensity: 0.65, clouds: 8, waterReflections: true, weather: true,
  },
  high: {
    level: 'high', label: '높음 HIGH', pixelRatioCap: 2, shadows: true, shadowMapSize: 2048,
    fogFar: 260, grassDensity: 1, clouds: 11, waterReflections: true, weather: true,
  },
};

const STORAGE_KEY = 'voxel-seoul-quality';
const USER_KEY = 'voxel-seoul-quality-user';
const ORDER: QualityLevel[] = ['low', 'medium', 'high'];

/**
 * Quality presets. On first visit the level is auto-chosen from the device
 * (coarse pointer -> low) and refined by GPU hints; the frame loop can then
 * step it down further if real FPS stays low. Once the visitor picks a level
 * by hand it is persisted and never auto-adjusted again.
 */
export class Quality {
  current: QualityPreset;
  /** True when the visitor chose the level by hand: disables all auto-tuning. */
  userSet: boolean;
  private callbacks: ((p: QualityPreset) => void)[] = [];

  constructor() {
    const stored = localStorage.getItem(STORAGE_KEY) as QualityLevel | null;
    this.userSet = localStorage.getItem(USER_KEY) === '1' && !!(stored && PRESETS[stored]);
    if (this.userSet && stored) {
      this.current = PRESETS[stored];
    } else {
      const isMobile = window.matchMedia('(pointer: coarse)').matches;
      this.current = PRESETS[isMobile ? 'low' : 'high'];
    }
  }

  /**
   * Refine the auto default from GPU hints before the first frame. Software
   * renderers (hardware acceleration off, remote desktops, VMs) report names
   * like SwiftShader / llvmpipe / "Microsoft Basic Render" and cannot sustain
   * shadows or a 2x pixel ratio, so they start at low. No-op once user-set.
   */
  applyDeviceHints(renderer: THREE.WebGLRenderer): void {
    if (this.userSet) return;
    let name = '';
    try {
      const gl = renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) name = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).toLowerCase();
    } catch {
      /* debug info blocked (privacy mode) — leave the device default */
    }
    if (/swiftshader|llvmpipe|softpipe|software|microsoft basic|basic render|mesa offscreen|angle \(software/.test(name)) {
      this.setAuto('low');
    }
  }

  cycle(): QualityPreset {
    const idx = ORDER.indexOf(this.current.level);
    this.current = PRESETS[ORDER[(idx + 1) % ORDER.length]];
    this.userSet = true;
    localStorage.setItem(STORAGE_KEY, this.current.level);
    localStorage.setItem(USER_KEY, '1');
    for (const cb of this.callbacks) cb(this.current);
    return this.current;
  }

  /** Set the level automatically (device hint / adaptive). Not persisted and
   *  does not mark the level as user-chosen. Returns true if it changed. */
  setAuto(level: QualityLevel): boolean {
    if (this.current.level === level) return false;
    this.current = PRESETS[level];
    for (const cb of this.callbacks) cb(this.current);
    return true;
  }

  /** Step one level down for adaptive performance. Returns true if it moved. */
  stepDown(): boolean {
    const idx = ORDER.indexOf(this.current.level);
    if (idx <= 0) return false;
    return this.setAuto(ORDER[idx - 1]);
  }

  onChange(cb: (p: QualityPreset) => void): void {
    this.callbacks.push(cb);
  }
}
