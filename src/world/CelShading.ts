import * as THREE from 'three';
import { ENV } from './Env';

/**
 * The cel-shading system for the whole world.
 *
 * Materials are MeshToonMaterial at the core — quantized diffuse bands via a
 * generated gradient ramp — but every material is patched with a shared
 * shader block that adds what stock toon shading lacks:
 *
 *  - tinted shadows (dark bands pull toward ENV.shadowTint, never black)
 *  - optional rim light facing away from the view (reads the live sun color)
 *  - optional fresnel lift for glassy surfaces
 *
 * Each material category picks a PROFILE: how many bands, how soft the
 * transitions are, how deep shadows sit, and how much rim/fresnel it gets.
 * All patched uniforms reference the shared ENV objects, so day/night and
 * weather changes flow into every surface automatically.
 */

export type CelProfileName =
  | 'concrete' // broad soft bands — buildings, roads, most matte surfaces
  | 'ground' // terrain: soft two-and-a-half bands, shallow shadow floor
  | 'foliage' // bright, few bands, gentle rim — leaves and grass tops
  | 'metal' // tighter bands with a sharper top step — poles, roofs, cars
  | 'character' // very soft bands + warm rim for the poro
  | 'glass'; // soft bands + fresnel lift

interface CelProfile {
  bands: number;
  /** 0..1 width of the smooth transition between bands. */
  softness: number;
  /** Darkest band brightness — the shadow floor (never 0). */
  floor: number;
  rim: number;
  rimPower: number;
  fresnel: number;
  /** How strongly dark bands pull toward ENV.shadowTint. */
  shadowTintAmount: number;
  /**
   * World-anchored albedo grain (±fraction). Breaks up flat single-color
   * faces into subtle material variation — concrete pitting, brick tone
   * shifts — without any real textures.
   */
  grain: number;
}

const PROFILES: Record<CelProfileName, CelProfile> = {
  concrete: { bands: 3, softness: 0.10, floor: 0.46, rim: 0.0, rimPower: 3, fresnel: 0, shadowTintAmount: 0.5, grain: 0.11 },
  ground: { bands: 3, softness: 0.22, floor: 0.52, rim: 0.0, rimPower: 3, fresnel: 0, shadowTintAmount: 0.42, grain: 0.07 },
  foliage: { bands: 2, softness: 0.24, floor: 0.55, rim: 0.14, rimPower: 2.6, fresnel: 0, shadowTintAmount: 0.4, grain: 0.12 },
  metal: { bands: 4, softness: 0.05, floor: 0.38, rim: 0.10, rimPower: 3.4, fresnel: 0, shadowTintAmount: 0.55, grain: 0.06 },
  character: { bands: 4, softness: 0.30, floor: 0.55, rim: 0.32, rimPower: 2.4, fresnel: 0, shadowTintAmount: 0.35, grain: 0 },
  glass: { bands: 3, softness: 0.14, floor: 0.5, rim: 0.12, rimPower: 3, fresnel: 0.22, shadowTintAmount: 0.45, grain: 0.05 },
};

/** Gradient ramps are shared: one texture per profile, generated once. */
const rampCache = new Map<string, THREE.DataTexture>();

