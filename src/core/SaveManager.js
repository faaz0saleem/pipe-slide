/**
 * Player profile persistence.
 *
 * Everything lives under one JSON blob so a save is a single SDK round-trip.
 * Writes are debounced because CrazyGames' data module hits the network for
 * signed-in players.
 */

import crazy from './CrazySDK.js';
import { DEFAULT_EQUIPPED, freeItems } from '../config/ShopCatalog.js';
import { TOTAL_LEVELS, ECONOMY } from '../config/GameConfig.js';

const KEY = 'pipeslide.save.v1';
const SAVE_DEBOUNCE = 400;

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function daysBetween(a, b) {
  if (!a || !b) return Infinity;
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function defaults() {
  return {
    version: 1,
    level: 1, // highest unlocked
    coins: ECONOMY.startingCoins,
    stars: {}, // levelId -> 0..3
    owned: freeItems(),
    equipped: { ...DEFAULT_EQUIPPED },
    settings: { sfx: true, music: true },
    daily: { last: null, streak: 0 },
    chestProgress: 0,
    stats: { plays: 0, wins: 0, fails: 0, delivered: 0, pinsPulled: 0, bestCombo: 0 },
    firstRun: true,
  };
}

class SaveManager {
  constructor() {
    this.data = defaults();
    this._timer = null;
    this._dirty = false;
  }

  /* ------------------------------ lifecycle -------------------------- */

  load() {
    let parsed = null;
    try {
      const raw = crazy.storageGet(KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (err) {
      console.warn('[save] corrupt save, starting fresh:', err);
    }

    this.data = this._migrate(parsed);

    // Flush anything the migration added so the stored blob stays current.
    this.flush();
    return this.data;
  }

  /** Merge a loaded blob onto the current defaults so new fields appear. */
  _migrate(parsed) {
    const base = defaults();
    if (!parsed || typeof parsed !== 'object') return base;

    const out = {
      ...base,
      ...parsed,
      equipped: { ...base.equipped, ...(parsed.equipped || {}) },
      settings: { ...base.settings, ...(parsed.settings || {}) },
      daily: { ...base.daily, ...(parsed.daily || {}) },
      stats: { ...base.stats, ...(parsed.stats || {}) },
      stars: { ...(parsed.stars || {}) },
    };

    // Free items are always owned, even if the catalogue grew since last play.
    out.owned = Array.from(new Set([...(parsed.owned || []), ...freeItems()]));
    out.level = Math.min(TOTAL_LEVELS, Math.max(1, Math.floor(out.level) || 1));
    out.coins = Math.max(0, Math.floor(out.coins) || 0);
    out.firstRun = false;
    return out;
  }

  /** Queue a write; several calls in the same frame collapse into one. */
  save() {
    this._dirty = true;
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.flush();
    }, SAVE_DEBOUNCE);
  }

  /** Write immediately (used on pagehide and after big moments). */
  flush() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._dirty = false;
    try {
      crazy.storageSet(KEY, JSON.stringify(this.data));
    } catch (err) {
      console.warn('[save] write failed:', err);
    }
  }

  reset() {
    this.data = defaults();
    this.flush();
  }

  /* ------------------------------ economy ---------------------------- */

  get coins() {
    return this.data.coins;
  }

  addCoins(n) {
    this.data.coins = Math.max(0, this.data.coins + Math.round(n));
    this.save();
    return this.data.coins;
  }

  spendCoins(n) {
    if (this.data.coins < n) return false;
    this.data.coins -= n;
    this.save();
    return true;
  }

  /* ----------------------------- progress ---------------------------- */

  get currentLevel() {
    return this.data.level;
  }

  starsFor(levelId) {
    return this.data.stars[levelId] || 0;
  }

  get totalStars() {
    return Object.values(this.data.stars).reduce((a, b) => a + b, 0);
  }

  isUnlocked(levelId) {
    return levelId <= this.data.level;
  }

  /**
   * Record a win. Returns what actually changed so the results screen can
   * celebrate the right things.
   */
  completeLevel(levelId, stars) {
    const prev = this.starsFor(levelId);
    const improved = stars > prev;
    if (improved) this.data.stars[levelId] = stars;

    // A skipped level (0 stars) unlocks the next one but never counts as a
    // clear, so it earns no chest progress and can still be starred later.
    const firstClear = prev === 0 && stars > 0;
    const unlockedNext = levelId >= this.data.level && levelId < TOTAL_LEVELS;
    if (unlockedNext) this.data.level = levelId + 1;

    if (stars > 0) this.data.stats.wins += 1;

    // Every fifth first-clear pops a chest.
    let chest = false;
    if (firstClear) {
      this.data.chestProgress += 1;
      if (this.data.chestProgress >= 5) {
        this.data.chestProgress = 0;
        chest = true;
      }
    }

    this.save();
    return { improved, firstClear, unlockedNext, chest, prevStars: prev };
  }

  recordFail() {
    this.data.stats.fails += 1;
    this.save();
  }

  recordPlay() {
    this.data.stats.plays += 1;
    this.save();
  }

  bumpStat(key, n = 1) {
    if (typeof this.data.stats[key] !== 'number') this.data.stats[key] = 0;
    this.data.stats[key] += n;
    this.save();
  }

  noteCombo(combo) {
    if (combo > (this.data.stats.bestCombo || 0)) {
      this.data.stats.bestCombo = combo;
      this.save();
    }
  }

  /* ------------------------------- shop ------------------------------ */

  owns(itemId) {
    return this.data.owned.includes(itemId);
  }

  buy(item) {
    if (this.owns(item.id)) return 'owned';
    if (this.data.coins < item.price) return 'poor';
    this.data.coins -= item.price;
    this.data.owned.push(item.id);
    this.equip(item);
    this.save();
    return 'bought';
  }

  equip(item) {
    if (!this.owns(item.id)) return false;
    this.data.equipped[item.cat] = item.id;
    this.save();
    return true;
  }

  equippedId(cat) {
    return this.data.equipped[cat] || DEFAULT_EQUIPPED[cat];
  }

  /* ---------------------------- daily bonus -------------------------- */

  /** @returns {{available:boolean, streak:number, reward:number}} */
  dailyStatus() {
    const today = todayStamp();
    const gap = daysBetween(this.data.daily.last, today);
    const available = gap >= 1 || this.data.daily.last === null;
    const streak = gap === 1 ? this.data.daily.streak : gap === 0 ? this.data.daily.streak : 0;
    const nextStreak = available ? Math.min(7, streak + 1) : streak;
    return {
      available,
      streak: nextStreak,
      reward: ECONOMY.dailyBase + nextStreak * ECONOMY.dailyPerStreak,
    };
  }

  claimDaily() {
    const status = this.dailyStatus();
    if (!status.available) return null;
    this.data.daily = { last: todayStamp(), streak: status.streak };
    this.addCoins(status.reward);
    this.flush();
    return status;
  }

  /* ----------------------------- settings ---------------------------- */

  get settings() {
    return this.data.settings;
  }

  toggleSetting(key) {
    this.data.settings[key] = !this.data.settings[key];
    this.save();
    return this.data.settings[key];
  }
}

export const save = new SaveManager();
export default save;
