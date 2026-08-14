# Pipe Slide

A pull-the-pin physics puzzle for CrazyGames, built with Phaser 3 + Matter.js.
Pull pins in the right order so coal, apples, gems and coins slide down glass
pipes into the pits that want them — and never into the ones that don't.

## Features

- **100 generated-and-proven levels** across 10 themed chapters, from a small
  set of blueprint families (straight lanes, diverter ramps, stacked gates,
  three-way sorting towers, pinball corridors). Every tenth level is a bonus
  **Coin Rush**: a hopper of coins cascading through a peg field into a vault.
- **Physics that's been played**: `npm run simulate` rebuilds each level in
  headless matter-js and plays its recorded solution — all 100 must pass
  before a build ships (`prebuild` enforces it).
- **Receivers & characters**: fire pit / food stall / gem stand / vault / slag
  pit, each with a waiting character (shivering, hungry, …) that cheers, hops
  and throws hearts when their pit is satisfied. Wrong deliveries fail the
  level; missed items cost the "perfect" star instead of dead-ending you.
- **Economy & shop**: coins, combos, 3-star ratings, chest every 5 first
  clears, daily streak gift, and a shop with hats, outfits, pipe skins
  (gold / neon / prism…) and payload trails — all live-previewed.
- **CrazyGames SDK v3**: init, loading/gameplay events, happytime, midgame +
  rewarded ads (coin doubling), and `data.setItem/getItem` persistence with a
  localStorage fallback so nothing is lost anywhere else either.
- **Zero binary assets**: every sprite is painted into canvas textures at boot
  and all audio is WebAudio-synthesised, so the bundle is ~375 KB gzipped.

## Commands

| command            | does |
|--------------------|------|
| `npm run dev`      | local dev server |
| `npm run levels`   | regenerate `public/levels/levels.json` |
| `npm run verify`   | static sanity checks on the level data |
| `npm run simulate` | headless matter-js playthrough of all 100 levels |
| `npm run build`    | levels + verify + simulate + production build |
| `npm run smoke`    | boots the built game in headless Chromium and plays level 1 |
| `npm run package`  | build + `pipe-slide.zip` for the CrazyGames upload |
