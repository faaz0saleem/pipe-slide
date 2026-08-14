/**
 * The level book: a thin accessor over the generated levels.json so scenes
 * never poke at raw cache data.
 */

import { TOTAL_LEVELS } from '../config/GameConfig.js';

class LevelBook {
  constructor() {
    this.doc = null;
  }

  init(doc) {
    if (!doc || !Array.isArray(doc.levels)) {
      throw new Error('levels.json is missing or malformed');
    }
    this.doc = doc;
    this.byId = new Map(doc.levels.map((l) => [l.id, l]));
    return this;
  }

  get count() {
    return this.doc ? this.doc.levels.length : TOTAL_LEVELS;
  }

  get chapters() {
    return this.doc?.chapters ?? [];
  }

  /** @returns {object|null} */
  get(id) {
    return this.byId?.get(id) ?? null;
  }

  /** Chapter metadata for a level id (1-based, 10 levels each). */
  chapterFor(id) {
    const index = Math.floor((id - 1) / 10);
    return this.chapters[index] ?? { name: 'Unknown', theme: 'mine' };
  }

  chapterIndex(id) {
    return Math.floor((id - 1) / 10);
  }

  isBonus(id) {
    return this.get(id)?.bonus ?? id % 10 === 0;
  }

  /** Total payload count — used for the level-select preview chips. */
  payloadSummary(id) {
    const lv = this.get(id);
    if (!lv) return [];
    const totals = {};
    for (const s of lv.spawns) totals[s.type] = (totals[s.type] || 0) + s.items.length;
    return Object.entries(totals).map(([type, count]) => ({ type, count }));
  }
}

export const Levels = new LevelBook();
export default Levels;
