const spriteCache = new Map();

function makeSprite(quantizedAngle, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const c = (size - 1) / 2;
  const r = Math.max(2, c - 0.5);
  ctx.fillStyle = '#f5f0dc';
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
  // Cream highlight and a one-pixel shaded edge keep the ball round at tiny sizes.
  ctx.fillStyle = '#fffdf3';
  ctx.fillRect(Math.max(1, c - 2), Math.max(1, c - 2), Math.max(1, size - 5), Math.max(1, size - 5));
  ctx.fillStyle = '#c8c1ad';
  ctx.fillRect(size - 3, 2, 1, Math.max(1, size - 5));
  ctx.fillRect(2, size - 3, Math.max(1, size - 5), 1);

  // Project two curved seam loops onto the visible hemisphere, then rotate about the view axis.
  const angle = quantizedAngle * Math.PI / 8;
  const points = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48 - 0.5) * Math.PI * 1.34;
    for (const side of [-1, 1]) {
      const x0 = side * (0.52 * Math.sin(t));
      const y0 = 0.72 * Math.sin(t * 0.72);
      const x = x0 * Math.cos(angle) - y0 * Math.sin(angle);
      const y = x0 * Math.sin(angle) + y0 * Math.cos(angle);
      if (x * x + y * y <= 0.88) points.push([Math.round(c + x * r), Math.round(c + y * r)]);
    }
  }
  ctx.fillStyle = '#c83232';
  for (const [x, y] of points) ctx.fillRect(x, y, 1, 1);
  return canvas;
}

/** Draw a chunky pixel baseball. Spin is a cumulative angle in radians. */
export function drawPixelBaseball(ctx, x, y, radiusPx, spin = 0, opts = {}) {
  const radius = Math.max(1, radiusPx);
  const size = Math.max(7, Math.min(16, Math.round(radius * 2 + 3)));
  const angle = ((Math.round((Number(spin) || 0) * 8 / (Math.PI * 2)) % 8) + 8) % 8;
  const key = `${size}:${angle}`;
  let sprite = spriteCache.get(key);
  if (!sprite) {
    sprite = makeSprite(angle, size);
    spriteCache.set(key, sprite);
  }
  const diameter = radius * 2;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (opts.tint) {
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = opts.tint;
    ctx.beginPath();
    ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(sprite, Math.round(x - radius), Math.round(y - radius), diameter, diameter);
  ctx.restore();
}
