/**
 * Pitcher delivery styles for the 1987 duel view.
 *
 * Every pitcher gets a deterministic delivery: a hash of the name seeds the arm slot, leg
 * kick, windup, tempo, glove position, sign look and follow-through, and the 1–10 ratings
 * nudge those choices (speed drives leg kick and sidearm odds, control drives tempo). Well-known
 * deliveries from the historical teams keep their signature motion.
 *
 * Keyframe units match the duel renderer: feet at y = 0, the pelvis at about -50, up is negative.
 * The pitcher faces the camera with an RHP's throwing arm on the viewer's left. Left-handers are
 * drawn by mirroring x in the renderer, so these keyframes never depend on handedness.
 *
 * Release timing: the throwing hand reaches its RELEASE keyframe at progress 0.42, the frame
 * the ball leaves it. `getReleasePointOffset` returns that hand position so the pitch flight can
 * start from the hand.
 */

/** Screen pixels per keyframe unit at the duel pitcher's scale. */
export const DUEL_PITCHER_SCALE = 0.66;

/** Arm length from shoulder to hand, in keyframe units. */
const REACH = 20;

/**
 * Per arm slot. `angle` is the release arm angle from vertical toward the throwing side (deg).
 * `lean` tilts the torso toward the glove side (deg); `drop` lowers the throwing shoulder and
 * `sink` lowers the pelvis (units). `follow` is the hand's drift from release to finish.
 */
const ARM_SLOT_PROFILES = {
  overhand: { angle: 0, lean: -2, drop: 0, sink: 0, follow: [18, 56] },
  'three-quarter': { angle: 34, lean: 6, drop: 3, sink: 2, follow: [22, 44] },
  sidearm: { angle: 84, lean: 14, drop: 7, sink: 3, follow: [28, 26] },
  submarine: { angle: 150, lean: 26, drop: 14, sink: 10, follow: [24, 18] }
};

/** Glove hand height, as an offset from the pelvis (units). */
const GLOVE_Y = { chest: -13, chin: -24, waist: -2, high: -34 };

/** Historical pitchers whose famous motion overrides the hash-based choices. Keyed by last name. */
const SIGNATURE_DELIVERIES = {
  marichal: { windup: 'overhead', armSlot: 'three-quarter', legKick: 1 },
  ryan: { windup: 'overhead', armSlot: 'overhand', legKick: 0.9 },
  tiant: { windup: 'pivot', armSlot: 'three-quarter', legKick: 0.7 },
  valenzuela: { windup: 'overhead', armSlot: 'overhand', legKick: 0.8, look: 'skyward' },
  seaver: { windup: 'drop', armSlot: 'overhand', legKick: 0.55 },
  quisenberry: { windup: 'hidden', armSlot: 'submarine', legKick: 0.1 },
  tekulve: { windup: 'hidden', armSlot: 'sidearm', legKick: 0.2 }
};

