/** Shared widget kit: buttons, panels, pills and text helpers. */

import Phaser from 'phaser';
import { FONT } from '../config/GameConfig.js';
import { UI, hex, mix } from '../config/Palette.js';
import sound from '../core/SoundKit.js';

export function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  g.lineTo(x + w, y + h - r);
  g.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  g.lineTo(x + r, y + h);
  g.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  g.lineTo(x, y + r);
  g.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  g.closePath();
}

/** Soft glassy panel with a highlight along the top edge. */
export function panel(scene, x, y, w, h, opts = {}) {
  const {
    fill = 0x131a35,
    fillAlpha = 0.94,
    stroke = 0x4a5892,
    strokeAlpha = 0.9,
    radius = 26,
    shadow = true,
    highlight = true,
  } = opts;

  const g = scene.add.graphics();
  g.setPosition(x, y);

  if (shadow) {
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-w / 2 + 4, -h / 2 + 10, w, h, radius);
  }

  g.fillStyle(fill, fillAlpha);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, radius);

  if (highlight) {
    g.fillStyle(0xffffff, 0.07);
    g.fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * 0.42, radius);
  }

  g.lineStyle(3, stroke, strokeAlpha);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);

  return g;
}

export function label(scene, x, y, text, opts = {}) {
  const {
    size = 26,
    color = '#ffffff',
    weight = 'bold',
    align = 'center',
    stroke = null,
    strokeWidth = 6,
    shadow = true,
    wrap = 0,
    origin = 0.5,
  } = opts;

  const t = scene.add.text(x, y, text, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: weight,
    color,
    align,
    wordWrap: wrap ? { width: wrap } : undefined,
  });
  t.setOrigin(typeof origin === 'number' ? origin : origin[0], typeof origin === 'number' ? origin : origin[1]);
  if (stroke) t.setStroke(stroke, strokeWidth);
  if (shadow) t.setShadow(0, 3, 'rgba(0,0,0,0.5)', 6, false, true);
  return t;
}

/** Paint a vertical gradient across a Text object's glyphs. */
export function gradientText(textObj, colors) {
  const grad = textObj.context.createLinearGradient(0, 0, 0, textObj.height);
  colors.forEach(([stop, color]) => grad.addColorStop(stop, color));
  textObj.setFill(grad);
  return textObj;
}

/**
 * Chunky game button. Returns a Container with `setEnabled`, `setLabel` and a
 * `pulse()` helper for drawing the eye.
 */
