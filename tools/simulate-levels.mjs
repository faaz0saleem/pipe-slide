/**
 * Headless playthrough of every level.
 *
 * Rebuilds each level in raw matter-js using exactly the bodies GameScene
 * creates, then plays the recorded `solution` order and reports what landed
 * where. This is the only practical way to prove 100 procedurally generated
 * levels are actually solvable — eyeballing them one by one is not an option.
 *
 * Run with:  npm run simulate            (all levels)
 *            npm run simulate -- 7 12    (just those)
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Matter from 'matter-js';

const { Engine, Bodies, Composite, Sleeping } = Matter;
const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(resolve(__dirname, '../public/levels/levels.json'), 'utf8'));
const TRACE = process.env.TRACE === '1';

/* Must mirror src/config/GameConfig.js PHYSICS. */
const GRAVITY = 1.15;
const PAYLOAD = {
  friction: 0.008,
  frictionStatic: 0.02,
  frictionAir: 0.014,
  restitution: 0.09,
  density: 0.0016,
  slop: 0.02,
};
const STEP_MS = 1000 / 60;
const GROUND_Y = doc.world.groundY;
const WIDTH = doc.world.width;
const HEIGHT = doc.world.height;

/**
 * A real player waits for the flow to stop before pulling the next pin, so the
 * simulation does too: step until nothing is moving, up to a generous cap.
 */
const SETTLE_FRAMES = 24; // consecutive quiet frames that count as "stopped"
const MAX_FRAMES_PER_PULL = 900; // 15s
const FINAL_FRAMES = 900;
const QUIET_SPEED = 0.35;
const RECEIVER_WALL_T = 16;

function buildLevel(lv) {
  const engine = Engine.create({
    enableSleeping: true,
    positionIterations: 8,
    velocityIterations: 6,
    constraintIterations: 3,
  });
  engine.gravity.y = GRAVITY;

  const statics = [];

  /* --- pipe walls --- */
  for (const w of lv.walls) {
    for (let i = 0; i < w.points.length - 1; i++) {
      const [x0, y0] = w.points[i];
      const [x1, y1] = w.points[i + 1];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      statics.push(
        Bodies.rectangle((x0 + x1) / 2, (y0 + y1) / 2, len + w.t, w.t, {
          isStatic: true,
          angle: Math.atan2(dy, dx),
          friction: 0.08,
          restitution: 0.05,
          chamfer: { radius: Math.min(w.t / 2, 6) },
          label: 'wall',
        })
      );
    }
    for (let i = 1; i < w.points.length - 1; i++) {
      const [x, y] = w.points[i];
      statics.push(
        Bodies.circle(x, y, w.t / 2, {
          isStatic: true,
          friction: 0.08,
          restitution: 0.05,
          label: 'wall',
        })
      );
    }
  }

  for (const peg of lv.pegs) {
    statics.push(
      Bodies.circle(peg.x, peg.y, peg.r, {
        isStatic: true,
        friction: 0.008,
        restitution: 0.42,
        label: 'peg',
      })
    );
  }

  /* --- receivers --- */
  const receivers = lv.receivers.map((def) => {
    const halfW = def.w / 2;
    const h = def.bottom - def.top;
    const opts = { isStatic: true, friction: 0.2, restitution: 0.02, label: 'wall' };
    statics.push(
      Bodies.rectangle(def.x - halfW - RECEIVER_WALL_T / 2, def.top + h / 2, RECEIVER_WALL_T, h, opts),
      Bodies.rectangle(def.x + halfW + RECEIVER_WALL_T / 2, def.top + h / 2, RECEIVER_WALL_T, h, opts),
      Bodies.rectangle(def.x, def.bottom + RECEIVER_WALL_T / 2, def.w + RECEIVER_WALL_T * 2, RECEIVER_WALL_T, opts)
    );
    return { def, delivered: 0, wrong: 0 };
  });

  /* --- world floor + side walls --- */
  statics.push(
    Bodies.rectangle(WIDTH / 2, GROUND_Y + 60, WIDTH + 600, 120, {
      isStatic: true,
      friction: 0.4,
      restitution: 0,
      label: 'ground',
    }),
    Bodies.rectangle(-40, HEIGHT / 2, 60, HEIGHT * 2, { isStatic: true, label: 'wall' }),
    Bodies.rectangle(WIDTH + 40, HEIGHT / 2, 60, HEIGHT * 2, { isStatic: true, label: 'wall' })
  );

  /* --- pins --- */
  const pins = new Map();
  for (const def of lv.pins) {
    const body = Bodies.rectangle(def.x, def.y, def.len, def.thick, {
      isStatic: true,
      angle: (def.angle * Math.PI) / 180,
      friction: 0.04,
      restitution: 0.02,
      chamfer: { radius: Math.min(def.thick / 2, 8) },
      label: 'pin',
    });
    pins.set(def.id, body);
    statics.push(body);
  }

  /* --- payloads --- */
  const payloads = [];
  for (const group of lv.spawns) {
    for (const [x, y] of group.items) {
      // Mirrors COLLIDER_RADIUS in src/objects/Payload.js.
      const shrink = { coal: 0.97, gem: 0.94 }[group.type] ?? 1;
      const shape = Bodies.circle(x, y, group.r * shrink, { ...PAYLOAD, label: 'payload' });
      shape.payloadType = group.type;
      payloads.push({ body: shape, type: group.type, resolved: false });
    }
  }

  Composite.add(engine.world, [...statics, ...payloads.map((p) => p.body)]);
  return { engine, pins, receivers, payloads };
}

