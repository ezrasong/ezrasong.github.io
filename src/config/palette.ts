/**
 * The restrained palette for the whole diorama: a warm dusk over Seoul.
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
  grass: '#5a8a58',
  grassDark: '#4c774b',
  asphalt: '#585d68',
  asphaltLight: '#666b77',
  sidewalk: '#8f8a80',
  curb: '#6e7076',
  stone: '#9a948a',
  plaza: '#b3a389',
  plazaDark: '#a08f74',
  laneMark: '#d8d2c0',
  sand: '#c2b18c',
  water: '#3f6f8e',
  waterDeep: '#35607c',
  waterShallow: '#4f86a6',
  foam: '#dcebf2',

  // Architecture
  concrete: '#a8a29a',
  concreteDark: '#8b857c',
  brick: '#a86f55',
  brickDark: '#8f5c46',
  glass: '#7fa8c9',
  glassDark: '#5d84a6',
  roof: '#5c6470',
  roofTile: '#4b5563',
  hanokWall: '#e8dcc3',
  hanokWood: '#7a5238',
  hanokRoof: '#3f4650',
  woodLight: '#b98d5f',

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
  leaf: '#5f9e54',
  leafDark: '#4e8746',
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