export function button(scene, x, y, opts = {}) {
  const {
    w = 260,
    h = 76,
    text = 'PLAY',
    size = 30,
    color = UI.mint,
    textColor = '#08301f',
    icon = null,
    iconScale = 1,
    radius = 24,
    onClick = () => {},
    sfx = 'tap',
  } = opts;

  const c = scene.add.container(x, y);
  const dark = mix(color, 0x000000, 0.42);
  const light = mix(color, 0xffffff, 0.35);

  const g = scene.add.graphics();
  const paint = (pressed, hover) => {
    g.clear();
    const dy = pressed ? 5 : 0;
    // Drop shadow / 3D lip.
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(-w / 2, -h / 2 + 12, w, h, radius);
    g.fillStyle(dark, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + 8, w, h, radius);
    // Face.
    g.fillStyle(hover ? light : color, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + dy, w, h - 4, radius);
    // Gloss.
    g.fillStyle(0xffffff, 0.28);
    g.fillRoundedRect(-w / 2 + 6, -h / 2 + 5 + dy, w - 12, (h - 4) * 0.42, radius - 6);
  };
  paint(false, false);

  const t = scene.add.text(0, 0, text, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: 'bold',
    color: textColor,
  });
  t.setOrigin(0.5);
  t.setShadow(0, 2, 'rgba(255,255,255,0.35)', 0, false, true);

  c.add([g, t]);

  let iconImg = null;
  if (icon) {
    iconImg = scene.add.image(0, 0, icon).setScale(iconScale);
    c.add(iconImg);
    // Sit the icon to the left of the label and re-centre the pair.
    const gap = 12;
    const total = iconImg.displayWidth + gap + t.width;
    iconImg.x = -total / 2 + iconImg.displayWidth / 2;
    t.x = total / 2 - t.width / 2;
  }

  c.setSize(w, h);
  c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
  c.input.cursor = 'pointer';

  let enabled = true;
  let pressed = false;

  c.on('pointerover', () => {
    if (!enabled) return;
    paint(pressed, true);
    scene.tweens.add({ targets: c, scale: 1.04, duration: 120, ease: 'Sine.out' });
  });
  c.on('pointerout', () => {
    if (!enabled) return;
    pressed = false;
    paint(false, false);
    scene.tweens.add({ targets: c, scale: 1, duration: 120, ease: 'Sine.out' });
  });
  c.on('pointerdown', () => {
    if (!enabled) return;
    pressed = true;
    paint(true, true);
    t.y = 4;
    if (iconImg) iconImg.y = 4;
  });
  c.on('pointerup', () => {
    if (!enabled) return;
    pressed = false;
    paint(false, true);
    t.y = 0;
    if (iconImg) iconImg.y = 0;
    sound.play(sfx);
    onClick();
  });

  c.setEnabled = (on) => {
    enabled = on;
    c.setAlpha(on ? 1 : 0.45);
    if (on) c.setInteractive();
    else c.disableInteractive();
    return c;
  };
  c.setLabel = (s) => {
    t.setText(s);
    return c;
  };
  c.pulse = () => {
    scene.tweens.add({
      targets: c,
      scale: { from: 1, to: 1.07 },
      duration: 720,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    return c;
  };
  c.labelText = t;
  return c;
}

/** Small round icon button (gear, back, close…). */
export function iconButton(scene, x, y, opts = {}) {
  const { r = 30, color = UI.slate, glyph = '⚙', size = 30, onClick = () => {} } = opts;
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.3);
  g.fillCircle(0, 5, r);
  g.fillStyle(color, 1);
  g.fillCircle(0, 0, r);
  g.fillStyle(0xffffff, 0.16);
  g.fillCircle(0, -r * 0.25, r * 0.78);
  g.lineStyle(3, mix(color, 0xffffff, 0.4), 0.9);
  g.strokeCircle(0, 0, r);

  const t = scene.add.text(0, 1, glyph, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color: '#ffffff',
    fontStyle: 'bold',
  });
  t.setOrigin(0.5);

  c.add([g, t]);
  c.setSize(r * 2, r * 2);
  c.setInteractive(new Phaser.Geom.Circle(0, 0, r), Phaser.Geom.Circle.Contains);
  c.input.cursor = 'pointer';
  c.on('pointerover', () => scene.tweens.add({ targets: c, scale: 1.1, duration: 110 }));
  c.on('pointerout', () => scene.tweens.add({ targets: c, scale: 1, duration: 110 }));
  c.on('pointerup', () => {
    sound.play('tap');
    onClick();
  });
  return c;
}