/** FNV-1a hash of a string, as an unsigned 32-bit integer. */
function hashName(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32), so each pitcher gets the same variation every time. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Picks one entry from [value, weight] pairs using the seeded random source. */
function weightedPick(rnd, entries) {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rnd() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r < 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** Rotates [x, y] about the pivot by `deg` (positive tilts the top toward +x, the glove side). */
function rotate([x, y], [px, py], deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = x - px;
  const dy = y - py;
  return [px + dx * c - dy * s, py + dx * s + dy * c];
}

/** Offset of a hand `REACH` units from the shoulder, for a world arm angle `a` under a torso tilt `lean`. */
function armOffset(a, lean) {
  const r = ((a + lean) * Math.PI) / 180;
  return [-Math.sin(r) * REACH, -Math.cos(r) * REACH];
}

const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const midpoint = ([ax, ay], [bx, by], dx = 0, dy = 0) => [(ax + bx) / 2 + dx, (ay + by) / 2 + dy];

/**
 * Deterministic delivery for one pitcher. Same name and ratings always give the same style.
 * @param {{ name?: string, ratings?: { speed?: number, control?: number } }} pitcher
 * @returns {Object} style fields used by `buildPitcherPoses`
 */
function deriveStyle(pitcher) {
  const name = String(pitcher?.name || 'Pitcher');
  const rnd = mulberry32(hashName(name));
  const ratings = pitcher?.ratings || {};
  const speed = clamp(ratings.speed ?? 5, 1, 10);
  const control = clamp(ratings.control ?? 5, 1, 10);
  const signature = SIGNATURE_DELIVERIES[name.trim().split(/\s+/).pop().toLowerCase()] || {};
  const jitter = (amt) => (rnd() * 2 - 1) * amt;

  // Low-velocity pitchers more often work from the side or under the arm.
  const lowVelo = speed <= 4;
  const armSlot =
    signature.armSlot ||
    weightedPick(rnd, [
      ['overhand', 0.5],
      ['three-quarter', 0.33],
      ['sidearm', lowVelo ? 0.28 : 0.12],
      ['submarine', lowVelo ? 0.08 : 0.02]
    ]);
  const profile = ARM_SLOT_PROFILES[armSlot];

  const windup =
    signature.windup ||
    weightedPick(rnd, [
      ['overhead', 0.5],
      ['hidden', 0.2],
      ['drop', 0.2],
      ['pivot', 0.1]
    ]);

  // Faster pitchers kick higher; side-armers kick low. Signature kicks keep their height.
  const baseKick = 0.25 + (0.55 * (speed - 1)) / 9;
  const slotScale = armSlot === 'sidearm' || armSlot === 'submarine' ? 0.6 : 1;
  const legKick = clamp((signature.legKick ?? baseKick * slotScale) + jitter(0.08), 0, 1);

  // Tempo scales how long the windup takes to rise. Higher tempo means a quicker start.
  const tempo = clamp(1 + (control - 5) * 0.02 + jitter(0.05), 0.85, 1.15);

  const glove = weightedPick(rnd, [
    ['chest', 0.35],
    ['chin', 0.25],
    ['waist', 0.2],
    ['high', 0.2]
  ]);
  const look = signature.look || (rnd() < 0.08 ? 'skyward' : 'center');
  const followThrough = legKick > 0.6 || rnd() < 0.5 ? 'long' : 'short';
  const followScale = followThrough === 'long' ? 1 : 0.6;

  return {
    name,
    armSlot,
    releaseAngle: profile.angle + jitter(4),
    lean: profile.lean + jitter(2),
    shoulderDrop: profile.drop,
    sink: profile.sink + (windup === 'drop' ? 4 : 0),
    headTurn: windup === 'pivot' ? 3 : 0,
    windup,
    legKick,
    tempo,
    glove,
    gloveY: GLOVE_Y[glove] + jitter(1.5),
    look,
    followThrough,
    followVector: profile.follow.map((v) => v * followScale),
    backKick: legKick
  };
}

const styleCache = new Map();

/**
 * Delivery style for a pitcher, cached by name.
 * @param {Object} pitcher
 * @returns {Object}
 */
export function getPitcherStyle(pitcher) {
  const name = String(pitcher?.name || 'Pitcher');
  let style = styleCache.get(name);
  if (!style) {
    style = deriveStyle(pitcher);
    styleCache.set(name, style);
  }
  return style;
}

/**
 * Builds the absolute keyframes for each delivery phase from a style. Keys match the
 * limb and joint names the renderer reads: tFoot/gFoot (throwing and glove feet), knees,
 * pelvis, neck, head, headR, shoulders, elbows and hands.
 * @param {Object} style from `getPitcherStyle`
 * @returns {{ SET: Object, STRETCH: Object, WIND: Object, LIFT: Object, STRIDE: Object, COCK: Object, RELEASE: Object, FOLLOW: Object }}
 */
export function buildPitcherPoses(style) {
  const { lean, shoulderDrop: d, sink, legKick: k, backKick, headTurn } = style;
  const gy = style.gloveY;
  const pelvisAt = (w) => [0, -50 + sink * w];
  const shoulders = (drop, narrow = 0) => ({
    tSh: [-12 + narrow, -29 + drop],
    gSh: [12 - narrow, -29 - drop * 0.3]
  });

  // Place each upper-body point from its pelvis offset, tilted about the pelvis by `lean`.
  // `turn` (deg) rotates the shoulders about the spine: 0 faces the plate, 90 is side-on with
  // the glove shoulder toward the plate, negative brings the throwing shoulder forward.
  // The shoulders narrow as they turn and the far one draws slightly higher.
  // `flex` bends the torso toward the plate, shortening it on screen.
  const frame = (f) => {
    const turn = ((f.turn || 0) * Math.PI) / 180;
    const w = 0.4 + 0.6 * Math.abs(Math.cos(turn));
    const twist = ([x, y]) => [x * w, y + 0.15 * x * Math.sin(turn)];
    const flex = 1 - (f.flex || 0);
    const bend = ([x, y]) => [x, y * flex];
    const at = (off) => rotate([f.pelvis[0] + off[0], f.pelvis[1] + off[1]], f.pelvis, f.lean);
    const hipTurn = ((f.hipTurn ?? f.turn ?? 0) * Math.PI) / 180;
    return {
      tFoot: f.tFoot,
      gFoot: f.gFoot,
      tKnee: f.tKnee,
      gKnee: f.gKnee,
      pelvis: f.pelvis,
      neck: at(bend(f.neck)),
      head: at(bend(f.head)),
      headR: f.headR,
      tShoulder: at(bend(twist(f.tSh))),
      gShoulder: at(bend(twist(f.gSh))),
      tElbow: at(f.tEl),
      gElbow: at(f.gEl),
      tHand: at(f.tHa),
      gHand: at(f.gHa),
      hipW: 0.55 + 0.45 * Math.abs(Math.cos(hipTurn)),
      // 1 while the throwing arm is behind the body (drawn before the torso)
      tArmBack: f.tArmBack || 0
    };
  };

  const standingLegs = { tFoot: [-7, 0], gFoot: [7, 0], tKnee: [-7, -27], gKnee: [7, -27] };
  const headLook = style.look === 'skyward' ? [0, -46] : [0, -41];
  const setFrame = {
    ...standingLegs,
    pelvis: [0, -50],
    lean: 0,
    turn: 0,
    neck: style.look === 'skyward' ? [0, -34] : [0, -32],
    head: headLook,
    headR: 8,
    ...shoulders(0),
    tEl: [-13, -14],
    gEl: [13, (-29 + gy) / 2],
    tHa: [-2, -13],
    gHa: [3, gy]
  };

  // From the stretch the pitcher already stands side-on, hands together at the chest.
  const stretchFrame = {
    ...setFrame,
    turn: 80,
    tFoot: [-3, 0],
    gFoot: [9, 2],
    tKnee: [-4, -27],
    gKnee: [9, -26],
    tEl: [-6, -13],
    tHa: [0, -19],
    gEl: [8, -13],
    gHa: [2, -18]
  };

  // Windup arms: overhead for the full windup, chest-high for hidden-ball and drop types.
  // The rocker step starts the turn toward the pivot.
  const high = style.windup === 'overhead' || style.windup === 'pivot';
  const windArms = high
    ? { tEl: [-14, -44], tHa: [-4, -54], gEl: [12, -42], gHa: [2, -52] }
    : { tEl: [-14, -18], tHa: [-3, -16], gEl: [13, -17], gHa: [3, -14] };
  const windFrame = {
    ...setFrame,
    ...windArms,
    turn: 20,
    head: [headTurn, -41],
    ...shoulders(0, style.windup === 'pivot' ? 4 : 0)
  };

  // Leg lift: the pitcher pivots side-on (Tiant turns his back to the plate), the knee comes
  // up and across the body toward the throwing side, and the hands come down to the chest.
  const kneeY = -50 - 36 * k;
  const kneeX = 7 - 9 * k;
  const liftFrame = {
    ...windFrame,
    turn: style.windup === 'pivot' ? 115 : 88,
    pelvis: [-1, -52],
    tFoot: [-3, 0],
    tKnee: [-5, -27],
    gKnee: [kneeX, kneeY],
    gFoot: [kneeX + 6, Math.min(-4, kneeY + 26)],
    tEl: [-7, -12],
    tHa: [0, -19],
    gEl: [8, -12],
    gHa: [2, -18]
  };

  // Stride: the front foot lands toward the plate while the shoulders stay closed. The hands
  // break: the glove reaches toward the plate and the throwing hand swings down behind the hip.
  const strideLegs = { tFoot: [-9, 0], gFoot: [12, 6], tKnee: [-10, -22], gKnee: [12, -21] };
  const strideFrame = {
    ...strideLegs,
    pelvis: [0, -46 + sink * 0.6],
    lean: lean * 0.3,
    turn: 72,
    hipTurn: 55,
    neck: [0, -32],
    head: [headTurn, -41],
    headR: 8,
    ...shoulders(d * 0.5),
    tEl: [-12, -12],
    tHa: [-15, -2],
    tArmBack: 1,
    gEl: [17, -25],
    gHa: [21, -22]
  };

  // Cocked arm: hips have fired but the shoulders are still closed. The elbow is up at
  // shoulder height and the hand is laid back above and behind the head.
  const sh = shoulders(d);
  const cockFrame = {
    ...strideLegs,
    pelvis: pelvisAt(1),
    lean: lean * 0.6,
    turn: 45,
    hipTurn: 10,
    neck: [0, -32],
    head: [headTurn, -41],
    headR: 8,
    ...sh,
    tEl: [sh.tSh[0] - 9, sh.tSh[1] - 2],
    tHa: [sh.tSh[0] - 4, sh.tSh[1] - 19],
    tArmBack: 1,
    gEl: [15, -20],
    gHa: [11, -18]
  };

  // Release: shoulders whip square and past, throwing shoulder forward, hand out front.
  const releaseHa = add(sh.tSh, armOffset(style.releaseAngle, lean));
  const releaseFrame = {
    ...cockFrame,
    tFoot: [-9, -2],
    gFoot: [12, 8],
    tKnee: [-8, -24],
    gKnee: [12, -20],
    lean,
    turn: -15,
    hipTurn: -20,
    headR: 9,
    tEl: midpoint(sh.tSh, releaseHa, -3, 1),
    tHa: releaseHa,
    tArmBack: 0,
    gEl: [13, -14],
    gHa: [10, -14]
  };

  // Follow-through: the arm whips down and across to the glove-side knee, the torso bends
  // toward the plate and the back leg comes up off the rubber.
  const followHa = add(releaseHa, style.followVector.map((v) => v * 1.35));
  const followFrame = {
    ...releaseFrame,
    tFoot: [-14, -20 - 34 * backKick],
    gFoot: [12, 8],
    tKnee: [-9, -30],
    gKnee: [11, -19],
    pelvis: [2, -42 + sink * 0.6],
    turn: -40,
    hipTurn: -35,
    flex: 0.18,
    headR: 9.5,
    tEl: midpoint(sh.tSh, followHa, 5, -2),
    tHa: followHa,
    gEl: [16, -10],
    gHa: [14, -4]
  };

  return {
    SET: frame(setFrame),
    STRETCH: frame(stretchFrame),
    WIND: frame(windFrame),
    LIFT: frame(liftFrame),
    STRIDE: frame(strideFrame),
    COCK: frame(cockFrame),
    RELEASE: frame(releaseFrame),
    FOLLOW: frame(followFrame)
  };
}

const poseCache = new WeakMap();

/**
 * Keyframes for a style, cached per style object.
 * @param {Object} style from `getPitcherStyle`
 */
export function getPitcherPoses(style) {
  let poses = poseCache.get(style);
  if (!poses) {
    poses = buildPitcherPoses(style);
    poseCache.set(style, poses);
  }
  return poses;
}

/**
 * Where the ball leaves the hand, relative to the pitcher's feet on the mound, in screen pixels.
 * Use it to start the pitch flight at the hand: x = cx + dx, y = footY + dy.
 * Mirrors x for left-handers, as the renderer does.
 * @param {Object} pitcher
 * @param {number} [unit=DUEL_PITCHER_SCALE] screen pixels per keyframe unit (the duel pitcher's scale)
 * @returns {{ dx: number, dy: number }}
 */
export function getReleasePointOffset(pitcher, unit = DUEL_PITCHER_SCALE) {
  const style = getPitcherStyle(pitcher);
  const [hx, hy] = getPitcherPoses(style).RELEASE.tHand;
  const mirror = pitcher?.throws === 'L' ? -1 : 1;
  return { dx: hx * unit * mirror, dy: hy * unit };
}
