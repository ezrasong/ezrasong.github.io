let destroyed = false;
let animationId = null;
let refreshIntervalId = null;
const managedListeners = [];

function addManagedListener(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  managedListeners.push(() => target.removeEventListener(type, handler, options));
}

export function initScene() {
  destroyed = false;
  animationId = null;
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
  const ASSET_BASE =
    (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";
  const assetPath = (path) => {
    const trimmedBase = ASSET_BASE.endsWith("/") ? ASSET_BASE.slice(0, -1) : ASSET_BASE;
    const trimmedPath = path.startsWith("/") ? path.slice(1) : path;
    return `${trimmedBase}/${trimmedPath}`;
  };

  const mediaSmall = window.matchMedia("(max-width: 900px)");
  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const deviceMemory = typeof navigator !== "undefined" ? navigator.deviceMemory : null;
  const hasTouch = typeof navigator !== "undefined" ? navigator.maxTouchPoints > 0 : false;
  const isLowPower = reduceMotionQuery.matches || (deviceMemory && deviceMemory <= 4) || hasTouch;
  const densityScaleBase = reduceMotionQuery.matches ? 0.55 : mediaSmall.matches ? 0.82 : 1;
  const densityScale = densityScaleBase * (isLowPower ? 0.7 : 1);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  let canvasIsVisible = true;
  let canvasObserver = null;

  function updateRendererQuality() {
    const baseCap = reduceMotionQuery.matches ? 1.1 : mediaSmall.matches ? 1.35 : 1.8;
    const cap = baseCap * (isLowPower ? 0.75 : 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  }

  updateRendererQuality();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.setClearColor(0x000000, 0);

  const pauseReasons = new Set();

  function isRenderingActive() {
    return pauseReasons.size === 0;
  }

  function setRenderPaused(reason, shouldPause) {
    if (shouldPause) {
      pauseReasons.add(reason);
    } else {
      pauseReasons.delete(reason);
    }
    document.body.classList.toggle("scene-paused", !isRenderingActive());
  }

  const handleQualityChange = () => {
    updateRendererQuality();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  if (typeof mediaSmall.addEventListener === "function") {
    mediaSmall.addEventListener("change", handleQualityChange);
    reduceMotionQuery.addEventListener("change", handleQualityChange);
  } else if (typeof mediaSmall.addListener === "function") {
    mediaSmall.addListener(handleQualityChange);
    reduceMotionQuery.addListener(handleQualityChange);
  }

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x110d0a, 0.08);

const camera = new THREE.PerspectiveCamera(
  48,
  window.innerWidth / window.innerHeight,
  0.08,
  4000
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
const DESPAWN_RADIUS = 86.5;
let isFarView = false;

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
  uniform float uAudioLevel;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  ${noiseGLSL}
  void main() {
    float audioBoost = clamp(uAudioLevel, 0.0, 1.0);
    float wobble = snoise(normal * (4.0 + audioBoost * 5.0) + uTime * (0.35 + audioBoost * 0.4));
    float wobbleStrength = mix(0.08, 0.17, audioBoost);
    vec3 displacedPosition = position + normal * wobble * wobbleStrength;
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
  uniform vec3 uAccent;
  uniform float uTime;
  uniform sampler2D uPreviewMap;
  uniform float uHasPreview;
  uniform float uAudioLevel;
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
      0.68 + 0.08 * sin(uTime * 0.45 + vWorldPosition.x * 3.0),
      0.8 + 0.1 * cos(uTime * 0.35 + vWorldPosition.y * 2.4),
      1.1 + 0.14 * sin(uTime * 0.28 + vWorldPosition.z * 2.0)
    );
    float thinFilm = sin((normal.x + normal.y + normal.z + uTime * 0.4) * 4.0);
    vec3 filmColor = vec3(
      0.7 + 0.16 * sin(thinFilm + 0.8),
      0.86 + 0.14 * sin(thinFilm + 1.9),
      1.16 + 0.18 * sin(thinFilm + 3.4)
    );
    float pulse = clamp(uAudioLevel, 0.0, 1.0);
    vec3 color = tint + dispersion * 0.12;
    color = mix(color, filmColor, fresnel * 0.15);
    float accentMix = 0.18 + 0.08 * swirl + 0.06 * pulse;
    color = mix(color, uAccent, clamp(accentMix, 0.12, 0.4));
    color = mix(color, vec3(0.92, 0.98, 1.0), pulse * 0.24);
    color += vec3(0.12, 0.16, 0.22) * pulse * 0.35;
    if (uHasPreview > 0.5) {
      vec3 sampleNormal = normalize(mix(normal, viewDir, 0.1));
      vec2 previewUV = vec2(
        atan(sampleNormal.z, sampleNormal.x) / (6.28318) + 0.5,
        sampleNormal.y * 0.5 + 0.5
      );
      previewUV += swirl * 0.025;
      vec3 preview = texture2D(uPreviewMap, previewUV).rgb;
      float warmBias = max(preview.r - max(preview.g, preview.b), 0.0);
      vec3 coolBias = vec3(0.48, 0.64, 1.05);
      preview = mix(preview, coolBias, 0.01 + warmBias * 0.08);
      // preview fully dominates shell color
      color = preview;
      color += preview * 0.72;
    }
    color += vec3(0.28, 0.7, 1.08) * fresnel * 0.08;
    float alpha = clamp(0.12 + fresnel * 0.45 + pulse * 0.15, 0.12, 0.78);
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
    base += vec3(0.1, 0.16, 0.28) * ripple * 0.35;
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

  function createBubbleMaterial(tint, accent, previewTexture) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTint: { value: tint },
        uAccent: { value: accent },
        uCameraPosition: { value: camera.position.clone() },
        uTime: { value: 0 },
        uAudioLevel: { value: 0 },
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
  textureLoader.setCrossOrigin?.("anonymous");
  const previewTextureCache = new Map();
  const imageColorCache = new Map();
  const collisionVec = new THREE.Vector3();
  const bubbleRegistry = [];

  function averageImageColor(image) {
    try {
      const canvas = document.createElement("canvas");
      const size = 12;
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 10) continue;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count += 1;
      }
      if (!count) return null;
      return { r: r / count, g: g / count, b: b / count };
    } catch (error) {
      return null;
    }
  }

  const tempHSL = { h: 0, s: 0, l: 0 };
  function deriveBubbleTint(base, imageColor, backgroundColor = paletteTintColor) {
    const tint = (base ? base.clone() : new THREE.Color("#6fb1ff")).convertSRGBToLinear();
    if (imageColor) {
      const img = new THREE.Color(imageColor.r / 255, imageColor.g / 255, imageColor.b / 255).convertSRGBToLinear();
      tint.lerp(img, 1.0);
    }
    if (backgroundColor) {
      tint.lerp(backgroundColor, 0.05);
    }
    const warmish = tint.r > tint.g * 1.08 && tint.g > tint.b * 0.9;
    const isWarm = tint.r > tint.g * 1.15 && tint.r > tint.b * 1.15;
    if (warmish || isWarm) {
      const coolBias = new THREE.Color(0.5, 0.6, 1.0); // subtle blue bias in linear space
      tint.lerp(coolBias, isWarm ? 0.18 : 0.12);
      if (backgroundColor) tint.lerp(backgroundColor, 0.12);
    }
    const luma = tint.r * 0.299 + tint.g * 0.587 + tint.b * 0.114;
    if (luma < 0.2) tint.lerp(new THREE.Color(1, 1, 1), 0.25);
    if (luma > 0.82) tint.lerp(new THREE.Color(0.08, 0.1, 0.16), 0.2);
    return tint.convertLinearToSRGB();
  }

  function deriveBubbleAccent(tint, backgroundColor = paletteTintColor, imageColor = null) {
    const accent = tint.clone();
    accent.getHSL(tempHSL);
    const h = (tempHSL.h + 0.12) % 1;
    const s = Math.min(1, tempHSL.s * 0.9 + 0.12);
    const l = Math.min(1, tempHSL.l * 0.82 + 0.08);
    accent.setHSL(h, s, l);
    if (imageColor) {
      const img = new THREE.Color(imageColor.r / 255, imageColor.g / 255, imageColor.b / 255).convertSRGBToLinear();
      accent.lerp(img, 0.85);
    }
    if (backgroundColor) {
      accent.lerp(backgroundColor, 0.05);
    }
    const diff =
      Math.abs(accent.r - tint.r) + Math.abs(accent.g - tint.g) + Math.abs(accent.b - tint.b);
    if (diff < 0.05) {
      accent.offsetHSL(0.18, 0, 0);
    }
    return accent;
  }

  function getTexture(url, onColor) {
    if (!url) return null;
    if (previewTextureCache.has(url)) {
      const cachedTexture = previewTextureCache.get(url);
      if (onColor && imageColorCache.has(url)) onColor(imageColorCache.get(url));
      return cachedTexture;
    }
    const texture = textureLoader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
        tex.needsUpdate = true;
        const avg = averageImageColor(tex.image);
        if (avg) {
          imageColorCache.set(url, avg);
          if (onColor) onColor(avg);
        }
      },
      undefined,
      () => {
        if (onColor && imageColorCache.has(url)) onColor(imageColorCache.get(url));
      }
    );
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

const surfacePalette = {
  name: "surface",
};

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
    points.userData = { speed, baseOpacity: opacity };
    scene.add(points);
    particleLayers.push(points);
  }

  const dustDensity = Math.max(0.45, densityScale);
  const dustScale = isLowPower ? 0.7 : 1;
  createDustLayer(Math.round(800 * dustDensity * dustScale), 30, 0.05, 0.45, 0x8fbaff, 0.002);
  createDustLayer(Math.round(600 * dustDensity * dustScale), 40, 0.08, 0.3, 0x5efbe0, -0.001);
  createDustLayer(Math.round(1200 * dustDensity * dustScale), 50, 0.03, 0.2, 0xffffff, 0.0015);

  const bubblesGroup = new THREE.Group();
  scene.add(bubblesGroup);
  const outerGeometry = new THREE.SphereGeometry(1, 96, 96);

