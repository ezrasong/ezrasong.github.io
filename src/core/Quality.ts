import type { QualityLevel } from '../types';

export interface QualityPreset {
  level: QualityLevel;
  label: string;
  pixelRatioCap: number;
  shadows: boolean;
  shadowMapSize: number;
  fogFar: number;
}

const PRESETS: Record<QualityLevel, QualityPreset> = {
  low: { level: 'low', label: '낮음 LOW', pixelRatioCap: 1, shadows: false, shadowMapSize: 512, fogFar: 130 },
  medium: { level: 'medium', label: '중간 MED', pixelRatioCap: 1.5, shadows: true, shadowMapSize: 1024, fogFar: 170 },
  high: { level: 'high', label: '높음 HIGH', pixelRatioCap: 2, shadows: true, shadowMapSize: 2048, fogFar: 210 },
};

const STORAGE_KEY = 'voxel-seoul-quality';
const ORDER: QualityLevel[] = ['low', 'medium', 'high'];

/** Quality presets, persisted. Defaults low on coarse-pointer devices. */
export class Quality {
  current: QualityPreset;
  private callbacks: ((p: QualityPreset) => void)[] = [];

  constructor() {
    const stored = localStorage.getItem(STORAGE_KEY) as QualityLevel | null;
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const fallback: QualityLevel = isMobile ? 'low' : 'high';
    this.current = PRESETS[stored && PRESETS[stored] ? stored : fallback];
  }

  cycle(): QualityPreset {
    const idx = ORDER.indexOf(this.current.level);
    this.current = PRESETS[ORDER[(idx + 1) % ORDER.length]];
    localStorage.setItem(STORAGE_KEY, this.current.level);
    for (const cb of this.callbacks) cb(this.current);
    return this.current;
  }

  onChange(cb: (p: QualityPreset) => void): void {
    this.callbacks.push(cb);
  }
}
