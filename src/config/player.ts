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
  /** How far above the physics body origin the visual model's feet sit. */
  groundOffset: -0.52,
  /** Physics collider radius. */
  bodyRadius: 0.52,

  // Movement feel
  maxSpeed: 9.5,
  maxReverseSpeed: 4.5,
  acceleration: 22,
  brakingDeceleration: 30,
  idleDeceleration: 14,
  /** Radians per second at full steering input. */
  turnSpeed: 2.9,
  /** Turning is weaker when barely moving so the poro doesn't spin in place too fast. */
  turnSpeedStationaryFactor: 0.55,

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

  spawn: { x: 0, z: 6, yaw: Math.PI },

  // Recovery
  /** Outside these bounds (or below minY) the player is teleported home. */
  worldBounds: { minX: -78, maxX: 78, minZ: -68, maxZ: 68, minY: -4 },
} as const;

export const CAMERA_CONFIG = {
  /** Base follow distance and height. */
  distance: 7.5,
  height: 4.2,
  /** Additional distance/height gained at full speed. */
  speedDistance: 2.4,
  speedHeight: 0.9,
  /** How far ahead of the player the camera aims, scaled by speed. */
  lookAhead: 2.6,
  lookHeight: 1.1,
  /** Smoothing half-life style damping (higher = snappier). */
  positionDamping: 3.2,
  rotationDamping: 4.5,
  /** Wider view shown briefly when crossing into a new district. */
  districtRevealDistance: 4.5,
  fov: 55,
  near: 0.1,
  far: 260,
} as const;