/** Mirrors Receiver.contains() plus the sensor band. */
function inSensor(def, x, y) {
  const h = def.bottom - def.top;
  const sensorH = Math.min(74, h - 10);
  const inX = Math.abs(x - def.x) < def.w / 2 - 2;
  const inY = y > def.top - 6 && y < def.top + 6 + sensorH;
  return inX && inY;
}

function simulate(lv, { verbose = false } = {}) {
  const { engine, pins, receivers, payloads } = buildLevel(lv);

  let lost = 0;
  let wrong = 0;
  const wrongDetail = [];

  const wakeNear = (x, y, radius = 150) => {
    const r2 = radius * radius;
    for (const p of payloads) {
      if (p.resolved) continue;
      const dx = p.body.position.x - x;
      const dy = p.body.position.y - y;
      if (dx * dx + dy * dy <= r2) Sleeping.set(p.body, false);
    }
  };

  const stepOnce = () => {
    Engine.update(engine, STEP_MS);

    for (const p of payloads) {
      if (p.resolved) continue;
      const { x, y } = p.body.position;

      for (const r of receivers) {
        if (!inSensor(r.def, x, y)) continue;
        p.resolved = true;
        if (TRACE) console.log(`  ${p.type} -> ${r.def.kind} at ${x.toFixed(0)},${y.toFixed(0)}`);
        if (r.def.accepts === p.type) {
          r.delivered++;
        } else {
          wrong++;
          r.wrong++;
          wrongDetail.push(`${p.type}→${r.def.kind}`);
        }
        Composite.remove(engine.world, p.body);
        wakeNear(x, y);
        break;
      }
      if (p.resolved) continue;

      // Lost: on the floor outside every pit, or off the bottom of the world.
      const onFloor = y + 4 >= GROUND_Y - 24 && Math.abs(p.body.velocity.y) < 1.2;
      const inAnyPit = receivers.some(
        (r) => Math.abs(x - r.def.x) < r.def.w / 2 && y > r.def.top - 6
      );
      if ((onFloor && !inAnyPit) || y > HEIGHT + 120) {
        p.resolved = true;
        lost++;
        Composite.remove(engine.world, p.body);
        wakeNear(x, y);
      }
    }
  };

  /** Step until every payload has been still for a while, or we give up. */
  const runUntilQuiet = (maxFrames) => {
    let quiet = 0;
    for (let i = 0; i < maxFrames; i++) {
      stepOnce();
      const moving = payloads.some(
        (p) =>
          !p.resolved &&
          Math.hypot(p.body.velocity.x, p.body.velocity.y) > QUIET_SPEED
      );
      quiet = moving ? 0 : quiet + 1;
      if (quiet >= SETTLE_FRAMES) return i;
    }
    return maxFrames;
  };

  runUntilQuiet(180);

  for (const pinId of lv.solution) {
    if (TRACE) console.log(`PULL ${pinId}`);
    const body = pins.get(pinId);
    if (body) Composite.remove(engine.world, body);
    // Mirrors GameScene._wakeAll(): removing a support does not wake sleepers.
    for (const p of payloads) if (!p.resolved) Sleeping.set(p.body, false);
    runUntilQuiet(MAX_FRAMES_PER_PULL);
    if (TRACE) {
      const left = payloads
        .filter((p) => !p.resolved)
        .map((p) => `${p.type}@${p.body.position.x.toFixed(0)},${p.body.position.y.toFixed(0)}`);
      console.log(`  after ${pinId}: ${left.length} left -> ${left.join(' ')}`);
    }
  }

  runUntilQuiet(FINAL_FRAMES);

  const stillMoving = payloads.filter((p) => !p.resolved).length;

  const report = {
    id: lv.id,
    family: lv.family,
    wrong,
    lost,
    stuck: stillMoving,
    receivers: receivers.map((r) => ({
      kind: r.def.kind,
      accepts: r.def.accepts,
      got: r.delivered,
      need: r.def.required,
    })),
    wrongDetail,
    stuckAt: payloads
      .filter((p) => !p.resolved)
      .slice(0, 8)
      .map((p) => `${p.type}@${p.body.position.x.toFixed(0)},${p.body.position.y.toFixed(0)}`),
  };
  report.solved = wrong === 0 && receivers.every((r) => r.delivered >= r.def.required);
  if (verbose) console.log(JSON.stringify(report, null, 2));
  return report;
}

/* ------------------------------------------------------------------ */

const args = process.argv.slice(2).map(Number).filter(Boolean);
const targets = args.length ? doc.levels.filter((l) => args.includes(l.id)) : doc.levels;

const failures = [];
const t0 = Date.now();

for (const lv of targets) {
  const r = simulate(lv, { verbose: args.length === 1 });
  if (!r.solved) {
    failures.push(r);
    const pits = r.receivers.map((p) => `${p.accepts} ${p.got}/${p.need}`).join(', ');
    console.log(
      `L${String(r.id).padStart(3)} ${r.family.padEnd(10)} FAIL  ${pits}` +
        `${r.wrong ? `  wrong:${r.wrongDetail.join(',')}` : ''}` +
        `${r.lost ? `  lost:${r.lost}` : ''}${r.stuck ? `  stuck:${r.stuck}` : ''}`
    );
  } else if (args.length) {
    console.log(`L${r.id} ${r.family} OK`);
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(
  `\n${targets.length - failures.length}/${targets.length} levels solved by their recorded hint order (${secs}s)`
);
if (failures.length) process.exit(1);