const targetLookAt = new THREE.Vector3(0, 0.2, 0);
const parallaxMouse = new THREE.Vector2(0, 0);
const viewForward = new THREE.Vector3();
const viewRight = new THREE.Vector3();
const viewUp = new THREE.Vector3();
const cameraToBubble = new THREE.Vector3();
const swimmerPushVec = new THREE.Vector3();
const swimDirFlat = new THREE.Vector3();

const bounds = {
  x: 4.2,
  y: 2.6,
  z: 4.5,
};

const depthClampConfig = {
  baseFrontDistance: 22,
  baseBackDistance: 30,
  frontDistance: 22,
  backDistance: 30,
  normal: new THREE.Vector3(),
  frontPlaneD: 0,
  backPlaneD: 0,
};
function updateDepthClampPlanes() {
  depthClampConfig.normal.copy(camera.position).sub(targetLookAt).normalize();
  const zoomStretch = Math.max(1, orbitState.radius * 0.12);
  depthClampConfig.frontDistance = depthClampConfig.baseFrontDistance + zoomStretch * 1.8;
  depthClampConfig.backDistance = depthClampConfig.baseBackDistance + zoomStretch * 2.2;
  depthClampConfig.frontPlaneD = targetLookAt
    .clone()
    .addScaledVector(depthClampConfig.normal, depthClampConfig.frontDistance)
    .dot(depthClampConfig.normal);
  depthClampConfig.backPlaneD = targetLookAt
    .clone()
    .addScaledVector(depthClampConfig.normal, -depthClampConfig.backDistance)
    .dot(depthClampConfig.normal);
}
updateDepthClampPlanes();

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

