/**
 * Chunky pixel-art fireworks show for home runs (1987 EWB tribute)
 *
 * Draws on a transparent overlay canvas stacked over the game canvas.
 * Rockets climb with a square-pixel trail, burst into gravity-driven square
 * sparks, and a twinkling "HOME RUN!" banner sits over the show. The overlay
 * removes itself when the show ends.
 */

const PALETTE = ['#ffd23f', '#ff4d4d', '#4dd2ff', '#7cff6b', '#ff8fd8', '#ff9f1c', '#ffffff'];
const BANNER_COLORS = ['#ffd23f', '#ffffff'];
const ROCKET_COUNT = 5;
const SPARKS_PER_BURST = 34;
const DEFAULT_DURATION_MS = 3600;

const randBetween = (lo, hi) => lo + Math.random() * (hi - lo);
const pick = (items) => items[Math.floor(Math.random() * items.length)];

export class HomeRunFireworks {
  /**
   * @param {HTMLCanvasElement} hostCanvas - Game canvas; the overlay is placed over it.
   * @param {{ onBurst?: () => void }} [options] - `onBurst` fires once per burst (e.g. a pop sound).
   */
  constructor(hostCanvas, { onBurst = null } = {}) {
    this.host = hostCanvas;
    this.onBurst = onBurst;
    this.overlay = null;
    this.ctx = null;
    this.rafId = null;
    this.timerId = null;
  }

  /** Starts a show, replacing any show already running. */
  play(durationMs = DEFAULT_DURATION_MS) {
    this.stop();
    if (!this.host?.parentElement) return;

    const dpr = window.devicePixelRatio || 1;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const overlay = document.createElement('canvas');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = `position:absolute;pointer-events:none;z-index:3;left:${this.host.offsetLeft}px;top:${this.host.offsetTop}px;width:${w}px;height:${h}px;`;
    overlay.width = Math.round(w * dpr);
    overlay.height = Math.round(h * dpr);
    this.host.parentElement.appendChild(overlay);

    this.overlay = overlay;
    this.ctx = overlay.getContext('2d');
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Chunky square "pixels" scale with the field width
    const pixel = Math.max(3, Math.round(w / 200));
    const state = this.createShow(w, h, pixel, durationMs);
    const startTime = performance.now();

    const frame = (now) => {
      const elapsed = now - startTime;
      this.drawFrame(state, elapsed / 1000);
      if (elapsed < durationMs) {
        this.rafId = requestAnimationFrame(frame);
      } else {
        this.stop();
      }
    };
    this.rafId = requestAnimationFrame(frame);
    // Backstop in case rAF is paused (e.g. background tab) so the overlay always cleans up
    this.timerId = setTimeout(() => this.stop(), durationMs + 500);
  }

