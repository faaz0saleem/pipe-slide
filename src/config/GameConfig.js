/** Shared world constants. These must stay in sync with tools/generate-levels.mjs. */

export const WIDTH = 720;
export const HEIGHT = 1280;

export const CHUTE_TOP = 215;
export const GROUND_Y = 1150;

export const TOTAL_LEVELS = 100;
export const BONUS_EVERY = 10;

/** Render order. Anything not listed sits at 0. */
export const DEPTH = {
  bg: 0,
  parallax: 2,
  ground: 4,
  pipeGlow: 6,
  receiver: 8,
  character: 9,
  receiverFront: 10,
  payload: 14,
  pipe: 18,
  pin: 22,
  fx: 26,
  hud: 40,
  overlay: 60,
  popup: 70,
};

export const FONT = '"Trebuchet MS", "Segoe UI", Verdana, system-ui, sans-serif';

/** Physics feel. */
export const PHYSICS = {
  gravity: 1.15,
  payloadFriction: 0.008,
  // Matter's friction impulse barely scales with slope, so default-ish values
  // glue a settled polygon to even a 24-degree ramp. This game is entirely
  // about things sliding, so both are dialled right down.
  payloadFrictionStatic: 0.02,
  payloadRestitution: 0.09,
  payloadAirFriction: 0.014,
  payloadDensity: 0.0016,
};

/** Star thresholds are computed per level; these are the labels. */
export const STAR_RULES = [
  'Finish the level',
  'Deliver every single item',
  'Beat the target time',
];