function clampBubbleToCameraView(bubble, data, radius, tanHalfFov) {
  cameraToBubble.copy(bubble.position).sub(camera.position);
  let depth = cameraToBubble.dot(viewForward);
  depth = Math.max(depth, radius + 0.4);
  let halfHeight = tanHalfFov * depth;
  let halfWidth = halfHeight * camera.aspect;
  const padding = Math.max(0.25, radius * 1.15);
  const minDepth = Math.max(radius + 2.2, 4.2);
  const maxDepth = bounds.z * 1.15;

  if (depth < minDepth) {
    const correction = minDepth - depth;
    bubble.position.addScaledVector(viewForward, correction);
    const component = data.velocity.dot(viewForward);
    if (component < 0) data.velocity.addScaledVector(viewForward, -component * 1.35);
    data.basePosition.addScaledVector(viewForward, correction * 0.15);
    depth = minDepth;
  } else if (depth > maxDepth) {
    const correction = depth - maxDepth;
    bubble.position.addScaledVector(viewForward, -correction);
    const component = data.velocity.dot(viewForward);
    if (component > 0) data.velocity.addScaledVector(viewForward, -component * 0.9);
    data.basePosition.addScaledVector(viewForward, -correction * 0.15);
    depth = maxDepth;
  }

  cameraToBubble.subVectors(bubble.position, camera.position);
  depth = cameraToBubble.dot(viewForward);
  halfHeight = tanHalfFov * depth;
  halfWidth = halfHeight * camera.aspect;

  const clampAxis = (dist, limit, axisVec) => {
    if (dist > limit) {
      const correction = dist - limit;
      bubble.position.addScaledVector(axisVec, -correction);
      data.velocity.addScaledVector(axisVec, -data.velocity.dot(axisVec) * 1.6);
      data.basePosition.addScaledVector(axisVec, -correction * 0.15);
    } else if (dist < -limit) {
      const correction = dist + limit;
      bubble.position.addScaledVector(axisVec, -correction);
      data.velocity.addScaledVector(axisVec, -data.velocity.dot(axisVec) * 1.6);
      data.basePosition.addScaledVector(axisVec, -correction * 0.15);
    }
  };

  clampAxis(cameraToBubble.dot(viewRight), Math.max(0.6, halfWidth - padding), viewRight);
  clampAxis(cameraToBubble.dot(viewUp), Math.max(0.5, halfHeight - padding), viewUp);

  if (depthClampConfig.normal.lengthSq() > 0) {
    const frontDistance =
      bubble.position.dot(depthClampConfig.normal) - depthClampConfig.frontPlaneD;
    if (frontDistance > 0) {
      bubble.position.addScaledVector(depthClampConfig.normal, -frontDistance);
      const velFront = data.velocity?.dot(depthClampConfig.normal) ?? 0;
      if (data.velocity && velFront > 0) {
        data.velocity.addScaledVector(depthClampConfig.normal, -velFront * 1.35);
      }
      data.basePosition.addScaledVector(depthClampConfig.normal, -frontDistance * 0.25);
    }
    const backDistance =
      bubble.position.dot(depthClampConfig.normal) - depthClampConfig.backPlaneD;
    if (backDistance < 0) {
      bubble.position.addScaledVector(depthClampConfig.normal, -backDistance);
      const velBack = data.velocity?.dot(depthClampConfig.normal) ?? 0;
      if (data.velocity && velBack < 0) {
        data.velocity.addScaledVector(depthClampConfig.normal, -velBack * 1.2);
      }
      data.basePosition.addScaledVector(depthClampConfig.normal, -backDistance * 0.25);
    }
  }
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
    const baseTint = new THREE.Color(project.tint || "#6fb1ff");
    const bubbleTint = baseTint.clone();
    const accentColor = deriveBubbleAccent(bubbleTint, paletteTintColor, null);
    let bubble = null;
    let shellMaterial = null;
    const applyImageTint = (avgColor) => {
      const nextTint = deriveBubbleTint(baseTint, avgColor, paletteTintColor);
      const nextAccent = deriveBubbleAccent(nextTint, paletteTintColor, avgColor);
      bubbleTint.copy(nextTint);
      accentColor.copy(nextAccent);
      if (bubble?.userData?.tintColor) bubble.userData.tintColor.copy(nextTint);
      if (bubble?.userData?.baseAccentColor) bubble.userData.baseAccentColor.copy(nextAccent);
      if (shellMaterial?.uniforms?.uTint?.value) shellMaterial.uniforms.uTint.value.copy(nextTint);
      if (shellMaterial?.uniforms?.uAccent?.value) shellMaterial.uniforms.uAccent.value.copy(nextAccent);
    };
    const previewTexture = getTexture(project.image, applyImageTint);
    shellMaterial = createBubbleMaterial(bubbleTint.clone(), accentColor.clone(), previewTexture);
    bubble = new THREE.Mesh(outerGeometry, shellMaterial);
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

    bubble.userData = {
      ...project,
      id: idx,
      basePosition: basePosition.clone(),
      offset: Math.random() * Math.PI * 2,
      shellMaterial,
      originalScale: baseScale,
      originalRadius: baseScale,
      popState: "idle",
      popStart: 0,
      tintColor: bubbleTint.clone(),
      baseAccentColor: accentColor.clone(),
      accentColor: accentColor.clone(),
      audioScale: 1,
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
  minActive: Math.max(14, Math.round(22 * densityScale)),
  maxActive: Math.max(40, Math.round((isLowPower ? 80 : 120) * densityScale)),
  radiusMin: 4.5,
  radiusMax: 14,
  verticalSpread: 5.2,
};
const droplets = [];
const swimmers = [];
const quagsireModelPath = assetPath("models/quagsire.glb");
const wailordModelPath = assetPath("models/wailord.glb");
let GLTFLoaderClass = window.THREE?.GLTFLoader;

async function getGLTFLoader() {
  if (GLTFLoaderClass) return GLTFLoaderClass;
  const mod = await import("three/examples/jsm/loaders/GLTFLoader.js");
  GLTFLoaderClass = mod.GLTFLoader;
  return GLTFLoaderClass;
}

function clampSwimmerToBounds(entry) {
  const { group } = entry;
  if (!group) return;
  const pos = group.position;
  const limitX = Math.max(0.5, bounds.x - 0.6);
  const limitYMin = -Math.max(0.5, bounds.y * 0.6);
  const limitYMax = Math.max(0.4, bounds.y * 0.4);
  const limitZ = Math.max(1, bounds.z - 1.2);
  let bounced = false;
  if (pos.x > limitX) {
    pos.x = limitX;
    bounced = true;
  } else if (pos.x < -limitX) {
    pos.x = -limitX;
    bounced = true;
  }
  if (pos.y > limitYMax) {
    pos.y = limitYMax;
    bounced = true;
  } else if (pos.y < limitYMin) {
    pos.y = limitYMin;
    bounced = true;
  }
  if (pos.z > limitZ) {
    pos.z = limitZ;
    bounced = true;
  } else if (pos.z < -limitZ) {
    pos.z = -limitZ;
    bounced = true;
  }
  if (bounced) {
    entry.pathOffset = (entry.pathOffset || 0) + Math.PI * 0.8;
  }
}

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

function updateSwimmers(audioResponse, elapsed, delta = 0) {
  if (isFarView) {
    swimmers.forEach((entry) => {
      if (entry.group) entry.group.visible = false;
    });
    return;
  }
  const levelEnergy = audioResponse?.active ? audioResponse.level : 0;
  const pulseEnergy = audioResponse?.active ? audioResponse.pulse : 0;
  const swellEnergy = audioResponse?.active ? audioResponse.swell : 0;
  swimmers.forEach((entry, idx) => {
    const {
      group,
      basePosition,
      radius,
      speed,
      pathOffset,
      verticalRange,
      wobbleAmplitude,
      lockVertical,
      yawOffset = 0,
      liftAmplitude = 0,
      liftSpeed = 0,
      liftPhase = 0,
    } = entry;
    const peak = Math.max(pulseEnergy - 0.3, 0);
    const swimSpeed = speed + peak * 0.5 + idx * 0.015;
    const angle = elapsed * swimSpeed + pathOffset;
    const amplitude = radius + peak * 1.3 + levelEnergy * 0.4;
    const lift = swellEnergy * 0.6;
    const extraLift = liftAmplitude
      ? Math.sin(elapsed * (liftSpeed || 0.35) + liftPhase) * liftAmplitude
      : 0;
    group.position.set(
      basePosition.x + Math.cos(angle) * amplitude,
      basePosition.y +
        Math.sin(angle * 1.2) * verticalRange +
        Math.cos(elapsed * 0.7 + idx) * wobbleAmplitude +
        lift +
        extraLift,
      basePosition.z + Math.sin(angle) * amplitude
    );
    const lookAhead = angle + 0.2;
    const target = new THREE.Vector3(
      basePosition.x + Math.cos(lookAhead) * amplitude,
      group.position.y + Math.sin(lookAhead * 1.1) * wobbleAmplitude,
      basePosition.z + Math.sin(lookAhead) * amplitude
    );
    if (lockVertical) {
      swimDirFlat.set(target.x - group.position.x, 0, target.z - group.position.z);
      const lenSq = swimDirFlat.lengthSq();
      if (lenSq > 0.0001) {
        const yaw = Math.atan2(swimDirFlat.x, swimDirFlat.z) + yawOffset;
        const targetRoll = entry.tilt || 0;
        group.rotation.set(0, yaw, targetRoll);
      }
    } else {
      group.lookAt(target);
      group.rotation.z += (entry.tilt - group.rotation.z) * 0.08;
      group.rotation.y += peak * 0.02;
    }
    clampSwimmerToBounds(entry);
    const scalePulse = 1 + peak * 0.25 + levelEnergy * 0.05;
    group.scale.setScalar(entry.scale * scalePulse);
    if (entry.mixer) {
      entry.mixer.update(Math.max(delta, 0) * (1 + peak * 0.6));
    }
  });
}

function repelBubblesFromSwimmers(bubble, data) {
  if (!swimmers.length) return;
  swimmers.forEach((entry) => {
    const { group, colliderRadius = 1 } = entry;
    if (!group) return;
    swimmerPushVec.copy(bubble.position).sub(group.position);
    const dist = swimmerPushVec.length();
    if (dist === 0) return;
    const bubbleRadius = Math.max(0.2, data.originalRadius || bubble.scale.x);
    const minDist = colliderRadius + bubbleRadius;
    if (dist < minDist) {
      const push = minDist - dist;
      swimmerPushVec.normalize();
      bubble.position.addScaledVector(swimmerPushVec, push);
      data.basePosition.addScaledVector(swimmerPushVec, push * 0.5);
      if (data.velocity) {
        const component = data.velocity.dot(swimmerPushVec);
        const rebound = -component * 1.6;
        data.velocity.addScaledVector(swimmerPushVec, rebound - component);
      }
    }
  });
}

  function tuneMaterialForLighting(mat) {
    if (!mat) return;
  if ("metalness" in mat) mat.metalness = Math.min(mat.metalness ?? 0.5, 0.12);
  if ("roughness" in mat) mat.roughness = Math.max(mat.roughness ?? 0.5, 0.45);
  if ("envMapIntensity" in mat) mat.envMapIntensity = Math.min(mat.envMapIntensity ?? 1, 0.22);
  if (mat.color) {
    mat.color.multiplyScalar(0.92);
  }
  if (mat.emissive) {
    mat.emissive.multiplyScalar(0.2);
    mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 0.08, 0.12);
  }
  mat.needsUpdate = true;
}

