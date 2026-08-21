/** Colour system: chapter themes, payload tints and pit tints. */

export const UI = {
  ink: 0x0d1226,
  paper: 0xf6f8ff,
  gold: 0xffc93c,
  goldDeep: 0xe08a1a,
  mint: 0x53e6a8,
  sky: 0x4cc9ff,
  grape: 0x8b5cf6,
  rose: 0xff5d7e,
  slate: 0x2a3358,
  slateLight: 0x3d4a7a,
  dim: 0x8892be,
};

/**
 * One theme per chapter. `sky` is the vertical background gradient, `ridge`
 * the parallax silhouettes, `glow` the big soft light behind the pipes.
 */
export const CHAPTER_THEMES = {
  mine: {
    sky: [0x33283f, 0x120d18],
    ridge: [0x40334c, 0x261e2f],
    glow: 0xff9d3c,
    accent: 0xffb547,
    dust: 0xffd9a0,
    shape: 'rock',
  },
  orchard: {
    sky: [0x2f7f6b, 0x123a3a],
    ridge: [0x2c6c5c, 0x1b4a44],
    glow: 0x7cf6b0,
    accent: 0x8ef0a0,
    dust: 0xd8ffd0,
    shape: 'hill',
  },
  crystal: {
    sky: [0x3b2a72, 0x140f30],
    ridge: [0x4a2f86, 0x271a52],
    glow: 0xb98bff,
    accent: 0xd0a2ff,
    dust: 0xe6d4ff,
    shape: 'crystal',
  },
  foundry: {
    sky: [0x5a2a24, 0x1b0e0d],
    ridge: [0x63332a, 0x3a1d18],
    glow: 0xff7a3c,
    accent: 0xff9a4d,
    dust: 0xffc79a,
    shape: 'gear',
  },
  sky: {
    sky: [0x3aa0e0, 0x134a80],
    ridge: [0x2f7fc0, 0x1d5b96],
    glow: 0x9ce0ff,
    accent: 0x7fd8ff,
    dust: 0xffffff,
    shape: 'cloud',
  },
  frost: {
    sky: [0x2f6a94, 0x0f2740],
    ridge: [0x3d7fa8, 0x24506e],
    glow: 0xa8ecff,
    accent: 0xc4f2ff,
    dust: 0xffffff,
    shape: 'ice',
  },
  neon: {
    sky: [0x2a1350, 0x0a0620],
    ridge: [0x43208a, 0x1d0e40],
    glow: 0xff45d0,
    accent: 0x4cf9ff,
    dust: 0xff9df0,
    shape: 'city',
  },
  lava: {
    sky: [0x611b1b, 0x180707],
    ridge: [0x7a2418, 0x3c110c],
    glow: 0xff5324,
    accent: 0xff7a45,
    dust: 0xffb066,
    shape: 'rock',
  },
  clockwork: {
    sky: [0x4a3a22, 0x171108],
    ridge: [0x5c4728, 0x322414],
    glow: 0xffcb6b,
    accent: 0xf0c674,
    dust: 0xffe9b0,
    shape: 'gear',
  },
  aurora: {
    sky: [0x1c3a6e, 0x080d22],
    ridge: [0x24507e, 0x122a4a],
    glow: 0x62ffcf,
    accent: 0x9df7ff,
    dust: 0xd6fff4,
    shape: 'ice',
  },
};

/**
 * The finish on the hardware, per chapter.
 *
 * Every rod and every blade in the game used to be the same three greys, so a
 * board in the neon refinery held the same ironmongery as one in the orchard.
 * A chapter's pins are now made of something that belongs to it: pitted iron
 * down the mine, brass in the clockwork vault, chrome up at the sky docks.
 *
 * `trim` is the accent that marks the working parts — the chevrons on a blade
 * and the collar on a gate — and is deliberately the chapter's own accent, so
 * the hardware ties back to the backdrop behind it.
 *
 * Every `base` is darker than the sky it will sit against, deliberately. The
 * first cut of this table matched each chapter's own brightness, which made
 * frost hardware white-on-white and orchard hardware green-on-green: the pins
 * are the one thing on the board a player has to find and hit, so they carry
 * the value contrast and `light` is spent on a thin lit edge, not on the
 * whole shaft.
 */
export const PIN_METAL = {
  mine: { dark: 0x1e2430, base: 0x5a6478, light: 0xc9d6ee, trim: 0xffb547 },
  orchard: { dark: 0x163327, base: 0x3f7a5c, light: 0xbff0d4, trim: 0x8ef0a0 },
  crystal: { dark: 0x241a44, base: 0x5a4a9c, light: 0xd9c9ff, trim: 0xd0a2ff },
  foundry: { dark: 0x351709, base: 0x8a4f2a, light: 0xffc79a, trim: 0xff9a4d },
  sky: { dark: 0x143349, base: 0x3f7ba8, light: 0xdff3ff, trim: 0x7fd8ff },
  frost: { dark: 0x14313f, base: 0x3d7690, light: 0xe4feff, trim: 0xc4f2ff },
  neon: { dark: 0x220a3c, base: 0x6a3a9c, light: 0xffc4ff, trim: 0x4cf9ff },
  lava: { dark: 0x2a0f08, base: 0x74381f, light: 0xffb98f, trim: 0xff7a45 },
  clockwork: { dark: 0x33220c, base: 0x936c2c, light: 0xffe0a0, trim: 0xf0c674 },
  aurora: { dark: 0x11253a, base: 0x3c6a96, light: 0xdcf0ff, trim: 0x9df7ff },
};

/** Payload look-up: body colours plus the UI icon tint. */
export const PAYLOAD_STYLE = {
  coal: { base: 0x2f3138, hi: 0x6a6f7d, spark: 0xffb457, label: 'Coal', icon: 0x4b515e },
  apple: { base: 0xe33b4a, hi: 0xff8a86, spark: 0x7bd66a, label: 'Apple', icon: 0xe33b4a },
  gem: { base: 0x36d6ff, hi: 0xd6fbff, spark: 0x8ce9ff, label: 'Gem', icon: 0x36d6ff },
  coin: { base: 0xffc224, hi: 0xfff2b0, spark: 0xfff3c4, label: 'Coin', icon: 0xffc224 },
  bomb: { base: 0x22242e, hi: 0x555a68, spark: 0xff6a2a, label: 'Bomb', icon: 0x22242e },
};

/** Pit look-up. */
export const RECEIVER_STYLE = {
  firepit: { stone: 0x4a4550, stoneHi: 0x6b6474, ember: 0xff7a1f, label: 'Fire Pit' },
  foodstall: { wood: 0x8a5a34, woodHi: 0xb37c4c, cloth: 0xef5f6b, label: 'Food Stall' },
  gemstand: { metal: 0x6d7ba8, metalHi: 0x9aa8d6, velvet: 0x7b3fd4, label: 'Gem Stand' },
  vault: { metal: 0x59617a, metalHi: 0x878fae, trim: 0xffc93c, label: 'Vault' },
  lava: { rock: 0x3a1e18, rockHi: 0x5c2f22, lava: 0xff4d1a, label: 'Slag Pit' },
};

export const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/** Blend two 0xRRGGBB colours. */
export function mix(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}
