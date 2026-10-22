/**
 * 1987 Earl Weaver Baseball (EWB 1.0) Split-Screen & Full-Field Isometric Renderer
 * Upgraded with Eddie Dombrower's Kinetically Choreographed Multi-Phase Animations
 *
 * Strictly implements the 1987 Amiga EWB 1.0 visual architecture (Style C Hybrid):
 * 1. SPLIT-SCREEN MODE (Pre-Pitch & Pitch Delivery):
 *    - Left 67% viewport: Isometric ballpark diamond with custom 10-point fence distances,
 *      9-segment wall heights (e.g. Fenway's 37-ft Green Monster), speckled stadium crowd,
 *      curved infield dirt cutouts, 4 umpires, 2 base coaches, 9 articulated fielders, and baserunners.
 *    - Right 33% viewport: catcher's-eye Pitcher vs. Batter duel featuring:
 *      • Large side-on batter beside the plate (stance waggle, stride, swing, follow-through)
 *      • Small front-on pitcher against the batter's eye (full windup vs. the stretch)
 *      • Pitch flight in depth perspective with late break, catcher's mitt or contact flash
 *      • Authentic 1987 Amiga top-right Batter/Pitcher stat box
 *    - Figures use dithered shading like the original EGA/Amiga art; field players are
 *      pixel-art sprites, duel figures are keyframed limbs with dithered shadow sides.
 * 2. FULL-FIELD MODE (Ball in Play & Instant Replay):
 *    - Expands the isometric ballpark across 100% of the canvas (matching amiga_01.jpg)
 *      tracking 3D ball flight (x, y, z), ground shadow (x, y, 0), wall caroms,
 *      6-state articulated fielder pursuit/scoops/leaps, 3D throw & relay arcs, baserunner slides with dirt plumes,
 *      and animated Umpire "SAFE!" / "OUT!" calls.
 */

import { getWallAtAngle } from '../data/ballparks.js';
import { getInitialFielderPositions } from '../engine/physicsEngine.js';
import { getLastName } from '../data/rosters.js';
import { drawPixelBaseball, getVisualBallSpin, visualSpinAngle } from './baseballSprite.js';
import { DUEL_PITCHER_SCALE, getPitcherStyle, getPitcherPoses, getReleasePointOffset, strideApproachScale } from './pitcherStyles.js';
import { getBatterStyle, getBatterSwingPose, hashString, BASE_BATTER_POSES } from './batterStyles.js';

/**
 * Duel delivery timing: windup to release (progress 0.42), then ball flight to the end (1.0).
 * The windup spans the hands rising, rocker step, pivot and leg lift; the stretch spans coming
 * set and the full stop before its quicker leg lift. Both share this length.
 */
export const PITCH_WINDUP_MS = 1100;
export const PITCH_FLIGHT_MS = 420;
export const PITCH_DELIVERY_MS = PITCH_WINDUP_MS + PITCH_FLIGHT_MS;
/** Milliseconds from pitch start until the ball reaches the plate (progress 0.92). */
export const PITCH_PLATE_ARRIVAL_MS = PITCH_WINDUP_MS + PITCH_FLIGHT_MS * (0.5 / 0.58);
/** Milliseconds from pitch start until bat meets ball (progress 0.90); a ball put in play cuts to the field view here. */
export const PITCH_CONTACT_MS = PITCH_WINDUP_MS + PITCH_FLIGHT_MS * (0.48 / 0.58);
/** The duel scene is drawn this much larger than its layout, anchored at the bottom, so the players fill the view. */
const DUEL_ZOOM = 1.3;

const FLIGHT_PROGRESS_PER_MS = 0.58 / PITCH_FLIGHT_MS;

function pitchProgressAt(elapsedMs) {
  if (elapsedMs <= PITCH_WINDUP_MS) return 0.42 * Math.max(0, elapsedMs) / PITCH_WINDUP_MS;
  return Math.min(1, 0.42 + FLIGHT_PROGRESS_PER_MS * (elapsedMs - PITCH_WINDUP_MS));
}

// ---------------------------------------------------------------------------
// Pixel-art sprites for the isometric field (fielders, runners, coaches, umpires).
// Drawn facing right; mirrored when a player moves left.
//   c cap        b brim/belt     s skin        w uniform      g uniform shade (dithered)
//   j team color m glove (skin when no glove) h ball in hand (skin when empty)
//   o cleats     B bat           n umpire coat d umpire slacks
// ---------------------------------------------------------------------------
const PIXEL_SPRITES = {
  READY: [
    '....ccc....',
    '...ccccc...',
    '...bbbbbb..',
    '....sss....',
    '....sss....',
    '..jjwwwjj..',
    '.jjwwwwwgj.',
    '.jwwwwwwgj.',
    '.swwwwwwgm.',
    '.s.wwwwg.m.',
    '.s.bbbbb.m.',
    '.swwwgwwgm.',
    '.wwg...wgg.',
    '.ww.....gg.',
    '.jj.....jj.',
    'ooo.....ooo'
  ],
  RUN_A: [
    '....ccc....',
    '...ccccbb..',
    '....sss....',
    '....sss....',
    '....jjw....',
    '...jwwwj...',
    '..s.wwwj.m.',
    '..s.wwwg.m.',
    '....wwgg...',
    '....bbbb...',
    '...wwwggg..',
    '..www..gg..',
    '.ww.....gg.',
    '.w.......g.',
    'jj.......jj',
    'oo.......oo'
  ],
  RUN_B: [
    '....ccc....',
    '...ccccbb..',
    '....sss....',
    '....sss....',
    '....jjw....',
    '...jwwwj...',
    '...swwwj...',
    '...swwgm...',
    '....wwgg...',
    '....bbbb...',
    '....wwgg...',
    '...wwwgg...',
    '.ww...gg...',
    'jj....gg...',
    'o.....jj...',
    '......oo...'
  ],
  FIELDING_GROUND: [
    '...........',
    '...........',
    '....ccc....',
    '...ccccc...',
    '...bbbbbb..',
    '....sss....',
    '..jjwwwjj..',
    '.jwwwwwwgj.',
    '.swwwwwwgs.',
    '.swbbbbbgs.',
    '.wwss.mmgg.',
    '.wg.smmm.gg',
    '.wg..mm..gg',
    '.ww.....gg.',
    '.jj.....jj.',
    'ooo.....ooo'
  ],
  FIELDING_AIR: [
    '........mm.',
    '........mm.',
    '....ccc.s..',
    '...ccccjs..',
    '...bbbbj...',
    '....sssj...',
    '..jjwwwj...',
    '.s.wwwwg...',
    '.s.wwwwg...',
    '..swwwgg...',
    '...bbbbb...',
    '...wwwgg...',
    '...ww.gg...',
    '...ww.gg...',
    '...jj.jj...',
    '...oo.oo...'
  ],
  THROWING: [
    '.h.........',
    '.s..ccc....',
    '.s.ccccbb..',
    '..j.sss....',
    '..jjsss....',
    '...jwwwj...',
    '...wwwwwjm.',
    '...wwwwg.mm',
    '....wwgg...',
    '....bbbb...',
    '...wwwggg..',
    '..www..gg..',
    '.ww.....gg.',
    '.w.......g.',
    'jj.......jj',
    'oo.......oo'
  ],
  RECEIVING: [
    '....ccc....',
    '...ccccc...',
    '...bbbbbb..',
    '....sss.mm.',
    '....sss.mm.',
    '..jjwwwjs..',
    '.jjwwwwwj..',
    '.s.wwwwg...',
    '.s.wwwwg...',
    '..swwwgg...',
    '...bbbbb...',
    '...wwwgg...',
    '..www.ggg..',
    '..ww...gg..',
    '..jj...jj..',
    '..oo...oo..'
  ],
  SLIDING: [
    '.ccc...........',
    'cccccb.........',
    '.sss...........',
    '.jwwwj.........',
    's.wwwwbwwwwwjoo',
    '..wggg.ggggjjoo'
  ],
  BATTING: [
    '.....BB....',
    '.....BB....',
    '..ccc.B....',
    '.ccccbbB...',
    '..sss.sB...',
    '..sssss....',
    '..jwwj.....',
    '.jwwwwj....',
    '.wwwwgg....',
    '.bbbbbb....',
    '.wwwggg....',
    'wwg..gg....',
    'ww....gg...',
    'jj....jj...',
    'oo....oo...'
  ],
  UMP: [
    '....nnn....',
    '...nnnnnb..',
    '....sss....',
    '....sss....',
    '..nnnnnnn..',
    '.nnnnnnnnn.',
    '.n.nnnnn.n.',
    '.s.nnnnn.s.',
    '...ddddd...',
    '...dd.dd...',
    '...dd.dd...',
    '...dd.dd...',
    '..ooo.ooo..'
  ],
  UMP_SAFE: [
    '....nnn....',
    '...nnnnnb..',
    '....sss....',
    '....sss....',
    'snnnnnnnnns',
    '...nnnnn...',
    '...nnnnn...',
    '...nnnnn...',
    '...ddddd...',
    '...dd.dd...',
    '...dd.dd...',
    '...dd.dd...',
    '..ooo.ooo..'
  ],
  UMP_OUT: [
    '.........s.',
    '....nnn..n.',
    '...nnnnnbn.',
    '....sss.n..',
    '....sssn...',
    '..nnnnnn...',
    '.nnnnnnn...',
    '.n.nnnnn...',
    '.s.nnnnn...',
    '...ddddd...',
    '...dd.dd...',
    '...dd.dd...',
    '...dd.dd...',
    '..ooo.ooo..'
  ]
};

const SPRITE_OUTLINE = 'rgba(6, 10, 16, 0.7)';
const FIGURE_OUTLINE = '#0b0f17';
const SKIN = '#f1c27d';

// ---------------------------------------------------------------------------
// Duel-view figure keyframes. Units: the batter stands 150 units tall and the
// pitcher 100, feet at y = 0, up is negative. Batter +x points toward the plate;
// pitcher (front view, RHP) throws with the arm on the viewer's left.
// ---------------------------------------------------------------------------
export const BATTER_POSES = {
  ...BASE_BATTER_POSES,
  FOLLOW: BASE_BATTER_POSES.FOLLOW_TWO_HAND
};

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/** Blends two keyframe poses; point entries are [x, y] pairs, the rest scalars. */
function blendPose(a, b, t) {
  const out = {};
  for (const key of Object.keys(a)) {
    const va = a[key];
    const vb = b[key];
    out[key] = Array.isArray(va) ? [lerp(va[0], vb[0], t), lerp(va[1], vb[1], t)] : lerp(va, vb, t);
  }
  return out;
}

