/**
 * Everything buyable. Ids are persisted, so never rename one after release —
 * add new entries instead.
 */

export const CATEGORIES = [
  { id: 'hat', name: 'Hats', blurb: 'Dress up the crew' },
  { id: 'outfit', name: 'Outfits', blurb: 'Recolour their gear' },
  { id: 'pipe', name: 'Pipes', blurb: 'Restyle the glass' },
  { id: 'trail', name: 'Trails', blurb: 'Leave a mark' },
];

/**
 * hat  — drawn on top of every character head
 * outfit — body/limb colours
 * pipe — stroke colours for the glass (fill always stays transparent)
 * trail — particle trail attached to falling payloads
 */
export const ITEMS = [
  /* ---------------- hats ---------------- */
  { id: 'hat_none', cat: 'hat', name: 'Bare Head', price: 0, art: 'none' },
  { id: 'hat_beanie', cat: 'hat', name: 'Wool Beanie', price: 120, art: 'beanie', tint: 0xe0574f },
  { id: 'hat_cap', cat: 'hat', name: 'Work Cap', price: 180, art: 'cap', tint: 0x3f7fd6 },
  { id: 'hat_helmet', cat: 'hat', name: 'Miner Helmet', price: 320, art: 'helmet', tint: 0xffc93c },
  { id: 'hat_party', cat: 'hat', name: 'Party Cone', price: 450, art: 'party', tint: 0xff5d9e },
  { id: 'hat_top', cat: 'hat', name: 'Top Hat', price: 700, art: 'top', tint: 0x2b2b3a },
  { id: 'hat_crown', cat: 'hat', name: 'Gold Crown', price: 1400, art: 'crown', tint: 0xffd54a },
  { id: 'hat_halo', cat: 'hat', name: 'Halo', price: 2200, art: 'halo', tint: 0xfff6b0 },

  /* --------------- outfits -------------- */
  { id: 'fit_default', cat: 'outfit', name: 'Overalls', price: 0, body: 0x4a6fa5, limb: 0x35507a },
  { id: 'fit_forest', cat: 'outfit', name: 'Forest Green', price: 150, body: 0x3f8f5c, limb: 0x2c6b43 },
  { id: 'fit_ember', cat: 'outfit', name: 'Ember Red', price: 260, body: 0xc4453f, limb: 0x93302c },
  { id: 'fit_royal', cat: 'outfit', name: 'Royal Purple', price: 520, body: 0x7b4fd4, limb: 0x5a37a3 },
  { id: 'fit_ice', cat: 'outfit', name: 'Glacier', price: 800, body: 0x63c7e8, limb: 0x3f9ab8 },
  { id: 'fit_gold', cat: 'outfit', name: 'Solid Gold', price: 1800, body: 0xf0b429, limb: 0xc4881a },

  /* ---------------- pipes --------------- */
  {
    id: 'pipe_glass',
    cat: 'pipe',
    name: 'Clear Glass',
    price: 0,
    stroke: 0x9fe8ff,
    glow: 0x5ec8ff,
    rim: 0xe8fbff,
  },
  {
    id: 'pipe_gold',
    cat: 'pipe',
    name: 'Gilded',
    price: 600,
    stroke: 0xffc93c,
    glow: 0xff9d2e,
    rim: 0xfff2c0,
  },
  {
    id: 'pipe_neon',
    cat: 'pipe',
    name: 'Neon Pink',
    price: 900,
    stroke: 0xff4fd8,
    glow: 0xb936ff,
    rim: 0xffd6f7,
  },
  {
    id: 'pipe_emerald',
    cat: 'pipe',
    name: 'Emerald',
    price: 1100,
    stroke: 0x4df0a6,
    glow: 0x1fbf7a,
    rim: 0xd6ffee,
  },
  {
    id: 'pipe_magma',
    cat: 'pipe',
    name: 'Magma',
    price: 1500,
    stroke: 0xff6a2a,
    glow: 0xff2e00,
    rim: 0xffd0a8,
  },
  {
    id: 'pipe_rainbow',
    cat: 'pipe',
    name: 'Prism',
    price: 2600,
    stroke: 0xffffff,
    glow: 0xffffff,
    rim: 0xffffff,
    rainbow: true,
  },

  /* ---------------- trails -------------- */
  { id: 'trail_none', cat: 'trail', name: 'No Trail', price: 0, fx: 'none' },
  { id: 'trail_spark', cat: 'trail', name: 'Sparkle', price: 340, fx: 'spark', tint: 0xfff2b0 },
  { id: 'trail_bubble', cat: 'trail', name: 'Bubbles', price: 560, fx: 'bubble', tint: 0x9fe8ff },
  { id: 'trail_fire', cat: 'trail', name: 'Comet', price: 980, fx: 'fire', tint: 0xff8a2e },
  { id: 'trail_void', cat: 'trail', name: 'Stardust', price: 1700, fx: 'void', tint: 0xc79dff },
];

export const DEFAULT_EQUIPPED = {
  hat: 'hat_none',
  outfit: 'fit_default',
  pipe: 'pipe_glass',
  trail: 'trail_none',
};

const BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export const getItem = (id) => BY_ID[id];
export const itemsIn = (cat) => ITEMS.filter((i) => i.cat === cat);
export const freeItems = () => ITEMS.filter((i) => i.price === 0).map((i) => i.id);