/** Coin counter pill with a rolling number. */
export function coinPill(scene, x, y, value = 0, opts = {}) {
  const { w = 152, h = 52 } = opts;
  const c = scene.add.container(x, y);

  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.34);
  g.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, h / 2);
  g.fillStyle(0x1c2445, 0.96);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  g.lineStyle(3, UI.gold, 0.85);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);

  const coin = scene.add.image(-w / 2 + h * 0.55, 0, 'p_coin').setScale(0.62);
  const t = scene.add.text(-w / 2 + h * 0.55 + 20, 0, String(value), {
    fontFamily: FONT,
    fontSize: '27px',
    fontStyle: 'bold',
    color: hex(UI.gold).replace('0x', '#'),
  });
  t.setOrigin(0, 0.5);
  t.setShadow(0, 2, 'rgba(0,0,0,0.6)', 3);

  c.add([g, coin, t]);

  let shown = value;
  c.setValue = (v, animate = true) => {
    if (!animate) {
      shown = v;
      t.setText(String(Math.round(v)));
      return c;
    }
    scene.tweens.addCounter({
      from: shown,
      to: v,
      duration: 520,
      ease: 'Cubic.out',
      onUpdate: (tw) => t.setText(String(Math.round(tw.getValue()))),
      onComplete: () => (shown = v),
    });
    scene.tweens.add({
      targets: coin,
      scale: { from: 0.62, to: 0.85 },
      duration: 160,
      yoyo: true,
      ease: 'Back.out',
    });
    return c;
  };
  c.coinIcon = coin;
  return c;
}

/** Three stars, `filled` of them lit. */
export function starRow(scene, x, y, filled = 0, opts = {}) {
  const { scale = 1, gap = 44, drop = 10 } = opts;
  const c = scene.add.container(x, y);
  const stars = [];
  for (let i = 0; i < 3; i++) {
    const s = scene.add.image((i - 1) * gap, i === 1 ? -drop : 0, 'fx_star');
    s.setScale(0.62 * scale);
    s.setTint(i < filled ? UI.gold : 0x2c3358);
    if (i >= filled) s.setAlpha(0.7);
    stars.push(s);
    c.add(s);
  }
  c.stars = stars;
  return c;
}

/** Floating "+25" style text that rises and fades. */
export function floatText(scene, x, y, text, opts = {}) {
  const { color = '#ffe680', size = 34, rise = 90, duration = 900, depth = 100 } = opts;
  const t = label(scene, x, y, text, { size, color, stroke: '#20140a', strokeWidth: 6 });
  t.setDepth(depth);
  scene.tweens.add({
    targets: t,
    y: y - rise,
    alpha: { from: 1, to: 0 },
    scale: { from: 0.7, to: 1.15 },
    duration,
    ease: 'Cubic.out',
    onComplete: () => t.destroy(),
  });
  return t;
}

/** Full-screen dim used behind modals. */
export function scrim(scene, alpha = 0.62, onClick = null) {
  const { width, height } = scene.scale;
  const r = scene.add.rectangle(width / 2, height / 2, width, height, 0x05070f, alpha);
  r.setInteractive();
  if (onClick) r.on('pointerup', onClick);
  return r;
}

/** Horizontal progress bar with a rounded fill. */
export function progressBar(scene, x, y, w, h, opts = {}) {
  const { color = UI.mint, bg = 0x1b2244, value = 0 } = opts;
  const c = scene.add.container(x, y);
  const back = scene.add.graphics();
  back.fillStyle(bg, 1);
  back.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  back.lineStyle(2, 0xffffff, 0.12);
  back.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);

  const fill = scene.add.graphics();
  c.add([back, fill]);

  let current = Phaser.Math.Clamp(value, 0, 1);
  const paint = (v) => {
    fill.clear();
    const fw = Math.max(0, (w - 4) * v);
    if (fw <= 1) return;
    fill.fillStyle(color, 1);
    fill.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, fw, h - 4, (h - 4) / 2);
    fill.fillStyle(0xffffff, 0.28);
    fill.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, Math.max(0, fw - 4), (h - 4) * 0.4, (h - 4) / 3);
  };
  paint(current);

  c.setValue = (v, animate = true) => {
    const target = Phaser.Math.Clamp(v, 0, 1);
    if (!animate) {
      current = target;
      paint(target);
      return c;
    }
    scene.tweens.addCounter({
      from: current,
      to: target,
      duration: 450,
      ease: 'Cubic.out',
      onUpdate: (tw) => paint(tw.getValue()),
      onComplete: () => (current = target),
    });
    return c;
  };
  return c;
}
