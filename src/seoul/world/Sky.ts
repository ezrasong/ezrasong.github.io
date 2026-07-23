import * as THREE from 'three';
import { ENV } from './Env';

/**
 * Stylized sky dome: a vertical zenith→horizon gradient, a warm directional
 * glow around the sun, and a haze band that melts into the scene fog so the
 * world's edge dissolves instead of meeting a flat backdrop. All colors are
 * live ENV uniforms driven by the day/night cycle and weather.
 */
export function createSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(430, 32, 18);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: ENV.skyZenith,
      uHorizon: ENV.skyHorizon,
      uFog: ENV.fogColor,
      uSunDir: ENV.sunDir,
      uSunColor: ENV.sunColor,
      uDaylight: ENV.daylight,
      uGloom: ENV.gloom,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize( position );
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        // Pin to the far plane so the dome never clips.
        gl_Position.z = gl_Position.w * 0.9999;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uFog;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uDaylight;
      uniform float uGloom;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize( vDir );
        float h = clamp( dir.y, 0.0, 1.0 );
        // Zenith→horizon gradient with a slow falloff.
        vec3 sky = mix( uHorizon, uZenith, pow( h, 0.62 ) );
        // Haze: below and just above the horizon, melt into the fog color.
        float haze = 1.0 - smoothstep( 0.0, 0.22, dir.y );
        sky = mix( sky, uFog, haze );
        // Directional sun glow, tightest at high daylight, warm at dusk.
        float sunAmount = clamp( dot( dir, normalize( uSunDir ) ), 0.0, 1.0 );
        float glow = pow( sunAmount, 18.0 ) * 0.5 + pow( sunAmount, 90.0 ) * 0.6;
        sky += uSunColor * glow * ( 0.35 + 0.65 * uDaylight ) * ( 1.0 - uGloom * 0.85 );
        gl_FragColor = vec4( sky, 1.0 );
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