async function assetExists(url) {
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) return true;
    const get = await fetch(url, { method: "GET" });
    return get.ok;
  } catch (error) {
    return false;
  }
}

function loadQuagsireSwimmer() {
  (async () => {
    const GLTFLoader = await getGLTFLoader();
    const exists = await assetExists(quagsireModelPath);
    if (!exists) {
      console.warn(`Quagsire model not found at ${quagsireModelPath}; skipping load.`);
      return;
    }
    const loader = new GLTFLoader();
    loader.load(
      quagsireModelPath,
      (gltf) => {
        window.latestQuagsire = gltf;
        const sceneRoot = gltf.scene || new THREE.Group();
        sceneRoot.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
          }
        });
        const basePosition = new THREE.Vector3(2.6, -0.4, -3.4);
        const baseScale = 0.45;
        sceneRoot.position.copy(basePosition);
        sceneRoot.scale.setScalar(baseScale);
        sceneRoot.rotation.y = Math.PI;
        scene.add(sceneRoot);
        const mixer = gltf.animations?.length ? new THREE.AnimationMixer(sceneRoot) : null;
        if (mixer) {
          gltf.animations.forEach((clip) => {
            const action = mixer.clipAction(clip);
            action.play();
          });
        }
        swimmers.push({
          group: sceneRoot,
          scale: baseScale,
          radius: 4.5,
          speed: 0.22,
          verticalRange: 0.6,
          pathOffset: Math.random() * Math.PI * 2,
          wobbleAmplitude: 0.25,
          basePosition,
          tilt: -0.15,
          colliderRadius: 0.8,
          mixer,
        });
      },
      undefined,
      (error) => {
        console.warn("Failed to load quagsire model", error);
      }
    );
  })();
}

loadQuagsireSwimmer();

