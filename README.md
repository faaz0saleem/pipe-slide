# Pipe Slide

A pull-the-pin physics puzzle for CrazyGames, built with Phaser 3 + Matter.js.
Pull pins in the right order so coal, apples, gems and coins slide down glass
pipes into the pits that want them — and never into the ones that don't.

## Features

- **100 generated-and-proven levels** across 10 themed chapters. Each is a set
  of curved glass vessels — a bulb reservoir narrowing into a winding channel —
  feeding a collector, a neck, and removable diverter blades that decide which
  pit the flow lands in. Pin count scales with the level (3 at L1, 8 at L99).
  Every tenth level is a bonus **Coin Rush**: a hopper of coins cascading
  through a peg field into a vault.
- **Physics that's been played**: `npm run simulate` rebuilds each level in
  headless matter-js and plays its recorded solution — all 100 must pass
  before a build ships (`prebuild` enforces it).
- **Receivers & characters**: fire pit / food stall / gem stand / vault / slag
  pit, each with a waiting character (shivering, hungry, …) that cheers, hops
  and throws hearts when their pit is satisfied — and slumps under a little
  rain cloud when something they were waiting for is wasted.
- **Mistakes cost, they don't kill**: every group spawns with spare items, so
  a wrong pull wastes the payload and eats your margin. The level is lost only
  once a pit provably cannot reach its quota — then you can retry, or pay 50
  coins to skip.
- **A deliberately tight economy**: 10 coins to start, 5 per level, 50 to skip
  one. The full run pays out roughly 500, so shop prices (12–260) are set
  against that rather than against idle-game inflation. Plus 3-star ratings, a
  chest every 5 clears, a daily streak gift, and a shop of hats, outfits, pipe
  skins and payload trails — all live-previewed.
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
| `node tools/shots.mjs` | capture PNGs of the menu, some levels, the map and the shop |
| `npm run package`  | build + `pipe-slide.zip` for the CrazyGames upload |