/** Darkens a #rrggbb color by `amt` (0..1). */
function darken(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (s) => Math.round(((n >> s) & 255) * (1 - amt));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

export class FieldRenderer1987 {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.logicalWidth = 960;
    this.logicalHeight = 500;
    this.dpr = 1;
    this.mode = 'SPLIT_SCREEN'; // 'SPLIT_SCREEN' | 'FULL_FIELD'
    this.lastGameState = null;

    // Animation state for pitch duel (Right 1/3 split screen)
    this.pitchAnim = null;
    // Animation state for ball in play (Full field)
    this.playAnim = null;
    // Last completed play tape for Instant Replay
    this.lastPlayRecord = null;
    this.isReplay = false;

    this._rafId = null;
    this._idleRafId = null;
    this._crowdPattern = null;

    this.ensureHiDPI();
    // Start subtle idle loop so batter bat-waggle, pitcher breathing, and runner leads are alive
    this.startIdleLoop();
  }

  /**
   * Scales internal backing store by window.devicePixelRatio while keeping
   * logical drawing coordinates at 960x500 for razor-sharp HiDPI vectors & sprites.
   */
  ensureHiDPI() {
    const dpr = Math.min(2.5, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
    const targetW = Math.round(this.logicalWidth * dpr);
    const targetH = Math.round(this.logicalHeight * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
      this.dpr = dpr;
    }
  }

  startIdleLoop() {
    const tick = () => {
      if (!this.pitchAnim && !this.playAnim && this.lastGameState) {
        this.render(this.lastGameState);
      }
      this._idleRafId = requestAnimationFrame(tick);
    };
    this._idleRafId = requestAnimationFrame(tick);
  }

  /**
   * Generates a cached 1987 Amiga speckled stadium crowd pattern for fast 60fps rendering
   */
  getCrowdPattern(ctx) {
    if (this._crowdPattern) return this._crowdPattern;
    const off = document.createElement('canvas');
    off.width = 96;
    off.height = 48;
    const octx = off.getContext('2d');

    octx.fillStyle = '#141c2b';
    octx.fillRect(0, 0, off.width, off.height);

    // Horizontal aisle steps
    for (let y = 0; y < off.height; y += 6) {
      octx.fillStyle = y % 12 === 0 ? '#1d283a' : '#101723';
      octx.fillRect(0, y, off.width, 2);
    }

    // Speckled 1987 Amiga spectators (shirts, caps, skin tones)
    const palette = ['#e2e8f0', '#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#f1c27d', '#93c5fd', '#fca5a5'];
    for (let y = 2; y < off.height; y += 4) {
      for (let x = 1; x < off.width; x += 3) {
        const idx = (x * 17 + y * 31) % palette.length;
        octx.fillStyle = palette[idx];
        octx.fillRect(x, y, 2, 2);
      }
    }

    this._crowdPattern = ctx.createPattern(off, 'repeat');
    return this._crowdPattern;
  }

  /**
   * Converts 3D ballfield coordinates (feet: x, y, z) to 2D canvas pixels
   * inside the active field viewport [vp.x, vp.y, vp.w, vp.h].
   */
  fieldToScreen(xFt, yFt, zFt = 0, vp) {
    const homeX = vp.x + vp.w * 0.5;
    const homeY = vp.y + vp.h * 0.865;

    // Isometric foreshortening matching 1987 EWB 1.0 diamond perspective
    const scaleX = (vp.w / 500) * 0.96;
    const scaleY = (vp.h / 440) * 0.78;
    const scaleZ = scaleY * 1.38;

    const sx = homeX + xFt * scaleX;
    const syGround = homeY - yFt * scaleY;
    const syBall = syGround - zFt * scaleZ;

    return {
      x: sx,
      y: syBall,
      groundY: syGround,
      scaleX,
      scaleY
    };
  }

  /**
   * Returns adjusted fielder coordinates shared with physicsEngine.js
   */
  getPositionedFielders(defensePlay = 'NORMAL', bases = [null, null, null]) {
    const raw = getInitialFielderPositions(defensePlay, bases);
    const coords = {};
    for (const [pos, pt] of Object.entries(raw)) {
      coords[pos] = { x: pt.x, y: pt.y, z: 0, pose: 'READY', isMoving: false, stridePhase: 0 };
    }
    return coords;
  }

  /**
   * Main render entry point
   */
  render(gameState) {
    if (!gameState) return;
    this.lastGameState = gameState;
    this.ensureHiDPI();
    const { ctx } = this;
    const W = this.logicalWidth;
    const H = this.logicalHeight;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (this.mode === 'SPLIT_SCREEN') {
      const splitX = Math.floor(W * 0.665);
      const fieldVp = { x: 0, y: 0, w: splitX, h: H };
      const duelVp = { x: splitX, y: 0, w: W - splitX, h: H };

      this.drawIsometricBallpark(ctx, fieldVp, gameState, false);
      this.drawDuelViewport(ctx, duelVp, gameState);

      // Classic 1987 Amiga yellow/gold vertical split divider
      ctx.strokeStyle = '#f5b942';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, H);
      ctx.stroke();
    } else {
      const fullVp = { x: 0, y: 0, w: W, h: H };
      this.drawIsometricBallpark(ctx, fullVp, gameState, true);
    }

    ctx.restore();
  }

  /**
   * Draws the 1987 Isometric Ballpark (used in both Left 2/3 Split-Screen and Full-Field mode)
   */
  drawIsometricBallpark(ctx, vp, gameState, isFullField) {
    const park = gameState.park;
    ctx.save();
    ctx.beginPath();
    ctx.rect(vp.x, vp.y, vp.w, vp.h);
    ctx.clip();

    // 1. Sky / Stadium Horizon
    const skyGrad = ctx.createLinearGradient(vp.x, vp.y, vp.x, vp.y + vp.h * 0.28);
    if (park.environment === 'Indoor') {
      skyGrad.addColorStop(0, '#1e293b');
      skyGrad.addColorStop(1, '#334155');
    } else {
      skyGrad.addColorStop(0, '#0ea5e9');
      skyGrad.addColorStop(0.55, '#38bdf8');
      skyGrad.addColorStop(1, '#1e3a8a');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(vp.x, vp.y, vp.w, vp.h * 0.3);

    // 2. Outfield Grass / Artificial Turf with subtle 1987 Amiga raster mowing bands
    const isTurf = park.surface === 'Artificial Turf';
    const baseGreen = isTurf ? '#126e5e' : '#1b7d36';
    const stripeGreen = isTurf ? '#157a68' : '#208b3d';

    ctx.fillStyle = baseGreen;
    ctx.fillRect(vp.x, vp.y + vp.h * 0.1, vp.w, vp.h * 0.9);

    const bandH = 6;
    ctx.fillStyle = stripeGreen;
    for (let sy = vp.y + Math.floor(vp.h * 0.14); sy < vp.y + vp.h; sy += bandH * 2) {
      ctx.fillRect(vp.x, sy, vp.w, bandH);
    }

    // 3. Compute Outfield Wall Polygon from the park's 10 fence distances & 9 wall heights
    const wallPoints = [];
    const trackInnerPoints = [];
    const numSamples = 40;
    for (let i = 0; i <= numSamples; i++) {
      const angleDeg = -45 + (i / numSamples) * 90;
      const angleRad = (angleDeg * Math.PI) / 180;
      const wall = getWallAtAngle(park, angleDeg);
      const wx = wall.distanceFt * Math.sin(angleRad);
      const wy = wall.distanceFt * Math.cos(angleRad);
      const botPt = this.fieldToScreen(wx, wy, 0, vp);
      const topPt = this.fieldToScreen(wx, wy, wall.heightFt, vp);

      // Warning track inner edge (16 ft inside wall)
      const tx = (wall.distanceFt - 16) * Math.sin(angleRad);
      const ty = (wall.distanceFt - 16) * Math.cos(angleRad);
      const trkPt = this.fieldToScreen(tx, ty, 0, vp);

      wallPoints.push({
        angleDeg,
        distanceFt: wall.distanceFt,
        heightFt: wall.heightFt,
        botX: botPt.x,
        botY: botPt.groundY,
        topX: topPt.x,
        topY: topPt.y
      });
      trackInnerPoints.push({ x: trkPt.x, y: trkPt.groundY });
    }

    // 4. Multi-Tier Stadium Bleachers & Speckled 1987 Crowd behind Outfield Wall
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(vp.x, vp.y + vp.h * 0.06);
    ctx.lineTo(vp.x + vp.w, vp.y + vp.h * 0.06);
    for (let i = wallPoints.length - 1; i >= 0; i--) {
      ctx.lineTo(wallPoints[i].botX, wallPoints[i].botY);
    }
    ctx.closePath();
    ctx.fillStyle = this.getCrowdPattern(ctx);
    ctx.fill();

    // Stadium deck fascia / upper deck tier line
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i < wallPoints.length; i++) {
      const p = wallPoints[i];
      if (i === 0) ctx.moveTo(p.topX, p.topY - 22);
      else ctx.lineTo(p.topX, p.topY - 22);
    }
    ctx.stroke();
    ctx.restore();

    // Side Foul-Ground Grandstands (Left & Right bleachers like amiga_01.jpg)
    const homePt = this.fieldToScreen(0, 0, 0, vp);
    const lfPole = wallPoints[0];
    const rfPole = wallPoints[wallPoints.length - 1];

    ctx.save();
    ctx.fillStyle = this.getCrowdPattern(ctx);
    // Left foul stands
    ctx.beginPath();
    ctx.moveTo(vp.x, lfPole.botY - 20);
    ctx.lineTo(lfPole.botX - 6, lfPole.botY);
    ctx.lineTo(homePt.x - vp.w * 0.36, vp.y + vp.h);
    ctx.lineTo(vp.x, vp.y + vp.h);
    ctx.closePath();
    ctx.fill();
    // Right foul stands
    ctx.beginPath();
    ctx.moveTo(vp.x + vp.w, rfPole.botY - 20);
    ctx.lineTo(rfPole.botX + 6, rfPole.botY);
    ctx.lineTo(homePt.x + vp.w * 0.36, vp.y + vp.h);
    ctx.lineTo(vp.x + vp.w, vp.y + vp.h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 5. True Polygon Warning Track Dirt Band hugging the outfield wall
    ctx.fillStyle = '#9c5a25';
    ctx.beginPath();
    for (let i = 0; i < wallPoints.length; i++) {
      const p = wallPoints[i];
      if (i === 0) ctx.moveTo(p.botX, p.botY);
      else ctx.lineTo(p.botX, p.botY);
    }
    for (let i = trackInnerPoints.length - 1; i >= 0; i--) {
      const tp = trackInnerPoints[i];
      ctx.lineTo(tp.x, tp.y);
    }
    ctx.closePath();
    ctx.fill();

    // Foul line warning track extensions
    ctx.strokeStyle = '#9c5a25';
    ctx.lineWidth = isFullField ? 11 : 8;
    ctx.beginPath();
    ctx.moveTo(lfPole.botX, lfPole.botY);
    ctx.lineTo(homePt.x - 16, homePt.groundY + 8);
    ctx.lineTo(homePt.x + 16, homePt.groundY + 8);
    ctx.lineTo(rfPole.botX, rfPole.botY);
    ctx.stroke();

    // 6. Draw 3D Outfield Fence Segments with panel shading (e.g. 37-ft Green Monster)
    ctx.fillStyle = park.wallColor || '#144d29';
    for (let i = 0; i < wallPoints.length - 1; i++) {
      const p1 = wallPoints[i];
      const p2 = wallPoints[i + 1];
      ctx.beginPath();
      ctx.moveTo(p1.botX, p1.botY);
      ctx.lineTo(p2.botX, p2.botY);
      ctx.lineTo(p2.topX, p2.topY);
      ctx.lineTo(p1.topX, p1.topY);
      ctx.closePath();
      ctx.fill();

      // Subtle vertical wall panel seams every 4 segments
      if (i % 4 === 0) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p1.botX, p1.botY);
        ctx.lineTo(p1.topX, p1.topY);
        ctx.stroke();
      }
    }

    // Fenway Green Monster scoreboard & ladder detail when Fenway is active
    if (park.id === 'fenway') {
      const m1 = wallPoints[3];
      const m2 = wallPoints[10];
      if (m1 && m2) {
        ctx.fillStyle = '#0c2918';
        ctx.beginPath();
        ctx.moveTo(m1.botX, m1.botY - 3);
        ctx.lineTo(m2.botX, m2.botY - 3);
        ctx.lineTo(m2.botX, (m2.botY + m2.topY) * 0.52);
        ctx.lineTo(m1.botX, (m1.botY + m1.topY) * 0.52);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Top yellow home-run crown line & bottom fence base line
    ctx.strokeStyle = '#f5b942';
    ctx.lineWidth = 2;
    ctx.beginPath();
    wallPoints.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.topX, pt.topY) : ctx.lineTo(pt.topX, pt.topY)));
    ctx.stroke();

    ctx.strokeStyle = '#091e10';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    wallPoints.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.botX, pt.botY) : ctx.lineTo(pt.botX, pt.botY)));
    ctx.stroke();

    // Paint authentic distance markers on the wall (LF Pole, L-C, CF, R-C, RF Pole)
    const markerIndices = [1, 10, 20, 30, 39];
    ctx.fillStyle = park.wallAccent || '#ffffff';
    ctx.font = `bold ${isFullField ? 11 : 9}px monospace`;
    ctx.textAlign = 'center';
    for (const idx of markerIndices) {
      const mp = wallPoints[idx];
      if (mp) {
        const midY = (mp.botY + mp.topY) * 0.5 + 3;
        ctx.fillText(String(Math.round(mp.distanceFt)), mp.botX, midY);
      }
    }

    // 7. Curved Infield Dirt Skinned Area, Base Cutouts, Mound & Home Plate Circle (matching amiga_01.jpg)
    const b1 = this.fieldToScreen(63.64, 63.64, 0, vp);
    const b2 = this.fieldToScreen(0, 127.28, 0, vp);
    const b3 = this.fieldToScreen(-63.64, 63.64, 0, vp);
    const infLeft = this.fieldToScreen(-92, 82, 0, vp);
    const infTop = this.fieldToScreen(0, 165, 0, vp);
    const infRight = this.fieldToScreen(92, 82, 0, vp);
    const infBot = this.fieldToScreen(0, -12, 0, vp);

    // Outer curved infield dirt arc
    ctx.fillStyle = '#a85d24';
    ctx.beginPath();
    ctx.moveTo(infBot.x, infBot.groundY);
    ctx.lineTo(infRight.x, infRight.groundY);
    ctx.quadraticCurveTo(b2.x, infTop.groundY + (infTop.groundY - b2.groundY) * 0.55, infLeft.x, infLeft.groundY);
    ctx.closePath();
    ctx.fill();

    // Basepath dirt lanes & inner grass diamond with curved base cutouts
    const grassBot = this.fieldToScreen(0, 15, 0, vp);
    const grassRight = this.fieldToScreen(52, 63.64, 0, vp);
    const grassTop = this.fieldToScreen(0, 113, 0, vp);
    const grassLeft = this.fieldToScreen(-52, 63.64, 0, vp);

    ctx.fillStyle = baseGreen;
    ctx.beginPath();
    ctx.moveTo(grassBot.x, grassBot.groundY);
    ctx.lineTo(grassRight.x, grassRight.groundY);
    ctx.lineTo(grassTop.x, grassTop.groundY);
    ctx.lineTo(grassLeft.x, grassLeft.groundY);
    ctx.closePath();
    ctx.fill();

    // Draw infield grass mowing stripes inside the diamond
    ctx.save();
    ctx.clip();
    ctx.fillStyle = stripeGreen;
    for (let sy = grassTop.groundY; sy < grassBot.groundY; sy += bandH * 2) {
      ctx.fillRect(grassLeft.x, sy, grassRight.x - grassLeft.x, bandH);
    }
    ctx.restore();

    // Rounded dirt sliding cutouts at Home, 1B, 2B, 3B
    ctx.fillStyle = '#a85d24';
    ctx.beginPath();
    ctx.ellipse(homePt.x, homePt.groundY, isFullField ? 20 : 15, isFullField ? 12 : 9, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const bPt of [b1, b2, b3]) {
      ctx.beginPath();
      ctx.ellipse(bPt.x, bPt.groundY, isFullField ? 13 : 10, isFullField ? 8 : 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pitcher's Mound 3D graded dirt oval & pitching rubber
    const moundPt = this.fieldToScreen(0, 60.5, 0, vp);
    const moundGrad = ctx.createRadialGradient(
      moundPt.x, moundPt.groundY - 2, 2,
      moundPt.x, moundPt.groundY, isFullField ? 15 : 11
    );
    moundGrad.addColorStop(0, '#c87638');
    moundGrad.addColorStop(1, '#96501e');
    ctx.fillStyle = moundGrad;
    ctx.beginPath();
    ctx.ellipse(moundPt.x, moundPt.groundY, isFullField ? 15 : 11, isFullField ? 9.5 : 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(moundPt.x - 4, moundPt.groundY - 1.5, 8, 2.5);

    // 8. White Chalk Foul Lines, Coach's Boxes, On-Deck Circles & Lattice Foul Poles
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(homePt.x, homePt.groundY);
    ctx.lineTo(lfPole.botX, lfPole.botY);
    ctx.moveTo(homePt.x, homePt.groundY);
    ctx.lineTo(rfPole.botX, rfPole.botY);
    ctx.stroke();

    // 1B and 3B White Chalk Coach's Boxes & On-Deck Circles (just like amiga_01.jpg!)
    const odLeft = this.fieldToScreen(-36, -12, 0, vp);
    const odRight = this.fieldToScreen(36, -12, 0, vp);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1.2;
    for (const od of [odLeft, odRight]) {
      ctx.beginPath();
      ctx.ellipse(od.x, od.groundY, isFullField ? 8 : 6, isFullField ? 4.5 : 3.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Yellow Lattice Foul Poles
    for (const pole of [lfPole, rfPole]) {
      const sign = pole === lfPole ? 1 : -1;
      ctx.strokeStyle = '#f5b942';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(pole.botX, pole.botY);
      ctx.lineTo(pole.topX, pole.topY - 24);
      ctx.stroke();
      // Lattice screen mesh
      ctx.lineWidth = 1;
      for (let py = pole.botY - 6; py > pole.topY - 22; py -= 5) {
        ctx.beginPath();
        ctx.moveTo(pole.botX, py);
        ctx.lineTo(pole.botX + sign * 4, py - 2);
        ctx.stroke();
      }
    }

    // 9. Bases (1st, 2nd, 3rd) & Home Plate Pentagon + Batter's Boxes
    for (const [idx, bPt] of [[0, b1], [1, b2], [2, b3]]) {
      const occupied = Boolean(gameState.bases && gameState.bases[idx]);
      ctx.fillStyle = occupied ? '#fde047' : '#ffffff';
      ctx.strokeStyle = occupied ? '#ca8a04' : '#334155';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bPt.x, bPt.groundY - 5);
      ctx.lineTo(bPt.x + 6.5, bPt.groundY);
      ctx.lineTo(bPt.x, bPt.groundY + 5);
      ctx.lineTo(bPt.x - 6.5, bPt.groundY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(homePt.x - 3.5, homePt.groundY - 2.5, 7, 4.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1;
    ctx.strokeRect(homePt.x - 10, homePt.groundY - 5, 5, 9);
    ctx.strokeRect(homePt.x + 5, homePt.groundY - 5, 5, 9);

    // 10. Draw 4 Field Umpires (Home, 1B, 2B, 3B) & 2 Base Coaches (authentic 1987 Amiga detail!)
    const activeFrame = this.playAnim ? this.playAnim.currentFrame : null;
    const umpireCall = activeFrame?.umpireCall || null;
    const fieldingTeam = gameState.half === 'TOP' ? gameState.homeTeam : gameState.awayTeam;
    const battingTeam = gameState.half === 'TOP' ? gameState.awayTeam : gameState.homeTeam;

    const umpCoords = [
      { key: 'HOME', x: 0, y: -15 },
      { key: '1B', x: 78, y: 68 },
      { key: '2B', x: 14, y: 148 },
      { key: '3B', x: -78, y: 68 }
    ];
    for (const u of umpCoords) {
      const uPt = this.fieldToScreen(u.x, u.y, 0, vp);
      const activeSignal = umpireCall && umpireCall.base === u.key ? umpireCall.call : null;
      this.drawUmpireSprite(ctx, uPt.x, uPt.groundY, activeSignal, isFullField);
    }

    // 1B and 3B Base Coaches in batting team uniform
    for (const cCoord of [{ x: 75, y: 48 }, { x: -75, y: 48 }]) {
      const cPt = this.fieldToScreen(cCoord.x, cCoord.y, 0, vp);
      this.drawArticulatedFieldPlayer(ctx, cPt.x, cPt.groundY, {
        jerseyColor: battingTeam.primaryColor || '#c53030',
        capColor: battingTeam.secondaryColor || '#1e293b',
        pantsColor: '#f1f5f9',
        pose: 'READY',
        stridePhase: 0,
        hasGlove: false,
        label: '',
        showLabel: false,
        scale: isFullField ? 0.95 : 0.85
      });
    }

    // 11. Draw all 9 Articulated Fielders
    const fielderMap =
      activeFrame && activeFrame.fielders
        ? activeFrame.fielders
        : this.getPositionedFielders(gameState.defensePlay, gameState.bases);

    const prevFrame = this.playAnim ? this.playAnim.prevFrame : null;
    for (const [pos, fState] of Object.entries(fielderMap)) {
      const fScreen = this.fieldToScreen(fState.x, fState.y, fState.z || 0, vp);
      const prevF = prevFrame?.fielders?.[pos];
      this.drawArticulatedFieldPlayer(ctx, fScreen.x, fScreen.y, {
        groundY: fScreen.groundY,
        jerseyColor: fieldingTeam.primaryColor || '#f58220',
        capColor: fieldingTeam.secondaryColor || '#1e293b',
        pantsColor: '#f8fafc',
        pose: fState.pose || (fState.isMoving ? 'RUNNING' : 'READY'),
        stridePhase: fState.stridePhase || 0,
        hasBall: Boolean(fState.hasBall),
        facing: this.trackFacing(`F${pos}`, prevF ? fState.x - prevF.x : 0),
        label: pos,
        showLabel: true,
        scale: isFullField ? 1.12 : 0.96
      });
    }

    // 12. Draw Batter at Home Plate (during Split-Screen) & Baserunners with Stride / Slides
    if (!this.playAnim && gameState.currentBatter) {
      let bSide = gameState.currentBatter.bats || 'R';
      if (bSide === 'S') bSide = gameState.currentPitcher?.throws === 'L' ? 'R' : 'L';
      const bxOffset = bSide === 'R' ? -7 : 7;
      const bPt = this.fieldToScreen(bxOffset, 0, 0, vp);
      this.drawArticulatedFieldPlayer(ctx, bPt.x, bPt.groundY, {
        jerseyColor: battingTeam.primaryColor || '#bd3039',
        capColor: battingTeam.secondaryColor || '#0c2340',
        pantsColor: '#e2e8f0',
        pose: 'BATTING',
        stridePhase: 0,
        hasGlove: false,
        facing: bSide === 'R' ? 1 : -1,
        label: '',
        showLabel: false,
        scale: 0.92
      });
    }

    if (activeFrame && activeFrame.runners) {
      activeFrame.runners.forEach((r, idx) => {
        const rScreen = this.fieldToScreen(r.x, r.y, 0, vp);
        const prevR = prevFrame?.runners?.find((pr) => pr.label === r.label) || prevFrame?.runners?.[idx];
        this.drawArticulatedFieldPlayer(ctx, rScreen.x, rScreen.groundY, {
          jerseyColor: battingTeam.primaryColor || '#bd3039',
          capColor: '#f5b942',
          pantsColor: '#e2e8f0',
          pose: r.isSliding ? 'SLIDING' : r.isMoving ? 'RUNNING' : 'READY',
          stridePhase: r.stridePhase || 0,
          hasGlove: false,
          facing: this.trackFacing(`R${r.label || idx}`, prevR ? r.x - prevR.x : 0),
          label: r.label || 'RUN',
          showLabel: isFullField,
          scale: isFullField ? 1.12 : 0.96
        });
      });
    } else if (gameState.bases) {
      const isStealOrRunHit =
        gameState.offensePlay === 'STEAL' ||
        gameState.offensePlay === 'RUN_AND_HIT' ||
        gameState.offensePlay === 'HIT_AND_RUN';
      const leadWave = Math.sin(performance.now() * 0.005) * (isStealOrRunHit ? 2.2 : 0.7);
      const leadOffsets = [
        { x: 53 - leadWave, y: 73 + leadWave },
        { x: -13 - leadWave, y: 117 - leadWave * 0.5 },
        { x: -55 + leadWave * 0.5, y: 53 - leadWave }
      ];
      gameState.bases.forEach((runner, idx) => {
        if (!runner) return;
        const pt = this.fieldToScreen(leadOffsets[idx].x, leadOffsets[idx].y, 0, vp);
        this.drawArticulatedFieldPlayer(ctx, pt.x, pt.groundY, {
          jerseyColor: battingTeam.primaryColor || '#bd3039',
          capColor: '#f5b942',
          pantsColor: '#e2e8f0',
          pose: 'READY',
          stridePhase: 0,
          hasGlove: false,
          label: getLastName(runner.name).slice(0, 3).toUpperCase(),
          showLabel: true,
          scale: 0.96
        });
      });
    }

    // 13. Draw Batted / Thrown Ball in 3D + Ground Shadow (when in play)
    if (this.playAnim && activeFrame && activeFrame.ball) {
      const { ball } = activeFrame;

      // Ground shadow path & 3D flight trail
      if (this.playAnim.trail && this.playAnim.trail.length > 1) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        this.playAnim.trail.forEach((bPt, i) => {
          const s = this.fieldToScreen(bPt.x, bPt.y, 0, vp);
          if (i === 0) ctx.moveTo(s.x, s.groundY);
          else ctx.lineTo(s.x, s.groundY);
        });
        ctx.stroke();

        ctx.strokeStyle = ball.isThrow ? 'rgba(96, 165, 250, 0.85)' : 'rgba(245, 185, 66, 0.8)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        this.playAnim.trail.forEach((bPt, i) => {
          const s = this.fieldToScreen(bPt.x, bPt.y, bPt.z, vp);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
      }

      const bScreen = this.fieldToScreen(ball.x, ball.y, ball.z, vp);

      // Ground shadow at z = 0 (Eddie Dombrower's signature depth cue!)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.ellipse(bScreen.x, bScreen.groundY, 5, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Elevated pixel baseball at z > 0
      const ballRadius = Math.min(7.5, 3.8 + ball.z * 0.045);
      const spin = getVisualBallSpin({ ...this.playAnim.ballSpin, isThrow: ball.isThrow });
      drawPixelBaseball(ctx, bScreen.x, bScreen.y, ballRadius, visualSpinAngle(spin.fps), spin);

      // Wall carom flash effect (e.g. Green Monster hit)
      if (activeFrame.wallHitFlash) {
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(bScreen.x, bScreen.y, 18, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 14. Top-Center 1987 Amiga Scoreboard Overlay & Top-Left Park/Wind Pill
    this.drawAmigaFieldScoreboard(ctx, vp, gameState);

    // Instant Replay Badge if active
    if (this.isReplay) {
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(vp.x + vp.w - 175, vp.y + 12, 162, 26);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('⏪ EWB INSTANT REPLAY', vp.x + vp.w - 165, vp.y + 29);
    }

    // Play outcome banner at bottom of Full-Field view
    if (isFullField && this.playAnim && this.playAnim.bannerText) {
      const bw = Math.min(vp.w - 40, 680);
      const bx = vp.x + (vp.w - bw) / 2;
      const by = vp.y + vp.h - 48;
      ctx.fillStyle = 'rgba(10, 18, 34, 0.92)';
      ctx.fillRect(bx, by, bw, 36);
      ctx.strokeStyle = '#f5b942';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, 36);

      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.playAnim.bannerText, bx + bw / 2, by + 22);
    }

    ctx.restore();
  }

  /**
   * Draws the authentic 1987 Amiga Top-Center Field Scoreboard (`amiga_01.jpg` / `ewb_1987_amiga_gameplay.jpg`)
   */
  drawAmigaFieldScoreboard(ctx, vp, gameState) {
    const park = gameState.park;
    const sbW = 248;
    const sbH = 54;
    const sbX = vp.x + Math.floor((vp.w - sbW) * 0.5);
    const sbY = vp.y + 6;

    ctx.fillStyle = 'rgba(10, 22, 46, 0.92)';
    ctx.fillRect(sbX, sbY, sbW, sbH);
    ctx.strokeStyle = '#f5b942';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sbX, sbY, sbW, sbH);

    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    const halfArrow = gameState.half === 'TOP' ? '▲' : '▼';
    ctx.fillText(`Inning ${gameState.inning}${halfArrow}  R   H   E`, sbX + 8, sbY + 16);
    ctx.fillText(`Outs    ${gameState.outs}`, sbX + 172, sbY + 16);

    ctx.fillStyle = '#ffffff';
    const awayName = gameState.awayTeam.city.slice(0, 9).padEnd(9, ' ');
    const homeName = gameState.homeTeam.city.slice(0, 9).padEnd(9, ' ');
    const aR = String(gameState.totals.away.R).padStart(2, ' ');
    const aH = String(gameState.totals.away.H).padStart(2, ' ');
    const aE = String(gameState.totals.away.E).padStart(2, ' ');
    const hR = String(gameState.totals.home.R).padStart(2, ' ');
    const hH = String(gameState.totals.home.H).padStart(2, ' ');
    const hE = String(gameState.totals.home.E).padStart(2, ' ');

    ctx.fillText(`${awayName}${aR}  ${aH}  ${aE}`, sbX + 8, sbY + 32);
    ctx.fillText(`Balls   ${gameState.count.balls}`, sbX + 172, sbY + 32);
    ctx.fillText(`${homeName}${hR}  ${hH}  ${hE}`, sbX + 8, sbY + 47);
    ctx.fillText(`Strikes ${gameState.count.strikes}`, sbX + 172, sbY + 47);

    // Compact park/wind badge on top-left
    ctx.fillStyle = 'rgba(10, 22, 46, 0.86)';
    ctx.fillRect(vp.x + 8, vp.y + 6, 172, 34);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.strokeRect(vp.x + 8, vp.y + 6, 172, 34);
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`${park.name} (${park.surface === 'Artificial Turf' ? 'Turf' : 'Grass'})`, vp.x + 13, vp.y + 19);
    ctx.fillStyle = '#93c5fd';
    ctx.font = '9px monospace';
    const windTxt = park.environment === 'Indoor' ? 'Indoor Dome' : `Wind: ${park.avgWindMph} mph ${park.prevailingWind}`;
    ctx.fillText(windTxt, vp.x + 13, vp.y + 33);
  }

  /**
   * Builds (and caches) a pixel sprite at device resolution with a soft dark outline,
   * so figures stay crisp on HiDPI screens and cost one drawImage per frame.
   */
  getPixelSprite(name, colors, facing, unitDev) {
    const key = [
      name, facing, unitDev, colors.cap, colors.jersey, colors.pants,
      colors.hasGlove ? 1 : 0, colors.hasBall ? 1 : 0
    ].join('|');
    this._spriteCache = this._spriteCache || new Map();
    const cached = this._spriteCache.get(key);
    if (cached) return cached;

    const rows = PIXEL_SPRITES[name] || PIXEL_SPRITES.READY;
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const shade = colors.shade || '#8b95a5';
    const palette = {
      c: colors.cap,
      b: '#1b2333',
      s: SKIN,
      w: colors.pants,
      j: colors.jersey,
      m: colors.hasGlove ? '#7a3b12' : SKIN,
      h: colors.hasBall ? '#ffffff' : SKIN,
      o: '#0b0f17',
      B: '#e2b866',
      n: '#18202f',
      d: '#2b3445'
    };

    const cellAt = (r, c) => {
      if (r < 0 || r >= h || c < 0 || c >= w) return '.';
      const src = facing < 0 ? w - 1 - c : c;
      return rows[r][src] || '.';
    };

    const off = document.createElement('canvas');
    off.width = (w + 2) * unitDev;
    off.height = (h + 2) * unitDev;
    const o = off.getContext('2d');

    // Outline pass: every empty cell touching a filled one
    o.fillStyle = SPRITE_OUTLINE;
    for (let r = -1; r <= h; r++) {
      for (let c = -1; c <= w; c++) {
        if (cellAt(r, c) !== '.') continue;
        if (cellAt(r - 1, c) !== '.' || cellAt(r + 1, c) !== '.' || cellAt(r, c - 1) !== '.' || cellAt(r, c + 1) !== '.') {
          o.fillRect((c + 1) * unitDev, (r + 1) * unitDev, unitDev, unitDev);
        }
      }
    }

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const ch = cellAt(r, c);
        if (ch === '.') continue;
        // 'g' alternates uniform and shade in a checkerboard, like EGA/Amiga dithering
        o.fillStyle = ch === 'g' ? ((r + c) % 2 ? shade : colors.pants) : palette[ch] || colors.pants;
        o.fillRect((c + 1) * unitDev, (r + 1) * unitDev, unitDev, unitDev);
      }
    }

    const sprite = { canvas: off, cellsW: w + 2, cellsH: h + 2 };
    this._spriteCache.set(key, sprite);
    return sprite;
  }

  /**
   * Blits a pixel sprite with its feet at (x, footY), snapped to whole device pixels.
   */
  drawPixelSprite(ctx, name, x, footY, unit, colors, facing = 1) {
    // Whole device pixels per cell keep the art crisp; below 2 that would shrink the
    // sprite badly, so build it at 2 and scale down to the true size instead.
    const wantDev = unit * this.dpr;
    const unitDev = Math.max(2, Math.round(wantDev));
    const drawUnit = wantDev < 1.75 ? wantDev : unitDev;
    const sprite = this.getPixelSprite(name, colors, facing, unitDev);
    const m = ctx.getTransform();
    const w = sprite.cellsW * drawUnit;
    const h = sprite.cellsH * drawUnit;
    const devX = Math.round(m.a * x + m.e - w / 2);
    const devY = Math.round(m.d * footY + m.f - h + drawUnit);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = drawUnit !== unitDev;
    ctx.drawImage(sprite.canvas, devX, devY, w, h);
    ctx.restore();
  }

  /**
   * Remembers which way a moving figure faces so it keeps facing that way when it stops.
   */
  trackFacing(key, dx) {
    this._facing = this._facing || {};
    if (Math.abs(dx) > 0.05) this._facing[key] = dx > 0 ? 1 : -1;
    return this._facing[key] || 1;
  }

  /**
   * Draws a pixel-art umpire with SAFE / OUT signals
   */
  drawUmpireSprite(ctx, x, y, callSignal, isFullField) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    const name = callSignal === 'SAFE' ? 'UMP_SAFE' : callSignal === 'OUT' ? 'UMP_OUT' : 'UMP';
    this.drawPixelSprite(ctx, name, x, y, isFullField ? 1.6 : 1.4, { cap: '#18202f', jersey: '#18202f', pants: '#2b3445' });

    if (callSignal && isFullField) {
      const isOut = callSignal === 'OUT';
      ctx.fillStyle = isOut ? '#dc2626' : '#16a34a';
      ctx.fillRect(x - 18, y - 36, 36, 12);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isOut ? 'OUT!' : 'SAFE!', x, y - 27);
    }
    ctx.restore();
  }

  /**
   * Draws a pixel-art field player / baserunner.
   * Poses: 'READY' | 'RUNNING' | 'FIELDING_GROUND' | 'FIELDING_AIR' | 'THROWING' | 'SLIDING' | 'RECEIVING' | 'BATTING'
   */
  drawArticulatedFieldPlayer(ctx, x, y, opts = {}) {
    const {
      groundY = y,
      jerseyColor = '#f58220',
      capColor = '#1e293b',
      pantsColor = '#f8fafc',
      pose = 'READY',
      stridePhase = 0,
      hasBall = false,
      hasGlove = true,
      facing = 1,
      label = '',
      showLabel = true,
      scale = 1.0
    } = opts;

    ctx.save();

    // Ground shadow at groundY (shrinks as the player leaves the ground)
    const lift = Math.max(0, groundY - y);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(x, groundY + 1, Math.max(3, 7 - lift * 0.15) * scale, 2.6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    if (pose === 'SLIDING') {
      // Dirt plume kicked up behind the slide
      ctx.fillStyle = 'rgba(184, 115, 56, 0.72)';
      ctx.beginPath();
      ctx.arc(x - facing * 12 * scale, y - 3 * scale, 5 * scale, 0, Math.PI * 2);
      ctx.arc(x - facing * 17 * scale, y - 6 * scale, 4 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    let spriteName = pose;
    if (pose === 'RUNNING') {
      // Four-step cycle: stride, pass, stride, pass
      const step = Math.floor((((stridePhase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2));
      spriteName = step % 2 === 0 ? 'RUN_A' : 'RUN_B';
    }
    if (!PIXEL_SPRITES[spriteName]) spriteName = 'READY';

    this.drawPixelSprite(ctx, spriteName, x, y, 1.45 * scale, {
      cap: capColor,
      jersey: jerseyColor,
      pants: pantsColor,
      hasGlove,
      hasBall
    }, facing);

    // Ball held in the glove (the throwing sprite shows it in the raised hand)
    if (hasBall && pose !== 'THROWING') {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0b0f17';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x + facing * 6 * scale, y - 12 * scale, 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();

    if (showLabel && label) {
      ctx.save();
      ctx.fillStyle = 'rgba(11, 15, 22, 0.78)';
      ctx.fillRect(x - 11, groundY + 4, 22, 10);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, groundY + 11.5);
      ctx.restore();
    }
  }

  /**
   * Returns a 2x2 checkerboard fill of two colors, locked to device pixels so the
   * dither stays crisp under any transform (mirroring, scaling).
   */
  getDitherPattern(ctx, a, b) {
    const cell = Math.max(1, Math.round(1.25 * this.dpr));
    const key = `${a}|${b}|${cell}`;
    this._ditherCache = this._ditherCache || new Map();
    let pat = this._ditherCache.get(key);
    if (!pat) {
      const off = document.createElement('canvas');
      off.width = off.height = cell * 2;
      const o = off.getContext('2d');
      o.fillStyle = a;
      o.fillRect(0, 0, cell * 2, cell * 2);
      o.fillStyle = b;
      o.fillRect(0, 0, cell, cell);
      o.fillRect(cell, cell, cell, cell);
      pat = ctx.createPattern(off, 'repeat');
      this._ditherCache.set(key, pat);
    }
    pat.setTransform(ctx.getTransform().inverse());
    return pat;
  }

  /** Black spikes shoe in profile, toe toward +x, sole on the ground at `foot`. */
  drawCleatSide(ctx, [fx, fy], onToe = false) {
    ctx.save();
    ctx.translate(fx, fy);
    if (onToe) {
      // Heel lifts as the back foot pivots on its toe
      ctx.translate(12, 0);
      ctx.rotate(-0.55);
      ctx.translate(-12, 0);
    }
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = FIGURE_OUTLINE;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-6, 0.5);
    ctx.lineTo(-6.5, -5.5);
    ctx.quadraticCurveTo(-3, -9, 2, -8);
    ctx.quadraticCurveTo(9, -6.5, 13, -2.5);
    ctx.quadraticCurveTo(14.5, 0.5, 12, 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(-5.5, -1.2, 17.5, 1.4);
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-0.5, -2.6);
    ctx.lineTo(4, -6.6);
    ctx.moveTo(3, -2.6);
    ctx.lineTo(7, -5.8);
    ctx.stroke();
    ctx.restore();
  }

  /** Black spikes shoe seen toe-on from the plate, sole on the ground at `foot`. */
  /**
   * A cleat seen from the front. `side` (0..1) turns it toward profile, toe pointing to -x:
   * a pivot foot laid along the rubber reads longer and flatter.
   */
  drawCleatFront(ctx, [fx, fy], side = 0) {
    const l = fx - 5.5 - 5 * side;
    const r = fx + 5.5 - side;
    const top = fy - 5 + 1.5 * side;
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = FIGURE_OUTLINE;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(l, fy + 2.5);
    ctx.lineTo(l, fy - 0.5);
    ctx.quadraticCurveTo(l + 0.5, top + 0.5, (l + r) / 2, top);
    ctx.quadraticCurveTo(r - 0.5, top + 0.5, r, fy - 0.5);
    ctx.lineTo(r, fy + 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(l + 0.5, fy + 1, r - l - 1, 1.3);
  }

  /**
   * Strokes a jointed limb: outline pass for every segment, then the fill pass,
   * so joints read as one shape. `segs` is [[from, to, width], ...].
   */
  strokeLimb(ctx, segs, fill) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = FIGURE_OUTLINE;
    for (const [a, b, w] of segs) {
      ctx.lineWidth = w + 2.4;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    ctx.strokeStyle = fill;
    for (const [a, b, w] of segs) {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  }

  /**
   * Lays a dithered shadow strip along one side of each limb segment.
   * `side` picks which perpendicular (+1 / -1) faces away from the light.
   */
  shadeLimb(ctx, segs, pattern, side = 1) {
    ctx.lineCap = 'butt';
    ctx.strokeStyle = pattern;
    for (const [a, b, w] of segs) {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const ox = (-dy / len) * w * 0.27 * side;
      const oy = (dx / len) * w * 0.27 * side;
      ctx.lineWidth = w * 0.46;
      ctx.beginPath();
      ctx.moveTo(a[0] + ox, a[1] + oy);
      ctx.lineTo(b[0] + ox, b[1] + oy);
      ctx.stroke();
    }
  }

  /**
   * Draws the Right 1/3 Split-Screen Viewport: the Pitcher vs. Batter duel seen from
   * catcher's-eye height behind home plate. The batter fills the foreground beside the
   * plate; the pitcher stands small on the mound against the batter's eye.
   */
  drawDuelViewport(ctx, vp, gameState) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(vp.x, vp.y, vp.w, vp.h);
    ctx.clip();

    const pitcher = gameState.currentPitcher;
    const batter = gameState.currentBatter;
    const fieldingTeam = gameState.half === 'TOP' ? gameState.homeTeam : gameState.awayTeam;
    const battingTeam = gameState.half === 'TOP' ? gameState.awayTeam : gameState.homeTeam;
    const hasRunnersOnBase = Boolean(gameState.bases && gameState.bases.some(Boolean));
    const isTurf = gameState.park?.surface === 'Artificial Turf';

    const cx = vp.x + vp.w * 0.5;
    // Zoom the scene about the bottom center so the batter and pitcher fill the view below the
    // stat box instead of sharing it with rows of seats. The stat box and call banner stay unzoomed.
    const viewBottom = vp.y + vp.h;
    ctx.save();
    ctx.translate(cx, viewBottom);
    ctx.scale(DUEL_ZOOM, DUEL_ZOOM);
    ctx.translate(-cx, -viewBottom);

    const standsTop = vp.y + 104;
    const lowerStandsTop = vp.y + 262;
    const wallTop = vp.y + 316;
    const grassTop = vp.y + 334;
    const dirtTop = vp.y + 404;
    const moundY = vp.y + 366;
    const plateY = vp.y + 428;

    let batterSide = batter ? batter.bats : 'R';
    if (batterSide === 'S') {
      batterSide = pitcher && pitcher.throws === 'L' ? 'R' : 'L';
    }
    // The camera sits a step off-center, away from the batter, like a TV camera behind the plate.
    // Parallax then shifts the plate a little and the mound more, so the batter stays clear of the pitcher.
    const awayFromBatter = batterSide === 'R' ? 1 : -1;
    const plateX = cx + awayFromBatter * 22;
    const moundX = plateX + awayFromBatter * 14;
    // The batter stands in the box level with the plate, just behind its front edge
    const batterFootY = plateY + 22;

    // 1. Upper stands: speckled crowd, slightly dimmed so the players pop
    ctx.fillStyle = this.getCrowdPattern(ctx);
    ctx.fillRect(vp.x, standsTop, vp.w, lowerStandsTop - standsTop);
    ctx.fillStyle = 'rgba(8, 12, 20, 0.55)';
    ctx.fillRect(vp.x, standsTop, vp.w, lowerStandsTop - standsTop);

    // 2. Lower boxes: darker band cut by aisle stairways that fan out in perspective
    ctx.fillStyle = this.getCrowdPattern(ctx);
    ctx.fillRect(vp.x, lowerStandsTop, vp.w, wallTop - lowerStandsTop);
    ctx.fillStyle = 'rgba(4, 7, 12, 0.6)';
    ctx.fillRect(vp.x, lowerStandsTop, vp.w, wallTop - lowerStandsTop);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(vp.x, lowerStandsTop, vp.w, 2);
    ctx.strokeStyle = '#05070b';
    ctx.lineWidth = 3.5;
    for (const frac of [0.06, 0.27, 0.73, 0.94]) {
      const bx = vp.x + vp.w * frac;
      const tx = cx + (bx - cx) * 1.18;
      ctx.beginPath();
      ctx.moveTo(bx, wallTop);
      ctx.lineTo(tx, lowerStandsTop + 2);
      ctx.stroke();
    }

    // Batter's eye: dark backdrop behind the pitcher
    ctx.fillStyle = '#070b12';
    ctx.fillRect(moundX - 42, lowerStandsTop + 6, 84, wallTop - lowerStandsTop - 6);

    // 3. Outfield wall pad, warning track
    ctx.fillStyle = '#14532d';
    ctx.fillRect(vp.x, wallTop, vp.w, 14);
    ctx.fillStyle = '#f5b942';
    ctx.fillRect(vp.x, wallTop, vp.w, 2);
    ctx.fillStyle = isTurf ? '#6b5a44' : '#a0612c';
    ctx.fillRect(vp.x, wallTop + 14, vp.w, grassTop - wallTop - 14);

    // 4. Grass with mowing stripes that widen toward the camera
    const grassA = isTurf ? '#157a68' : '#1f8a3e';
    const grassB = isTurf ? '#126e5e' : '#1b7d36';
    let sy = grassTop;
    let stripeH = 3;
    let stripe = 0;
    while (sy < dirtTop) {
      ctx.fillStyle = stripe++ % 2 ? grassB : grassA;
      ctx.fillRect(vp.x, sy, vp.w, Math.min(stripeH, dirtTop - sy) + 0.5);
      sy += stripeH;
      stripeH *= 1.22;
    }

    // Pitcher's mound and rubber
    ctx.fillStyle = '#a65f2a';
    ctx.beginPath();
    ctx.ellipse(moundX, moundY - 1, 44, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c27a3e';
    ctx.beginPath();
    ctx.ellipse(moundX, moundY - 3, 26, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(moundX - 7, moundY - 3, 14, 2);

    // 5. Home plate dirt
    ctx.fillStyle = isTurf ? '#8b6a4a' : '#a65f2a';
    ctx.fillRect(vp.x, dirtTop, vp.w, vp.y + vp.h - dirtTop);
    ctx.fillStyle = 'rgba(255, 220, 170, 0.07)';
    ctx.beginPath();
    ctx.ellipse(plateX, plateY + 30, vp.w * 0.45, 46, 0, 0, Math.PI * 2);
    ctx.fill();

    // Foul lines running off to either side, then the batter's boxes in perspective
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plateX - 22, plateY - 2);
    ctx.lineTo(vp.x, dirtTop + 10);
    ctx.moveTo(plateX + 22, plateY - 2);
    ctx.lineTo(vp.x + vp.w, dirtTop + 10);
    ctx.stroke();

    ctx.lineWidth = 1.8;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(plateX + s * 25, plateY - 10);
      ctx.lineTo(plateX + s * 60, plateY - 10);
      ctx.lineTo(plateX + s * 94, plateY + 50);
      ctx.lineTo(plateX + s * 31, plateY + 50);
      ctx.closePath();
      ctx.stroke();
      // Catcher's box lines trailing toward the camera
      ctx.beginPath();
      ctx.moveTo(plateX + s * 31, plateY + 50);
      ctx.lineTo(plateX + s * 36, vp.y + vp.h);
      ctx.stroke();
    }

    // Home plate seen from behind: point toward the camera, black rubber bevel
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.moveTo(plateX - 19, plateY - 3);
    ctx.lineTo(plateX + 19, plateY - 3);
    ctx.lineTo(plateX + 19, plateY + 3);
    ctx.lineTo(plateX, plateY + 9);
    ctx.lineTo(plateX - 19, plateY + 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(plateX - 17, plateY - 4);
    ctx.lineTo(plateX + 17, plateY - 4);
    ctx.lineTo(plateX + 17, plateY + 1);
    ctx.lineTo(plateX, plateY + 6);
    ctx.lineTo(plateX - 17, plateY + 1);
    ctx.closePath();
    ctx.fill();

    // Faint strike-zone frame above the plate, from the batter's knees to mid-torso
    const szW = 34;
    const szH = 56;
    const szX = plateX - szW / 2;
    const szY = batterFootY - 96;
    ctx.strokeStyle = 'rgba(245, 185, 66, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(szX, szY, szW, szH);
    ctx.setLineDash([]);

    // 6. Pitcher on the mound
    const pitchProg = this.pitchAnim ? this.pitchAnim.progress : 0;
    const isLeftyP = pitcher && pitcher.throws === 'L';
    this.drawDuelPitcher(ctx, moundX, moundY, fieldingTeam, pitcher, pitchProg, hasRunnersOnBase, fieldingTeam === gameState.homeTeam);

    // 7. Pitch flight. Depth runs from the release point (~55 ft out) to the plate, so the ball
    //    creeps out of the windup, then grows fast and breaks late, as it does from behind the plate.
    const outcome = this.pitchAnim?.outcome;
    const wasHit = Boolean(this.pitchAnim?.swung) && (outcome === 'IN_PLAY' || outcome === 'FOUL');
    const putInPlay = outcome === 'IN_PLAY';
    let target = null;
    if (this.pitchAnim) {
      const normZ = ((this.pitchAnim.plateZ ?? 2.5) - 1.55) / 2.0;
      target = {
        x: plateX + (this.pitchAnim.plateX || 0) * (szW * 0.64),
        y: szY + szH * (1 - Math.max(-0.35, Math.min(1.35, normZ)))
      };
    }

    if (this.pitchAnim && pitchProg >= 0.42) {
      const t = Math.min(1, (pitchProg - 0.42) / 0.5);
      const d0 = 55;
      const d1 = 10;
      // Pitch leaves the throwing hand: per-pitcher arm slot, mirrored for LHP.
      const release = getReleasePointOffset(pitcher);
      const startX = moundX + release.dx;
      const startY = moundY + release.dy;
      const ballAt = (tt) => {
        const d = d0 + (d1 - d0) * tt;
        const s = (1 / d - 1 / d0) / (1 / d1 - 1 / d0);
        const bx = (this.pitchAnim.breakX || 0) * 14;
        const bz = (this.pitchAnim.breakZ || 0) * 12;
        return {
          x: lerp(startX, target.x - bx, s) + bx * s * s,
          y: lerp(startY, target.y + bz, s) - bz * s * s,
          s
        };
      };

      const contactReached = putInPlay && t >= 0.97;
      if (!contactReached) {
        // Ghost trail
        for (let i = 3; i >= 1; i--) {
          const g = ballAt(Math.max(0, t - i * 0.035));
          ctx.fillStyle = `rgba(255, 255, 255, ${0.12 * (4 - i)})`;
          ctx.beginPath();
          ctx.arc(g.x, g.y, lerp(1.2, 5, g.s), 0, Math.PI * 2);
          ctx.fill();
        }

        const b = ballAt(t);
        const radius = lerp(1.3, 5.5, b.s);
        const shadowY = lerp(moundY, plateY, b.s);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(b.x, shadowY, radius, radius * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        const spin = getVisualBallSpin({ pitchType: this.pitchAnim.pitchType });
        const tint = !putInPlay && t >= 0.65 ? (this.pitchAnim.isStrike ? '#ef4444' : '#22c55e') : null;
        drawPixelBaseball(ctx, b.x, b.y, radius, visualSpinAngle(spin.fps), { ...spin, tint });
      }
    }

    // 8. Batter in the box, filling the foreground
    const batterX = plateX - awayFromBatter * 88;
    // The batter's clock keeps running past the end of the pitch so the follow-through can finish
    const batterProg = pitchProg + (this.pitchAnim?.finishMs || 0) * FLIGHT_PROGRESS_PER_MS;
    this.drawDuelBatter(
      ctx,
      batterX,
      batterFootY,
      battingTeam,
      batterSide,
      batterProg,
      Boolean(this.pitchAnim && this.pitchAnim.swung),
      battingTeam === gameState.homeTeam
    );

    // 9. Contact flash, or the catcher's mitt popping up to receive the pitch
    if (this.pitchAnim && target && pitchProg >= 0.9) {
      if (wasHit) {
        const flash = 1 - Math.min(1, (pitchProg - 0.9) / 0.1) * 0.6;
        ctx.strokeStyle = `rgba(253, 224, 71, ${flash})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.moveTo(target.x + Math.cos(a) * 5, target.y + Math.sin(a) * 5);
          ctx.lineTo(target.x + Math.cos(a) * 13, target.y + Math.sin(a) * 13);
        }
        ctx.stroke();
      } else {
        // The colored pixel ball supplies the catch; suppress the mitt's legacy outlined white ball.
        this.drawDuelCatcherMitt(ctx, target.x, target.y, false);
      }
    }

    // Retain a colored pixel ball at the crossing, including after pitchAnim clears.
    if (this.pitchAnim && target && !putInPlay && pitchProg >= 0.92) {
      this.pitchBallMark = {
        plateX: this.pitchAnim.plateX, plateZ: this.pitchAnim.plateZ,
        tint: this.pitchAnim.isStrike ? '#ef4444' : '#22c55e',
        label: this.pitchAnim.isStrike ? 'STRIKE' : 'BALL',
        batter
      };
    }
    // The mark belongs to the batter who saw the pitch; a new batter starts with a clean zone
    if (this.pitchBallMark && this.pitchBallMark.batter !== batter) {
      this.pitchBallMark = null;
    }
    if (this.pitchBallMark) {
      const mark = this.pitchBallMark;
      const normZ = ((mark.plateZ ?? 2.5) - 1.55) / 2;
      const x = plateX + (mark.plateX || 0) * (szW * 0.64);
      const y = szY + szH * (1 - Math.max(-0.35, Math.min(1.35, normZ)));

      // Subtle halo around crossing ball so it clearly pops against the catcher's mitt
      ctx.fillStyle = 'rgba(7, 12, 24, 0.6)';
      ctx.beginPath();
      ctx.arc(x, y, 7.5, 0, Math.PI * 2);
      ctx.fill();

      drawPixelBaseball(ctx, x, y, 5.5, 0, { axis: 'back', tint: mark.tint });

      // Badge pill with label
      const badgeText = mark.label;
      ctx.font = 'bold 9px monospace';
      const textW = ctx.measureText(badgeText).width;
      const badgeY = y - 11;
      ctx.fillStyle = 'rgba(7, 12, 24, 0.88)';
      ctx.fillRect(Math.round(x - textW / 2 - 3), Math.round(badgeY - 7), Math.round(textW + 6), 11);
      ctx.strokeStyle = mark.tint;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(x - textW / 2 - 3), Math.round(badgeY - 7), Math.round(textW + 6), 11);

      ctx.fillStyle = mark.tint;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, x, badgeY - 1.5);
    }

    ctx.restore();

    // 10. Batter/Pitcher stat box over the stands
    this.drawAmigaDuelStatBox(ctx, vp, gameState, batter, pitcher);

    // 11. Pitch call banner when the pitch finishes
    if (this.pitchAnim && pitchProg >= 0.85) {
      const boxW = vp.w - 24;
      const boxX = vp.x + 12;
      const boxY = vp.y + 114;
      ctx.fillStyle = 'rgba(10, 22, 46, 0.92)';
      ctx.fillRect(boxX, boxY, boxW, 38);
      ctx.strokeStyle = '#f5b942';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(boxX, boxY, boxW, 38);

      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${this.pitchAnim.pitchType} (${this.pitchAnim.mph} MPH) — ${this.pitchAnim.callText}`,
        cx,
        boxY + 23
      );
    }

    ctx.restore();
  }

  /**
   * Draws the authentic 1987 Amiga Top-Right Batter/Pitcher Stat Box (`amiga_02.jpg`)
   */
  drawAmigaDuelStatBox(ctx, vp, gameState, batter, pitcher) {
    const boxH = 104;
    ctx.fillStyle = '#0a162e';
    ctx.fillRect(vp.x, vp.y, vp.w, boxH);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vp.x + 1, vp.y + 1, vp.w - 2, boxH - 2);

    const bLast = batter ? getLastName(batter.name) : 'Batter';
    const pLast = pitcher ? getLastName(pitcher.name) : 'Pitcher';
    const pHand = pitcher?.throws === 'L' ? 'L' : 'R';
    const bSplit = batter?.splits?.[pHand] || batter?.splits?.T || { BA: 0.285, HR: 18, RBI: 70 };
    const bAvgStr = (Number(bSplit.BA) || 0.285).toFixed(3).replace(/^0/, '');
    const bRuns = batter?.ratings?.runs ?? 6;

    const pTotal = pitcher?.splits?.T || { ERA: 2.85, W: 18, L: 9 };
    const pFatigue = pitcher?.ratings?.fatigue ?? 8;

    ctx.textAlign = 'left';
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText(`Batter: `, vp.x + 12, vp.y + 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${bLast} (${batter?.bats || 'R'})`, vp.x + 76, vp.y + 20);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px monospace';
    ctx.fillText(`  ${bAvgStr}  ${bSplit.HR} HR  ${bSplit.RBI} RBI  R: ${bRuns}`, vp.x + 12, vp.y + 39);

    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText(`Pitcher:`, vp.x + 12, vp.y + 60);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${pLast} (${pHand}HP)`, vp.x + 82, vp.y + 60);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px monospace';
    ctx.fillText(
      `  ${Number(pTotal.ERA).toFixed(2)}  ${pTotal.W}-${pTotal.L}  F: ${pFatigue} (${pitcher?.pitchCount || 0}P)`,
      vp.x + 12,
      vp.y + 78
    );

    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(
      `Balls ${gameState.count.balls}   Strikes ${gameState.count.strikes}`,
      vp.x + 12,
      vp.y + 97
    );
  }

  /**
   * Pitcher on the mound, seen front-on from behind the plate. Each pitcher's arm slot,
   * leg kick, windup and follow-through come from `getPitcherStyle` (pitcherStyles.js).
   * Bases empty, the windup (hands overhead, or hidden at the chest, or a Tiant-style pivot):
   * - idle: square to the plate, hands together at the chest
   * - 0.00–0.05 hands rise, still square
   * - 0.05–0.11 rocker step: the glove-side foot steps back
   * - 0.11–0.17 pivot: the pivot foot turns into the slot and the body turns side-on
   * - 0.17–0.26 the knee lifts to the chest as the body coils past side-on; hands to the chest
   * - 0.26–0.28 balance point
   * Runners on, the stretch:
   * - idle: side-on, hands apart, looking in for the sign (and glancing at the runner)
   * - 0.00–0.09 come set: the hands meet at the chest, then settle at the belt
   * - 0.09–0.21 the full stop (about 300 ms)
   * - 0.21–0.28 a quicker, lower leg lift that stays in front
   * Both then finish the same way:
   * - 0.27–0.30 the hands break at the belt as the knee starts down
   * - 0.30–0.33 stride toward the plate, shoulders closed, front foot still in the air; the
   *   glove arm leads toward third and the throwing hand swings down and back past the hip
   * - 0.33–0.355 the front foot lands, the hips open and the throwing elbow rises
   * - 0.355–0.385 the elbow leads up and the hand trails behind the head; the glove pulls in
   * - 0.385–0.40 layback: the shoulders square, the elbow leads and the hand drops behind the head
   * - 0.40–0.42 the arm snaps through to the release
   * - 0.42 release: the ball leaves the hand here, at the hand from `getReleasePointOffset`
   * - 0.42–0.62 follow-through across to the glove-side knee, the torso folds, the back leg lifts
   */
  drawDuelPitcher(ctx, x, footY, team, pitcher, progress, isStretch = false, isHome = true) {
    const style = getPitcherStyle(pitcher);
    const P = getPitcherPoses(style);
    const isLefty = pitcher && pitcher.throws === 'L';
    const primary = team?.primaryColor || '#f58220';
    const secondary = team?.secondaryColor || '#1e293b';
    const uni = isHome ? '#f4f5f7' : '#c4cad3';
    const uniShade = isHome ? '#97a0ae' : '#7a8391';

    const setPose = isStretch ? P.SIGN : P.SET;
    const liftPose = isStretch ? P.STRETCH_LIFT : P.LIFT;
    const breakPose = isStretch ? P.STRETCH_BREAK : P.BREAK;
    const leadIn = (prog) => {
      if (isStretch) {
        if (prog < 0.045) return blendPose(P.SIGN, P.GATHER, smooth(Math.pow(prog / 0.045, style.tempo)));
        if (prog < 0.09) return blendPose(P.GATHER, P.STRETCH, smooth((prog - 0.045) / 0.045));
        if (prog < 0.21) return P.STRETCH;
        return blendPose(P.STRETCH, P.STRETCH_LIFT, smooth((prog - 0.21) / 0.07));
      }
      if (prog < 0.05) return blendPose(P.SET, P.WIND, smooth(Math.pow(prog / 0.05, style.tempo)));
      if (prog < 0.11) return blendPose(P.WIND, P.ROCKER, smooth((prog - 0.05) / 0.06));
      if (prog < 0.17) return blendPose(P.ROCKER, P.PIVOT, smooth((prog - 0.11) / 0.06));
      if (prog < 0.26) return blendPose(P.PIVOT, P.LIFT, smooth((prog - 0.17) / 0.09));
      return P.LIFT;
    };
    const poseAt = (prog) => {
      if (prog < 0.27) return leadIn(prog);
      if (prog < 0.3) return blendPose(leadIn(prog), breakPose, smooth((prog - 0.27) / 0.03));
      if (prog < 0.33) return blendPose(breakPose, P.STRIDE, smooth((prog - 0.3) / 0.03));
      if (prog < 0.355) return blendPose(P.STRIDE, P.LOAD, smooth((prog - 0.33) / 0.025));
      // The elbow leads and the hand trails behind the head into the cock
      if (prog < 0.385) {
        const t = (prog - 0.355) / 0.03;
        return blendPose(P.LOAD, P.COCK, t * t);
      }
      if (prog < 0.4) return blendPose(P.COCK, P.LAYBACK, smooth((prog - 0.385) / 0.015));
      // The whip runs at full speed through the release instead of easing into it
      if (prog < 0.42) return blendPose(P.LAYBACK, P.RELEASE, (prog - 0.4) / 0.02);
      const t = Math.min(1, (prog - 0.42) / 0.2);
      return blendPose(P.RELEASE, P.FOLLOW, 1 - (1 - t) * (1 - t));
    };
    let pose;
    if (progress === 0) {
      pose = { ...setPose };
      const breath = Math.sin(performance.now() * 0.004) * 0.8;
      pose.neck = [setPose.neck[0], setPose.neck[1] + breath];
      pose.head = [
        setPose.head[0] + (isStretch && Math.sin(performance.now() * 0.003) > 0.4 ? 3 : 0),
        setPose.head[1] + breath
      ];
    } else {
      pose = poseAt(progress);
    }

    // The figure grows a little as the stride carries the body toward the plate
    const k = DUEL_PITCHER_SCALE * strideApproachScale(pose);
    ctx.save();
    // The shadow stretches down the mound under a front foot that has landed nearer the plate
    const reach = Math.max(0, pose.gFoot[1]) * k;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(x, footY + reach / 2, 13, 3.5 + reach / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(x, footY);
    ctx.scale(isLefty ? -k : k, k);
    const shade = this.getDitherPattern(ctx, uni, uniShade);
    const sleeveShade = this.getDitherPattern(ctx, primary, darken(primary, 0.45));

    // Throwing arm: drawn behind the body while it swings back toward second base, on top once it
    // comes through. A smear trails the hand through the whip.
    const armBehind = (pose.tArmBack ?? 0) > 0.5;
    const drawThrowingArm = () => {
      if (progress > 0.36 && progress < 0.5) {
        const prev = poseAt(Math.max(0.33, progress - 0.03));
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.moveTo(pose.tShoulder[0], pose.tShoulder[1]);
        ctx.lineTo(prev.tHand[0], prev.tHand[1]);
        ctx.lineTo(pose.tHand[0], pose.tHand[1]);
        ctx.closePath();
        ctx.fill();
      }
      const tArm = [[pose.tShoulder, pose.tElbow, 8.5], [pose.tElbow, pose.tHand, 7.5]];
      this.strokeLimb(ctx, tArm, primary);
      this.shadeLimb(ctx, tArm, sleeveShade, -1);
      ctx.fillStyle = SKIN;
      ctx.strokeStyle = FIGURE_OUTLINE;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(pose.tHand[0], pose.tHand[1], 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (progress > 0 && progress < 0.42) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(pose.tHand[0], pose.tHand[1] - 2.5, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    };
    const drawGloveArm = () => {
      const gArm = [[pose.gShoulder, pose.gElbow, 8.5], [pose.gElbow, pose.gHand, 7.5]];
      this.strokeLimb(ctx, gArm, primary);
      this.shadeLimb(ctx, gArm, sleeveShade, 1);
      ctx.fillStyle = '#7a3b12';
      ctx.strokeStyle = FIGURE_OUTLINE;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(pose.gHand[0] + 1, pose.gHand[1], 6, 7, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    // Coiled with the back to the plate, both hands are in front of the chest, out of sight
    // behind the jersey.
    const coiled = (pose.back ?? 0) > 0.5;
    if (armBehind || coiled) drawThrowingArm();
    if (coiled) drawGloveArm();

    // Legs, cleats and team stirrups
    const hipW = pose.hipW ?? 1;
    // Hips swap sides as the pitcher coils his back to the plate
    const hipSide = 1 - 2 * (pose.back ?? 0);
    const pelvisT = [pose.pelvis[0] - 6 * hipW * hipSide, pose.pelvis[1]];
    const pelvisG = [pose.pelvis[0] + 6 * hipW * hipSide, pose.pelvis[1]];
    const drawLeg = (hip, knee, foot, side) => {
      // Stirrup from the pant cuff to the ankle, then the shoe (toe-on, or turned along the
      // rubber), then the pants
      const ankle = [foot[0], foot[1] - 4];
      const cuff = [lerp(knee[0], ankle[0], 0.5), lerp(knee[1], ankle[1], 0.5)];
      this.strokeLimb(ctx, [[cuff, ankle, 6.5]], primary);
      this.drawCleatFront(ctx, foot, side);
      const leg = [[hip, knee, 12], [knee, cuff, 10]];
      this.strokeLimb(ctx, leg, uni);
      this.shadeLimb(ctx, leg, shade, 1);
    };
    // A knee lifted well above the hip comes up in front of the jersey, toward the plate
    const kneeUp = pose.gKnee[1] < pose.pelvis[1] - 10;
    drawLeg(pelvisT, pose.tKnee, pose.tFoot, pose.tFootSide ?? 0);
    if (!kneeUp) drawLeg(pelvisG, pose.gKnee, pose.gFoot, pose.gFootSide ?? 0);

    // Torso: tapered jersey with dithered shadow side, team lettering and belt
    const [tsx, tsy] = pose.tShoulder;
    const [gsx, gsy] = pose.gShoulder;
    const [px, py] = pose.pelvis;
    ctx.fillStyle = uni;
    ctx.strokeStyle = FIGURE_OUTLINE;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(tsx - 2, tsy);
    ctx.lineTo(gsx + 2, gsy);
    ctx.lineTo(px + 9 * hipW, py + 1);
    ctx.lineTo(px - 9 * hipW, py + 1);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.moveTo((tsx + gsx) / 2 + 4, (tsy + gsy) / 2);
    ctx.lineTo(gsx + 2, gsy);
    ctx.lineTo(px + 9 * hipW, py + 1);
    ctx.lineTo(px + 3 * hipW, py + 1);
    ctx.closePath();
    ctx.fill();
    // Team lettering across the chest while it faces the plate; side-on neither shows, and at
    // the top of a deep coil the plate sees the number on the back instead.
    const back = pose.back ?? 0;
    const chestY = lerp(tsy, py, 0.3);
    if ((pose.front ?? 1) > 0.35) {
      ctx.strokeStyle = primary;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lerp(tsx, px, 0.3) + 3, chestY + 1);
      ctx.lineTo(lerp(gsx, px, 0.3) - 3, chestY - 1);
      ctx.stroke();
    } else if (back > 0.5) {
      const number = String(pitcher?.uniform ?? 2 + (hashString(pitcher?.id || pitcher?.name) % 58));
      ctx.save();
      ctx.translate((tsx + gsx) / 2, lerp(tsy, py, 0.4));
      // Undo the left-handed mirror so the digits read correctly, and squeeze them while side-on
      ctx.scale((isLefty ? -1 : 1) * (0.4 + 0.6 * back), 1);
      ctx.globalAlpha = Math.min(1, (back - 0.5) * 3);
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = secondary;
      ctx.strokeText(number, 0, 0);
      ctx.fillStyle = primary;
      ctx.fillText(number, 0, 0);
      ctx.restore();
    }
    ctx.fillStyle = '#1b2333';
    ctx.fillRect(px - 9 * hipW, py - 3, 18 * hipW, 4);
    if (kneeUp) drawLeg(pelvisG, pose.gKnee, pose.gFoot, pose.gFootSide ?? 0);

    // Glove arm, then head and cap, then the throwing arm on top unless it is behind the body
    if (!coiled) drawGloveArm();

    const [hx, hy] = pose.head;
    const hr = pose.headR;
    this.strokeLimb(ctx, [[pose.neck, [hx, hy + hr * 0.5], 6]], SKIN);
    ctx.fillStyle = SKIN;
    ctx.strokeStyle = FIGURE_OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
    // As the torso folds toward the plate the head bows: the crown and brim come down the face
    const bow = Math.max(0, Math.min(1, ((pose.flex ?? 0) - 0.1) / 0.3)) * 3;
    ctx.fillStyle = secondary;
    ctx.beginPath();
    ctx.arc(hx, hy - 1 + bow, hr + 0.8, Math.PI * 1.02, Math.PI * 1.98);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const brimY = hy - 2.5 + bow;
    const eyeY = hy + 1 + bow * 0.8;
    if (coiled) {
      // Coiled away from the plate, he looks in over the glove shoulder: the head shows in
      // profile, the brim and one eye toward third
      ctx.fillStyle = darken(secondary, 0.3);
      ctx.fillRect(hx - hr - 4, brimY, hr + 3, 3);
      ctx.fillStyle = FIGURE_OUTLINE;
      ctx.fillRect(hx - hr + 1, eyeY, 2, 2);
    } else if ((pose.front ?? 1) < 0.35) {
      // Side-on, his face turns in toward the catcher: a three-quarter head, brim and eyes
      // shifted toward third
      ctx.fillStyle = darken(secondary, 0.3);
      ctx.fillRect(hx - hr - 3, brimY, hr * 2 - 1, 3);
      ctx.fillStyle = FIGURE_OUTLINE;
      ctx.fillRect(hx - 6, eyeY, 2, 2);
      ctx.fillRect(hx - 1, eyeY, 2, 2);
    } else {
      ctx.fillStyle = darken(secondary, 0.3);
      ctx.fillRect(hx - hr - 2, brimY, hr * 2 + 4, 3);
      ctx.fillStyle = FIGURE_OUTLINE;
      ctx.fillRect(hx - 4, eyeY, 2, 2);
      ctx.fillRect(hx + 2, eyeY, 2, 2);
    }

    if (!armBehind && !coiled) drawThrowingArm();

    ctx.restore();
  }

  /**
   * Batter in the box, side-on from behind the plate and filling the foreground.
   * Kinetic multi-phase swing choreographies customized by player style:
   * - 0.00–0.42 pre-pitch stance & idle waggle (arm flap, barrel circle, pump, twitch)
   * - 0.42–0.58 load (hands drift back/up into slot, weight coils back, stride begins)
   * - 0.58–0.72 stride plant (front foot plants, hips brace, elastic separation)
   * - 0.72–0.90 swing acceleration (hips clear, elbow slots, violent snap to contact at p = 0.90)
   * - 0.90–1.00 follow-through (one-hand high extension vs two-hand wrap)
   * - !didSwing check-swing / take (wrists hold up before 90° or disciplined take)
   */
  drawDuelBatter(ctx, x, footY, team, side, pitchProg, didSwing, isHome = false, batter = null) {
    const batterObj = batter || this.lastGameState?.currentBatter;
    const style = getBatterStyle(batterObj, side);
    const tNow = performance.now();
    const pose = getBatterSwingPose(style, pitchProg, didSwing, tNow);

    const f = side === 'R' ? 1 : -1; // RHB stands left of the plate and faces right
    const primary = team?.primaryColor || '#bd3039';
    const secondary = team?.secondaryColor || '#0c2340';
    const uni = isHome ? '#f4f5f7' : '#c4cad3';
    const uniShade = isHome ? '#97a0ae' : '#7a8391';

    const batTip = (pz) => [pz.hands[0] + Math.sin(pz.batAng) * pz.batLen, pz.hands[1] - Math.cos(pz.batAng) * pz.batLen];

    ctx.save();
    ctx.translate(x, footY);
    ctx.scale(f, 1);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(16, 0, 40, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bat: tapered ash with a dark outline
    const drawBat = () => {
      const tip = batTip(pose);
      const dx = tip[0] - pose.hands[0];
      const dy = tip[1] - pose.hands[1];
      const len = Math.hypot(dx, dy) || 1;
      const ax = dx / len;
      const ay = dy / len;
      const knob = [pose.hands[0] - ax * 11, pose.hands[1] - ay * 11];
      const nxp = -ay;
      const nyp = ax;
      ctx.fillStyle = '#d9b26a';
      ctx.strokeStyle = FIGURE_OUTLINE;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(knob[0] + nxp * 1.6, knob[1] + nyp * 1.6);
      ctx.lineTo(tip[0] + nxp * 3.4, tip[1] + nyp * 3.4);
      // Round the barrel end outward, past the tip, not back into the bat
      ctx.arc(tip[0], tip[1], 3.4, Math.atan2(nyp, nxp), Math.atan2(-nyp, -nxp), true);
      ctx.lineTo(knob[0] - nxp * 1.6, knob[1] - nyp * 1.6);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.strokeStyle = '#f3dca0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lerp(pose.hands[0], tip[0], 0.35) + nxp, lerp(pose.hands[1], tip[1], 0.35) + nyp);
      ctx.lineTo(tip[0] + nxp, tip[1] + nyp);
      ctx.stroke();
    };

    // After contact the barrel wraps past the pitcher's side to the far side of the batter,
    // so it passes behind the body and helmet. From the wrap on, the chest faces the pitcher
    // and the arms and hands finish on that far side too, drawn before the torso covers them.
    const armsBehind = (pose.armsBehind || 0) > 0.5;
    const batBehind = armsBehind || (pose.batDepth > 0.3 && pose.batYaw > 100);
    if (batBehind) drawBat();

    const shade = this.getDitherPattern(ctx, uni, uniShade);
    const farUni = this.getDitherPattern(ctx, uniShade, uni);
    const sleeveShade = this.getDitherPattern(ctx, primary, darken(primary, 0.45));

    // Pants end at a cuff below the knee; the team stirrup runs from the cuff to the ankle,
    // where a spikes shoe in profile sits flat on the ground (or up on its toe as the back foot pivots).
    const ankleOf = (foot) => [foot[0] + 1, foot[1] - 6];
    const cuffOf = (foot, knee) => {
      const a = ankleOf(foot);
      return [lerp(knee[0], a[0], 0.55), lerp(knee[1], a[1], 0.55)];
    };
    const drawLowerLeg = (foot, knee, onToe) => {
      this.strokeLimb(ctx, [[cuffOf(foot, knee), ankleOf(foot), 8]], primary);
      this.drawCleatSide(ctx, foot, onToe);
    };

    // The hips turn toward the pitcher ahead of the shoulders (hipTwist leads twist): they start
    // opening in the launch and are mostly open at contact. As they open, the rear hip swings toward
    // the plate, the lead hip away from it, and the seat squares up to the camera into a back view.
    const hipView = Math.max(0, Math.min(1, ((pose.hipTwist || 0) - 0.1) / 0.9));
    const nHipX = pose.pelvis[0] + lerp(-2, 5, hipView);
    const fHipX = pose.pelvis[0] + lerp(4, -3, hipView);

    // Far (front) leg and far arm sit behind the body, so they get the darker dither
    drawLowerLeg(pose.fFoot, pose.fKnee, false);
    const fLeg = [[[fHipX, pose.pelvis[1]], pose.fKnee, 16], [pose.fKnee, cuffOf(pose.fFoot, pose.fKnee), 12]];
    this.strokeLimb(ctx, fLeg, uniShade);
    this.shadeLimb(ctx, fLeg, farUni, 1);

    // Two-handed grip: lead (far) hand at the bottom by the knob, rear (near) hand stacked above it.
    // A one-handed follow-through releases the rear hand toward pose.nHand.
    const gripAx = Math.sin(pose.batAng);
    const gripAy = -Math.cos(pose.batAng);
    const fHand = pose.fHand || [pose.hands[0] - gripAx * 4.5, pose.hands[1] - gripAy * 4.5];
    const gripTop = [pose.hands[0] + gripAx * 4.5, pose.hands[1] + gripAy * 4.5];
    let nHand = gripTop;
    if (pose.nHand) {
      const hold = Math.max(0, 1 - Math.hypot(pose.nHand[0] - pose.hands[0], pose.nHand[1] - pose.hands[1]) / 12);
      nHand = [pose.nHand[0] + (gripTop[0] - pose.hands[0]) * hold, pose.nHand[1] + (gripTop[1] - pose.hands[1]) * hold];
    }
    const drawGlove = (hand, fill) => {
      ctx.fillStyle = fill;
      ctx.strokeStyle = FIGURE_OUTLINE;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(hand[0], hand[1], 4.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
    };

    // Arms are layered a segment at a time. The lead forearm and bottom glove cover the rear
    // forearm and top glove where they cross at the grip, so the rear ("back") arm never paints
    // over the lead arm. The rear upper arm slips behind the torso once the shoulders open past
    // twist 0.7; from the wrap on, everything above the shoulders goes behind the body.
    const leadSleeve = darken(primary, 0.25);
    const leadShade = this.getDitherPattern(ctx, leadSleeve, darken(primary, 0.55));
    const drawLeadUpper = () => {
      const seg = [[pose.fShoulder, pose.fElbow, 10]];
      this.strokeLimb(ctx, seg, leadSleeve);
      this.shadeLimb(ctx, seg, leadShade, 1);
    };
    const drawLeadFore = () => {
      const seg = [[pose.fElbow, fHand, 9]];
      this.strokeLimb(ctx, seg, leadSleeve);
      this.shadeLimb(ctx, seg, leadShade, 1);
    };
    const drawRearUpper = () => {
      const seg = [[pose.nShoulder, pose.nElbow, 11]];
      this.strokeLimb(ctx, seg, primary);
      this.shadeLimb(ctx, seg, sleeveShade, 1);
    };
    const drawRearFore = () => {
      const seg = [[pose.nElbow, nHand, 10]];
      this.strokeLimb(ctx, seg, primary);
      this.shadeLimb(ctx, seg, sleeveShade, 1);
    };
    const drawGrip = () => {
      drawGlove(nHand, '#f8fafc');
      drawGlove(fHand, '#d5dbe3');
    };
    const rearUpperBehind = armsBehind || (pose.twist || 0) > 0.7;
    if (armsBehind) {
      drawRearUpper();
      drawRearFore();
      drawLeadUpper();
      drawLeadFore();
      drawGrip();
    } else if (rearUpperBehind) {
      drawRearUpper();
    }

    // Torso: spine from pelvis to neck, butt pushed back, chest forward. As the shoulders and
    // hips turn through the finish, each half widens into a back view: shoulders level, seat square.
    const backView = Math.max(0, Math.min(1, ((pose.twist || 0) - 0.85) / 0.15));
    const [px, py] = pose.pelvis;
    const [nx, ny] = pose.neck;
    const sl = Math.hypot(nx - px, ny - py) || 1;
    const ux = (nx - px) / sl;
    const uy = (ny - py) / sl;
    const bx = uy; // perpendicular pointing backward (away from the plate)
    const by = -ux;
    const backShoulder = [nx + bx * 14 - ux * 5, ny + by * 14 - uy * 5];
    const hipBack = lerp(16, 14, hipView);
    const hipFront = lerp(11, 14, hipView);
    const backHip = [px + bx * hipBack + ux * 2 * (1 - hipView), py + by * hipBack + uy * 2 * (1 - hipView)];
    const frontHip = [px - bx * hipFront, py - by * hipFront];
    const chestOut = lerp(13, 16, backView);
    const chestDrop = lerp(12, 5, backView);
    const frontChest = [nx - bx * chestOut - ux * chestDrop, ny - by * chestOut - uy * chestDrop];
    const torsoPath = new Path2D();
    torsoPath.moveTo(nx, ny);
    torsoPath.quadraticCurveTo(backShoulder[0] + bx * 3, backShoulder[1] + by * 3, backShoulder[0], backShoulder[1]);
    torsoPath.quadraticCurveTo(backHip[0] + bx * lerp(4, 1, hipView), (backShoulder[1] + backHip[1]) / 2, backHip[0], backHip[1]);
    torsoPath.quadraticCurveTo(px + bx * 4, py + 12, frontHip[0], frontHip[1] + 4);
    torsoPath.lineTo(frontChest[0], frontChest[1]);
    torsoPath.quadraticCurveTo(frontChest[0] - bx * 2, ny - by * 4, nx, ny);
    torsoPath.closePath();
    ctx.fillStyle = uni;
    ctx.strokeStyle = FIGURE_OUTLINE;
    ctx.lineWidth = 2.4;
    ctx.stroke(torsoPath);
    ctx.fill(torsoPath);

    // Dithered shadow down the back
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.moveTo(backShoulder[0], backShoulder[1]);
    ctx.lineTo(backHip[0], backHip[1]);
    ctx.lineTo(backHip[0] - bx * 7, backHip[1] - by * 7);
    ctx.lineTo(backShoulder[0] - bx * 6, backShoulder[1] - by * 6);
    ctx.closePath();
    ctx.fill();

    // Jersey number between the shoulder blades. It starts to come around as the shoulders open
    // (twist 0.45), reads clearly by twist 0.8 and faces the camera in the finish.
    // Players without a recorded number get a steady placeholder from their id.
    const numberView = Math.max(0, Math.min(1, ((pose.twist || 0) - 0.45) / 0.45));
    if (numberView > 0) {
      const number = String(batterObj?.uniform ?? 2 + (hashString(batterObj?.id || batterObj?.name) % 58));
      const [cx2, cy2] = [lerp(nx, px, 0.4) + bx * 8 * (1 - numberView), lerp(ny, py, 0.4)];
      ctx.save();
      ctx.clip(torsoPath);
      ctx.translate(cx2, cy2);
      ctx.rotate(Math.atan2(ux, -uy));
      // Undo the left-handed mirror so the digits read correctly, and squeeze them while side-on
      ctx.scale(f * (0.25 + 0.75 * numberView), 1);
      ctx.globalAlpha = Math.min(1, numberView * 2.5);
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = secondary;
      ctx.strokeText(number, 0, 0);
      ctx.fillStyle = primary;
      ctx.fillText(number, 0, 0);
      ctx.restore();
    }

    // Near (rear) leg with pants piping
    const nCuff = cuffOf(pose.nFoot, pose.nKnee);
    drawLowerLeg(pose.nFoot, pose.nKnee, pose.nFoot[1] < -0.8);
    const nLeg = [[[nHipX, py], pose.nKnee, 18], [pose.nKnee, nCuff, 13]];
    this.strokeLimb(ctx, nLeg, uni);
    this.shadeLimb(ctx, nLeg, shade, -1);
    // The piping runs down the side of the leg facing the camera; as the hips open it rolls
    // around to the leg's outer edge, toward the plate
    const seam = lerp(-6, 6, hipView);
    ctx.strokeStyle = primary;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(nHipX + seam, py + 2);
    ctx.lineTo(pose.nKnee[0] + seam, pose.nKnee[1]);
    ctx.lineTo(nCuff[0] + seam * 0.85, nCuff[1]);
    ctx.stroke();

    // Belt
    ctx.strokeStyle = '#1b2333';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(px + bx * (hipBack - 1) + ux * 4, py + by * (hipBack - 1) + uy * 4);
    ctx.lineTo(px - bx * hipFront + ux * 4, py - by * hipFront + uy * 4);
    ctx.stroke();

    // Back pockets come around into view as the seat turns toward the camera
    if (hipView > 0.35) {
      const seatX = px + bx * 7 * (1 - hipView);
      const spread = lerp(2, 5.5, hipView);
      ctx.save();
      ctx.clip(torsoPath);
      ctx.fillStyle = uniShade;
      ctx.globalAlpha = Math.min(1, (hipView - 0.35) / 0.35);
      for (const side of [-1, 1]) {
        ctx.fillRect(seatX + side * spread - 3, py, 6, 4);
      }
      ctx.restore();
    }

    // Neck sits under the lead arm, which drapes across the chest and throat to the bottom of the grip
    const [hx, hy] = pose.head;
    this.strokeLimb(ctx, [[[nx, ny + 2], [hx - 2, hy + 6], 9]], SKIN);
    if (!armsBehind) drawLeadUpper();

    // Motion smear while the bat whips through
    // Only through the whip into contact, trailing the barrel's last few hundredths of a pitch
    if (didSwing && pitchProg > 0.82 && pitchProg < 0.95) {
      const prev = getBatterSwingPose(style, pitchProg - 0.025, didSwing, tNow);
      const p0 = batTip(prev);
      const p1 = batTip(pose);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.beginPath();
      ctx.moveTo(prev.hands[0], prev.hands[1]);
      ctx.lineTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(pose.hands[0], pose.hands[1]);
      ctx.closePath();
      ctx.fill();
    }

    // The bat covers the body while its barrel swings on the catcher's side; an upright stance bat stays behind the helmet
    const batInFront = pose.batDepth < -0.2 && pose.batPitch < 40;
    if (!batInFront && !batBehind) drawBat();

    // The head turns with the shoulders, so the helmet shows its back once they are mostly open
    if ((pose.twist || 0) > 0.75) {
      // Back of the helmet, ear flap on the lead side; the face is turned away toward the pitcher
      ctx.fillStyle = secondary;
      ctx.strokeStyle = FIGURE_OUTLINE;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(hx - 7, hy + 3, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hx, hy - 1, 11.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(hx, hy - 2, 8, Math.PI * 1.15, Math.PI * 1.45);
      ctx.stroke();
    } else {
      // Head: skin, batting helmet with ear flap and brim
      ctx.fillStyle = SKIN;
      ctx.strokeStyle = FIGURE_OUTLINE;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(hx, hy, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
      ctx.fillStyle = FIGURE_OUTLINE;
      ctx.fillRect(hx + 5, hy - 1, 2, 2.2);
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.arc(hx - 0.5, hy - 1, 11.5, Math.PI * 0.62, Math.PI * 1.93);
      ctx.lineTo(hx + 16, hy - 4);
      ctx.lineTo(hx + 9, hy - 0.5);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hx - 2, hy + 3, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(hx - 1, hy - 2, 8, Math.PI * 1.15, Math.PI * 1.45);
      ctx.stroke();
    }

    // Rear arm in team undershirt sleeve, then the lead forearm across it, then both gloves
    if (!armsBehind) {
      if (!rearUpperBehind) drawRearUpper();
      drawRearFore();
      drawLeadFore();
      drawGrip();
    }

    // Behind the body, the forearms and gloves still show wherever they clear the torso and helmet,
    // so the grip never floats free of the bat
    if (armsBehind) {
      const outsideTorso = new Path2D();
      outsideTorso.rect(-200, -300, 400, 400);
      outsideTorso.addPath(torsoPath);
      const outsideHelmet = new Path2D();
      outsideHelmet.rect(-200, -300, 400, 400);
      outsideHelmet.moveTo(hx + 11.5, hy - 1);
      outsideHelmet.arc(hx, hy - 1, 11.5, 0, Math.PI * 2);
      ctx.save();
      ctx.clip(outsideTorso, 'evenodd');
      ctx.clip(outsideHelmet, 'evenodd');
      drawRearFore();
      drawLeadFore();
      drawGrip();
      ctx.restore();
    }

    if (batInFront && !armsBehind) {
      // Keep both hands wrapped over the handle
      drawBat();
      drawGrip();
    }

    ctx.restore();
  }

  /**
   * Catcher's mitt rising into the bottom of the duel view to take the pitch.
   */
  drawDuelCatcherMitt(ctx, x, y, withBall) {
    ctx.save();
    ctx.fillStyle = '#7a3b12';
    ctx.strokeStyle = FIGURE_OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 12, 13, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = '#5a2a0c';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 7, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c08040';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y + 2, 10, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    if (withBall) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = FIGURE_OUTLINE;
      ctx.beginPath();
      ctx.arc(x, y + 1, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Plays the Pitch Delivery animation in the Right 1/3 Duel Viewport,
   * and if the ball is put in play, automatically transitions to the
   * 1987 Full-Field Isometric View to animate the 3D ball physics & throws!
   */
  animatePlay(pitchStep, physicsResult, gameState, onComplete) {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this.isReplay = false;
    this.mode = 'SPLIT_SCREEN';

    const swung =
      pitchStep.outcome === 'SWINGING_STRIKE' ||
      pitchStep.outcome === 'FOUL' ||
      pitchStep.outcome === 'IN_PLAY';

    this.pitchBallMark = null;
    this.pitchAnim = {
      progress: 0,
      ballSpin: { spin: physicsResult?.spin, contact: physicsResult?.contact, launchVector: pitchStep.launchVector },
      outcome: pitchStep.outcome,
      pitchType: pitchStep.pitchType || 'FASTBALL',
      mph: pitchStep.mph || 91,
      plateX: pitchStep.plateX ?? 0,
      plateZ: pitchStep.plateZ ?? 2.5,
      breakX: pitchStep.curveBreakX ?? 0,
      breakZ: pitchStep.curveBreakZ ?? 0,
      launchVector: pitchStep.launchVector || null,
      swung,
      isStrike: pitchStep.outcome !== 'BALL' && pitchStep.outcome !== 'HBP',
      callText: pitchStep.callText || pitchStep.outcome
    };

    // Windup (progress 0 -> 0.42) gets room to breathe; the pitch itself (0.42 -> 1) stays quick.
    const startTime = performance.now();

    const stepPitch = (now) => {
      this.pitchAnim.progress = pitchProgressAt(now - startTime);
      this.render(gameState);

      // A ball put in play cuts straight to the field view the moment bat meets ball
      if (pitchStep.outcome === 'IN_PLAY' && physicsResult && physicsResult.frames?.length && this.pitchAnim.progress >= 0.9) {
        this.startFieldPlay(pitchStep, physicsResult, gameState, onComplete);
        return;
      }

      if (this.pitchAnim.progress < 1) {
        this._rafId = requestAnimationFrame(stepPitch);
        return;
      }

      // Let a swing-and-miss or foul finish its follow-through before the duel resets
      const settleStart = performance.now();
      const settle = (t) => {
        this.pitchAnim.finishMs = t - settleStart;
        this.render(gameState);
        if (this.pitchAnim.finishMs < 480) {
          this._rafId = requestAnimationFrame(settle);
          return;
        }
        this.pitchAnim = null;
        this.render(gameState);
        if (onComplete) onComplete();
      };
      this._rafId = requestAnimationFrame(settle);
    };

    this._rafId = requestAnimationFrame(stepPitch);
  }

  /** Records the play for Instant Replay and opens the full-field view. */
  startFieldPlay(pitchStep, physicsResult, gameState, onComplete) {
    this.lastPlayRecord = {
      pitchStep,
      physicsResult,
      snapshotState: {
        park: JSON.parse(JSON.stringify(gameState.park)),
        inning: gameState.inning,
        half: gameState.half,
        outs: gameState.outs,
        count: { ...gameState.count },
        totals: JSON.parse(JSON.stringify(gameState.totals)),
        homeTeam: gameState.homeTeam,
        awayTeam: gameState.awayTeam,
        bases: [...(gameState.bases || [null, null, null])],
        defensePlay: gameState.defensePlay
      }
    };
    this.runFullFieldAnimation(physicsResult, gameState, false, onComplete);
  }

  /**
   * Animates the 3D ball-in-play physics frames (including 3D throws & slides) across the full 1987 field view
   * using real elapsed time (60fps simulation steps) so playback speed is identical on 60Hz, 120Hz, and 144Hz monitors.
   */
  runFullFieldAnimation(physicsResult, gameState, isReplay, onComplete) {
    this.mode = 'FULL_FIELD';
    this.isReplay = isReplay;
    const frames = physicsResult.frames || [];
    let lastProcessedIdx = -1;
    const startTime = performance.now();
    // Play Instant Replays at 0.85x speed for classic broadcast examination
    const playbackRateFps = isReplay ? 51 : 60;

    this._facing = {};
    this.playAnim = {
      ballSpin: { spin: physicsResult.spin, contact: physicsResult.contact, launchVector: this.lastPlayRecord?.pitchStep?.launchVector },
      currentFrame: frames[0] || null,
      prevFrame: null,
      trail: [],
      // Result banner waits until the play finishes on the field so it never spoils the action
      bannerText: null
    };
    const resultBanner = physicsResult.description || physicsResult.outcome;

    const stepField = (now) => {
      const elapsedSec = Math.max(0, (now - startTime) / 1000);
      const targetIdx = Math.floor(elapsedSec * playbackRateFps);

      if (targetIdx < frames.length) {
        for (let idx = lastProcessedIdx + 1; idx <= targetIdx; idx++) {
          const f = frames[idx];
          if (!f || !f.ball) continue;
          const anyFielderHasBall = f.fielders && Object.values(f.fielders).some((fl) => fl.hasBall);
          if (anyFielderHasBall && !f.ball.isThrow) {
            // Clear trail when fielder gloves the ball so throw arc starts fresh
            this.playAnim.trail = [];
          } else if (idx % 2 === 0) {
            if (f.ball.isThrow && this.playAnim.trail.length > 0 && !this.playAnim.trail[this.playAnim.trail.length - 1].isThrow) {
              this.playAnim.trail = [];
            }
            this.playAnim.trail.push({
              x: f.ball.x,
              y: f.ball.y,
              z: f.ball.z,
              isThrow: Boolean(f.ball.isThrow)
            });
          }
        }
        lastProcessedIdx = targetIdx;
        this.playAnim.prevFrame = frames[Math.max(0, targetIdx - 3)];
        this.playAnim.currentFrame = frames[targetIdx];
        this.render(gameState);
        this._rafId = requestAnimationFrame(stepField);
      } else {
        if (frames.length > 0) {
          this.playAnim.currentFrame = frames[frames.length - 1];
          this.render(gameState);
        }
        setTimeout(() => {
          if (this.playAnim) {
            this.playAnim.bannerText = resultBanner;
            this.render(gameState);
          }
        }, 350);
        setTimeout(() => {
          this.mode = 'SPLIT_SCREEN';
          this.playAnim = null;
          this.pitchAnim = null;
          this.isReplay = false;
          this.render(this.lastGameState || gameState);
          if (onComplete) onComplete();
        }, 1500);
      }
    };

    this._rafId = requestAnimationFrame(stepField);
  }

  /**
   * Re-runs the last ball-in-play using Eddie Dombrower's Instant Replay feature
   */
  triggerInstantReplay(currentGameState, onComplete) {
    if (!this.lastPlayRecord) return false;
    if (this._rafId) cancelAnimationFrame(this._rafId);

    const { physicsResult, snapshotState } = this.lastPlayRecord;
    this.runFullFieldAnimation(physicsResult, snapshotState || currentGameState, true, onComplete);
    return true;
  }
}