function loadWailordSwimmer() {
  getGLTFLoader().then((GLTFLoader) => {
    if (!GLTFLoader) {
      console.warn("GLTFLoader unavailable; skipping Wailord load.");
      return;
    }
    const loader = new GLTFLoader();
    loader.load(
      wailordModelPath,
      (gltf) => {
        const sceneRoot = gltf.scene || new THREE.Group();
        sceneRoot.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            tuneMaterialForLighting(child.material);
          }
        });
        const basePosition = new THREE.Vector3(0, -0.1, -5.2);
        const baseScale = 0.8;
        sceneRoot.position.copy(basePosition);
        sceneRoot.scale.setScalar(baseScale);
        sceneRoot.rotation.x = -Math.PI * 0.5; // pitch up so the head faces forward, not downward
        sceneRoot.rotation.y = Math.PI;
        scene.add(sceneRoot);
        const clips = gltf.animations || [];
        const mixer = clips.length ? new THREE.AnimationMixer(sceneRoot) : null;
        if (mixer) {
          clips.forEach((clip) => {
            const action = mixer.clipAction(clip);
            action.play();
          });
        }
        swimmers.push({
          group: sceneRoot,
          scale: baseScale,
          radius: THREE.MathUtils.randFloat(3.0, 4.4),
          speed: THREE.MathUtils.randFloat(0.14, 0.22),
          verticalRange: THREE.MathUtils.randFloat(0.25, 0.55),
          pathOffset: Math.random() * Math.PI * 2,
          wobbleAmplitude: THREE.MathUtils.randFloat(0.08, 0.2),
          basePosition,
          tilt: 0,
          colliderRadius: 2.1,
          mixer,
          lockVertical: true,
          yawOffset: 0,
          liftAmplitude: THREE.MathUtils.randFloat(0.25, 0.6),
          liftSpeed: THREE.MathUtils.randFloat(0.25, 0.55),
          liftPhase: Math.random() * Math.PI * 2,
        });
      },
      undefined,
      (error) => {
        console.warn("Failed to load Wailord GLB model", error);
      }
    );
  });
}

loadWailordSwimmer();

