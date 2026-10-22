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
 * Windup: SET, WIND, ROCKER, PIVOT, LIFT. Stretch: SIGN, GATHER, STRETCH, STRETCH_LIFT.
 * Both finish through BREAK (or STRETCH_BREAK), STRIDE, LOAD, COCK, LAYBACK, RELEASE and FOLLOW.
 * @returns {Object<string, Object>} keyframes by phase name
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
    const w = 0.3 + 0.7 * Math.abs(Math.cos(turn));
    const twist = ([x, y]) => [x * w, y + 0.15 * x * Math.sin(turn)];
    const flex = 1 - (f.flex || 0);
    const bend = ([x, y]) => [x, y * flex];
    const at = (off) => rotate([f.pelvis[0] + off[0], f.pelvis[1] + off[1]], f.pelvis, f.lean);
    const hipTurn = ((f.hipTurn ?? f.turn ?? 0) * Math.PI) / 180;
    return {
      tFoot: f.tFoot,
      gFoot: f.gFoot,
      // 0 toe-on to the camera, 1 turned along the rubber toward third
      tFootSide: f.tFootSide || 0,
      gFootSide: f.gFootSide || 0,
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
      hipW: 0.25 + 0.75 * Math.abs(Math.cos(hipTurn)),
      // 1 while the throwing arm is behind the body (drawn before the torso)
      tArmBack: f.tArmBack || 0,
      // How much of the jersey's back faces the plate: none while square or side-on (the stretch
      // turns up to 88°), all of it once coiled to 105° or more
      back: clamp(((f.turn || 0) - 85) / 20, 0, 1),
      // How squarely the chest faces the plate: 1 square, 0 side-on or turned away
      front: Math.max(0, Math.cos(turn))
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

  // Stretch, taking the sign: already side-on (chest to third base), pivot foot along the
  // rubber, front foot toward the plate. Seen from the plate the feet are nearly in line, the
  // front one nearer the camera. The hands are apart: the glove rests on the front thigh and
  // the throwing hand hangs behind the hip.
  const stretchLegs = { tFoot: [-1, -1], gFoot: [2, 3], tKnee: [-1, -27], gKnee: [2, -25] };
  const signFrame = {
    ...setFrame,
    ...stretchLegs,
    tFootSide: 1,
    gFootSide: 0.4,
    turn: 80,
    tEl: [-9, -9],
    tHa: [-7, 5],
    tArmBack: 1,
    gEl: [11, -8],
    gHa: [8, 6]
  };

  // Coming set: the hands meet at the chest, then settle at the belt (chest for high-glove
  // pitchers) for the full stop.
  const setY = Math.max(gy, -15);
  const stretchFrame = {
    ...signFrame,
    tEl: [-6, setY + 6],
    tHa: [-2, setY],
    tArmBack: 0,
    gEl: [7, setY + 6],
    gHa: [0, setY + 1]
  };
  const gatherFrame = {
    ...stretchFrame,
    tEl: [-7, -12],
    tHa: [-2, -19],
    gEl: [7, -12],
    gHa: [0, -18]
  };

  // Stretch leg lift: lower than the windup's, about belt height, and the knee stays in front
  // instead of tucking back. The hands rise a little at the set.
  const stretchKneeY = -52 - 10 * k;
  const stretchKneeX = 2 - 3 * k;
  const stretchLiftFrame = {
    ...stretchFrame,
    turn: 88,
    pelvis: [-1, -51],
    tFoot: [-1, -1],
    tKnee: [-1, -27],
    gKnee: [stretchKneeX, stretchKneeY],
    gFoot: [stretchKneeX + 3, stretchKneeY + 24],
    tEl: [-6, setY + 3],
    tHa: [-2, setY - 3],
    gEl: [7, setY + 3],
    gHa: [0, setY - 2]
  };

  // Windup arms: overhead for the full windup, chest-high for hidden-ball and drop types.
  // The pitcher stays square to the plate while the hands go up.
  const high = style.windup === 'overhead' || style.windup === 'pivot';
  const windArms = high
    ? { tEl: [-14, -44], tHa: [-4, -54], gEl: [12, -42], gHa: [2, -52] }
    : { tEl: [-14, -18], tHa: [-3, -16], gEl: [13, -17], gHa: [3, -14] };
  const windFrame = {
    ...setFrame,
    ...windArms,
    turn: 5,
    head: [headTurn, -41],
    ...shoulders(0, style.windup === 'pivot' ? 4 : 0)
  };

  // Rocker step: the glove-side foot steps a few inches back (up the screen, away from the
  // plate) and the weight rocks onto it, still square, hands still up.
  const rockerFrame = {
    ...windFrame,
    pelvis: [1, -49],
    gFoot: [9, -4],
    gKnee: [9, -30],
    tKnee: [-7, -26],
    turn: 10
  };

  // Pivot: the pivot foot turns and slides into the slot in front of the rubber, the body
  // turns side-on, and overhead hands start down toward the head.
  const pivotFrame = {
    ...rockerFrame,
    tFootSide: 1,
    pelvis: [0, -50],
    tFoot: [-3, 2],
    tKnee: [-4, -26],
    gFoot: [8, -2],
    gKnee: [8, -28],
    turn: 70,
    ...(high ? { tEl: [-10, -36], tHa: [-2, -46], gEl: [9, -35], gHa: [2, -45] } : {})
  };

  // Leg lift: high kickers coil past side-on so the plate sees the back of the jersey (Tiant
  // turns furthest; low kickers stay about side-on), the knee comes up and across toward the
  // throwing side, and the hands come down to the chest. The deeper the coil, the further the
  // knee sits out to the side, so the number on the back stays in view.
  const liftTurn = style.windup === 'pivot' ? 130 : 86 + 22 * k;
  const kneeY = -50 - 36 * k;
  const kneeX = 7 - 9 * k - 13 * clamp((liftTurn - 85) / 20, 0, 1);
  const liftFrame = {
    ...windFrame,
    tFootSide: 1,
    turn: liftTurn,
    pelvis: [-1, -52],
    tFoot: [-3, 2],
    tKnee: [-5, -26],
    gKnee: [kneeX, kneeY],
    gFoot: [kneeX + 6, Math.min(-4, kneeY + 26)],
    tEl: [-7, -12],
    tHa: [0, -19],
    gEl: [8, -12],
    gHa: [2, -18]
  };

  // Stride: the front foot lands toward the plate while the shoulders stay closed (high kickers
  // still nearly side-on). The glove arm leads, out toward third base at shoulder height, and
  // the throwing hand has swung down and back toward second, peeking out past the far hip.
  // The stride comes straight at the camera: the front foot lands nearer (lower on screen), not
  // far out to the side, so the feet stay close together across the screen.
  const strideLegs = { tFoot: [-4, -1], gFoot: [4, 8], tKnee: [-6, -23], gKnee: [5, -20] };
  const strideFrame = {
    ...strideLegs,
    tFootSide: 1,
    gFootSide: 0.2,
    pelvis: [0, -46 + sink * 0.6],
    lean: lean * 0.3,
    turn: 78 + 14 * k,
    hipTurn: 55,
    neck: [0, -32],
    head: [headTurn, -41],
    headR: 8,
    ...shoulders(d * 0.5),
    tEl: [3, -17],
    tHa: [12, -6],
    tArmBack: 1,
    gEl: [-8, -26],
    gHa: [-18, -23]
  };

  // Hand break, as the lifted knee starts down: the hands part at the belt, the glove turning
  // out and the throwing hand starting down.
  const breakFrom = (lift) => {
    const toward = (key) => [
      lift[key][0] + (strideLegs[key][0] - lift[key][0]) * 0.35,
      lift[key][1] + (strideLegs[key][1] - lift[key][1]) * 0.35
    ];
    return {
      ...lift,
      tFoot: toward('tFoot'),
      gFoot: toward('gFoot'),
      tKnee: toward('tKnee'),
      gKnee: toward('gKnee'),
      tEl: [-8, -9],
      tHa: [-5, -3],
      tArmBack: 0,
      gEl: [6, -13],
      gHa: [0, -8]
    };
  };

  // Arm load as the front foot lands: the hips open first, and behind the body the throwing
  // elbow rises to shoulder height with the forearm still hanging. The glove arm still leads.
  // From here the hand sweeps up behind the head into the cocked position.
  const sl = shoulders(d * 0.75);
  const loadFrame = {
    ...strideFrame,
    pelvis: [0, -47 + sink * 0.8],
    lean: lean * 0.45,
    turn: 82,
    hipTurn: 40,
    ...sl,
    tEl: [11, -27],
    tHa: [15, -16],
    gEl: [-4, -23],
    gHa: [-12, -20]
  };

  // Cocked arm: hips have fired but the shoulders are still closed. The elbow is up at
  // shoulder height and the hand is laid back behind the head, lower for lower arm slots
  // (beside the shoulder for sidearm, below it for submarine). The glove pulls in in front
  // of the chest.
  const sh = shoulders(d);
  // 0 overhand, about 0.4 three-quarter, 0.9 sidearm, 1.7 submarine
  const slotDrop = clamp(style.releaseAngle / 90, 0, 1.7);
  const cockFrame = {
    ...strideLegs,
    tFootSide: 0.7,
    gFootSide: 0.2,
    pelvis: pelvisAt(1),
    lean: lean * 0.6,
    turn: 65,
    hipTurn: 15,
    neck: [0, -32],
    head: [headTurn, -41],
    headR: 8,
    ...sh,
    tEl: [sh.tSh[0] - 9, sh.tSh[1] - 2 + 3 * slotDrop],
    tHa: [sh.tSh[0] - 4 - 5 * Math.min(slotDrop, 1), sh.tSh[1] - 16 + 12 * slotDrop],
    tArmBack: 1,
    gEl: [9, -21],
    gHa: [3, -19]
  };

  // Layback, just before release: the shoulders have nearly squared, the elbow leads at
  // shoulder height and the forearm lies back, so the hand drops behind the head.
  const laybackFrame = {
    ...cockFrame,
    lean: lean * 0.8,
    turn: 25,
    hipTurn: -5,
    tEl: [sh.tSh[0] - 9, sh.tSh[1] - 1 + 3 * slotDrop],
    tHa: [sh.tSh[0] - 5 - 4 * Math.min(slotDrop, 1), sh.tSh[1] - 11 + 12 * slotDrop],
    gEl: [11, -17],
    gHa: [6, -16]
  };

  // Release: shoulders whip square and past, throwing shoulder forward, the chest driving out
  // over the front knee. The straight arm reaches toward the plate, at the camera, so it reads
  // short and the hand comes in front of the head (overhand) or the shoulder (lower slots).
  const releaseFlex = 0.15;
  const releaseSh = [sh.tSh[0], sh.tSh[1] * (1 - releaseFlex)];
  const releaseHa = add(
    add(releaseSh, armOffset(style.releaseAngle, lean).map((v) => v * 0.6)),
    [4, 0]
  );
  const releaseFrame = {
    ...cockFrame,
    tFootSide: 0.3,
    gFootSide: 0.1,
    tFoot: [-4, -2],
    gFoot: [4, 8],
    tKnee: [-5, -24],
    gKnee: [4, -20],
    lean,
    flex: releaseFlex,
    turn: -15,
    hipTurn: -20,
    headR: 9,
    tEl: midpoint(releaseSh, releaseHa, -1.5, 0.5),
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
    tFootSide: 0,
    tFoot: [-14, -20 - 34 * backKick],
    gFoot: [4, 8],
    tKnee: [-9, -30],
    gKnee: [4, -19],
    pelvis: [2, -42 + sink * 0.6],
    turn: -40,
    hipTurn: -35,
    flex: 0.24,
    headR: 9.5,
    tEl: midpoint(sh.tSh, followHa, 5, -2),
    tHa: followHa,
    gEl: [16, -10],
    gHa: [14, -4]
  };

  return {
    SET: frame(setFrame),
    WIND: frame(windFrame),
    ROCKER: frame(rockerFrame),
    PIVOT: frame(pivotFrame),
    LIFT: frame(liftFrame),
    SIGN: frame(signFrame),
    GATHER: frame(gatherFrame),
    STRETCH: frame(stretchFrame),
    STRETCH_LIFT: frame(stretchLiftFrame),
    BREAK: frame(breakFrom(liftFrame)),
    STRETCH_BREAK: frame(breakFrom(stretchLiftFrame)),
    STRIDE: frame(strideFrame),
    LOAD: frame(loadFrame),
    COCK: frame(cockFrame),
    LAYBACK: frame(laybackFrame),
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