function rampFor(profile: CelProfile): THREE.DataTexture {
  const key = `${profile.bands}|${profile.softness}|${profile.floor}`;
  const cached = rampCache.get(key);
  if (cached) return cached;

  const size = 256;
  const data = new Uint8Array(size * 4);
  const { bands, softness, floor } = profile;
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    // Which band are we in, and how far through the step transition?
    const scaled = t * bands;
    const idx = Math.min(bands - 1, Math.floor(scaled));
    const frac = scaled - idx;
    // Smooth only near the band boundary; the plateau stays flat.
    const rise = smoothstep(1 - softness, 1, frac);
    const level = (idx + rise) / (bands - 1 + 1e-6);
    const v = Math.round((floor + (1 - floor) * Math.min(1, level)) * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  rampCache.set(key, tex);
  return tex;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export interface CelOptions {
  profile?: CelProfileName;
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  vertexColors?: boolean;
  transparent?: boolean;
  opacity?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  /** Override the profile's rim strength (e.g. quality settings). */
  rim?: number;
}

/**
 * A cel-shaded material for the given profile. All instances share ramp
 * textures and read the live ENV uniforms.
 */
export function celMaterial(opts: CelOptions = {}): THREE.MeshToonMaterial {
  const profile = PROFILES[opts.profile ?? 'concrete'];
  const mat = new THREE.MeshToonMaterial({
    color: opts.color ?? '#ffffff',
    map: opts.map ?? null,
    gradientMap: rampFor(profile),
    vertexColors: opts.vertexColors ?? false,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    emissive: opts.emissive ?? '#000000',
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
  patchCel(mat, profile, opts.rim);
  return mat;
}

/**
 * Patches any built-in material with the shared cel finishing pass (shadow
 * tint + rim + fresnel). Used directly on the poro's converted materials.
 */
export function patchCel(
  mat: THREE.Material,
  profileOrName: CelProfile | CelProfileName,
  rimOverride?: number
): void {
  const profile = typeof profileOrName === 'string' ? PROFILES[profileOrName] : profileOrName;
  const rim = rimOverride ?? profile.rim;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = ENV.sunDir;
    shader.uniforms.uSunColor = ENV.sunColor;
    shader.uniforms.uShadowTint = ENV.shadowTint;
    shader.uniforms.uDaylight = ENV.daylight;
    shader.uniforms.uRim = { value: rim };
    shader.uniforms.uFresnel = { value: profile.fresnel };
    shader.uniforms.uShadowTintAmt = { value: profile.shadowTintAmount };
    shader.uniforms.uGrain = { value: profile.grain };

    if (profile.grain > 0) {
      // World-position varying for the albedo grain (instance-aware; kept
      // additive after project_vertex so addWindSway's replacement of that
      // include still composes).
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vGrainW;`
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          {
            vec4 grainP = vec4( transformed, 1.0 );
            #ifdef USE_INSTANCING
            grainP = instanceMatrix * grainP;
            #endif
            vGrainW = ( modelMatrix * grainP ).xyz;
          }`
        );
    }

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uShadowTint;
        uniform float uDaylight;
        uniform float uRim;
        uniform float uFresnel;
        uniform float uShadowTintAmt;
        uniform float uGrain;
        ${profile.grain > 0
          ? `varying vec3 vGrainW;
        float celGrainHash( vec2 q ) { return fract( sin( dot( q, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
        float celGrainNoise( vec2 q ) {
          vec2 i = floor( q );
          vec2 f = fract( q );
          vec2 u2 = f * f * ( 3.0 - 2.0 * f );
          return mix(
            mix( celGrainHash( i ), celGrainHash( i + vec2( 1.0, 0.0 ) ), u2.x ),
            mix( celGrainHash( i + vec2( 0.0, 1.0 ) ), celGrainHash( i + vec2( 1.0, 1.0 ) ), u2.x ),
            u2.y );
        }`
          : ''}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        ${profile.grain > 0
          ? `{
          // Slanted projection so vertical walls vary along their height and
          // horizontal surfaces vary across their extent.
          vec2 grainQ = vec2( vGrainW.x + vGrainW.y * 0.71, vGrainW.z - vGrainW.y * 0.53 );
          float celGrain = celGrainNoise( grainQ * 0.55 ) * 0.55 + celGrainNoise( grainQ * 2.6 ) * 0.45;
          diffuseColor.rgb *= 1.0 + ( celGrain - 0.5 ) * uGrain * 2.0;
        }`
          : ''}`
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 celNormal = normalize( normal );
          vec3 celView = normalize( vViewPosition );
          float celFacing = clamp( dot( celNormal, celView ), 0.0, 1.0 );
          float celEdge = pow( 1.0 - celFacing, uRim > 0.0 ? 2.4 : 3.0 );
          // Rim: strongest on the sun-facing side, warm, fades at night.
          if ( uRim > 0.0 ) {
            vec3 sunView = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
            float sunSide = clamp( dot( celNormal, sunView ) * 0.5 + 0.5, 0.0, 1.0 );
            outgoingLight += uSunColor * ( uRim * celEdge * sunSide * ( 0.25 + 0.75 * uDaylight ) );
          }
          // Fresnel lift for glassy profiles: cool sky tint at grazing angles.
          if ( uFresnel > 0.0 ) {
            outgoingLight += uShadowTint * ( uFresnel * celEdge );
          }
          // Tinted shadows: dark bands drift toward the atmosphere tint.
          float celLum = dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) );
          float celShade = 1.0 - smoothstep( 0.04, 0.62, celLum );
          outgoingLight = mix( outgoingLight, outgoingLight * uShadowTint * 2.0, celShade * uShadowTintAmt * 0.5 );
        }
        #include <opaque_fragment>`
      );
  };
  // Distinct programs per profile+rim combination.
  mat.customProgramCacheKey = () =>
    `cel|${profile.bands}|${profile.softness}|${profile.floor}|${rim}|${profile.fresnel}|${profile.shadowTintAmount}|${profile.grain}`;
}

/**
 * Adds wind sway to a material's vertex stage (canopies, reeds). Vertices
 * above `y0` (object space) sway with strength ramping to full at `y1`.
 * Works with instancing — the phase is seeded from world position.
 */
export function addWindSway(
  mat: THREE.Material,
  amp: number,
  freq: number,
  y0: number,
  y1: number
): void {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.uniforms.uTime = ENV.time;
    shader.uniforms.uWindDir = ENV.windDir;
    shader.uniforms.uWindStrength = ENV.windStrength;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec2 uWindDir;
        uniform float uWindStrength;`
      )
      .replace(
        '#include <project_vertex>',
        `vec4 swayPos = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
        swayPos = instanceMatrix * swayPos;
        #endif
        {
          vec3 swayWorld = ( modelMatrix * swayPos ).xyz;
          float swayPhase = uTime * ${freq.toFixed(3)} + swayWorld.x * 0.21 + swayWorld.z * 0.17;
          float swayW = smoothstep( ${y0.toFixed(3)}, ${y1.toFixed(3)}, transformed.y );
          float sway = ( sin( swayPhase ) + 0.45 * sin( swayPhase * 2.33 ) ) * ${amp.toFixed(4)} * uWindStrength * swayW;
          swayPos.xyz += vec3( uWindDir.x, 0.0, uWindDir.y ) * sway;
        }
        vec4 mvPosition = modelViewMatrix * swayPos;
        gl_Position = projectionMatrix * mvPosition;`
      );
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}|sway${amp}|${freq}|${y0}|${y1}`;
}

/**
 * Shared world materials, cel-shaded — the drop-in successors of the old
 * Lambert MATERIALS in voxel.ts.
 */
export const CEL = {
  lit: celMaterial({ profile: 'concrete', vertexColors: true }),
  litMetal: celMaterial({ profile: 'metal', vertexColors: true }),
  foliage: celMaterial({ profile: 'foliage', vertexColors: true }),
};
