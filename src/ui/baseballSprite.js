const spriteCache = new Map();
const ANGLES = 24;
const TAU = Math.PI * 2;

function spinAxis(axis) {
  const named = { back: { x: 1, y: 0, z: 0 }, top: { x: -1, y: 0, z: 0 }, side: { x: 0, y: 1, z: 0.35 } };
  const v = typeof axis === 'object' && axis ? axis : (named[axis] || named.back);
  const length = Math.hypot(v.x || 0, v.y || 0, v.z || 0);
  if (!Number.isFinite(length) || !length) return named.back;
  return { x: (v.x || 0) / length, y: (v.y || 0) / length, z: (v.z || 0) / length };
}

function makeSprite(quantizedAngle, size, axis, tint) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const c = (size - 1) / 2;
  const r = c;
  const inside = (x, y) => (x - c) ** 2 + (y - c) ** 2 <= r * r;
  // Rasterize the silhouette, one-pixel outline, and two-tone leather on the same grid.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      const shade = x + y > size && Math.hypot(x - c, y - c) > r * 0.65;
      ctx.fillStyle = edge ? '#30352b' : tint ? (shade ? (tint === '#ef4444' ? '#a82d31' : '#168344') : tint) : (shade ? '#bdb79e' : '#fff9e6');
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const angle = quantizedAngle * TAU / ANGLES;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  // One closed, two-lobed seam on a unit sphere. Rodrigues rotation moves it
  // across the visible hemisphere and hides the far side, including at the poles.
  for (let i = 0; i < 240; i++) {
    const t = i * TAU / 240;
    let x = 0.65 * Math.cos(t) + 0.35 * Math.cos(3 * t);
    let y = 0.65 * Math.sin(t) - 0.35 * Math.sin(3 * t);
    let z = 0.75 * Math.sin(2 * t);
    const length = Math.hypot(x, y, z);
    x /= length; y /= length; z /= length;
    const dot = axis.x * x + axis.y * y + axis.z * z;
    const rx = x * cos + (axis.y * z - axis.z * y) * sin + axis.x * dot * (1 - cos);
    const ry = y * cos + (axis.z * x - axis.x * z) * sin + axis.y * dot * (1 - cos);
    const rz = z * cos + (axis.x * y - axis.y * x) * sin + axis.z * dot * (1 - cos);
    if (rz <= 0) continue;
    const px = Math.round(c + rx * (r - 1));
    const py = Math.round(c - ry * (r - 1));
    ctx.fillStyle = i % 12 < 3 ? '#862b31' : '#c83232';
    ctx.fillRect(px, py, 1, 1);
  }
  return canvas;
}

/** Visual spin only: positive backspin RPM, negative topspin, signed sidespin. */
export function getVisualBallSpin({ pitchType, spin, contact, launchVector, isThrow = false } = {}) {
  if (isThrow) return { axis: 'back', fps: 12 };
  if (spin && (Number.isFinite(spin.backspinRpm) || Number.isFinite(spin.sidespinRpm))) {
    const back = Number(spin.backspinRpm) || 0;
    const side = Number(spin.sidespinRpm) || 0;
    if (back || side) return { axis: { x: back, y: side, z: side * 0.35 }, fps: 12 };
  }
  if (pitchType) {
    const type = String(pitchType).toUpperCase();
    return { axis: type.includes('CURVE') ? 'top' : type.includes('SLIDER') ? 'side' : 'back', fps: type.includes('CHANGE') ? 10 : 14 };
  }
  const type = String(typeof contact === 'string' ? contact : contact?.type || contact?.contactType || '').toUpperCase();
  const angle = contact?.launchAngleDeg ?? launchVector?.launchAngleDeg ?? 16;
  return { axis: type.includes('GROUND') || (!type.includes('FLY') && angle < 10) ? 'top' : 'back', fps: 12 };
}

/** Advance exactly one cached orientation per visible step, independent of display Hz. */
export function visualSpinAngle(fps = 12, timeMs = performance.now()) {
  return Math.floor(timeMs * fps / 1000) * TAU / ANGLES;
}

/** Draw a chunky pixel baseball. Spin is a cumulative angle in radians; tint colors the leather. */
export function drawPixelBaseball(ctx, x, y, radiusPx, spin = 0, opts = {}) {
  const radius = Math.max(1, radiusPx);
  const size = Math.max(7, Math.min(16, Math.round(radius * 2 + 3)));
  const angle = ((Math.round((Number(spin) || 0) * ANGLES / TAU) % ANGLES) + ANGLES) % ANGLES;
  const axis = spinAxis(opts.axis);
  const key = `${size}:${angle}:${axis.x.toFixed(3)},${axis.y.toFixed(3)},${axis.z.toFixed(3)}:${opts.tint || ''}`;
  let sprite = spriteCache.get(key);
  if (!sprite) {
    sprite = makeSprite(angle, size, axis, opts.tint);
    if (spriteCache.size >= 2048) spriteCache.clear();
    spriteCache.set(key, sprite);
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, Math.round(x - radius), Math.round(y - radius), radius * 2, radius * 2);
  ctx.restore();
}
