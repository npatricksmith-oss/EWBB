/**
 * 1987 Earl Weaver Baseball (EWB 1.0) Split-Screen & Full-Field Isometric Renderer
 * Upgraded with Eddie Dombrower's Kinetically Choreographed Multi-Phase Animations
 *
 * Strictly implements the 1987 Amiga EWB 1.0 visual architecture (Style C Hybrid):
 * 1. SPLIT-SCREEN MODE (Pre-Pitch & Pitch Delivery):
 *    - Left 67% viewport: Isometric ballpark diamond with custom 10-point fence distances,
 *      9-segment wall heights (e.g. Fenway's 37-ft Green Monster), speckled stadium crowd,
 *      curved infield dirt cutouts, 4 umpires, 2 base coaches, 9 articulated fielders, and baserunners.
 *    - Right 33% viewport: Over-the-umpire Pitcher vs. Batter duel featuring:
 *      • 5-Stage Pitcher Kinetics (Full Windup with high leg kick vs. The Stretch with runner check)
 *      • Batter Kinetics (Continuous pre-pitch bat waggle, stride, hip rotation, elliptical bat swing, follow-through)
 *      • Foreground Catcher & Home Plate Umpire crouched in the slot
 *      • Authentic 1987 Amiga top-right Batter/Pitcher stat box
 * 2. FULL-FIELD MODE (Ball in Play & Instant Replay):
 *    - Expands the isometric ballpark across 100% of the canvas (matching amiga_01.jpg)
 *      tracking 3D ball flight (x, y, z), ground shadow (x, y, 0), wall caroms,
 *      6-state articulated fielder pursuit/scoops/leaps, 3D throw & relay arcs, baserunner slides with dirt plumes,
 *      and animated Umpire "SAFE!" / "OUT!" calls.
 */

