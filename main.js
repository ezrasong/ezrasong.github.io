(function init() {
  if (!window.THREE) {
    console.error("Three.js is not available. Ensure the CDN script is loaded before main.js.");
    return;
  }

  const THREE = window.THREE;
  const {
    bubbleProjects = [],
    profileLinks = {},
    stats = [],
    skills = [],
    experiences = [],
    featuredProjects = [],
    extracurriculars = [],
    education = {},
  } = window.SITE_DATA || {};

  const canvas = document.getElementById("scene-canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x110d0a, 0.08);

const camera = new THREE.PerspectiveCamera(
  48,
  window.innerWidth / window.innerHeight,
  0.1,
  80
);
camera.position.set(0.2, 0.9, 6.4);
const orbitState = {
  azimuth: 0,
  polar: 1.05,
  radius: 6.3,
  minPolar: 0.35,
  maxPolar: 1.4,
  minRadius: 4.2,
  maxRadius: 14,
};
const orbitPointer = { x: 0, y: 0, azimuth: 0, polar: 0 };
let orbiting = false;
const orbitPosition = new THREE.Vector3();
const orbitKeys = {
  left: false,
  right: false,
  up: false,
  down: false,
  zoomIn: false,
  zoomOut: false,
};

  const noiseGLSL = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 =   v - i + dot(i, C.xxx) ;
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute( permute( permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1),
                            dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                  dot(p2,x2), dot(p3,x3) ) );
  }
  `;

  const bubbleVertexShader = `
  precision mediump float;
  uniform float uTime;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  ${noiseGLSL}
  void main() {
    float wobble = snoise(normal * 4.0 + uTime * 0.35);
    vec3 displacedPosition = position + normal * wobble * 0.08;
    vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
  `;

  const bubbleFragmentShader = `
  precision mediump float;
  uniform vec3 uTint;
  uniform vec3 uCameraPosition;
  uniform float uTime;
  uniform sampler2D uPreviewMap;
  uniform float uHasPreview;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  ${noiseGLSL}
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.3);
    float swirl = snoise(normal * 2.2 + uTime * 0.2);
    vec3 tint = mix(vec3(0.15, 0.18, 0.24), uTint, 0.45 + swirl * 0.18);
    vec3 dispersion = vec3(
      0.82 + 0.12 * sin(uTime * 0.45 + vWorldPosition.x * 3.0),
      0.86 + 0.12 * cos(uTime * 0.35 + vWorldPosition.y * 2.4),
      0.78 + 0.12 * sin(uTime * 0.28 + vWorldPosition.z * 2.0)
    );
    float thinFilm = sin((normal.x + normal.y + normal.z + uTime * 0.4) * 4.0);
    vec3 filmColor = vec3(
      0.95 + 0.2 * sin(thinFilm + 0.0),
      0.88 + 0.2 * sin(thinFilm + 1.7),
      0.8 + 0.2 * sin(thinFilm + 3.2)
    );
    vec3 color = tint + dispersion * 0.18;
    color = mix(color, filmColor, fresnel * 0.6);
    if (uHasPreview > 0.5) {
      vec3 sampleNormal = normalize(mix(normal, viewDir, 0.1));
      vec2 previewUV = vec2(
        atan(sampleNormal.z, sampleNormal.x) / (6.28318) + 0.5,
        sampleNormal.y * 0.5 + 0.5
      );
      previewUV += swirl * 0.025;
      vec3 preview = texture2D(uPreviewMap, previewUV).rgb;
      float previewBlend = clamp(0.55 + fresnel * 0.45, 0.55, 0.98);
      color = mix(color, preview, previewBlend);
      color += preview * 0.22;
    }
    color += vec3(1.05, 1.0, 0.85) * fresnel * 0.3;
    float alpha = clamp(0.12 + fresnel * 0.45, 0.12, 0.65);
    gl_FragColor = vec4(color, alpha);
  }
  `;

  const liquidVertexShader = `
  precision mediump float;
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
  `;

  const liquidFragmentShader = `
  precision mediump float;
  uniform vec3 uTint;
  uniform float uTime;
  uniform sampler2D uPreviewMap;
  uniform float uHasPreview;
  varying vec3 vWorldPosition;
  ${noiseGLSL}
  void main() {
    float n = snoise(vWorldPosition * 1.4 + uTime * 0.3);
    float ripple = snoise(vWorldPosition * 2.6 - uTime * 0.55);
    float brightness = smoothstep(0.0, 1.0, n * 0.5 + 0.5);
    vec3 base = mix(uTint * 0.4, uTint, brightness);
    base += vec3(0.22, 0.18, 0.1) * ripple * 0.35;
    if (uHasPreview > 0.5) {
      vec3 normal = normalize(vWorldPosition);
      vec2 previewUV = vec2(
        atan(normal.z, normal.x) / (6.28318) + 0.5,
        normal.y * 0.5 + 0.5
      );
      previewUV += ripple * 0.02;
      vec3 preview = texture2D(uPreviewMap, previewUV).rgb;
      base = mix(base, preview, 0.35);
    }
    float alpha = 0.35 + brightness * 0.2;
    gl_FragColor = vec4(base, alpha);
  }
  `;

  function createBubbleMaterial(tint, previewTexture) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTint: { value: tint },
        uCameraPosition: { value: camera.position.clone() },
        uTime: { value: 0 },
        uPreviewMap: { value: previewTexture },
        uHasPreview: { value: previewTexture ? 1 : 0 },
      },
      vertexShader: bubbleVertexShader,
      fragmentShader: bubbleFragmentShader,
    });
  }

  function createLiquidMaterial(tint, previewTexture) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTint: { value: tint },
        uTime: { value: 0 },
        uPreviewMap: { value: previewTexture },
        uHasPreview: { value: previewTexture ? 1 : 0 },
      },
      vertexShader: liquidVertexShader,
      fragmentShader: liquidFragmentShader,
    });
  }

  const textureLoader = new THREE.TextureLoader();
  const previewTextureCache = new Map();
  const collisionVec = new THREE.Vector3();
  const bubbleRegistry = [];

  function getTexture(url) {
    if (!url) return null;
    if (previewTextureCache.has(url)) return previewTextureCache.get(url);
    const texture = textureLoader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
      tex.needsUpdate = true;
    });
    previewTextureCache.set(url, texture);
    return texture;
  }

const hemi = new THREE.HemisphereLight(0xf9f0de, 0x050403, 0.7);
scene.add(hemi);
const rimLight = new THREE.PointLight(0xffd6a3, 1.2, 25, 2);
rimLight.position.set(-5, 3.5, 2);
scene.add(rimLight);
const fillLight = new THREE.PointLight(0xf3e7d3, 0.9, 20, 2);
fillLight.position.set(4, -2, 3);
scene.add(fillLight);
const ambient = new THREE.AmbientLight(0x1a1410, 0.35);
scene.add(ambient);
const spot = new THREE.SpotLight(0xffe4be, 0.8, 20, Math.PI / 6, 0.4, 1.5);
spot.position.set(2, 5, 5);
scene.add(spot);

const lightingPalettes = [
  {
    name: "dawn",
    range: [5, 9],
    fog: 0x0c1a2e,
    fogDensity: 0.065,
    hemiSky: 0xe2f4ff,
    hemiGround: 0x040610,
    rim: 0xa7ddff,
    fill: 0x64c9ff,
    ambient: 0x14243e,
    spot: 0xf7fdff,
    rimIntensity: 1.35,
    fillIntensity: 1,
    ambientIntensity: 0.55,
    spotIntensity: 1.15,
    rimPosition: [-5.2, 3.9, 2.8],
    fillPosition: [4.2, -1.4, 4.4],
    spotPosition: [1.2, 6.4, 4.8],
    tint: "#9fd4ff",
    tintStrength: 0.32,
    bubbleTint: "#92b9ff",
    exposure: 1.2,
    background: ["#020c1d", "#041731", "#030a1c"],
    flare: "rgba(155, 224, 255, 0.4)",
    flareSoft: "rgba(155, 224, 255, 0.2)",
    hero: {
      bg: "rgba(10, 20, 40, 0.32)",
      border: "rgba(157, 216, 255, 0.24)",
      shadow: "0 60px 130px rgba(4, 8, 24, 0.35)",
      highlight: "rgba(157, 216, 255, 0.28)",
    },
    surface: {
      bg: "rgba(7, 15, 32, 0.18)",
      border: "rgba(127, 198, 255, 0.2)",
      shadow: "0 48px 110px rgba(4, 8, 20, 0.28)",
      highlight: "rgba(140, 205, 255, 0.24)",
    },
  },
  {
    name: "day",
    range: [9, 17],
    fog: 0x071835,
    fogDensity: 0.055,
    hemiSky: 0xdff3ff,
    hemiGround: 0x03050c,
    rim: 0xbfe3ff,
    fill: 0x6ad5ff,
    ambient: 0x12233f,
    spot: 0xf2fbff,
    rimIntensity: 1.25,
    fillIntensity: 1.08,
    ambientIntensity: 0.58,
    spotIntensity: 1.35,
    rimPosition: [-4.4, 3.4, 2.4],
    fillPosition: [5.2, -1.2, 3.8],
    spotPosition: [1.9, 6.1, 5.4],
    tint: "#b6e1ff",
    tintStrength: 0.3,
    bubbleTint: "#a9c8ff",
    exposure: 1.35,
    background: ["#031433", "#051e4a", "#020a1f"],
    flare: "rgba(180, 232, 255, 0.45)",
    flareSoft: "rgba(180, 232, 255, 0.2)",
    hero: {
      bg: "rgba(9, 22, 42, 0.3)",
      border: "rgba(188, 228, 255, 0.22)",
      shadow: "0 60px 140px rgba(5, 10, 26, 0.38)",
      highlight: "rgba(200, 236, 255, 0.32)",
    },
    surface: {
      bg: "rgba(6, 16, 32, 0.16)",
      border: "rgba(168, 224, 255, 0.18)",
      shadow: "0 52px 120px rgba(5, 9, 22, 0.28)",
      highlight: "rgba(194, 236, 255, 0.24)",
      sheen: "rgba(198, 232, 255, 0.12)",
    },
  },
  {
    name: "dusk",
    range: [17, 21],
    fog: 0x081027,
    fogDensity: 0.085,
    hemiSky: 0xbad0ff,
    hemiGround: 0x030308,
    rim: 0x9fbefc,
    fill: 0x657dff,
    ambient: 0x101431,
    spot: 0xe1e5ff,
    rimIntensity: 1.55,
    fillIntensity: 0.92,
    ambientIntensity: 0.6,
    spotIntensity: 1.15,
    rimPosition: [-6.2, 3.4, 2.1],
    fillPosition: [3.8, -1.7, 4.3],
    spotPosition: [0.8, 5.3, 4.4],
    tint: "#99b2ff",
    tintStrength: 0.38,
    bubbleTint: "#92a5ff",
    exposure: 1.08,
    background: ["#050b1e", "#090e28", "#030614"],
    flare: "rgba(146, 182, 255, 0.45)",
    flareSoft: "rgba(146, 182, 255, 0.2)",
    hero: {
      bg: "rgba(8, 15, 30, 0.26)",
      border: "rgba(150, 176, 255, 0.24)",
      shadow: "0 65px 130px rgba(5, 6, 24, 0.36)",
      highlight: "rgba(150, 176, 255, 0.3)",
    },
    surface: {
      bg: "rgba(6, 11, 24, 0.14)",
      border: "rgba(134, 160, 255, 0.18)",
      shadow: "0 54px 115px rgba(5, 5, 18, 0.28)",
      highlight: "rgba(154, 176, 255, 0.24)",
    },
  },
  {
    name: "night",
    range: [21, 5],
    fog: 0x010414,
    fogDensity: 0.12,
    hemiSky: 0xb4c0ff,
    hemiGround: 0x020203,
    rim: 0x8fb1ff,
    fill: 0x4457ff,
    ambient: 0x060818,
    spot: 0xaecfff,
    rimIntensity: 1.25,
    fillIntensity: 0.55,
    ambientIntensity: 0.45,
    spotIntensity: 0.9,
    rimPosition: [-3.8, 3.6, 1.8],
    fillPosition: [4.8, -2.1, 4.4],
    spotPosition: [2.5, 4.6, 5.2],
    tint: "#8eb6ff",
    tintStrength: 0.48,
    bubbleTint: "#7a8eff",
    exposure: 0.88,
    background: ["#010414", "#03071c", "#000207"],
    flare: "rgba(166, 190, 255, 0.3)",
    flareSoft: "rgba(166, 190, 255, 0.16)",
    hero: {
      bg: "rgba(4, 7, 18, 0.22)",
      border: "rgba(158, 181, 255, 0.22)",
      shadow: "0 55px 140px rgba(1, 2, 6, 0.38)",
      highlight: "rgba(180, 200, 255, 0.2)",
    },
    surface: {
      bg: "rgba(3, 4, 10, 0.12)",
      border: "rgba(140, 166, 255, 0.18)",
      shadow: "0 52px 120px rgba(1, 2, 6, 0.3)",
      highlight: "rgba(180, 200, 255, 0.18)",
      sheen: "rgba(180, 200, 255, 0.08)",
    },
  },
];

const defaultBackgroundStops = ["#120e0a", "#1c1611", "#070604"];
const defaultHeroStyle = {
  bg: "rgba(22, 16, 12, 0.38)",
  border: "rgba(255, 238, 215, 0.14)",
  shadow: "0 45px 90px rgba(12, 8, 5, 0.4)",
  highlight: "rgba(255, 231, 205, 0.22)",
};
const defaultSurfaceStyle = {
  bg: defaultHeroStyle.bg,
  border: defaultHeroStyle.border,
  shadow: defaultHeroStyle.shadow,
  highlight: defaultHeroStyle.highlight,
  sheen: "rgba(255, 255, 245, 0.05)",
};

const lightingTargets = {
  fog: scene.fog.color.clone(),
  hemiSky: hemi.color.clone(),
  hemiGround: hemi.groundColor.clone(),
  rim: rimLight.color.clone(),
  fill: fillLight.color.clone(),
  ambient: ambient.color.clone(),
  spot: spot.color.clone(),
  rimIntensity: rimLight.intensity,
  fillIntensity: fillLight.intensity,
  ambientIntensity: ambient.intensity,
  spotIntensity: spot.intensity,
  rimPosition: rimLight.position.clone(),
  fillPosition: fillLight.position.clone(),
  spotPosition: spot.position.clone(),
};

const paletteTintColor = new THREE.Color("#9ecbff");
let paletteTintTarget = 0.25;
let paletteTintMix = 0.25;
let fogDensityTarget = scene.fog.density;
let exposureTarget = renderer.toneMappingExposure;
const rootStyle = typeof document !== "undefined" ? document.documentElement.style : null;
let activeLightingPalette = null;
let paletteInitialized = false;
const paletteCheckInterval = 45;
let paletteCheckTimer = paletteCheckInterval;

function applyPaletteCSS(palette) {
  if (!rootStyle) return;
  const bg = palette.background?.length === 3 ? palette.background : defaultBackgroundStops;
  rootStyle.setProperty("--background-top", bg[0]);
  rootStyle.setProperty("--background-mid", bg[1]);
  rootStyle.setProperty("--background-bottom", bg[2]);
  const hero = { ...defaultHeroStyle, ...(palette.hero || {}) };
  rootStyle.setProperty("--hero-card-bg", hero.bg);
  rootStyle.setProperty("--hero-card-border", hero.border);
  rootStyle.setProperty("--hero-card-shadow", hero.shadow);
  rootStyle.setProperty("--hero-card-highlight", hero.highlight);
  const surface = {
    ...defaultSurfaceStyle,
    bg: hero.bg,
    border: hero.border,
    shadow: hero.shadow,
    highlight: hero.highlight,
    ...(palette.surface || {}),
  };
  rootStyle.setProperty("--surface-bg", surface.bg);
  rootStyle.setProperty("--surface-border", surface.border);
  rootStyle.setProperty("--surface-shadow", surface.shadow);
  rootStyle.setProperty("--surface-highlight", surface.highlight);
  rootStyle.setProperty("--surface-sheen", surface.sheen ?? defaultSurfaceStyle.sheen);
  const flare = palette.flare || hero.highlight;
  const flareSoft = palette.flareSoft || flare;
  rootStyle.setProperty("--background-flare", flare);
  rootStyle.setProperty("--background-flare-soft", flareSoft);
}

function paletteMatchesHour(hour, palette) {
  const [start, end] = palette.range;
  if (start <= end) {
    return hour >= start && hour < end;
  }
  return hour >= start || hour < end;
}

function getLightingPalette() {
  const hour = new Date().getHours();
  return lightingPalettes.find((entry) => paletteMatchesHour(hour, entry)) || lightingPalettes[0];
}

function setLightingPalette(palette, immediate = false) {
  if (!palette) return;
  lightingTargets.fog.set(palette.fog ?? scene.fog.color.getHex());
  lightingTargets.hemiSky.set(palette.hemiSky ?? hemi.color.getHex());
  lightingTargets.hemiGround.set(palette.hemiGround ?? hemi.groundColor.getHex());
  lightingTargets.rim.set(palette.rim ?? rimLight.color.getHex());
  lightingTargets.fill.set(palette.fill ?? fillLight.color.getHex());
  lightingTargets.ambient.set(palette.ambient ?? ambient.color.getHex());
  lightingTargets.spot.set(palette.spot ?? spot.color.getHex());
  lightingTargets.rimIntensity = palette.rimIntensity ?? rimLight.intensity;
  lightingTargets.fillIntensity = palette.fillIntensity ?? fillLight.intensity;
  lightingTargets.ambientIntensity = palette.ambientIntensity ?? ambient.intensity;
  lightingTargets.spotIntensity = palette.spotIntensity ?? spot.intensity;
  if (palette.rimPosition) {
    lightingTargets.rimPosition.set(...palette.rimPosition);
  } else {
    lightingTargets.rimPosition.copy(rimLight.position);
  }
  if (palette.fillPosition) {
    lightingTargets.fillPosition.set(...palette.fillPosition);
  } else {
    lightingTargets.fillPosition.copy(fillLight.position);
  }
  if (palette.spotPosition) {
    lightingTargets.spotPosition.set(...palette.spotPosition);
  } else {
    lightingTargets.spotPosition.copy(spot.position);
  }
  fogDensityTarget = palette.fogDensity ?? scene.fog.density;
  exposureTarget = palette.exposure ?? renderer.toneMappingExposure;
  paletteTintColor.set(palette.bubbleTint || palette.tint || "#9cb8ff");
  paletteTintTarget = palette.tintStrength ?? 0.22;
  applyPaletteCSS(palette);
  if (immediate) {
    scene.fog.color.copy(lightingTargets.fog);
    hemi.color.copy(lightingTargets.hemiSky);
    hemi.groundColor.copy(lightingTargets.hemiGround);
    rimLight.color.copy(lightingTargets.rim);
    fillLight.color.copy(lightingTargets.fill);
    ambient.color.copy(lightingTargets.ambient);
    spot.color.copy(lightingTargets.spot);
    rimLight.intensity = lightingTargets.rimIntensity;
    fillLight.intensity = lightingTargets.fillIntensity;
    ambient.intensity = lightingTargets.ambientIntensity;
    spot.intensity = lightingTargets.spotIntensity;
    rimLight.position.copy(lightingTargets.rimPosition);
    fillLight.position.copy(lightingTargets.fillPosition);
    spot.position.copy(lightingTargets.spotPosition);
    scene.fog.density = fogDensityTarget;
    renderer.toneMappingExposure = exposureTarget;
    paletteTintMix = paletteTintTarget;
  }
}

function maybeUpdateLightingPalette(force = false) {
  const palette = getLightingPalette();
  if (!palette) return;
  const paletteChanged = !activeLightingPalette || palette.name !== activeLightingPalette.name;
  if (force || paletteChanged) {
    setLightingPalette(palette, force || !paletteInitialized);
    activeLightingPalette = palette;
    paletteInitialized = true;
  }
}

maybeUpdateLightingPalette(true);

  const particleLayers = [];
  function createDustLayer(count, spread, size, opacity, color, speed) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const idx = i * 3;
      positions[idx] = (Math.random() - 0.5) * spread;
      positions[idx + 1] = (Math.random() - 0.5) * spread * 0.6;
      positions[idx + 2] = (Math.random() - 0.5) * spread;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      size,
      transparent: true,
      opacity,
      color,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.userData = { speed };
    scene.add(points);
    particleLayers.push(points);
  }

  createDustLayer(800, 30, 0.05, 0.45, 0x8fbaff, 0.002);
  createDustLayer(600, 40, 0.08, 0.3, 0x5efbe0, -0.001);
  createDustLayer(1200, 50, 0.03, 0.2, 0xffffff, 0.0015);

  const bubblesGroup = new THREE.Group();
  scene.add(bubblesGroup);
  const outerGeometry = new THREE.SphereGeometry(1, 96, 96);
  const innerGeometry = new THREE.SphereGeometry(0.65, 48, 48);

const targetLookAt = new THREE.Vector3(0, 0.2, 0);
const parallaxMouse = new THREE.Vector2(0, 0);

const bounds = {
  x: 4.2,
  y: 2.6,
  z: 4.5,
};

function getZoomRatio() {
  return THREE.MathUtils.clamp(
    (orbitState.radius - orbitState.minRadius) / (orbitState.maxRadius - orbitState.minRadius),
    0,
    1
  );
}

function refreshBounds() {
  const ratio = getZoomRatio();
  const focusDistance = camera.position.distanceTo(targetLookAt);
  const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const verticalExtent = 2 * Math.tan(halfFov) * focusDistance;
  const horizontalExtent = verticalExtent * camera.aspect;
  const depthExtent = focusDistance * 0.9;
  bounds.x = Math.max(3.8, horizontalExtent * (0.7 + ratio * 0.4) + 0.4);
  bounds.y = Math.max(2.5, verticalExtent * (0.45 + ratio * 0.35) + 0.3);
  bounds.z = Math.max(5, depthExtent * (0.8 + ratio * 1.2) + 1.2);
}

function randomVelocity() {
  const intensity = 0.8 + Math.random() * 0.7;
  return new THREE.Vector3(
    (Math.random() - 0.5) * 1.7 * intensity,
    (Math.random() - 0.5) * 1.1 * intensity,
    (Math.random() - 0.5) * 1.7 * intensity
  );
}

function clampVectorToBounds(target, radius = 0.8) {
  const maxX = Math.max(0.1, bounds.x - radius);
  const maxY = Math.max(0.1, bounds.y - radius);
  const maxZ = Math.max(0.1, bounds.z - radius);
  target.x = THREE.MathUtils.clamp(target.x, -maxX, maxX);
  target.y = THREE.MathUtils.clamp(target.y, -maxY, maxY);
  target.z = THREE.MathUtils.clamp(target.z, -maxZ, maxZ);
  return target;
}

refreshBounds();
  function randomizeBasePosition(data, bubble, bubbleList = bubbleRegistry) {
    let attempts = 0;
    let base;
    const radius = data.originalRadius;
    const padding = radius * 0.1;
    do {
      base = data.spawnOrigin
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 1.8,
            (Math.random() - 0.5) * 1.4,
            (Math.random() - 0.5) * 2.0
          )
        );
      attempts += 1;
    } while (
      attempts < 14 &&
      bubbleList.some((other) => {
        if (other === bubble || !other.visible) return false;
        const dist = base.distanceTo(other.position);
        const otherRadius = other.userData?.originalRadius || 0.9;
        return dist < radius + otherRadius + padding;
      })
    );
    clampVectorToBounds(base, radius);
    data.basePosition.copy(base);
    bubble.position.copy(base);
    data.velocity.copy(randomVelocity());
  }

  const bubbles = bubbleProjects.map((project, idx) => {
    const tint = new THREE.Color(project.tint || "#6fb1ff");
    const previewTexture = getTexture(project.image);
    const shellMaterial = createBubbleMaterial(tint.clone(), previewTexture);
    const bubble = new THREE.Mesh(outerGeometry, shellMaterial);
    bubble.renderOrder = 2;
    const baseScale = 0.9 + Math.random() * 0.5;
    bubble.scale.setScalar(baseScale);
    const spawnOrigin = new THREE.Vector3(
      project.position?.x ?? (Math.random() - 0.5) * 3.5,
      project.position?.y ?? (Math.random() - 0.5) * 2.0,
      project.position?.z ?? (Math.random() - 0.5) * 3.5
    );
    const basePosition = spawnOrigin.clone();
    bubble.rotation.y = Math.random() * Math.PI;

    const liquidMaterial = createLiquidMaterial(tint.clone(), previewTexture);
    const liquid = new THREE.Mesh(innerGeometry, liquidMaterial);
    liquid.renderOrder = 1;
    liquid.scale.setScalar(0.7);
    bubble.add(liquid);

    bubble.userData = {
      ...project,
      id: idx,
      basePosition: basePosition.clone(),
      offset: Math.random() * Math.PI * 2,
      liquid,
      liquidMaterial,
      shellMaterial,
      originalScale: baseScale,
      originalRadius: baseScale,
      popState: "idle",
      popStart: 0,
      tintColor: tint.clone(),
      velocity: randomVelocity(),
      spawnOrigin,
      respawnDelay: 1.6 + Math.random() * 2.2,
    };
    bubblesGroup.add(bubble);
    randomizeBasePosition(bubble.userData, bubble, bubbleRegistry);
    bubbleRegistry.push(bubble);
    return bubble;
  });

  function resolveCollisions() {
    for (let i = 0; i < bubbles.length; i += 1) {
      const a = bubbles[i];
      if (!a.visible || a.userData.popState === "hidden") continue;
      for (let j = i + 1; j < bubbles.length; j += 1) {
        const b = bubbles[j];
        if (!b.visible || b.userData.popState === "hidden") continue;
        if (a === selectedBubble || b === selectedBubble) continue;
        collisionVec.copy(b.position).sub(a.position);
        let distSq = collisionVec.lengthSq();
        if (distSq === 0) {
          collisionVec.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
          distSq = collisionVec.lengthSq();
        }
        const dist = Math.sqrt(distSq);
        const minDist = (a.userData.originalRadius || a.scale.x) + (b.userData.originalRadius || b.scale.x);
        if (dist < minDist) {
          const push = (minDist - dist) * 0.5;
          collisionVec.normalize();
          a.position.addScaledVector(collisionVec, -push);
          b.position.addScaledVector(collisionVec, push);
          const normal = collisionVec.clone();
          const va = a.userData.velocity;
          const vb = b.userData.velocity;
          const vaN = normal.clone().multiplyScalar(va.dot(normal));
          const vbN = normal.clone().multiplyScalar(vb.dot(normal));
          va.add(vbN).sub(vaN).multiplyScalar(0.92);
          vb.add(vaN).sub(vbN).multiplyScalar(0.92);
          a.userData.basePosition.copy(a.position);
          b.userData.basePosition.copy(b.position);
        }
      }
    }
  }

const dropletGeometry = new THREE.IcosahedronGeometry(0.07, 0);
const dropletMaterial = new THREE.MeshStandardMaterial({
  color: 0x7dfbff,
  transparent: true,
  opacity: 0.35,
  metalness: 0.2,
  roughness: 0.2,
});
const dropletSettings = {
  minActive: 22,
  maxActive: 120,
  radiusMin: 4.5,
  radiusMax: 14,
  verticalSpread: 5.2,
};
const droplets = [];

function randomizeDropletPosition(droplet) {
  const radius = THREE.MathUtils.randFloat(dropletSettings.radiusMin, dropletSettings.radiusMax);
  const angle = Math.random() * Math.PI * 2;
  const depthOffset = THREE.MathUtils.randFloat(2, 9);
  droplet.position.set(
    Math.cos(angle) * radius,
    THREE.MathUtils.randFloatSpread(dropletSettings.verticalSpread),
    Math.sin(angle) * radius - depthOffset
  );
  droplet.userData.base.copy(droplet.position);
  droplet.userData.speed = 0.35 + Math.random() * 0.6;
}

for (let i = 0; i < dropletSettings.maxActive; i += 1) {
  const droplet = new THREE.Mesh(dropletGeometry, dropletMaterial);
  droplet.visible = false;
  droplet.userData = {
    base: new THREE.Vector3(),
    speed: 0.4,
    active: false,
  };
  randomizeDropletPosition(droplet);
  scene.add(droplet);
  droplets.push(droplet);
}

let activeDropletTarget = 0;
function updateDropletActivity(force = false) {
  const target = Math.round(
    THREE.MathUtils.lerp(dropletSettings.minActive, dropletSettings.maxActive, getZoomRatio())
  );
  if (!force && target === activeDropletTarget) return;
  activeDropletTarget = target;
  droplets.forEach((droplet, idx) => {
    const shouldBeActive = idx < target;
    if (shouldBeActive) {
      if (!droplet.userData.active) {
        randomizeDropletPosition(droplet);
        droplet.userData.active = true;
      }
      droplet.visible = true;
    } else if (droplet.userData.active) {
      droplet.visible = false;
      droplet.userData.active = false;
    }
  });
}

updateDropletActivity(true);

const bubbleBursts = [];
const tempBurstPosition = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const dragPlaneNormal = new THREE.Vector3();
const planeIntersection = new THREE.Vector3();
const dragStart = new THREE.Vector2();
const pointerWorld = new THREE.Vector3();
const pointerPrevWorld = new THREE.Vector3();
const dragVelocity = new THREE.Vector3();
const dragTarget = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();
let pointerWorldTime = 0;
let activePointerId = null;
let selectedBubble = null;
let dragging = false;
let pointerDownTime = 0;
const dragThreshold = 0.02;
  const isPromptActive = () => document.body.classList.contains("prompt-active");

  const panel = document.getElementById("bubble-panel");
  const panelTitle = document.getElementById("bubble-panel-title");
  const panelDesc = document.getElementById("bubble-panel-description");
  const panelMeta = document.getElementById("bubble-panel-meta");
  const panelMedia = document.getElementById("bubble-panel-media");
  const panelImage = document.getElementById("bubble-panel-image");
  const panelLink = document.getElementById("bubble-panel-link");
  const panelClose = document.getElementById("bubble-panel-close");
  const panelOverlay = document.getElementById("bubble-panel-overlay");
  const introPrompt = document.getElementById("intro-prompt");
  const introEnter = document.getElementById("intro-enter");

  const emailLink = document.querySelector('[data-link="email"]');
  const phoneLink = document.querySelector('[data-link="phone"]');
  const linkedinLink = document.querySelector('[data-link="linkedin"]');
  const githubLink = document.querySelector('[data-link="github"]');
  const statsList = document.getElementById("stats-list");
  const skillsGrid = document.getElementById("skills-grid");
  const experienceList = document.getElementById("experience-list");
  const projectGrid = document.getElementById("project-grid");
  const extracurricularList = document.getElementById("extracurricular-list");
  const educationBlock = document.getElementById("education-block");

  if (introPrompt) {
    document.body.classList.add("prompt-active");
    const dismissPrompt = () => {
      introPrompt.classList.add("hidden");
      document.body.classList.remove("prompt-active");
      setTimeout(() => introPrompt.remove(), 500);
    };
    introPrompt.addEventListener("click", (event) => {
      if (event.target === introPrompt) {
        dismissPrompt();
      }
    });
    if (introEnter) {
      introEnter.addEventListener("click", dismissPrompt);
    }
    window.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && document.body.classList.contains("prompt-active")) {
        dismissPrompt();
      }
    });
  }

  function renderSiteContent(siteData = window.SITE_DATA || {}) {
    if (!siteData) return;
    const {
      profileLinks: profile = {},
      stats: statsData = [],
      skills: skillsData = [],
      experiences: expData = [],
      featuredProjects: featured = [],
      extracurriculars: extra = [],
      education: educationData = {},
    } = siteData;

    if (emailLink) {
      if (profile.email) {
        emailLink.href = `mailto:${profile.email}`;
        emailLink.textContent = profile.email;
      }
    }
    if (phoneLink) {
      if (profile.phone) {
        const tel = profile.phone.replace(/[^+\d]/g, "");
        phoneLink.href = `tel:${tel}`;
        phoneLink.textContent = profile.phone;
      }
    }
    if (linkedinLink && profile.linkedin) {
      linkedinLink.href = profile.linkedin;
    }
    if (githubLink && profile.github) {
      githubLink.href = profile.github;
    }

    if (statsList) {
      statsList.innerHTML = "";
      statsData.forEach((stat) => {
        const li = document.createElement("li");
        const value = document.createElement("span");
        value.textContent = stat.value;
        li.appendChild(value);
        li.appendChild(document.createTextNode(stat.label));
        statsList.appendChild(li);
      });
    }

    if (skillsGrid) {
      skillsGrid.innerHTML = "";
      skillsData.forEach((skill) => {
        const card = document.createElement("article");
        card.className = "service-card";
        const icon = document.createElement("div");
        icon.className = "service-icon";
        icon.textContent = skill.icon || "✷";
        const title = document.createElement("h3");
        title.textContent = skill.title;
        const list = document.createElement("ul");
        (skill.items || []).forEach((item) => {
          const li = document.createElement("li");
          li.textContent = item;
          list.appendChild(li);
        });
        card.appendChild(icon);
        card.appendChild(title);
        card.appendChild(list);
        skillsGrid.appendChild(card);
      });
    }

    if (experienceList) {
      experienceList.innerHTML = "";
      expData.forEach((exp) => {
        const article = document.createElement("article");
        article.className = "timeline-card";
        const header = document.createElement("header");
        const title = document.createElement("h3");
        title.textContent = `${exp.role} · ${exp.company}`;
        const meta = document.createElement("div");
        meta.className = "timeline-meta";
        meta.textContent = `${exp.range || ""}${exp.location ? ` • ${exp.location}` : ""}`;
        header.appendChild(title);
        header.appendChild(meta);
        const summary = document.createElement("p");
        summary.textContent = exp.summary || "";
        article.appendChild(header);
        article.appendChild(summary);
        if (exp.highlights?.length) {
          const list = document.createElement("ul");
          exp.highlights.forEach((point) => {
            const li = document.createElement("li");
            li.textContent = point;
            list.appendChild(li);
          });
          article.appendChild(list);
        }
        experienceList.appendChild(article);
      });
    }

    if (projectGrid) {
      projectGrid.innerHTML = "";
      featured.forEach((project) => {
        const card = document.createElement("article");
        card.className = "project-card";
        const tag = document.createElement("p");
        tag.className = "tag";
        tag.textContent = "GitHub";
        const title = document.createElement("h3");
        title.textContent = project.title;
        const desc = document.createElement("p");
        desc.textContent = project.description;
        if (project.image) {
          const thumb = document.createElement("div");
          thumb.className = "project-thumb";
          const img = document.createElement("img");
          img.src = project.image;
          img.alt = `${project.title} preview`;
          thumb.appendChild(img);
          card.appendChild(thumb);
        }
        card.appendChild(tag);
        card.appendChild(title);
        card.appendChild(desc);
        if (project.stack?.length) {
          const tagsWrap = document.createElement("div");
          tagsWrap.className = "project-tags";
          project.stack.forEach((item) => {
            const span = document.createElement("span");
            span.textContent = item;
            tagsWrap.appendChild(span);
          });
          card.appendChild(tagsWrap);
        }
        const footer = document.createElement("footer");
        const link = document.createElement("a");
        link.href = project.link;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "View repo ↗";
        footer.appendChild(link);
        card.appendChild(footer);
        projectGrid.appendChild(card);
      });
    }

    if (extracurricularList) {
      extracurricularList.innerHTML = "";
      extra.forEach((item) => {
        const card = document.createElement("article");
        card.className = "extracurricular-card";
        const title = document.createElement("h3");
        title.textContent = item.title;
        const meta = document.createElement("p");
        meta.className = "meta";
        meta.textContent = `${item.org || ""}${item.range ? ` • ${item.range}` : ""}`;
        const desc = document.createElement("p");
        desc.textContent = item.description || "";
        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(desc);
        extracurricularList.appendChild(card);
      });
    }

    if (educationBlock && educationData.school) {
      educationBlock.innerHTML = `
        <p><strong>${educationData.school}</strong> · ${educationData.program || ""} · ${educationData.location || ""}</p>
        <p>${educationData.graduation || ""}</p>
      `;
    }
  }

  renderSiteContent();

  async function fetchLatestSiteData() {
    try {
      const response = await fetch(`./site-data.js?cache=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Failed to fetch site-data: ${response.status}`);
      const scriptText = await response.text();
      delete window.SITE_DATA;
      const loader = new Function("window", `${scriptText}; return window.SITE_DATA;`);
      return loader(window);
    } catch (error) {
      console.error("Unable to refresh site content", error);
      return null;
    }
  }

  async function refreshSiteContent() {
    const fresh = await fetchLatestSiteData();
    if (fresh) renderSiteContent(fresh);
  }

  const AUTO_REFRESH_INTERVAL = 120000;
  setInterval(() => {
    if (!document.hidden) {
      refreshSiteContent();
    }
  }, AUTO_REFRESH_INTERVAL);

  panelClose?.addEventListener("click", hidePanel);
  panelOverlay?.addEventListener("click", hidePanel);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hidePanel();
  });

  function hidePanel() {
    panel.classList.add("hidden");
    panelOverlay.classList.add("hidden");
    document.body.classList.remove("panel-open");
  }

  function showPanel(project) {
    panelTitle.textContent = project.title;
    panelDesc.textContent = project.description;
    panelMeta.textContent = project.stack?.join(" · ") || "";
    panelLink.href = project.link;
    if (panelImage && panelMedia) {
      if (project.image) {
        panelImage.src = project.image;
        panelImage.alt = `${project.title} preview`;
        panelMedia.classList.remove("hidden");
      } else {
        panelMedia.classList.add("hidden");
      }
    }
    panel.classList.remove("hidden");
    panelOverlay.classList.remove("hidden");
    document.body.classList.add("panel-open");
  }

  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function isInteractingWithUI(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest(".page") || target.closest(".bubble-panel"));
  }

  function updatePointer(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  function handlePointerDown(event) {
    if (isPromptActive()) return;
    if (event.button === 2 || event.altKey) {
      orbiting = true;
      orbitPointer.x = event.clientX;
      orbitPointer.y = event.clientY;
      orbitPointer.azimuth = orbitState.azimuth;
      orbitPointer.polar = orbitState.polar;
      document.body.style.cursor = "grabbing";
      return;
    }
    if (event.button !== 0 || isInteractingWithUI(event.target)) return;
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(bubbles, false);
    if (!hits.length) {
      selectedBubble = null;
      return;
    }
    selectedBubble = hits[0].object;
    dragging = true;
    dragVelocity.set(0, 0, 0);
    activePointerId = event.pointerId;
    event.target?.setPointerCapture?.(event.pointerId);
    dragStart.copy(pointer);
    pointerDownTime = performance.now();
    document.body.style.cursor = "grabbing";
    document.body.classList.add("bubble-dragging");
    hidePanel();
    const normal = camera.getWorldDirection(cameraDirection).normalize();
    dragPlaneNormal.copy(normal);
    dragPlane.setFromNormalAndCoplanarPoint(dragPlaneNormal, selectedBubble.position);
    pointerWorld.copy(selectedBubble.position);
    pointerPrevWorld.copy(selectedBubble.position);
    pointerWorldTime = performance.now();
    selectedBubble.userData.velocity?.set(0, 0, 0);
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (isPromptActive()) return;
    parallaxMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    parallaxMouse.y = (event.clientY / window.innerHeight) * 2 - 1;
    if (orbiting) {
      const deltaX = (event.clientX - orbitPointer.x) / window.innerWidth;
      const deltaY = (event.clientY - orbitPointer.y) / window.innerHeight;
      orbitState.azimuth = orbitPointer.azimuth - deltaX * Math.PI * 1.5;
      orbitState.polar = THREE.MathUtils.clamp(
        orbitPointer.polar + deltaY * Math.PI * 0.8,
        orbitState.minPolar,
        orbitState.maxPolar
      );
      return;
    }
    if (!dragging || !selectedBubble) return;
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    dragPlaneNormal.copy(camera.getWorldDirection(cameraDirection).normalize());
    dragPlane.setFromNormalAndCoplanarPoint(dragPlaneNormal, selectedBubble.position);
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersection)) {
      const radius = selectedBubble.userData?.originalRadius || selectedBubble.scale.x;
      dragTarget.copy(planeIntersection);
      clampVectorToBounds(dragTarget, radius);
      const now = performance.now();
      const dt = Math.max((now - pointerWorldTime) / 1000, 0.008);
      dragVelocity.copy(dragTarget).sub(pointerPrevWorld).divideScalar(dt);
      pointerWorldTime = now;
      pointerPrevWorld.copy(dragTarget);
      pointerWorld.copy(dragTarget);
      selectedBubble.position.copy(dragTarget);
      selectedBubble.userData.basePosition.copy(dragTarget);
    }
  }

  function endDrag(event) {
    if (isPromptActive()) {
      document.body.classList.remove("bubble-dragging");
      return;
    }
    if (orbiting) {
      orbiting = false;
      document.body.style.cursor = "";
      return;
    }
    document.body.classList.remove("bubble-dragging");
    if (!dragging || !selectedBubble) {
      dragging = false;
      selectedBubble = null;
      document.body.style.cursor = "";
      return;
    }
    if (activePointerId !== null) {
      event.target?.releasePointerCapture?.(activePointerId);
      activePointerId = null;
    }
    if (event) updatePointer(event);
    const moved = dragStart.distanceTo(pointer) > dragThreshold;
    const tapped =
      !moved &&
      performance.now() - pointerDownTime < 450 &&
      !isInteractingWithUI(event?.target);
    const bubble = selectedBubble;
    const project = bubble.userData;
    dragging = false;
    selectedBubble = null;
    document.body.style.cursor = "";
    document.body.classList.remove("bubble-dragging");
    if (moved) {
      const fling = dragVelocity.clone();
      const speed = fling.length();
      if (speed > 0.01) {
        const capped = THREE.MathUtils.clamp(speed * 0.5, 0.5, 6);
        fling.normalize().multiplyScalar(capped);
        bubble.userData.velocity.copy(fling);
      } else {
        bubble.userData.velocity.copy(randomVelocity());
      }
      bubble.userData.basePosition.copy(bubble.position);
    } else if (tapped && project) {
      triggerBubblePop(bubble);
      showPanel(project);
    } else {
      bubble.userData.velocity.copy(randomVelocity());
    }
  }

  function triggerBubblePop(bubble) {
    if (!bubble) return;
    const data = bubble.userData;
    if (!data || data.popState !== "idle") return;
    const time = clock.getElapsedTime();
    data.popState = "shrink";
    data.popStart = time;
    spawnBurst(bubble, time);
  }

  function spawnBurst(bubble, bornTime) {
    const count = 26;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const direction = new THREE.Vector3();
    for (let i = 0; i < count; i += 1) {
      const base = i * 3;
      direction
        .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
        .normalize()
        .multiplyScalar(0.6 + Math.random() * 0.6);
      velocities[base] = direction.x;
      velocities[base + 1] = direction.y;
      velocities[base + 2] = direction.z;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const tint = bubble.userData.tintColor || new THREE.Color("#9ca8ff");
    const material = new THREE.PointsMaterial({
      color: tint,
      size: 0.055,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const burst = new THREE.Points(geometry, material);
    bubble.getWorldPosition(tempBurstPosition);
    burst.position.copy(tempBurstPosition);
    burst.userData = {
      velocities,
      life: 0.85,
      born: bornTime,
    };
    scene.add(burst);
    bubbleBursts.push(burst);
  }

  function updateBursts(delta, elapsed) {
    for (let i = bubbleBursts.length - 1; i >= 0; i -= 1) {
      const burst = bubbleBursts[i];
      const data = burst.userData;
      const life = data.life || 0.8;
      const ratio = life > 0 ? (elapsed - data.born) / life : 1;
      if (ratio >= 1) {
        scene.remove(burst);
        burst.geometry.dispose();
        burst.material.dispose();
        bubbleBursts.splice(i, 1);
        continue;
      }
      const positions = burst.geometry.attributes.position.array;
      const velocities = data.velocities;
      for (let j = 0; j < velocities.length; j += 3) {
        positions[j] += velocities[j] * delta;
        positions[j + 1] += velocities[j + 1] * delta;
        positions[j + 2] += velocities[j + 2] * delta;
        velocities[j] *= 0.94;
        velocities[j + 1] *= 0.94;
        velocities[j + 2] *= 0.94;
      }
      burst.geometry.attributes.position.needsUpdate = true;
      const fade = 1 - ratio;
      burst.material.opacity = fade;
      burst.material.size = 0.035 + fade * 0.035;
    }
  }

  window.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointerleave", endDrag);

const clock = new THREE.Clock();
let lastElapsed = 0;

function applyCameraOrbit() {
    const azimuthSpeed = 0.025;
    const polarSpeed = 0.02;
    const zoomSpeed = 0.035;
  if (orbitKeys.left) orbitState.azimuth -= azimuthSpeed;
  if (orbitKeys.right) orbitState.azimuth += azimuthSpeed;
  if (orbitKeys.up)
    orbitState.polar = THREE.MathUtils.clamp(
      orbitState.polar - polarSpeed,
      orbitState.minPolar,
      orbitState.maxPolar
    );
  if (orbitKeys.down)
    orbitState.polar = THREE.MathUtils.clamp(
      orbitState.polar + polarSpeed,
      orbitState.minPolar,
      orbitState.maxPolar
    );
  if (orbitKeys.zoomIn)
    orbitState.radius = THREE.MathUtils.clamp(
      orbitState.radius - zoomSpeed,
      orbitState.minRadius,
      orbitState.maxRadius
    );
  if (orbitKeys.zoomOut)
    orbitState.radius = THREE.MathUtils.clamp(
      orbitState.radius + zoomSpeed,
      orbitState.minRadius,
      orbitState.maxRadius
    );
  const sinPhi = Math.sin(orbitState.polar);
  const cosPhi = Math.cos(orbitState.polar);
  orbitPosition.set(
    orbitState.radius * sinPhi * Math.sin(orbitState.azimuth),
    orbitState.radius * cosPhi,
    orbitState.radius * sinPhi * Math.cos(orbitState.azimuth)
  );
  camera.position.lerp(orbitPosition, 0.08);
  targetLookAt.x += (parallaxMouse.x * 0.3 - targetLookAt.x) * 0.04;
  targetLookAt.y += (0.35 + parallaxMouse.y * 0.15 - targetLookAt.y) * 0.04;
  camera.lookAt(targetLookAt);
  refreshBounds();
  updateDropletActivity();
}

function updateLighting(delta) {
  const amount = Math.min(0.08, delta * 2.4);
  scene.fog.color.lerp(lightingTargets.fog, amount);
  hemi.color.lerp(lightingTargets.hemiSky, amount);
  hemi.groundColor.lerp(lightingTargets.hemiGround, amount);
  rimLight.color.lerp(lightingTargets.rim, amount);
  fillLight.color.lerp(lightingTargets.fill, amount);
  ambient.color.lerp(lightingTargets.ambient, amount);
  spot.color.lerp(lightingTargets.spot, amount);
  rimLight.position.lerp(lightingTargets.rimPosition, amount);
  fillLight.position.lerp(lightingTargets.fillPosition, amount);
  spot.position.lerp(lightingTargets.spotPosition, amount);
  rimLight.intensity += (lightingTargets.rimIntensity - rimLight.intensity) * amount;
  fillLight.intensity += (lightingTargets.fillIntensity - fillLight.intensity) * amount;
  ambient.intensity += (lightingTargets.ambientIntensity - ambient.intensity) * amount;
  spot.intensity += (lightingTargets.spotIntensity - spot.intensity) * amount;
  scene.fog.density += (fogDensityTarget - scene.fog.density) * amount * 0.6;
  renderer.toneMappingExposure += (exposureTarget - renderer.toneMappingExposure) * amount;
  paletteTintMix += (paletteTintTarget - paletteTintMix) * amount;
}

  function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    const delta = Math.min(0.05, Math.max(0.001, elapsed - lastElapsed || 0.016));
    lastElapsed = elapsed;

    particleLayers.forEach((layer) => {
      layer.rotation.y += layer.userData.speed;
    });

    const tintMix = paletteTintMix;
    const liquidTintMix = Math.min(1, tintMix + 0.12);
    bubbles.forEach((bubble) => {
      const data = bubble.userData;
      const { basePosition, liquid, liquidMaterial, shellMaterial, velocity, originalRadius } = data;
      const canFloat = bubble !== selectedBubble && data.popState !== "shrink";
      if (canFloat) {
        if (Math.random() < 0.0025) {
          velocity.add(randomVelocity().multiplyScalar(0.2));
        }
        bubble.position.addScaledVector(velocity, delta * 1.3);
        basePosition.lerp(bubble.position, 0.008);
        if (velocity.lengthSq() < 0.000015) {
          velocity.copy(randomVelocity().multiplyScalar(0.45));
        } else {
          velocity.multiplyScalar(0.9985);
        }
        const radius = Math.max(0.2, originalRadius || bubble.scale.x);
        const maxX = Math.max(0.1, bounds.x - radius);
        const maxY = Math.max(0.1, bounds.y - radius);
        const maxZ = Math.max(0.1, bounds.z - radius);
        if (bubble.position.x > maxX) {
          bubble.position.x = maxX;
          velocity.x *= -1.05;
          basePosition.x = bubble.position.x;
        } else if (bubble.position.x < -maxX) {
          bubble.position.x = -maxX;
          velocity.x *= -1.05;
          basePosition.x = bubble.position.x;
        }
        if (bubble.position.y > maxY) {
          bubble.position.y = maxY;
          velocity.y *= -1.02;
          basePosition.y = bubble.position.y;
        } else if (bubble.position.y < -maxY) {
          bubble.position.y = -maxY;
          velocity.y *= -1.02;
          basePosition.y = bubble.position.y;
        }
        if (bubble.position.z > maxZ) {
          bubble.position.z = maxZ;
          velocity.z *= -1.05;
          basePosition.z = bubble.position.z;
        } else if (bubble.position.z < -maxZ) {
          bubble.position.z = -maxZ;
          velocity.z *= -1.05;
          basePosition.z = bubble.position.z;
        }
      }
      bubble.rotation.y += 0.002;
      bubble.rotation.x += 0.001;
      liquid.rotation.x -= 0.004;
      liquid.rotation.y += 0.003;
      if (shellMaterial) {
        shellMaterial.uniforms.uTint.value.copy(data.tintColor).lerp(paletteTintColor, tintMix);
        shellMaterial.uniforms.uTime.value = elapsed;
        shellMaterial.uniforms.uCameraPosition.value.copy(camera.position);
      }
      if (liquidMaterial) {
        liquidMaterial.uniforms.uTint.value.copy(data.tintColor).lerp(paletteTintColor, liquidTintMix);
        liquidMaterial.uniforms.uTime.value = elapsed;
      }

    if (data.popState === "shrink") {
      const shrinkProgress = THREE.MathUtils.clamp(
        (elapsed - data.popStart) / 0.2,
        0,
        1
        );
        const scale = Math.max(data.originalScale * (1 - shrinkProgress), 0.02);
        bubble.scale.setScalar(scale);
        if (shrinkProgress >= 1) {
          data.popState = "hidden";
          data.popStart = elapsed;
          bubble.visible = false;
        }
    } else if (data.popState === "hidden") {
      const wait = data.respawnDelay ?? 1.8;
      if (elapsed - data.popStart > wait) {
        data.popState = "grow";
        data.popStart = elapsed;
        data.respawnDelay = 1.6 + Math.random() * 2.4;
        randomizeBasePosition(data, bubble);
        data.orbitRadius = 0.35 + Math.random() * 0.35;
        data.depthRange = 0.5 + Math.random() * 0.45;
        data.depthSpeed = 0.18 + Math.random() * 0.25;
        bubble.visible = true;
        bubble.scale.setScalar(data.originalScale * 0.3);
      }
    } else if (data.popState === "grow") {
      const growProgress = THREE.MathUtils.clamp(
        (elapsed - data.popStart) / 0.4,
        0,
        1
        );
        const eased = easeOutBack(growProgress);
        bubble.scale.setScalar(data.originalScale * eased);
        if (growProgress >= 1) {
          data.popState = "idle";
          bubble.scale.setScalar(data.originalScale);
        }
      }
  });

  resolveCollisions();

    droplets.forEach((droplet) => {
      if (!droplet.visible) return;
      const { base, speed } = droplet.userData;
      droplet.position.y = base.y + Math.sin(elapsed * speed + base.x) * 0.8;
      droplet.rotation.x += 0.01;
      droplet.rotation.y += 0.008;
    });

    updateBursts(delta, elapsed);

    paletteCheckTimer -= delta;
    if (paletteCheckTimer <= 0) {
      paletteCheckTimer = paletteCheckInterval;
      maybeUpdateLightingPalette();
    }
    updateLighting(delta);

    applyCameraOrbit();

    renderer.render(scene, camera);
  }

  animate();

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    refreshBounds();
  }

  const inputTags = new Set(["INPUT", "TEXTAREA", "SELECT"]);

  function handleKeyChange(event, pressed) {
    if (inputTags.has(document.activeElement?.tagName || "")) return;
    let handled = true;
  switch (event.key) {
    case "ArrowLeft":
    case "a":
    case "A":
      orbitKeys.left = pressed;
      break;
    case "ArrowRight":
    case "d":
    case "D":
      orbitKeys.right = pressed;
      break;
    case "ArrowUp":
    case "w":
    case "W":
      orbitKeys.up = pressed;
      break;
    case "ArrowDown":
    case "s":
    case "S":
      orbitKeys.down = pressed;
      break;
      case "q":
      case "Q":
        orbitKeys.zoomIn = pressed;
        break;
      case "e":
      case "E":
        orbitKeys.zoomOut = pressed;
        break;
      default:
        handled = false;
    }
    if (handled) event.preventDefault();
  }

  window.addEventListener("keydown", (event) => handleKeyChange(event, true));
  window.addEventListener("keyup", (event) => handleKeyChange(event, false));
  window.addEventListener("resize", onResize);
  window.addEventListener("contextmenu", (evt) => evt.preventDefault());
})();
