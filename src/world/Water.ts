import * as THREE from 'three';
import { ENV } from './Env';
import { PALETTE as P } from '../config/palette';
import { WATER_Y } from './Terrain';

/**
 * The Han River, as one custom shader:
 *
 *  - three overlapping wave trains displace the surface in the vertex stage
 *  - color grades from shallow teal at the banks to deep blue mid-channel
 *  - foam builds along both shorelines (the same analytic curves the
 *    terrain and painted ground use, evaluated in GLSL) and around bridge
 *    piers, and breathes with the waves
 *  - specular is quantized into cel bands and follows the live sun/moon
 *  - a fresnel term blends toward the sky colors so the surface reads the
 *    day cycle; everything dims with ENV.daylight and weather gloom
 *  - the plane runs far past the playable edge and dissolves into scene fog
 *
 * The whole river is one draw call and the CPU never touches vertices.
 */
export function createWater(quality: { reflections: boolean } = { reflections: true }): {
  object: THREE.Object3D;
  material: THREE.ShaderMaterial;
} {
  // Fine grid where the player sees it, sparse far away: three merged strips
  // would complicate UVs — a single 480×30 plane with 220×18 segments is
  // ~4k verts, fine for the vertex stage.
  const geo = new THREE.PlaneGeometry(480, 31, 220, 18);
  geo.rotateX(-Math.PI / 2);

  // Bridge piers + pier posts that should churn foam (world x,z).
  const foamPoints = [
    new THREE.Vector2(0, 22), new THREE.Vector2(0, 32), new THREE.Vector2(0, 42),
    new THREE.Vector2(-48, 22), new THREE.Vector2(-48, 32), new THREE.Vector2(-48, 42),
    new THREE.Vector2(14, 25), new THREE.Vector2(14, 29.4),
  ];

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: {
      uTime: ENV.time,
      uSunDir: ENV.sunDir,
      uSunColor: ENV.sunColor,
      uDaylight: ENV.daylight,
      uGloom: ENV.gloom,
      uSkyZenith: ENV.skyZenith,
      uSkyHorizon: ENV.skyHorizon,
      uDeep: { value: new THREE.Color(P.waterDeep) },
      uShallow: { value: new THREE.Color(P.waterShallow) },
      uFoam: { value: new THREE.Color(P.foam) },
      uFoamPoints: { value: foamPoints },
      uReflect: { value: quality.reflections ? 1 : 0 },
      fogColor: { value: new THREE.Color() }, // linked by onBeforeRender
      fogNear: { value: 55 },
      fogFar: { value: 260 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      varying float vWave;

      float waveHeight(vec2 p, float t) {
        float h = sin(p.x * 0.16 - t * 1.15) * 0.10;
        h += sin(p.x * 0.31 + p.y * 0.24 - t * 0.72) * 0.064;
        h += sin(p.y * 0.55 + t * 1.5 + p.x * 0.05) * 0.036;
        return h;
      }

      float shoreN(float x) { return 21.8 + 1.2 * sin(x * 0.045 + 1.7) + 0.6 * sin(x * 0.11 + 0.4); }
      float shoreS(float x) { return 46.4 + 1.2 * sin(x * 0.05 + 3.9) + 0.6 * sin(x * 0.13 + 2.1); }

      void main() {
        vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
        float n = shoreN(wp.x);
        float s = shoreS(wp.x);
        // Waves calm toward both banks so the foam line stays believable.
        float shoreFade = smoothstep(0.0, 4.5, wp.z - n) * smoothstep(0.0, 4.5, s - wp.z);
        float h = waveHeight(wp.xz, uTime) * max(shoreFade, 0.12);
        wp.y += h;
        vWave = h;
        vWorld = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uDaylight;
      uniform float uGloom;
      uniform vec3 uSkyZenith;
      uniform vec3 uSkyHorizon;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uFoam;
      uniform vec2 uFoamPoints[8];
      uniform float uReflect;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      varying vec3 vWorld;
      varying float vWave;

      float shoreN(float x) { return 21.8 + 1.2 * sin(x * 0.045 + 1.7) + 0.6 * sin(x * 0.11 + 0.4); }
      float shoreS(float x) { return 46.4 + 1.2 * sin(x * 0.05 + 3.9) + 0.6 * sin(x * 0.13 + 2.1); }

      float waveHeight(vec2 p, float t) {
        float h = sin(p.x * 0.16 - t * 1.15) * 0.10;
        h += sin(p.x * 0.31 + p.y * 0.24 - t * 0.72) * 0.064;
        h += sin(p.y * 0.55 + t * 1.5 + p.x * 0.05) * 0.036;
        return h;
      }

      // Cheap scrolling ripple noise for sparkle + foam breakup.
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u2 = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), u2.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u2.x), u2.y);
      }

      void main() {
        vec2 p = vWorld.xz;
        float n = shoreN(p.x);
        float s = shoreS(p.x);
        float distShore = min(p.y - n, s - p.y);

        // Outside the channel: fully transparent (organic waterline).
        if (distShore < -0.4) discard;

        // Analytic normal from wave-height derivatives.
        float e = 0.35;
        float hC = waveHeight(p, uTime);
        float hX = waveHeight(p + vec2(e, 0.0), uTime);
        float hZ = waveHeight(p + vec2(0.0, e), uTime);
        vec3 normal = normalize(vec3(hC - hX, e * 2.0, hC - hZ));

        // Depth grading: teal at the banks, deep mid-channel.
        float depthFac = smoothstep(0.0, 7.0, distShore);
        vec3 base = mix(uShallow, uDeep, depthFac);

        // Downstream flow streaks (the Han flows west→east here).
        float flow = noise(vec2(p.x * 0.25 - uTime * 0.55, p.y * 0.6));
        base *= 0.94 + flow * 0.12;

        // Day cycle: the water carries the sky's brightness.
        float lightAmt = 0.28 + uDaylight * 0.72;
        base *= lightAmt * (1.0 - uGloom * 0.25);

        // Fresnel toward the sky color (approximate reflection).
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(dot(viewDir, normal), 0.0, 1.0), 3.0);
        vec3 skyRef = mix(uSkyHorizon, uSkyZenith, 0.35) * lightAmt;
        base = mix(base, skyRef, fres * (0.22 + 0.28 * uReflect));

        // Cel-banded sun glint along the light path.
        vec3 sunRef = reflect(-normalize(uSunDir), normal);
        float spec = clamp(dot(sunRef, viewDir), 0.0, 1.0);
        float glint = smoothstep(0.965, 0.975, spec) * 0.55 + smoothstep(0.997, 0.998, spec) * 0.45;
        base += uSunColor * glint * (0.35 + 0.65 * uDaylight) * (1.0 - uGloom * 0.7);

        // Sparkle from ripple noise crests.
        float sparkle = smoothstep(0.78, 0.95, noise(p * 1.7 + vec2(uTime * 0.4, -uTime * 0.3)));
        base += uSunColor * sparkle * 0.05 * uDaylight;

        // Shoreline + pier foam: a breathing band with noisy edges.
        float foamBand = 1.0 - smoothstep(0.0, 1.1 + 0.45 * sin(uTime * 0.8 + p.x * 0.25), distShore);
        float pierFoam = 0.0;
        for (int i = 0; i < 8; i++) {
          float d = distance(p, uFoamPoints[i]);
          pierFoam = max(pierFoam, 1.0 - smoothstep(1.2, 2.6, d));
        }
        float foamNoise = noise(p * 2.4 + vec2(uTime * 0.5, uTime * 0.22));
        float foam = clamp(max(foamBand, pierFoam * 0.9) * (0.35 + foamNoise * 0.75), 0.0, 1.0);
        foam *= 0.5 + 0.5 * lightAmt;
        base = mix(base, uFoam * lightAmt, foam * 0.7);

        // Edge fade: dissolve the last 40cm so the waterline never cuts hard.
        float alpha = 0.88 * smoothstep(-0.4, 0.6, distShore) + foam * 0.12;

        // Fog — same equation as the scene fog.
        float fogDepth = length(vWorld - cameraPosition);
        float fogFactor = smoothstep(fogNear, fogFar, fogDepth);
        vec3 color = mix(base, fogColor, fogFactor);

        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(0, WATER_Y, 34);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  return { object: mesh, material };
}
