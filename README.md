# Pipe Slide

A pull-the-pin physics puzzle for CrazyGames, built with Phaser 3 + Matter.js.
Pull pins in the right order so coal, apples, gems and coins slide down glass
pipes into the pits that want them — and never into the ones that don't.

## Features

- **100 generated-and-proven levels** across 10 themed chapters. Each is a set
  of curved glass vessels — a bulb reservoir narrowing into a winding channel —
  feeding a collector, a neck, and removable diverter blades that decide which
  pit the flow lands in. Difficulty climbs on an explicit ladder — 2 pipes and
  one gate each at the start, up to the maximum of 4 pipes with three gates
  each by the end — so pin count rises from 3 at L1 to 14 at L99.
  Every tenth level is a bonus **Coin Rush**: a hopper of coins cascading
  through a peg field into a vault.
- **A different machine at the bottom of every board.** The blades are the
  part of a level a player operates for its whole length, and for a long time
  they were the same plank on all ninety boards. Each one is now built to one
  of seven shapes — a plank, a knee, a concave bow, a steepening crest, a
  flat-landing flare, a plate with a speed bump, an upturned lip — and the
  shape changes how the flow behaves as well as how it looks: a bow lets
  payload build speed and coast off the end, a rib trips it into a dribble, a
  crest holds it back and then throws it. Two blades on one board never share
  a shape, no board shares its set with the three before it, and the neck
  above them is a plain shaft, a funnel or a flanged collar. Physically a
  blade is a polyline the payload runs along, not a bar, so the plate really
  is bent — and it swings out on its pivot when you pull it.
- **Levels that prove themselves**: the generator plays every candidate level
  in headless matter-js before keeping it, and re-rolls the shape if it is
  unsolvable, if a payload would spawn inside the glass, or if it repeats a
  board already in the book. That is what lets the shapes vary freely — bore
  profiles, curve motifs, mirroring, jittered proportions, blade shapes —
  without gambling on whether they work. Repetition is judged over two spans:
  a board that *plays* like an earlier one is rejected against the whole book,
  because the player will meet both in the same run, while merely looking
  alike is checked against a window of six. `npm run simulate` re-checks the
  whole book as a build gate; `npm run variety` measures how distinct they
  actually are.
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
  That includes the things a texture atlas would normally buy you: three cut
  variants of each payload so a tube of coal is a heap and not one lump
  stamped out eight times, hardware finished in a different metal per chapter,
  and a horizon seeded per level so ten boards in a chapter do not share one
  skyline.

## Commands

| command            | does |
|--------------------|------|
| `npm run dev`      | local dev server |
| `npm run levels`   | regenerate `public/levels/levels.json` (`LEVELS=12 OUT=/tmp/probe.json` builds a prefix instead — the full book is ~25 minutes of simulation) |
| `npm run verify`   | static sanity checks on the level data |
| `npm run simulate` | headless matter-js playthrough of all 100 levels |
| `npm run variety`  | measure how distinct the levels are from each other |
| `npm run build`    | levels + verify + simulate + production build |
| `npm run smoke`    | boots the built game in headless Chromium and plays level 1 |
| `node tools/shots.mjs` | capture PNGs of a spread of levels (`SHOTS=4,12` picks them; `SCENES=menu,map,shop` adds the menus) |
| `npm run package`  | build + `pipe-slide.zip` for the CrazyGames upload |
| `npm run single`   | build `pipe-slide-standalone.html` — the whole game in one double-clickable file, no server or network required |