let activeDropletTarget = 0;
function updateDropletActivity(force = false) {
  const target = isFarView
    ? 0
    : Math.round(THREE.MathUtils.lerp(dropletSettings.minActive, dropletSettings.maxActive, getZoomRatio()));
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

function updateZoomDespawn() {
  const shouldDespawn = orbitState.radius > DESPAWN_RADIUS;
  if (shouldDespawn === isFarView) return;
  isFarView = shouldDespawn;
  bubbles.forEach((bubble) => {
    bubble.visible = !isFarView && bubble.userData.popState !== "hidden";
  });
  droplets.forEach((droplet) => {
    droplet.visible = !isFarView && droplet.userData.active;
  });
  swimmers.forEach((entry) => {
    if (entry.group) entry.group.visible = !isFarView;
  });
  particleLayers.forEach((layer) => {
    layer.visible = !isFarView;
    if (layer.material?.opacity !== undefined) {
      layer.material.opacity = isFarView ? 0 : layer.userData.baseOpacity;
    }
  });
  bubbleBursts.forEach((burst) => {
    burst.visible = !isFarView;
  });
  updateDropletActivity(true);
}

const bubbleBursts = [];
const canvasObserverOptions = {
  root: null,
  threshold: 0,
};
let canvasVisibilityObserver = null;
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
  const audioToggle = document.getElementById("audio-toggle");

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
  const AUDIO_TRACK_URL = assetPath("audio/chill-chip.wav");
  const audioState = {
    media: null,
    context: null,
    analyser: null,
    sourceNode: null,
    dataArray: null,
    enabled: false,
    attemptedAutoStart: false,
  };
  const focusableSelectors =
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
  let activeFocusTrap = null;
  let lastFocusedElement = null;

  function activateFocusTrap(container) {
    if (!container) return;
    const handleTrap = (event) => {
      if (event.key !== "Tab") return;
      const nodes = Array.from(container.querySelectorAll(focusableSelectors)).filter((el) => {
        const isDisabled = el.hasAttribute("disabled");
        const isHidden = el.getAttribute("aria-hidden") === "true";
        const disallowsTab = el.tabIndex === -1;
        return !isDisabled && !isHidden && !disallowsTab;
      });
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        last.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first.focus();
        event.preventDefault();
      }
    };
    container.addEventListener("keydown", handleTrap);
    activeFocusTrap = { container, handleTrap };
  }

  function releaseFocusTrap() {
    if (activeFocusTrap?.container && activeFocusTrap.handleTrap) {
      activeFocusTrap.container.removeEventListener("keydown", activeFocusTrap.handleTrap);
    }
    activeFocusTrap = null;
  }
  const audioReactiveLevels = {
    level: 0,
    bass: 0,
    mids: 0,
    treble: 0,
    pulse: 0,
    swell: 0,
    active: false,
  };
  let audioMotionPhase = 0;
  if (audioState.media) {
    audioState.media.loop = true;
    audioState.media.preload = "auto";
    audioState.media.volume = 0.03;
  }

  if (introPrompt) {
    document.body.classList.add("prompt-active");
    const dismissPrompt = () => {
      introPrompt.classList.add("hidden");
      document.body.classList.remove("prompt-active");
      releaseFocusTrap();
      setTimeout(() => introPrompt.remove(), 500);
      primeAudioFromInteraction();
      const fallbackFocus = audioToggle || document.querySelector(".hero .primary") || document.body;
      fallbackFocus?.focus?.();
    };
    activateFocusTrap(introPrompt);
    (introEnter || introPrompt).focus();
    addManagedListener(introPrompt, "click", (event) => {
      if (event.target === introPrompt) {
        dismissPrompt();
      }
    });
    if (introEnter) {
      addManagedListener(introEnter, "click", dismissPrompt);
    }
    addManagedListener(window, "keydown", (event) => {
      if (event.key === "Enter" && document.body.classList.contains("prompt-active")) {
        dismissPrompt();
      }
    });
  }

  function updateAudioToggleUI() {
    if (!audioToggle) return;
    const isActive = Boolean(audioState.enabled && audioState.media && !audioState.media.paused);
    audioToggle.dataset.state = isActive ? "on" : "off";
    audioToggle.setAttribute("aria-pressed", isActive ? "true" : "false");
    audioToggle.textContent = isActive ? "Sound on · Pause" : "Enable sound";
  }

  function ensureMedia() {
    if (audioState.media) return audioState.media;
    if (typeof Audio === "undefined") return null;
    audioState.media = new Audio(AUDIO_TRACK_URL);
    audioState.media.loop = true;
    audioState.media.preload = "auto";
    audioState.media.volume = 0.03;
    return audioState.media;
  }

  async function ensureAudioGraph() {
    const media = ensureMedia();
    if (!media) return false;
    if (audioState.context || audioState.dataArray) return true;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return true;
    audioState.context = new AudioContextClass();
    audioState.analyser = audioState.context.createAnalyser();
    audioState.analyser.fftSize = 512;
    audioState.analyser.smoothingTimeConstant = 0.45;
    audioState.dataArray = new Uint8Array(audioState.analyser.frequencyBinCount);
    audioState.sourceNode = audioState.context.createMediaElementSource(audioState.media);
    audioState.sourceNode.connect(audioState.analyser);
    audioState.analyser.connect(audioState.context.destination);
    return true;
  }

  async function startSoundtrack() {
    if (!ensureMedia()) return;
    audioState.attemptedAutoStart = true;
    if (!(await ensureAudioGraph())) {
      updateAudioToggleUI();
      return;
    }
    try {
      if (audioState.context?.state === "suspended") {
        await audioState.context.resume();
      }
      await audioState.media.play();
      audioState.enabled = true;
    } catch (error) {
      console.warn("Unable to start soundtrack", error);
      audioState.enabled = false;
    }
    updateAudioToggleUI();
  }

  function stopSoundtrack() {
    if (!audioState.media) return;
    audioState.media.pause();
    audioState.enabled = false;
    updateAudioToggleUI();
  }

  function handleAudioToggle() {
    if (audioState.enabled) {
      stopSoundtrack();
    } else {
      startSoundtrack();
    }
  }

  function primeAudioFromInteraction() {
    if (!audioState.media || audioState.enabled || audioState.attemptedAutoStart) return;
    startSoundtrack();
  }

  function sampleAudioLevels() {
    const isActive = Boolean(audioState.enabled && audioState.media && !audioState.media.paused);
    audioReactiveLevels.active = isActive;
    if (!audioState.analyser || !audioState.dataArray) {
      audioReactiveLevels.level = 0;
      audioReactiveLevels.bass = 0;
      audioReactiveLevels.mids = 0;
      audioReactiveLevels.treble = 0;
      audioReactiveLevels.pulse = 0;
      audioReactiveLevels.swell = 0;
      audioReactiveLevels.active = false;
      return audioReactiveLevels;
    }
    audioState.analyser.getByteFrequencyData(audioState.dataArray);
    const len = audioState.dataArray.length || 1;
    let sum = 0;
    let low = 0;
    let mid = 0;
    let high = 0;
    const lowCount = Math.max(1, Math.floor(len * 0.22));
    const highStart = Math.floor(len * 0.68);
    const highCount = Math.max(1, len - highStart);
    const midCount = Math.max(1, highStart - lowCount);
    for (let i = 0; i < len; i += 1) {
      const value = audioState.dataArray[i] / 255;
      sum += value;
      if (i < lowCount) {
        low += value;
      } else if (i < highStart) {
        mid += value;
      } else {
        high += value;
      }
    }
    const level = sum / len;
    const bass = low / lowCount;
    const mids = mid / midCount;
    const treble = high / highCount;
    const baseSmooth = isActive ? 0.65 : 0.2;
    audioReactiveLevels.level += (level - audioReactiveLevels.level) * baseSmooth;
    audioReactiveLevels.bass += (bass - audioReactiveLevels.bass) * (isActive ? 0.58 : 0.18);
    audioReactiveLevels.mids += (mids - audioReactiveLevels.mids) * (isActive ? 0.5 : 0.14);
    audioReactiveLevels.treble += (treble - audioReactiveLevels.treble) * (isActive ? 0.62 : 0.18);
    const energy = Math.max(level - 0.25, 0);
    const pulseEnergy = Math.max(energy, treble - 0.3);
    audioReactiveLevels.pulse = Math.max(
      audioReactiveLevels.pulse * (isActive ? 0.82 : 0.7),
      pulseEnergy * (isActive ? 1.55 : 1.0)
    );
    const swellTarget = Math.max(mids - 0.2, 0) + energy * 0.35;
    audioReactiveLevels.swell += (swellTarget - audioReactiveLevels.swell) * (isActive ? 0.5 : 0.18);
    if (!isActive) {
      audioReactiveLevels.level = 0;
      audioReactiveLevels.bass = 0;
      audioReactiveLevels.mids = 0;
      audioReactiveLevels.treble = 0;
      audioReactiveLevels.swell = 0;
      audioReactiveLevels.pulse = 0;
    }
    return audioReactiveLevels;
  }

  audioToggle?.addEventListener("click", handleAudioToggle);
  updateAudioToggleUI();
  const oncePrimeAudio = () => {
    primeAudioFromInteraction();
    window.removeEventListener("pointerdown", oncePrimeAudio);
  };
  window.addEventListener("pointerdown", oncePrimeAudio);

  function renderSiteContent(siteData = window.SITE_DATA || {}) {
    if (!siteData) return;
    if (window.REACT_RENDERED) return;
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
          img.loading = "lazy";
          img.decoding = "async";
          img.width = 1200;
          img.height = 675;
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

  function validateSiteData(data) {
    if (!data || typeof data !== "object") return false;
    const requiredArrays = ["stats", "skills", "experiences", "featuredProjects", "extracurriculars", "bubbleProjects"];
    const requiredObjects = ["profileLinks", "education"];
    if (requiredObjects.some((key) => !data[key] || typeof data[key] !== "object")) return false;
    if (requiredArrays.some((key) => !Array.isArray(data[key]))) return false;
    return true;
  }

  async function fetchLatestSiteData() {
    const dataUrl = window.SITE_DATA_URL || "./site-data.json";
    try {
      const response = await fetch(`${dataUrl}?cache=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Failed to fetch site-data: ${response.status}`);
      const json = await response.json();
      if (!validateSiteData(json)) throw new Error("Site data failed validation");
      return json;
    } catch (error) {
      console.error("Unable to refresh site content", error);
      return validateSiteData(window.SITE_DATA) ? window.SITE_DATA : null;
    }
  }

  if (!window.REACT_RENDERED) {
    async function initSiteData() {
      const cached = validateSiteData(window.SITE_DATA) ? window.SITE_DATA : null;
      if (cached) {
        renderSiteContent(cached);
      }
      const fresh = await fetchLatestSiteData();
      if (fresh && fresh !== cached) {
        window.SITE_DATA = fresh;
        renderSiteContent(fresh);
      }
    }

    async function refreshSiteContent() {
      const fresh = await fetchLatestSiteData();
      if (fresh) {
        window.SITE_DATA = fresh;
        renderSiteContent(fresh);
      }
    }

    const AUTO_REFRESH_INTERVAL = 120000;
    initSiteData();

    refreshIntervalId = setInterval(() => {
      if (!document.hidden) {
        refreshSiteContent();
      }
    }, AUTO_REFRESH_INTERVAL);
  }

  if (!window.REACT_RENDERED) {
    panelClose && addManagedListener(panelClose, "click", hidePanel);
    panelOverlay && addManagedListener(panelOverlay, "click", hidePanel);
    addManagedListener(window, "keydown", (event) => {
      if (event.key === "Escape") hidePanel();
    });
  }

  function hidePanel() {
    window.dispatchEvent(new CustomEvent("panel:hide"));
  }

  function showPanel(project) {
    window.dispatchEvent(new CustomEvent("panel:show", { detail: project }));
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
    if (isFarView) return;
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
        const capped = THREE.MathUtils.clamp(speed * 0.9, 0.8, 9);
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
    if (isFarView) {
      for (let i = bubbleBursts.length - 1; i >= 0; i -= 1) {
        const burst = bubbleBursts[i];
        scene.remove(burst);
        bubbleBursts.splice(i, 1);
      }
      return;
    }
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

  addManagedListener(window, "pointerdown", handlePointerDown);
  addManagedListener(window, "pointermove", handlePointerMove);
  addManagedListener(window, "pointerup", endDrag);
  addManagedListener(window, "pointerleave", endDrag);

  if ("IntersectionObserver" in window && canvas) {
    canvasVisibilityObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const visible = entry.isIntersecting;
          canvasIsVisible = visible;
          setRenderPaused("offscreen", !visible);
        });
      },
      { ...canvasObserverOptions, rootMargin: "0px" }
    );
    canvasVisibilityObserver.observe(canvas);
  }

  const clock = new THREE.Clock();
  let lastElapsed = 0;

  addManagedListener(document, "visibilitychange", () => {
    setRenderPaused("hidden", document.hidden);
    if (!document.hidden) {
      lastElapsed = clock.getElapsedTime();
    }
  });
  setRenderPaused("hidden", document.hidden);