  /** Stops the show and removes the overlay. Safe to call when idle. */
  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.timerId) clearTimeout(this.timerId);
    this.rafId = null;
    this.timerId = null;
    this.overlay?.remove();
    this.overlay = null;
    this.ctx = null;
  }

  /** Schedules rockets across the first ~1.5 s, so every rocket bursts before the show ends. */
  createShow(w, h, pixel, durationMs) {
    const gravity = h * 0.55; // px/s²
    const rockets = [];
    for (let i = 0; i < ROCKET_COUNT; i++) {
      const apexY = randBetween(h * 0.14, h * 0.4);
      const x0 = randBetween(w * 0.18, w * 0.82);
      rockets.push({
        launchAt: 0.1 + i * randBetween(0.25, 0.35),
        x0,
        y0: h,
        apexY,
        // Launch speed chosen so the rocket reaches apexY under gravity
        vy0: Math.sqrt(2 * gravity * (h - apexY)),
        vx: randBetween(-8, 8),
        color: pick(PALETTE),
        burst: false,
        trail: []
      });
    }
    return {
      w,
      h,
      pixel,
      gravity,
      durationSec: durationMs / 1000,
      rockets,
      sparks: [],
      bannerText: 'HOME RUN!'
    };
  }

  /** Paints the show at `t` seconds since it started. */
  drawFrame(state, t) {
    const { ctx } = this;
    if (!ctx) return;
    const { w, h, gravity } = state;
    // Step physics by real elapsed time (capped), so speed holds on 60, 120, and 144 Hz displays
    const dt = Math.min(1 / 30, t - (state.lastT ?? 0));
    state.lastT = t;

    ctx.clearRect(0, 0, w, h);

    for (const r of state.rockets) {
      if (r.burst || t < r.launchAt) continue;
      const age = t - r.launchAt;
      const rise = r.vy0 * age - 0.5 * gravity * age * age;
      const trailPoint = { x: r.x0 + r.vx * age, y: r.y0 - rise };
      r.trail.push(trailPoint);
      if (r.trail.length > 14) r.trail.shift();
      if (r.vy0 - gravity * age <= 0) {
        r.burst = true;
        this.spawnBurst(state, trailPoint, r.color);
      }
    }

    this.paintRocketTrails(state);
    this.stepSparks(state, dt);
    this.paintBanner(state, t);
  }

  paintRocketTrails(state) {
    const { ctx } = this;
    const { pixel } = state;
    for (const r of state.rockets) {
      if (r.burst) continue;
      r.trail.forEach((p, i) => {
        ctx.globalAlpha = (i + 1) / r.trail.length;
        ctx.fillStyle = i === r.trail.length - 1 ? '#ffffff' : r.color;
        ctx.fillRect(Math.round(p.x / pixel) * pixel, Math.round(p.y / pixel) * pixel, pixel, pixel);
      });
    }
    ctx.globalAlpha = 1;
  }

  /** Spawns square sparks radiating from a burst point. */
  spawnBurst(state, origin, color) {
    const { h, pixel } = state;
    const speedMax = h * 0.5;
    const altColor = pick(PALETTE);
    for (let i = 0; i < SPARKS_PER_BURST; i++) {
      const angle = (i / SPARKS_PER_BURST) * Math.PI * 2 + randBetween(-0.1, 0.1);
      const speed = randBetween(speedMax * 0.35, speedMax);
      state.sparks.push({
        x: origin.x,
        y: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: randBetween(1.1, 1.9),
        color: i % 2 === 0 ? color : altColor,
        twinkleSeed: Math.random() * 10,
        size: pixel
      });
    }
    this.onBurst?.();
  }

  stepSparks(state, dt) {
    const { ctx } = this;
    const { gravity, pixel } = state;
    const alive = [];
    for (const s of state.sparks) {
      s.life += dt;
      if (s.life >= s.maxLife) continue;
      s.vx *= 0.985;
      s.vy = s.vy * 0.985 + gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      alive.push(s);

      const lifeLeft = 1 - s.life / s.maxLife;
      // Sparks flicker in their last stretch of life
      const flicker = lifeLeft < 0.35 && Math.sin(s.life * 40 + s.twinkleSeed) > 0 ? 0 : 1;
      ctx.globalAlpha = Math.min(1, lifeLeft * 2.2) * flicker;
      ctx.fillStyle = s.color;
      ctx.fillRect(Math.round(s.x / pixel) * pixel, Math.round(s.y / pixel) * pixel, s.size, s.size);
    }
    ctx.globalAlpha = 1;
    state.sparks = alive;
  }

  /** Pops the banner in, twinkles it, and fades it out over the last half second. */
  paintBanner(state, t) {
    const { ctx } = this;
    const { w, h, bannerText, durationSec } = state;
    const fadeStart = durationSec - 0.6;
    if (t < 0.15 || t > durationSec) return;

    const popIn = Math.min(1, (t - 0.15) / 0.25);
    const scale = 0.6 + 0.4 * popIn;
    const fadeOut = t > fadeStart ? (durationSec - t) / 0.6 : 1;
    const color = BANNER_COLORS[Math.floor(t / 0.14) % BANNER_COLORS.length];
    const fontPx = Math.max(18, Math.round(h * 0.13));

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, fadeOut));
    ctx.translate(w / 2, h * 0.5);
    ctx.scale(scale, scale);
    ctx.font = `bold ${fontPx}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Chunky drop shadow, drawn at offsets so the text reads as pixel art
    const shadow = Math.max(2, Math.round(fontPx / 12));
    ctx.fillStyle = '#1a0f00';
    ctx.fillText(bannerText, shadow, shadow);
    ctx.fillStyle = color;
    ctx.fillText(bannerText, 0, 0);
    ctx.restore();
  }
}
