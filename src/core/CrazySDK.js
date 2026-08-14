/**
 * Thin, defensive wrapper around the CrazyGames SDK v3.
 *
 * Every entry point is safe to call when the SDK is absent (local dev, itch,
 * a plain static host), so the game never branches on "are we on CrazyGames".
 */

const noop = () => {};

class CrazySDK {
  constructor() {
    this.sdk = null;
    this.available = false;
    this.environment = 'local';
    this.user = null;
    this.adInProgress = false;
    this._gameplayActive = false;
    this._onAdStateChange = noop;
  }

  get raw() {
    return typeof window !== 'undefined' ? window.CrazyGames?.SDK ?? null : null;
  }

  /** Resolves once the SDK has initialised, or immediately if it is missing. */
  async init() {
    const sdk = this.raw;
    if (!sdk) {
      console.info('[CrazyGames] SDK not present — running in local mode.');
      return false;
    }
    try {
      await sdk.init();
      this.sdk = sdk;
      this.available = true;
      this.environment = sdk.environment ?? 'unknown';
      try {
        this.user = await sdk.user?.getUser?.();
      } catch {
        this.user = null; // player is not signed in — perfectly normal
      }
      console.info(`[CrazyGames] ready (${this.environment})`);
      return true;
    } catch (err) {
      console.warn('[CrazyGames] init failed, continuing without it:', err);
      this.sdk = null;
      this.available = false;
      return false;
    }
  }

  /* ----------------------------- loading ----------------------------- */

  loadingStart() {
    try {
      this.sdk?.game?.loadingStart?.();
    } catch {
      /* ignore */
    }
  }

  loadingStop() {
    try {
      this.sdk?.game?.loadingStop?.();
    } catch {
      /* ignore */
    }
  }

  /* ---------------------------- gameplay ----------------------------- */

  /** Call when the player is actually playing (not in menus). */
  gameplayStart() {
    if (this._gameplayActive) return;
    this._gameplayActive = true;
    try {
      this.sdk?.game?.gameplayStart?.();
    } catch {
      /* ignore */
    }
  }

  gameplayStop() {
    if (!this._gameplayActive) return;
    this._gameplayActive = false;
    try {
      this.sdk?.game?.gameplayStop?.();
    } catch {
      /* ignore */
    }
  }

  /** A moment of delight — level cleared, big combo, jackpot. */
  happytime() {
    try {
      this.sdk?.game?.happytime?.();
    } catch {
      /* ignore */
    }
  }

  /* ------------------------------- ads ------------------------------- */

  /**
   * @param {'midgame'|'rewarded'} type
   * @returns {Promise<{shown:boolean, error?:unknown}>} resolves when the ad
   *   flow finishes; `shown` is false when no ad was served.
   */
  requestAd(type = 'midgame') {
    if (!this.sdk?.ad?.requestAd) return Promise.resolve({ shown: false });
    if (this.adInProgress) return Promise.resolve({ shown: false });

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        this.adInProgress = false;
        this._onAdStateChange(false);
        resolve(result);
      };

      this.adInProgress = true;
      const callbacks = {
        adStarted: () => this._onAdStateChange(true),
        adFinished: () => finish({ shown: true }),
        adError: (error) => finish({ shown: false, error }),
      };

      try {
        this.sdk.ad.requestAd(type, callbacks);
      } catch (error) {
        finish({ shown: false, error });
      }

      // Safety valve: never leave the game stuck behind a silent ad call.
      setTimeout(() => finish({ shown: false, error: 'timeout' }), 45000);
    });
  }

  /** Hook so the game can duck its audio while an ad plays. */
  onAdStateChange(fn) {
    this._onAdStateChange = typeof fn === 'function' ? fn : noop;
  }

  /* ------------------------------ storage ---------------------------- */

  /**
   * The SDK's data module mirrors the localStorage API but survives across
   * devices for signed-in players, so prefer it and fall back silently.
   */
  storageGet(key) {
    try {
      const v = this.sdk?.data?.getItem?.(key);
      if (v !== undefined && v !== null) return v;
    } catch {
      /* fall through */
    }
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  storageSet(key, value) {
    let ok = false;
    try {
      this.sdk?.data?.setItem?.(key, value);
      ok = true;
    } catch {
      /* fall through */
    }
    try {
      window.localStorage.setItem(key, value);
      ok = true;
    } catch {
      /* ignore */
    }
    return ok;
  }

  storageRemove(key) {
    try {
      this.sdk?.data?.removeItem?.(key);
    } catch {
      /* ignore */
    }
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  /* ------------------------------ social ----------------------------- */

  /** Native "invite a friend" sheet, when available. */
  inviteLink(params = {}) {
    try {
      return this.sdk?.game?.inviteLink?.(params) ?? null;
    } catch {
      return null;
    }
  }

  showInviteButton(params = {}) {
    try {
      this.sdk?.game?.showInviteButton?.(params);
    } catch {
      /* ignore */
    }
  }
}

export const crazy = new CrazySDK();
export default crazy;