import { getWallAtAngle } from '../data/ballparks.js';
import { getInitialFielderPositions } from '../engine/physicsEngine.js';

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

    for (const [pos, fState] of Object.entries(fielderMap)) {
      const fScreen = this.fieldToScreen(fState.x, fState.y, fState.z || 0, vp);
      this.drawArticulatedFieldPlayer(ctx, fScreen.x, fScreen.y, {
        groundY: fScreen.groundY,
        jerseyColor: fieldingTeam.primaryColor || '#f58220',
        capColor: fieldingTeam.secondaryColor || '#1e293b',
        pantsColor: '#f8fafc',
        pose: fState.pose || (fState.isMoving ? 'RUNNING' : 'READY'),
        stridePhase: fState.stridePhase || 0,
        hasBall: Boolean(fState.hasBall),
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
        pose: 'READY',
        stridePhase: 0,
        label: '',
        showLabel: false,
        scale: 0.92
      });
    }

    if (activeFrame && activeFrame.runners) {
      for (const r of activeFrame.runners) {
        const rScreen = this.fieldToScreen(r.x, r.y, 0, vp);
        this.drawArticulatedFieldPlayer(ctx, rScreen.x, rScreen.groundY, {
          jerseyColor: battingTeam.primaryColor || '#bd3039',
          capColor: '#f5b942',
          pantsColor: '#e2e8f0',
          pose: r.isSliding ? 'SLIDING' : r.isMoving ? 'RUNNING' : 'READY',
          stridePhase: r.stridePhase || 0,
          label: r.label || 'RUN',
          showLabel: isFullField,
          scale: isFullField ? 1.12 : 0.96
        });
      }
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
          label: runner.name.split(' ').pop().slice(0, 3).toUpperCase(),
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

      // Elevated baseball at z > 0
      const ballRadius = Math.min(7.5, 3.8 + ball.z * 0.045);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(bScreen.x, bScreen.y, ballRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

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
   * Draws an articulated 1987 Amiga Umpire Sprite with dynamic SAFE / OUT signal animations
   */
  drawUmpireSprite(ctx, x, y, callSignal, isFullField) {
    ctx.save();
    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 5.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs (charcoal slacks)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x - 2.5, y - 6);
    ctx.lineTo(x - 3.5, y + 1);
    ctx.moveTo(x + 2.5, y - 6);
    ctx.lineTo(x + 3.5, y + 1);
    ctx.stroke();

    // Black/Navy Umpire Coat
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(x - 5, y - 14, 10, 9, 2);
    ctx.fill();

    // Arms (Signaling SAFE, OUT, or Ready)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    if (callSignal === 'SAFE') {
      // Both arms spread wide horizontally ("SAFE!")
      ctx.moveTo(x - 11, y - 12);
      ctx.lineTo(x + 11, y - 12);
    } else if (callSignal === 'OUT') {
      // Right arm raised in emphatic hammer punch-out ("YER OUT!")
      ctx.moveTo(x - 5, y - 12);
      ctx.lineTo(x - 7, y - 7);
      ctx.moveTo(x + 4, y - 12);
      ctx.lineTo(x + 10, y - 19);
    } else {
      ctx.moveTo(x - 5, y - 12);
      ctx.lineTo(x - 6, y - 7);
      ctx.moveTo(x + 5, y - 12);
      ctx.lineTo(x + 6, y - 7);
    }
    ctx.stroke();

    // Head & Black Cap
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(x, y - 16.5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#020617';
    ctx.fillRect(x - 3.5, y - 19.5, 7, 2.5);

    // Floating Call Bubble when signaling
    if (callSignal && isFullField) {
      const isOut = callSignal === 'OUT';
      ctx.fillStyle = isOut ? '#dc2626' : '#16a34a';
      ctx.fillRect(x - 18, y - 34, 36, 12);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isOut ? 'OUT!' : 'SAFE!', x, y - 25);
    }
    ctx.restore();
  }

  /**
   * Draws an articulated 6-state 1987 Amiga Field Player / Baserunner Sprite:
   * States: 'READY' | 'RUNNING' | 'FIELDING_GROUND' | 'FIELDING_AIR' | 'THROWING' | 'SLIDING' | 'RECEIVING'
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
      label = '',
      showLabel = true,
      scale = 1.0
    } = opts;

    ctx.save();

    // Ground shadow at groundY
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.ellipse(x, groundY + 2, 6.5 * scale, 2.8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(x, y);
    ctx.scale(scale, scale);

    if (pose === 'SLIDING') {
      // Horizontal feet-first slide into the bag with dirt plume puffs!
      ctx.fillStyle = 'rgba(184, 115, 56, 0.72)';
      ctx.beginPath();
      ctx.arc(-9, -2, 5, 0, Math.PI * 2);
      ctx.arc(-14, -5, 4, 0, Math.PI * 2);
      ctx.fill();

      // Sliding legs & torso
      ctx.strokeStyle = pantsColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-2, -2);
      ctx.lineTo(9, -1);
      ctx.moveTo(-2, -5);
      ctx.lineTo(7, -4);
      ctx.stroke();

      ctx.fillStyle = jerseyColor;
      ctx.beginPath();
      ctx.roundRect(-10, -7, 9, 5, 2);
      ctx.fill();

      ctx.fillStyle = '#f1c27d';
      ctx.beginPath();
      ctx.arc(-11, -7, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = capColor;
      ctx.fillRect(-14, -10, 6, 2.5);
      ctx.restore();
      return;
    }

    // Compute leg scissor & arm swing from stridePhase
    const legSwing = pose === 'RUNNING' ? Math.sin(stridePhase) * 5.2 : 0;
    const armSwing = pose === 'RUNNING' ? Math.cos(stridePhase) * 4.5 : 0;
    const crouchDrop = pose === 'FIELDING_GROUND' ? 4.5 : pose === 'READY' ? 1.5 : 0;

    // 1. Articulated Legs (Pants + Stirrups + Cleats)
    ctx.strokeStyle = pantsColor;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    // Left leg
    ctx.moveTo(-2.5, -7 + crouchDrop);
    ctx.lineTo(-3.5 - legSwing * 0.4, -3 + crouchDrop * 0.5);
    ctx.lineTo(-3.5 - legSwing, 0);
    // Right leg
    ctx.moveTo(2.5, -7 + crouchDrop);
    ctx.lineTo(3.5 + legSwing * 0.4, -3 + crouchDrop * 0.5);
    ctx.lineTo(3.5 + legSwing, 0);
    ctx.stroke();

    // Cleats
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-5 - legSwing, -1, 3, 2);
    ctx.fillRect(2 + legSwing, -1, 3, 2);

    // 2. Torso / Jersey with Belt
    ctx.fillStyle = jerseyColor;
    ctx.beginPath();
    ctx.roundRect(-4.8, -15.5 + crouchDrop, 9.6, 8.8, 2.5);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-4.5, -7.5 + crouchDrop, 9, 1.3);

    // 3. Articulated Arms & Leather Fielding Glove
    ctx.strokeStyle = jerseyColor;
    ctx.lineWidth = 2.3;
    let gloveX = -6.5;
    let gloveY = -10 + crouchDrop;

    ctx.beginPath();
    if (pose === 'FIELDING_GROUND') {
      // Both arms reaching down to scoop ball in the dirt
      ctx.moveTo(-4, -13 + crouchDrop);
      ctx.lineTo(-3, -2);
      ctx.moveTo(4, -13 + crouchDrop);
      ctx.lineTo(2, -2);
      gloveX = -3;
      gloveY = -1.5;
    } else if (pose === 'FIELDING_AIR') {
      // Leaping / high glove reach overhead
      ctx.moveTo(-4, -14);
      ctx.lineTo(-6, -23);
      ctx.moveTo(4, -14);
      ctx.lineTo(6, -10);
      gloveX = -6.5;
      gloveY = -24;
    } else if (pose === 'THROWING') {
      // Throwing whip extension
      ctx.moveTo(-4, -14);
      ctx.lineTo(-8, -11);
      ctx.moveTo(4, -14);
      ctx.lineTo(9, -19);
      gloveX = -8.5;
      gloveY = -11;
    } else {
      // Running or Ready stance
      ctx.moveTo(-4, -14 + crouchDrop);
      ctx.lineTo(-6.5, -9.5 + crouchDrop + armSwing);
      ctx.moveTo(4, -14 + crouchDrop);
      ctx.lineTo(6.5, -9.5 + crouchDrop - armSwing);
      gloveX = -6.8;
      gloveY = -9.2 + crouchDrop + armSwing;
    }
    ctx.stroke();

    // Brown leather mitt on glove hand
    ctx.fillStyle = '#7c2d12';
    ctx.beginPath();
    ctx.arc(gloveX, gloveY, 2.4, 0, Math.PI * 2);
    ctx.fill();

    // White baseball visible if player currently holds ball
    if (hasBall) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pose === 'THROWING' ? 9 : gloveX, pose === 'THROWING' ? -19 : gloveY, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Head, Neck & Visored Cap
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(0, -18 + crouchDrop, 3.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = capColor;
    ctx.beginPath();
    ctx.arc(0, -19.2 + crouchDrop, 3.5, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-4.2, -19.5 + crouchDrop, 8.4, 1.8);

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
   * Draws the Right 1/3 Split-Screen Viewport:
   * Over-the-Umpire Pitcher vs. Batter Duel (matching `ewb_1987_amiga_gameplay.jpg` & `amiga_02.jpg`)
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

    // 1. Authentic 1987 Amiga Green Turf Background with subtle raster scanlines (NOT a brown trapezoid!)
    const isTurf = gameState.park?.surface === 'Artificial Turf';
    ctx.fillStyle = isTurf ? '#126e5e' : '#1b7d36';
    ctx.fillRect(vp.x, vp.y, vp.w, vp.h);

    ctx.fillStyle = isTurf ? '#157a68' : '#208b3d';
    for (let sy = vp.y; sy < vp.y + vp.h; sy += 8) {
      ctx.fillRect(vp.x, sy, vp.w, 4);
    }

    // 2. Top-Right 1987 Amiga Retro Stat Card (`amiga_02.jpg` layout)
    this.drawAmigaDuelStatBox(ctx, vp, gameState, batter, pitcher);

    const cx = vp.x + vp.w * 0.5;
    const moundY = vp.y + vp.h * 0.43;
    const plateY = vp.y + vp.h * 0.825;

    // 3. Pitcher's Mound Dirt Oval & Rubber Slab
    const moundGrad = ctx.createRadialGradient(cx, moundY, 8, cx, moundY + 4, vp.w * 0.44);
    moundGrad.addColorStop(0, '#c27135');
    moundGrad.addColorStop(1, '#8c4b1c');
    ctx.fillStyle = moundGrad;
    ctx.beginPath();
    ctx.ellipse(cx, moundY + 6, vp.w * 0.44, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    // White Pitcher's Rubber
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 16, moundY + 8, 32, 4);

    // 4. Home Plate Dirt Circle, Chalk Batter's Boxes & Pentagon Home Plate
    ctx.fillStyle = '#9c5624';
    ctx.beginPath();
    ctx.ellipse(cx, plateY + 2, vp.w * 0.48, 42, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.lineWidth = 1.8;
    // Left-handed & Right-handed batter's boxes in perspective
    ctx.strokeRect(cx - 72, plateY - 20, 44, 34);
    ctx.strokeRect(cx + 28, plateY - 20, 44, 34);

    // Home plate pentagon with black beveled rubber edge (just like amiga_02.jpg)
    ctx.fillStyle = '#111827';
    ctx.fillRect(cx - 14, plateY - 6, 28, 9);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx - 12, plateY - 5);
    ctx.lineTo(cx + 12, plateY - 5);
    ctx.lineTo(cx + 12, plateY + 1);
    ctx.lineTo(cx, plateY + 7);
    ctx.lineTo(cx - 12, plateY + 1);
    ctx.closePath();
    ctx.fill();

    // Subtle Strike Zone Reference Frame
    const szW = 36;
    const szH = 44;
    const szX = cx - szW / 2;
    const szY = plateY - 56;
    ctx.strokeStyle = 'rgba(245, 185, 66, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(szX, szY, szW, szH);
    ctx.setLineDash([]);

    // 5. 5-Stage Kinetically Choreographed Pitcher on the Mound
    const pitchProg = this.pitchAnim ? this.pitchAnim.progress : 0;
    this.drawDuelPitcher(ctx, cx, moundY + 8, fieldingTeam, pitcher, pitchProg, hasRunnersOnBase);

    // 6. Kinetically Choreographed Batter in the Box (with continuous bat waggle & multi-phase swing)
    let batterSide = batter ? batter.bats : 'R';
    if (batterSide === 'S') {
      batterSide = pitcher && pitcher.throws === 'L' ? 'R' : 'L';
    }
    const batterX = batterSide === 'R' ? cx - 48 : cx + 48;
    this.drawDuelBatter(
      ctx,
      batterX,
      plateY - 2,
      battingTeam,
      batterSide,
      pitchProg,
      Boolean(this.pitchAnim && this.pitchAnim.swung)
    );

    // 7. Animated Pitch Flight & Curve Break (starts at pitcher release p = 0.42 -> arrives at plate p = 0.92)
    if (this.pitchAnim && pitchProg >= 0.40) {
      const flightProg = Math.min(1, (pitchProg - 0.40) / 0.52);
      const isLeftyP = pitcher && pitcher.throws === 'L';
      const startX = cx + (isLeftyP ? 14 : -14);
      const startY = moundY - 38;

      const normZ = ((this.pitchAnim.plateZ ?? 2.5) - 1.55) / 2.0;
      const targetX = cx + (this.pitchAnim.plateX || 0) * (szW * 0.64);
      const targetY = szY + szH * (1 - Math.max(-0.35, Math.min(1.35, normZ)));

      const curveArc = Math.sin(flightProg * Math.PI);
      const curX = startX + (targetX - startX) * flightProg + (this.pitchAnim.breakX || 0) * 15 * curveArc;
      const curY = startY + (targetY - startY) * flightProg - (this.pitchAnim.breakZ || 0) * 13 * curveArc;
      const radius = 3.2 + flightProg * 4.2;

      // Ground shadow of the pitched ball racing toward home plate
      const shadowY = (moundY + 8) + (plateY - (moundY + 8)) * flightProg;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(curX, shadowY, radius * 0.9, radius * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pitch break ribbon trail
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(
        (startX + targetX) / 2 + (this.pitchAnim.breakX || 0) * 15,
        (startY + targetY) / 2 - (this.pitchAnim.breakZ || 0) * 13,
        curX,
        curY
      );
      ctx.stroke();

      // Baseball with red seams
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(curX, curY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (flightProg >= 0.96) {
        ctx.strokeStyle = this.pitchAnim.isStrike ? '#fde047' : '#60a5fa';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(targetX, targetY, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 8. Foreground Catcher & Home Plate Umpire Silhouetted in the Slot (authentic 1987 Amiga perspective!)
    this.drawDuelBatteryForeground(ctx, cx, vp.y + vp.h, fieldingTeam, this.pitchAnim);

    // 9. Pitch Call Banner when pitch finishes
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

    const bLast = batter ? batter.name.split(' ').pop() : 'Batter';
    const pLast = pitcher ? pitcher.name.split(' ').pop() : 'Pitcher';
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
   * Eddie Dombrower's 5-Stage Kinetic Pitcher Choreography (`drawDuelPitcher`):
   * Differentiates between Full Windup (bases empty) and The Stretch (runners on base).
   * - Stage 0 (Idle): Breathing stance on the rubber; if in Stretch, glances toward 1st base.
   * - Stage 1 (0.00 - 0.18): Rocker step / hands come set at chest or overhead.
   * - Stage 2 (0.18 - 0.36): High knee lift tucked to chest (or quick slide-step in Stretch) & hip coil.
   * - Stage 3 (0.36 - 0.46): Power stride down the mound & throwing arm cocked in external rotation.
   * - Stage 4 (0.46 - 0.65): Whip arm release & torso extension over front knee.
   * - Stage 5 (0.65 - 1.00): Follow-through back leg kick & defensive fielding finish.
   */
  drawDuelPitcher(ctx, x, footY, team, pitcher, progress, isStretch = false) {
    ctx.save();
    const isLefty = pitcher && pitcher.throws === 'L';
    const dir = isLefty ? -1 : 1; // +1 for RHP (throwing arm on viewer's left), -1 for LHP
    const primary = team?.primaryColor || '#f58220';
    const secondary = team?.secondaryColor || '#1e293b';
    const idleBreath = progress === 0 ? Math.sin(performance.now() * 0.004) * 1.2 : 0;

    // Determine kinetic phase variables
    let strideY = 0;
    let kneeLift = 0;
    let torsoTilt = 0;
    let throwArmAngle = 0.3 * dir;
    let gloveArmAngle = -0.3 * dir;
    let headTurnX = 0;

    if (progress === 0) {
      if (isStretch) {
        // Runner check glance toward 1st base
        headTurnX = Math.sin(performance.now() * 0.003) > 0.4 ? -2.5 : 0;
      }
    } else if (progress < 0.18) {
      // Stage 1: Rocker step & hands raise
      const p = progress / 0.18;
      throwArmAngle = dir * (0.2 - p * (isStretch ? 0.4 : 1.1));
      gloveArmAngle = -dir * (0.2 - p * (isStretch ? 0.4 : 1.1));
    } else if (progress < 0.36) {
      // Stage 2: High Leg Kick & Hip Coil (compact in Stretch)
      const p = (progress - 0.18) / 0.18;
      const liftFactor = Math.sin(p * Math.PI);
      kneeLift = (isStretch ? 8 : 17) * liftFactor;
      torsoTilt = -dir * 0.12 * liftFactor;
      throwArmAngle = dir * (isStretch ? -0.5 : -1.2);
      gloveArmAngle = -dir * 0.6;
    } else if (progress < 0.48) {
      // Stage 3: Stride Down the Mound & Arm Cocked High
      const p = (progress - 0.36) / 0.12;
      strideY = p * 11;
      kneeLift = (1 - p) * 6;
      throwArmAngle = dir * (-2.35 + p * 0.4); // arm cocked high behind head
      gloveArmAngle = -dir * 1.1; // glove pointing at batter
    } else {
      // Stage 4 & 5: Whip Release & Follow-Through
      const p = Math.min(1, (progress - 0.48) / 0.42);
      strideY = 11;
      torsoTilt = dir * 0.22 * p;
      throwArmAngle = dir * (-1.95 + p * 3.1); // whips across body
      gloveArmAngle = -dir * (1.1 - p * 0.7);
    }

    const baseFootY = footY + strideY;

    // Ground shadow under pitcher
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.beginPath();
    ctx.ellipse(x, baseFootY + 2, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    const hipY = baseFootY - 22 + (strideY > 4 ? 3 : 0) + idleBreath;

    // 1. Pivot Leg & Lead Stride/Kick Leg (White/Gray Uniform Pants with Team Piping & Stirrups)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Pivot leg (stays anchored near rubber, then kicks up in follow-through)
    const pivotFootX = x - dir * 5;
    const pivotFootY = progress > 0.52 ? footY - 6 : footY;
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(x - dir * 4, hipY);
    ctx.lineTo(x - dir * 5, (hipY + pivotFootY) * 0.5);
    ctx.lineTo(pivotFootX, pivotFootY);
    ctx.stroke();

    // Lead leg (lifts up to chest during windup Stage 2, then plants down mound)
    const leadKneeX = x + dir * (kneeLift > 2 ? 2 : 5);
    const leadKneeY = hipY + 9 - kneeLift;
    const leadFootX = x + dir * 6;
    const leadFootY = baseFootY - kneeLift * 0.85;

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(x + dir * 4, hipY);
    ctx.lineTo(leadKneeX, leadKneeY);
    ctx.lineTo(leadFootX, leadFootY);
    ctx.stroke();

    // Stirrup socks & black cleats
    ctx.fillStyle = primary;
    ctx.fillRect(pivotFootX - 2.5, pivotFootY - 6, 5, 5);
    ctx.fillRect(leadFootX - 2.5, leadFootY - 6, 5, 5);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(pivotFootX - 3.5, pivotFootY - 2, 7, 3);
    ctx.fillRect(leadFootX - 3.5, leadFootY - 2, 7, 3);

    // 2. Articulated Torso / Jersey
    ctx.save();
    ctx.translate(x, hipY);
    ctx.rotate(torsoTilt);

    // Belt
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-8, -2, 16, 3);

    // Jersey torso with team trim
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(-9.5, -21, 19, 20, 4);
    ctx.fill();

    // Colored jersey shoulders / chest stripe
    ctx.fillStyle = primary;
    ctx.fillRect(-9.5, -20, 19, 6);
    ctx.fillRect(-2, -20, 4, 18);

    // 3. Pitching Arm & Glove Arm
    const shoulderY = -16;
    // Glove Arm
    ctx.save();
    ctx.translate(dir * 9, shoulderY);
    ctx.rotate(gloveArmAngle);
    ctx.strokeStyle = primary;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(dir * 4, 11);
    ctx.stroke();
    // Leather Pitcher's Glove
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(dir * 4, 13, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Throwing Arm
    ctx.save();
    ctx.translate(-dir * 9, shoulderY);
    ctx.rotate(throwArmAngle);
    ctx.strokeStyle = primary;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-dir * 3, 12);
    ctx.stroke();
    // Hand & Baseball (before release at progress < 0.42)
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(-dir * 3, 13, 2.8, 0, Math.PI * 2);
    ctx.fill();
    if (progress > 0 && progress < 0.42) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-dir * 3, 14.5, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 4. Head, Facial Features & Team Cap
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(headTurnX, -26, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = secondary;
    ctx.beginPath();
    ctx.arc(headTurnX, -27.5, 5.8, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = primary;
    ctx.fillRect(headTurnX - 6.5, -28, 13, 2.5);

    ctx.restore();
    ctx.restore();
  }

  /**
   * Eddie Dombrower's Kinetic Batter Choreography (`drawDuelBatter`):
   * - Pre-Pitch (Idle / Early Delivery): Rhythmic bat waggle behind shoulder, coiled athletic knees.
   * - Stride (0.42 - 0.62): Front foot steps toward mound; hands stay loaded back.
   * - Hip Rotation & Swing Plane (0.62 - 0.88): Hips snap open, bat sweeps elliptically across the plate with motion blur.
   * - Follow-Through (0.88 - 1.00): Two-handed high finish over lead shoulder; back heel pivots.
   */
  drawDuelBatter(ctx, x, footY, team, side, pitchProg, didSwing) {
    ctx.save();
    const dir = side === 'R' ? 1 : -1; // +1 for RHB (stands on left of plate, faces right toward plate)
    const primary = team?.primaryColor || '#bd3039';
    const secondary = team?.secondaryColor || '#0c2340';

    // Continuous rhythmic bat waggle before swing
    const waggle = Math.sin(performance.now() * 0.0085) * 0.14;
    const strideProg = pitchProg > 0.35 ? Math.min(1, (pitchProg - 0.35) / 0.25) : 0;
    const swingProg = didSwing && pitchProg > 0.58 ? Math.min(1, (pitchProg - 0.58) / 0.32) : 0;

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.ellipse(x + dir * 2, footY + 3, 15, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    const backFootX = x - dir * 8;
    const backFootY = footY + 2;
    const frontFootX = x + dir * 6 + dir * strideProg * 4;
    const frontFootY = footY - 7 - strideProg * 4;
    const hipX = x + dir * (strideProg * 2 + swingProg * 3);
    const hipY = footY - 23;

    // 1. Articulated Batter Legs (Crouched knees & hip pivot)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Front (lead) leg
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 6.2;
    ctx.beginPath();
    ctx.moveTo(hipX + dir * 2, hipY);
    ctx.lineTo(frontFootX + dir * 2, (hipY + frontFootY) * 0.52);
    ctx.lineTo(frontFootX, frontFootY);
    ctx.stroke();

    // Back leg (pivots knee inward on swing — "squishing the bug")
    const backKneeX = backFootX + dir * (4 + swingProg * 7);
    const backKneeY = (hipY + backFootY) * 0.54;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(hipX - dir * 2, hipY);
    ctx.lineTo(backKneeX, backKneeY);
    ctx.lineTo(backFootX, backFootY);
    ctx.stroke();

    // Team pants piping & cleats
    ctx.strokeStyle = primary;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hipX - dir * 2, hipY);
    ctx.lineTo(backKneeX, backKneeY);
    ctx.lineTo(backFootX, backFootY);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(backFootX - 4, backFootY - 2, 8, 3.5);
    ctx.fillRect(frontFootX - 4, frontFootY - 2, 8, 3.5);

    // 2. Torso / Jersey (Coiled then rotating open toward pitcher on swing)
    const shoulderX = hipX + dir * (swingProg * 2);
    const shoulderY = hipY - 20;

    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(hipX - 9, shoulderY, 18, 21, 5);
    ctx.fill();

    // Team jersey sleeves, belt & trim
    ctx.fillStyle = primary;
    ctx.fillRect(hipX - 9, shoulderY + 1, 18, 7);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(hipX - 8.5, hipY - 2, 17, 3);

    // 3. Head & Ear-Flap Batting Helmet (matching amiga_02.jpg)
    const headX = shoulderX + dir * 1;
    const headY = shoulderY - 6;
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(headX, headY, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = secondary;
    ctx.beginPath();
    ctx.arc(headX, headY - 1.5, 6.8, Math.PI * 0.9, Math.PI * 0.1, false);
    ctx.fill();
    // Helmet visor & protective ear-flap facing pitcher
    ctx.fillRect(headX, headY - 3, dir * 9, 2.5);
    ctx.beginPath();
    ctx.arc(headX + dir * 2, headY + 1, 4, 0, Math.PI);
    ctx.fill();

    // 4. Hands, Arms & Elliptical 3D Bat Swing Arc
    // Hand anchor moves from behind rear shoulder through the zone to front shoulder
    let handsX;
    let handsY;
    let batTipX;
    let batTipY;

    if (swingProg === 0) {
      // Coiled stance with continuous bat waggle
      handsX = shoulderX - dir * 8;
      handsY = shoulderY + 4 + Math.sin(waggle * 4) * 1.5;
      const batAngle = -dir * (0.65 + waggle);
      batTipX = handsX + Math.sin(batAngle) * 32;
      batTipY = handsY - Math.cos(batAngle) * 32;
    } else if (swingProg < 0.55) {
      // Driving through the hitting zone across home plate
      const p = swingProg / 0.55;
      handsX = shoulderX - dir * 8 + dir * p * 22;
      handsY = shoulderY + 5 + p * 3;
      const sweepAngle = -dir * 0.65 + dir * p * 2.35;
      batTipX = handsX + Math.sin(sweepAngle) * 36;
      batTipY = handsY - Math.cos(sweepAngle) * 24;

      // Motion blur bat-arc smear during peak swing velocity!
      ctx.fillStyle = 'rgba(253, 224, 71, 0.25)';
      ctx.beginPath();
      ctx.moveTo(handsX, handsY);
      ctx.lineTo(batTipX, batTipY);
      ctx.lineTo(batTipX - dir * 18, batTipY - 14);
      ctx.closePath();
      ctx.fill();
    } else {
      // High two-handed follow-through wrapped over front shoulder
      const p = (swingProg - 0.55) / 0.45;
      handsX = shoulderX + dir * (14 - p * 8);
      handsY = shoulderY + 6 - p * 8;
      batTipX = handsX - dir * (12 + p * 16);
      batTipY = handsY - 22 - p * 6;
    }

    // Arms connecting shoulders to hands
    ctx.strokeStyle = primary;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(shoulderX - dir * 4, shoulderY + 4);
    ctx.lineTo(handsX, handsY);
    ctx.moveTo(shoulderX + dir * 4, shoulderY + 4);
    ctx.lineTo(handsX, handsY);
    ctx.stroke();

    // Ash-wood Baseball Bat
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(handsX, handsY);
    ctx.lineTo(batTipX, batTipY);
    ctx.stroke();

    // Batting gloves grip
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(handsX, handsY, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draws the Foreground Catcher & Home Plate Umpire Silhouetted at the Bottom of the Duel View
   * (Authentic 1987 Amiga perspective from `ewb_1987_amiga_gameplay.jpg` & `amiga_02.jpg`)
   */
  drawDuelBatteryForeground(ctx, cx, bottomY, fieldingTeam, pitchAnim) {
    ctx.save();
    const gloveSnap = pitchAnim && pitchAnim.progress >= 0.88;
    const targetOffsetX = pitchAnim ? (pitchAnim.plateX || 0) * 14 : 0;

    // 1. Catcher crouched in front of the Umpire
    const catcherX = cx + targetOffsetX * 0.4;
    const catcherY = bottomY - 26;

    // Catcher's mitt held up as target
    ctx.fillStyle = '#78350f';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(catcherX + targetOffsetX * 0.6, catcherY - 24, gloveSnap ? 7.5 : 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (gloveSnap && pitchAnim.outcome !== 'IN_PLAY') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(catcherX + targetOffsetX * 0.6, catcherY - 24, 3.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Catcher shoulders & chest protector
    ctx.fillStyle = fieldingTeam?.primaryColor || '#1e3a8a';
    ctx.beginPath();
    ctx.roundRect(catcherX - 22, catcherY - 12, 44, 26, 8);
    ctx.fill();

    // Catcher helmet & mask back straps
    ctx.fillStyle = fieldingTeam?.secondaryColor || '#0f172a';
    ctx.beginPath();
    ctx.arc(catcherX, catcherY - 18, 10, 0, Math.PI * 2);
    ctx.fill();

    // 2. Home Plate Umpire Silhouetted in the Foreground Slot (just like `amiga_02.jpg`!)
    const umpX = cx - 4;
    const umpY = bottomY;

    // Broad black umpire coat shoulders with tan/gold collar trim
    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.moveTo(umpX - 42, umpY);
    ctx.quadraticCurveTo(umpX - 38, umpY - 28, umpX - 16, umpY - 30);
    ctx.lineTo(umpX + 16, umpY - 30);
    ctx.quadraticCurveTo(umpX + 38, umpY - 28, umpX + 42, umpY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(umpX - 26, umpY - 26);
    ctx.quadraticCurveTo(umpX, umpY - 20, umpX + 26, umpY - 26);
    ctx.stroke();

    // Umpire head & black cap in foreground
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.arc(umpX, umpY - 38, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.arc(umpX, umpY - 40, 11.5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.fill();

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

    this.pitchAnim = {
      progress: 0,
      outcome: pitchStep.outcome,
      pitchType: pitchStep.pitchType || 'FASTBALL',
      mph: pitchStep.mph || 91,
      plateX: pitchStep.plateX ?? 0,
      plateZ: pitchStep.plateZ ?? 2.5,
      breakX: pitchStep.curveBreakX ?? 0,
      breakZ: pitchStep.curveBreakZ ?? 0,
      swung,
      isStrike: pitchStep.outcome !== 'BALL' && pitchStep.outcome !== 'HBP',
      callText: pitchStep.callText || pitchStep.outcome
    };

    // Full 5-stage windup + pitch delivery takes ~720ms for smooth kinetic motion
    const pitchDurationMs = 720;
    const startTime = performance.now();

    const stepPitch = (now) => {
      const elapsed = now - startTime;
      this.pitchAnim.progress = Math.min(1, elapsed / pitchDurationMs);
      this.render(gameState);

      if (this.pitchAnim.progress < 1) {
        this._rafId = requestAnimationFrame(stepPitch);
      } else {
        if (pitchStep.outcome === 'IN_PLAY' && physicsResult && physicsResult.frames?.length) {
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
        } else {
          setTimeout(() => {
            this.pitchAnim = null;
            this.render(gameState);
            if (onComplete) onComplete();
          }, 480);
        }
      }
    };

    this._rafId = requestAnimationFrame(stepPitch);
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

    this.playAnim = {
      currentFrame: frames[0] || null,
      trail: [],
      bannerText: physicsResult.description || physicsResult.outcome
    };

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
        this.playAnim.currentFrame = frames[targetIdx];
        this.render(gameState);
        this._rafId = requestAnimationFrame(stepField);
      } else {
        if (frames.length > 0) {
          this.playAnim.currentFrame = frames[frames.length - 1];
          this.render(gameState);
        }
        setTimeout(() => {
          this.mode = 'SPLIT_SCREEN';
          this.playAnim = null;
          this.pitchAnim = null;
          this.isReplay = false;
          this.render(this.lastGameState || gameState);
          if (onComplete) onComplete();
        }, 950);
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
