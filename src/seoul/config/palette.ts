/**
 * The palette for the whole diorama, keyed to real Seoul materials: grey
 * concrete, dark brick, slate roofs, worn asphalt. Saturation is kept for
 * signage and neon, so the poro and the shopfronts carry the colour.
 * Everything in the world should pick from here so the city reads as one
 * handcrafted object.
 */
export const PALETTE = {
  // Atmosphere
  sky: '#2e3457',
  skyHorizon: '#c96f4a',
  fog: '#3a3f63',
  ambient: '#8d86b8',
  sun: '#ffc9a0',

  // Ground
  grass: '#5f8456',
  grassDark: '#4d6e47',
  asphalt: '#4f5258',
  asphaltLight: '#5d6067',
  sidewalk: '#9b958a',
  curb: '#6e7076',
  stone: '#9a948a',
  plaza: '#b0a48f',
  plazaDark: '#9a8d78',
  laneMark: '#d8d2c0',
  sand: '#c2b18c',
  water: '#3f6f8e',
  waterDeep: '#35607c',
  waterShallow: '#4f86a6',
  foam: '#dcebf2',

  // Architecture
  concrete: '#a39d92',
  concreteDark: '#878177',
  brick: '#93604a',
  brickDark: '#7a4e3c',
  glass: '#6d8798',
  glassDark: '#526a7a',
  roof: '#55595f',
  roofTile: '#4b5563',
  hanokWall: '#e3d8c2',
  hanokWood: '#7a5238',
  hanokRoof: '#3f4650',
  woodLight: '#a8835d',

  // Life
  windowWarm: '#ffd98a',
  windowCool: '#bfe3ff',
  neonPink: '#ff5d8f',
  neonCyan: '#4ce0d2',
  neonYellow: '#ffd447',
  neonGreen: '#7dff8a',
  lampGlow: '#ffe6b0',

  // Nature
  treeTrunk: '#6d4c33',
  leaf: '#5c8f4f',
  leafDark: '#4a7841',
  leafAutumn: '#d99a4e',
} as const;

/** District accent colors used for signage and panels. */
export const DISTRICT_ACCENTS: Record<string, string> = {
  plaza: '#ffd447',
  hongdae: '#ff5d8f',
  gangnam: '#4ce0d2',
  hanok: '#d99a4e',
  riverside: '#7fb8e0',
  namsan: '#7dff8a',
};
