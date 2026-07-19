import * as THREE from 'three';

/**
 * Shared environment uniforms — the single clock every custom shader in the
 * world reads from. World updates these once per frame; water, grass, trees,
 * clouds, sky, and the cel materials all reference the same objects, so
 * wind, sun, fog, and time can never drift apart between systems.
 */
export const ENV = {
  /** Elapsed seconds. */
  time: { value: 0 },
  /** Normalized wind direction on the ground plane. */
  windDir: { value: new THREE.Vector2(0.85, 0.35).normalize() },
  /** 0..~1.5 wind strength; weather raises it. */
  windStrength: { value: 1 },
  /** World-space direction TOWARD the sun (or moon at night). */
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  sunColor: { value: new THREE.Color('#fff2dc') },
  ambientColor: { value: new THREE.Color('#8d86b8') },
  fogColor: { value: new THREE.Color('#3a3f63') },
  skyZenith: { value: new THREE.Color('#6f93c9') },
  skyHorizon: { value: new THREE.Color('#8299bd') },
  /** 0 = midnight, 1 = full daylight (smoothed sun elevation). */
  daylight: { value: 1 },
  /** 0..1 weather gloom. */
  gloom: { value: 0 },
  /** Tint multiplied into shadowed cel bands so shadows stay colored. */
  shadowTint: { value: new THREE.Color('#5a5f8a') },
};

/**
 * Optional time-of-day override (0..1 day fraction) used by tests and visual
 * review; null keeps the live Seoul clock.
 */
export let timeOverride: number | null = null;
export function setTimeOverride(frac: number | null): void {
  timeOverride = frac;
}