function applyCameraOrbit() {
    const azimuthSpeed = 0.025;
    const polarSpeed = 0.02;
    const zoomSpeed = 0.038;
    const zoomBoost = Math.max(1, orbitState.radius * 0.12);
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
  if (orbitKeys.zoomIn) {
    orbitState.radius = Math.max(
      orbitState.minRadius,
      orbitState.radius - zoomSpeed * zoomBoost
    );
  }
  if (orbitKeys.zoomOut) {
    orbitState.radius = Math.max(
      orbitState.minRadius,
      orbitState.radius + zoomSpeed * zoomBoost
    );
  }
  const polarTarget = orbitState.polar;
  const orbitRadius = orbitState.radius;
  const sinPhi = Math.sin(polarTarget);
  const cosPhi = Math.cos(polarTarget);
  orbitPosition.set(
    orbitRadius * sinPhi * Math.sin(orbitState.azimuth),
    orbitRadius * cosPhi,
    orbitRadius * sinPhi * Math.cos(orbitState.azimuth)
  );
  camera.position.lerp(orbitPosition, 0.08);
  const parallaxScale = 0.3;
  const lookBaseY = 0.35;
  targetLookAt.x += (parallaxMouse.x * parallaxScale - targetLookAt.x) * 0.04;
  targetLookAt.y += (lookBaseY + parallaxMouse.y * parallaxScale * 0.4 - targetLookAt.y) * 0.04;
  camera.lookAt(targetLookAt);
  updateDepthClampPlanes();
  refreshBounds();
  updateDropletActivity();
  updateZoomDespawn();
  const farTarget = Math.max(camera.far, orbitRadius * 6);
  if (farTarget > camera.far + 0.5) {
    camera.far = farTarget;
    camera.updateProjectionMatrix();
  }
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
    if (destroyed) return;
    animationId = requestAnimationFrame(animate);
    if (!isRenderingActive()) {
      lastElapsed = clock.getElapsedTime();
      return;
    }
    const elapsed = clock.getElapsedTime();
    const delta = Math.min(0.05, Math.max(0.001, elapsed - lastElapsed || 0.016));
    lastElapsed = elapsed;
    applyCameraOrbit();
    const audioResponse = sampleAudioLevels();
    if (audioResponse.active) {
      audioMotionPhase += delta * (0.35 + audioResponse.level * 2.6 + audioResponse.treble * 1.4);
    } else {
      audioMotionPhase += delta * 0.2;
    }
    const rawWave = 0.5 + 0.5 * Math.sin(audioMotionPhase);
    const audioWave = audioResponse.active ? rawWave : 0;
    const levelEnergy = audioResponse.active ? audioResponse.level : 0;
    const pulseEnergy = audioResponse.active ? audioResponse.pulse : 0;
    const trebleEnergy = audioResponse.active ? audioResponse.treble : 0;
    const bassEnergy = audioResponse.active ? audioResponse.bass : 0;
    const swellEnergy = audioResponse.active ? audioResponse.swell : 0;
    const layeredAudio = audioResponse.active
      ? THREE.MathUtils.clamp(levelEnergy * 0.55 + pulseEnergy * 1.2 + trebleEnergy * 0.45, 0, 1.6)
      : 0;
    const fluidLift = audioResponse.active
      ? THREE.MathUtils.clamp(swellEnergy * 1.05 + audioWave * 0.5, 0, 1.5)
      : 0;
    const peakBoost = audioResponse.active ? Math.max(layeredAudio - 0.65, 0) * 1.6 : 0;

    if (activeLightingPalette) {
      const baseTintStrength = activeLightingPalette.tintStrength ?? 0.24;
      const baseExposure = activeLightingPalette.exposure ?? renderer.toneMappingExposure;
      const baseFog = activeLightingPalette.fogDensity ?? scene.fog.density;
      paletteTintTarget = Math.min(0.9, baseTintStrength + layeredAudio * 0.32 + audioWave * 0.16);
      exposureTarget = baseExposure * (1 + layeredAudio * 0.16 + swellEnergy * 0.08);
      fogDensityTarget = Math.max(0.01, baseFog * (1 - fluidLift * 0.12));
    }

    if (!isFarView) {
      particleLayers.forEach((layer, idx) => {
        const spinBoost = layeredAudio * 0.004 * (idx + 1);
        layer.rotation.y += layer.userData.speed + spinBoost;
        const material = layer.material;
        if (material && layer.userData.baseOpacity !== undefined) {
          const targetOpacity = Math.min(
            1,
            layer.userData.baseOpacity + layeredAudio * (0.4 - idx * 0.06) + fluidLift * 0.2
          );
          material.opacity += (targetOpacity - material.opacity) * 0.08;
        }
      });
    } else {
      particleLayers.forEach((layer) => {
        if (layer.material?.opacity !== undefined) {
          layer.material.opacity += (0 - layer.material.opacity) * 0.2;
        }
      });
    }

    camera.getWorldDirection(viewForward).normalize();
    viewRight.crossVectors(viewForward, camera.up).normalize();
    viewUp.crossVectors(viewRight, viewForward).normalize();
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const driftBoost = 0.85 + layeredAudio * 2.4 + bassEnergy * 0.8 + peakBoost * 2.2;
    const jitterChance = 0.0004 + layeredAudio * 0.05 + peakBoost * 0.03;
    const damping = THREE.MathUtils.lerp(0.9992, 0.984, THREE.MathUtils.clamp(layeredAudio, 0, 1));
    const baseLerp = 0.001 + fluidLift * 0.006 + layeredAudio * 0.002;
    const swirlSpeed = 0.4 + layeredAudio * 2.6 + peakBoost * 1.6;
    const swirlAmp = (0.02 + layeredAudio * 0.05 + fluidLift * 0.2 + peakBoost * 0.25) * delta;

    const tintMix = paletteTintMix;
    const liquidTintMix = Math.min(1, tintMix + 0.12);
    const hideBubbles = false;
    bubbles.forEach((bubble) => {
      const data = bubble.userData;
      if (isFarView) {
        bubble.visible = false;
        return;
      }
      const { basePosition, shellMaterial, velocity, originalRadius } = data;
      const canFloat = bubble !== selectedBubble && data.popState !== "shrink";
      bubble.visible = true;
      if (canFloat) {
        if (Math.random() < jitterChance) {
          const impulseStrength =
            0.08 + layeredAudio * 0.8 + trebleEnergy * 0.45 + fluidLift * 0.35 + peakBoost * 1.1;
          velocity.add(randomVelocity().multiplyScalar(impulseStrength));
        }
        bubble.position.addScaledVector(velocity, delta * driftBoost);
        bubble.position.y += Math.sin(elapsed * swirlSpeed + data.offset) * swirlAmp;
        bubble.position.x += Math.cos(elapsed * swirlSpeed * 0.8 + data.offset) * swirlAmp * 0.6;
        basePosition.lerp(bubble.position, baseLerp);
        if (velocity.lengthSq() < 0.00001) {
          velocity.copy(
            randomVelocity().multiplyScalar(0.35 + layeredAudio * 0.8 + fluidLift * 0.6 + peakBoost)
          );
        } else {
          velocity.multiplyScalar(damping);
        }
        const radius = Math.max(0.2, originalRadius || bubble.scale.x);
        clampBubbleToCameraView(bubble, data, radius, tanHalfFov);
        repelBubblesFromSwimmers(bubble, data);
        const maxZ = Math.max(0.1, bounds.z - radius);
        if (bubble.position.z > maxZ) {
          bubble.position.z = maxZ;
          velocity.z *= -1.3;
          basePosition.z = bubble.position.z;
        } else if (bubble.position.z < -maxZ) {
          bubble.position.z = -maxZ;
          velocity.z *= -1.3;
          basePosition.z = bubble.position.z;
        }
      }
      bubble.rotation.y += 0.001 + layeredAudio * 0.015 + peakBoost * 0.01;
      bubble.rotation.x += 0.0006 + fluidLift * 0.01 + peakBoost * 0.008;
      if (shellMaterial) {
        shellMaterial.uniforms.uTint.value.copy(data.tintColor).lerp(paletteTintColor, tintMix);
        if (data.baseAccentColor) {
          data.accentColor.copy(data.baseAccentColor);
          data.accentColor.lerp(paletteTintColor, tintMix * 0.7);
          if (shellMaterial.uniforms.uAccent) shellMaterial.uniforms.uAccent.value.copy(data.accentColor);
        }
        shellMaterial.uniforms.uTime.value = elapsed;
        shellMaterial.uniforms.uCameraPosition.value.copy(camera.position);
        if (shellMaterial.uniforms.uAudioLevel) {
          const shaderPulse = Math.min(
            1.5,
            layeredAudio + fluidLift * 0.45 + audioWave * 0.25 + peakBoost * 0.6
          );
          shellMaterial.uniforms.uAudioLevel.value = shaderPulse;
        }
      }
      if (data.liquidMaterial) {
        data.liquidMaterial.uniforms.uTint.value.copy(data.tintColor).lerp(paletteTintColor, liquidTintMix);
        data.liquidMaterial.uniforms.uTime.value = elapsed;
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
        data.audioScale = 1;
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
      } else if (data.popState === "idle") {
        const pulseTarget =
          1 + layeredAudio * 0.65 + bassEnergy * 0.28 + audioWave * 0.22 + fluidLift * 0.28 + peakBoost * 0.8;
        data.audioScale = THREE.MathUtils.lerp(
          data.audioScale || 1,
          pulseTarget,
          0.04 + layeredAudio * 0.3 + peakBoost * 0.35
        );
        bubble.scale.setScalar(data.originalScale * data.audioScale);
      }
  });

  if (!isFarView) {
    resolveCollisions();
  }

    updateSwimmers(audioResponse, elapsed, delta);

    const dropletBob = 0.55 + fluidLift * 0.9 + peakBoost * 0.4;
    const dropletPulse = 1 + layeredAudio * 0.45 + audioWave * 0.2 + peakBoost * 0.5;
    if (!isFarView) {
      droplets.forEach((droplet) => {
        if (!droplet.visible) return;
        const { base, speed } = droplet.userData;
        droplet.position.y = base.y + Math.sin(elapsed * speed + base.x) * dropletBob;
        droplet.rotation.x += 0.006 + layeredAudio * 0.02 + peakBoost * 0.02;
        droplet.rotation.y += 0.005 + fluidLift * 0.015 + peakBoost * 0.015;
        droplet.scale.setScalar(dropletPulse);
      });
    }

    updateBursts(delta, elapsed);

    paletteCheckTimer -= delta;
    if (paletteCheckTimer <= 0) {
      paletteCheckTimer = paletteCheckInterval;
      maybeUpdateLightingPalette();
    }
    updateLighting(delta);

    renderer.render(scene, camera);
  }

  animate();

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    updateRendererQuality();
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

  addManagedListener(window, "keydown", (event) => handleKeyChange(event, true));
  addManagedListener(window, "keyup", (event) => handleKeyChange(event, false));
  addManagedListener(window, "resize", onResize);
  addManagedListener(window, "contextmenu", (evt) => evt.preventDefault());
}

export function destroyScene() {
  destroyed = true;
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  if (refreshIntervalId !== null) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
  managedListeners.splice(0).forEach((off) => {
    try {
      off();
    } catch (error) {
      console.warn("Failed to remove listener", error);
    }
  });
  if (canvasVisibilityObserver) {
    try {
      canvasVisibilityObserver.disconnect();
    } catch (error) {
      console.warn("Failed to disconnect canvas observer", error);
    }
    canvasVisibilityObserver = null;
  }
}
