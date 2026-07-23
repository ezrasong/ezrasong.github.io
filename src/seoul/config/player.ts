/**
 * Player tuning. Everything about how the Poro sits in the world and how it
 * moves lives here so the feel can be tuned without touching Player.ts.
 */
export const PLAYER_CONFIG = {
  /** Target height of the Poro in world units after normalization. */
  targetHeight: 1.25,
  /**
   * Extra yaw applied to the model so that its visual "front" matches the
   * movement heading. Tuned by inspection of the loaded GLB (the poro's
   * root carries a 180° flip, so no extra correction is needed).
   */
  modelYaw: 0,
  /**
   * Vertical offset of the visual model relative to the ground point.
   * Normalization already puts the feet at 0, so only a tiny sink keeps
   * the paws visually planted.
   */
  groundOffset: -0.04,
  /** Physics collider radius. */
  bodyRadius: 0.52,

  // Movement feel. There is no reverse gear: S brakes, then swings the poro
  // around to run the other way (it always moves the way it faces).
  maxSpeed: 9.5,
  sprintMultiplier: 1.45,
  jumpSpeed: 8.6,
  acceleration: 22,
  brakingDeceleration: 30,
  idleDeceleration: 14,
  /** Radians per second at full steering input. */
  turnSpeed: 2.9,
  /** Turning is weaker when barely moving so the poro doesn't spin in place too fast. */
  turnSpeedStationaryFactor: 0.55,
  /** How quickly the body rotates to face its heading (turnarounds, steering). */
  facingLambda: 9,

  // Procedural animation on top of the GLB clips
  leanAmount: 0.16,
  bounceAmount: 0.05,
  bounceFrequency: 9,
  squashAmount: 0.06,

  // Animation clip names discovered in poro.glb
  clips: {
    idle: 'Idle_Base',
    run: 'Run_Base',
    runFast: 'Run_Haste',
    interact: 'Interact',
    greeting: 'Greeting',
    dance: 'Dance_Loop',
    laugh: 'Laugh',
  },
  /** Seconds of stillness before the poro starts goofing around. */
  idleFidgetDelay: 24,

  spawn: { x: 0, z: -8, yaw: Math.PI },

  // Recovery
  /** Outside these bounds (or below minY) the player is teleported home. */
  worldBounds: { minX: -88, maxX: 88, minZ: -88, maxZ: 97, minY: -4 },
} as const;

export const CAMERA_CONFIG = {
  /** Base follow distance and height. */
  distance: 7.5,
  height: 4.2,
  /** Additional distance/height gained at full speed (kept subtle). */
  speedDistance: 1.1,
  speedHeight: 0.35,
  /** How far ahead of the player the camera aims, scaled by speed. */
  lookAhead: 1.5,
  lookHeight: 1.1,
  /** Hard clamp on the camera's pitch above horizontal (radians, ≈-10°..+60°). */
  pitchMin: -0.17,
  pitchMax: 1.05,
  /** Smoothing half-life style damping (higher = snappier, less swim). */
  positionDamping: 5.2,
  rotationDamping: 6.5,
  /** Wider view shown briefly when crossing into a new district. */
  districtRevealDistance: 3.0,
  fov: 55,
  near: 0.1,
  far: 340,
} as const;
