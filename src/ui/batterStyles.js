/**
 * @fileoverview Batter Stances, Mechanics & Swing Animation Engine for Earl Weaver Baseball.
 *
 * Implements historically authentic 1950s–1980s batting stances, pre-pitch waggles,
 * kinetic load/stride phases, swing rotation, contact alignment, and follow-throughs.
 *
 * Researched Iconic Hitters & Mechanics:
 * - Stan Musial: Famous "coiled corkscrew" stance, deeply crouched, closed off, peering
 *   over front shoulder, explosive hip uncoil.
 * - Rod Carew: Ultra-deep crouch, wide open stance, bat held nearly flat/horizontal
 *   across chest, hypnotic barrel waggle, inside-out line drive stroke.
 * - Carl Yastrzemski: Upright stance, hands held sky-high above helmet crown, bat
 *   pointing straight up, high-hand load dropping into the hitting zone.
 * - Ted Williams: The "Science of Hitting" blueprint — textbook balanced posture,
 *   fluid load, rotational hip-shoulder separation, slight upward attack angle
 *   matching incoming pitch plane, magnificent high two-handed follow-through.
 * - Pete Rose: "Charlie Hustle" aggressive crouch crowding the plate, wide base,
 *   rapid forward/back pump waggle, short aggressive stride, compact slash swing.
 * - Joe Morgan: Upright stance with the iconic back-elbow flap waggle like a bird wing,
 *   explosive compact hip turn, high finish.
 * - Jim Rice: Imposing upright stance, wide power base, high hands cocked back,
 *   murderous forearm snap and wrist roll.
 * - Eddie Murray: "Steady Eddie" switch-hitter, relaxed quiet hands, smooth balanced
 *   stride from both sides of the plate, sweeping fluid follow-through.
 * - Cal Ripken Jr. (1987): Wide base with deep knee bend, bat held relatively flat
 *   off rear shoulder, calm waggle, short stride, level rotational stroke.
 * - Wade Boggs: Balanced crouch, high hands with bat pointed up, subtle toe-tap stride,
 *   classic inside-out stroke driving pitches to opposite field, compact two-handed finish.
 * - Reggie Jackson: "Mr. October" high hands, wide base, dramatic leg kick, violent
 *   rotational uppercut, towering one-handed follow-through holding the finish.
 *
 * Swing Phases & Timing Contract (pitchProg: 0.0 -> 1.0):
 * - 0.00 – 0.42: Stance & Idle Waggle (settles smoothly before pitch release)
 * - 0.42 – 0.58: Load (hands drift back/up into power slot, weight shifts to rear leg, stride begins)
 * - 0.58 – 0.72: Stride Plant (front foot plants, hips brace, elastic tension)
 * - 0.72 – 0.90: Swing Acceleration:
 *     0.72 – 0.82: Hip/shoulder rotation, rear knee drives down/in ("squish bug"), bat lags behind hands
 *     0.82 – 0.90: Violent wrist snap through zone reaching CONTACT at EXACTLY p = 0.90
 * - 0.90 – 1.00: Follow-Through (one-hand high extension vs two-hand wrap)
 * - !didSwing: Check-swing / Take (holds up wrists at check angle or disciplined take watching mitt)
 */

export const lerp = (a, b, t) => a + (b - a) * t;

export const smooth = (t) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

export const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

/**
 * Fast deterministic 32-bit FNV-1a hash of a string.
 * @param {string} str
 * @returns {number}
 */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Blends two figure keyframe poses with support for optional decoupled hands.
 */
export function blendPose(a, b, t) {
  const out = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const va = a[key] !== undefined ? a[key] : (key === 'nHand' || key === 'fHand' ? a.hands : 0);
    const vb = b[key] !== undefined ? b[key] : (key === 'nHand' || key === 'fHand' ? b.hands : 0);

    if (Array.isArray(va) && Array.isArray(vb)) {
      out[key] = [lerp(va[0], vb[0], t), lerp(va[1], vb[1], t)];
    } else if (typeof va === 'number' && typeof vb === 'number') {
      out[key] = lerp(va, vb, t);
    } else {
      out[key] = vb !== undefined ? vb : va;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Canonical Base Figure Keyframes (150-unit tall batter beside home plate)
// +x points toward home plate / pitcher; y = 0 at feet; negative y is up.
// ---------------------------------------------------------------------------
export const BASE_BATTER_POSES = {
  STANCE: {
    nFoot: [0, 0], fFoot: [28, -10], nKnee: [18, -38], fKnee: [38, -46], pelvis: [8, -70],
    neck: [18, -114], head: [24, -125], nShoulder: [12, -106], fShoulder: [24, -108],
    nElbow: [-6, -98], fElbow: [30, -92], hands: [10, -114], batAng: -0.55, batLen: 62, twist: 0
  },
  LOAD: {
    nFoot: [0, 0], fFoot: [32, -14], nKnee: [14, -38], fKnee: [40, -50], pelvis: [4, -69],
    neck: [14, -114], head: [20, -125], nShoulder: [8, -106], fShoulder: [20, -108],
    nElbow: [-12, -102], fElbow: [22, -98], hands: [2, -118], batAng: -0.80, batLen: 62, twist: -0.08
  },
  STRIDE_PLANT: {
    nFoot: [0, 0], fFoot: [36, -10], nKnee: [16, -38], fKnee: [46, -44], pelvis: [8, -68],
    neck: [18, -112], head: [24, -123], nShoulder: [12, -105], fShoulder: [26, -107],
    nElbow: [-8, -98], fElbow: [26, -94], hands: [6, -115], batAng: -0.70, batLen: 62, twist: 0.08
  },
  ROTATION: {
    nFoot: [0, -2], fFoot: [38, -11], nKnee: [20, -36], fKnee: [45, -45], pelvis: [12, -68],
    neck: [21, -111], head: [28, -122], nShoulder: [18, -103], fShoulder: [30, -106],
    nElbow: [12, -88], fElbow: [40, -92], hands: [28, -96], batAng: 0.35, batLen: 56, twist: 0.35
  },
  CONTACT: {
    nFoot: [0, -3], fFoot: [38, -12], nKnee: [24, -36], fKnee: [44, -46], pelvis: [14, -68],
    neck: [24, -110], head: [32, -120], nShoulder: [22, -101], fShoulder: [34, -105],
    nElbow: [30, -84], fElbow: [52, -90], hands: [46, -86], batAng: 1.62, batLen: 52, twist: 0.60
  },
  FOLLOW_TWO_HAND: {
    nFoot: [2, -3], fFoot: [38, -12], nKnee: [26, -34], fKnee: [44, -46], pelvis: [16, -68],
    neck: [28, -110], head: [36, -120], nShoulder: [30, -102], fShoulder: [22, -104],
    nElbow: [46, -108], fElbow: [30, -116], hands: [38, -124], batAng: -1.90, batLen: 58, twist: 1.0
  },
  FOLLOW_ONE_HAND: {
    nFoot: [2, -3], fFoot: [38, -12], nKnee: [26, -34], fKnee: [44, -46], pelvis: [16, -68],
    neck: [28, -110], head: [36, -122], nShoulder: [28, -102], fShoulder: [22, -104],
    nElbow: [14, -92], fElbow: [48, -116], hands: [44, -138], nHand: [18, -96],
    batAng: -2.35, batLen: 60, twist: 1.0
  },
  CHECK_SWING: {
    nFoot: [0, -1], fFoot: [37, -11], nKnee: [20, -36], fKnee: [44, -45], pelvis: [11, -68],
    neck: [20, -112], head: [27, -122], nShoulder: [16, -104], fShoulder: [28, -106],
    nElbow: [14, -92], fElbow: [38, -94], hands: [24, -98], batAng: 0.52, batLen: 58, twist: 0.28
  },
  TAKE: {
    nFoot: [0, 0], fFoot: [32, -10], nKnee: [18, -38], fKnee: [40, -45], pelvis: [8, -70],
    neck: [18, -114], head: [24, -125], nShoulder: [12, -106], fShoulder: [24, -108],
    nElbow: [-4, -98], fElbow: [28, -94], hands: [10, -112], batAng: -0.50, batLen: 62, twist: 0.05
  }
};

// ---------------------------------------------------------------------------
// Historic Player Archetype Definitions
// ---------------------------------------------------------------------------
export const BATTER_ARCHETYPES = {
  STAN_MUSIAL: {
    id: 'STAN_MUSIAL',
    name: 'Stan Musial',
    description: 'Coiled corkscrew, closed stance, peering over shoulder, explosive uncoil',
    stanceWidth: 2,
    crouch: 10,
    openClosed: -8,       // deeply closed stance
    handHeight: 2,
    handX: -6,
    batAngle: -0.85,      // steep cocked bat angle
    batLength: 62,
    waggleRate: 0.95,
    waggleStyle: 'subtle',
    strideType: 'step',
    strideLength: 10,
    followThrough: 'two_hand',
    attackAngle: 0.10,
    checkSwingAggression: 0.45
  },
  ROD_CAREW: {
    id: 'ROD_CAREW',
    name: 'Rod Carew',
    description: 'Deep crouch, wide open stance, bat held flat/horizontal across chest',
    stanceWidth: 6,
    crouch: 12,
    openClosed: 10,       // wide open stance
    handHeight: 10,       // low hands near chest
    handX: 2,
    batAngle: -0.15,      // bat nearly parallel to ground
    batLength: 60,
    waggleRate: 1.10,
    waggleStyle: 'barrel_circle',
    strideType: 'toe_tap',
    strideLength: 6,
    followThrough: 'two_hand',
    attackAngle: 0.00,    // pure level line drive plane
    checkSwingAggression: 0.40
  },
  CARL_YASTRZEMSKI: {
    id: 'CARL_YASTRZEMSKI',
    name: 'Carl Yastrzemski',
    description: 'Upright stance, hands held sky-high above helmet crown, bat straight up',
    stanceWidth: -2,
    crouch: -3,           // tall upright stance
    openClosed: -2,
    handHeight: -13,      // very high hands
    handX: -4,
    batAngle: -0.96,      // pointing almost straight up
    batLength: 62,
    waggleRate: 1.40,
    waggleStyle: 'twitch',
    strideType: 'step',
    strideLength: 9,
    followThrough: 'two_hand',
    attackAngle: 0.06,
    checkSwingAggression: 0.50
  },
  TED_WILLIAMS: {
    id: 'TED_WILLIAMS',
    name: 'Ted Williams',
    description: 'The Science of Hitting textbook posture, fluid stride, upward plane, majestic high finish',
    stanceWidth: 3,
    crouch: 4,
    openClosed: 2,        // slight open stance for hip clearance
    handHeight: -2,
    handX: -2,
    batAngle: -0.62,      // classic 45-degree angle
    batLength: 63,
    waggleRate: 1.00,
    waggleStyle: 'standard',
    strideType: 'step',
    strideLength: 11,
    followThrough: 'two_hand',
    attackAngle: 0.14,    // Williams slight uppercut matching pitch descent
    checkSwingAggression: 0.42
  },
  PETE_ROSE: {
    id: 'PETE_ROSE',
    name: 'Pete Rose',
    description: 'Charlie Hustle aggressive low crouch crowding plate, wide base, pump waggle',
    stanceWidth: 8,
    crouch: 14,
    openClosed: -3,
    handHeight: 6,
    handX: 1,
    batAngle: -0.45,
    batLength: 59,
    waggleRate: 1.35,
    waggleStyle: 'pump',
    strideType: 'toe_tap',
    strideLength: 5,
    followThrough: 'two_hand',
    attackAngle: 0.02,    // flat slash plane
    checkSwingAggression: 0.55
  },
  JOE_MORGAN: {
    id: 'JOE_MORGAN',
    name: 'Joe Morgan',
    description: 'Upright stance with famous back-elbow flap waggle like a bird wing',
    stanceWidth: 1,
    crouch: 2,
    openClosed: 4,
    handHeight: 0,
    handX: -1,
    batAngle: -0.55,
    batLength: 60,
    waggleRate: 1.15,
    waggleStyle: 'arm_flap', // iconic back arm flap!
    strideType: 'step',
    strideLength: 8,
    followThrough: 'two_hand',
    attackAngle: 0.08,
    checkSwingAggression: 0.44
  },
  JIM_RICE: {
    id: 'JIM_RICE',
    name: 'Jim Rice',
    description: 'Imposing upright power stance, wide base, high cocked hands, violent forearm snap',
    stanceWidth: 6,
    crouch: -2,
    openClosed: -1,
    handHeight: -8,
    handX: -6,
    batAngle: -0.80,
    batLength: 64,
    waggleRate: 0.85,
    waggleStyle: 'pump',
    strideType: 'step',
    strideLength: 10,
    followThrough: 'one_hand',
    attackAngle: 0.15,
    checkSwingAggression: 0.52
  },
  EDDIE_MURRAY: {
    id: 'EDDIE_MURRAY',
    name: 'Eddie Murray',
    description: 'Steady Eddie switch-hitter, relaxed quiet hands, smooth balanced stride from both sides',
    stanceWidth: 4,
    crouch: 2,
    openClosed: 0,
    handHeight: 1,
    handX: 0,
    batAngle: -0.52,
    batLength: 62,
    waggleRate: 0.80,
    waggleStyle: 'subtle',
    strideType: 'step',
    strideLength: 9,
    followThrough: 'two_hand',
    attackAngle: 0.10,
    checkSwingAggression: 0.40
  },
  CAL_RIPKEN: {
    id: 'CAL_RIPKEN',
    name: 'Cal Ripken Jr.',
    description: '1987 wide stance with deep knee bend, bat resting low near shoulder, rotational stroke',
    stanceWidth: 9,
    crouch: 7,
    openClosed: -1,
    handHeight: 4,
    handX: 0,
    batAngle: -0.32,      // bat resting relatively flat
    batLength: 63,
    waggleRate: 0.90,
    waggleStyle: 'subtle',
    strideType: 'step',
    strideLength: 6,
    followThrough: 'two_hand',
    attackAngle: 0.06,
    checkSwingAggression: 0.48
  },
  WADE_BOGGS: {
    id: 'WADE_BOGGS',
    name: 'Wade Boggs',
    description: 'Balanced crouch, high hands, toe-tap trigger, classic inside-out opposite-field stroke',
    stanceWidth: 3,
    crouch: 6,
    openClosed: 0,
    handHeight: -7,
    handX: -2,
    batAngle: -0.88,      // bat pointed up
    batLength: 61,
    waggleRate: 1.05,
    waggleStyle: 'barrel_circle',
    strideType: 'toe_tap',
    strideLength: 6,
    followThrough: 'two_hand',
    attackAngle: 0.03,    // inside-out flat path
    checkSwingAggression: 0.38
  },
  REGGIE_JACKSON: {
    id: 'REGGIE_JACKSON',
    name: 'Reggie Jackson',
    description: 'Mr. October dramatic high hands, wide base, big leg kick, violent uppercut, towering one-handed finish',
    stanceWidth: 7,
    crouch: 5,
    openClosed: 1,
    handHeight: -6,
    handX: -5,
    batAngle: -0.75,
    batLength: 64,
    waggleRate: 1.10,
    waggleStyle: 'standard',
    strideType: 'leg_kick', // iconic leg kick
    strideLength: 14,
    followThrough: 'one_hand', // iconic towering finish
    attackAngle: 0.18,    // pronounced uppercut
    checkSwingAggression: 0.60
  },
  FRANK_ROBINSON: {
    id: 'FRANK_ROBINSON',
    name: 'Frank Robinson',
    description: 'Crowding the plate, upright aggressive coil, explosive compact power stroke',
    stanceWidth: 4,
    crouch: 1,
    openClosed: -3,
    handHeight: -5,
    handX: -4,
    batAngle: -0.70,
    batLength: 63,
    waggleRate: 1.00,
    waggleStyle: 'pump',
    strideType: 'step',
    strideLength: 10,
    followThrough: 'one_hand',
    attackAngle: 0.14,
    checkSwingAggression: 0.50
  },
  CARLTON_FISK: {
    id: 'CARLTON_FISK',
    name: 'Carlton Fisk',
    description: 'Tall upright catcher stance, high hands, high leg kick, two-handed high drive',
    stanceWidth: 5,
    crouch: -1,
    openClosed: 2,
    handHeight: -9,
    handX: -3,
    batAngle: -0.82,
    batLength: 64,
    waggleRate: 1.05,
    waggleStyle: 'standard',
    strideType: 'leg_kick',
    strideLength: 12,
    followThrough: 'two_hand',
    attackAngle: 0.16,
    checkSwingAggression: 0.46
  },
  BOOG_POWELL: {
    id: 'BOOG_POWELL',
    name: 'Boog Powell',
    description: 'Massive slugger crouch, wide stance, heavy load, two-handed high wrap',
    stanceWidth: 8,
    crouch: 8,
    openClosed: -2,
    handHeight: -4,
    handX: -5,
    batAngle: -0.72,
    batLength: 64,
    waggleRate: 0.85,
    waggleStyle: 'subtle',
    strideType: 'step',
    strideLength: 9,
    followThrough: 'two_hand',
    attackAngle: 0.16,
    checkSwingAggression: 0.52
  },
  AL_BUMBRY: {
    id: 'AL_BUMBRY',
    name: 'Al Bumbry',
    description: 'Speedster slap-hitter stance, open, quick stride heading toward first base',
    stanceWidth: 2,
    crouch: 9,
    openClosed: 7,
    handHeight: 5,
    handX: 1,
    batAngle: -0.30,
    batLength: 59,
    waggleRate: 1.25,
    waggleStyle: 'barrel_circle',
    strideType: 'toe_tap',
    strideLength: 7,
    followThrough: 'two_hand',
    attackAngle: -0.02,
    checkSwingAggression: 0.36
  }
};

/**
 * Maps player names / IDs to iconic archetypes.
 */
const HISTORIC_NAME_MAP = [
  { pattern: /musial/i, archetype: 'STAN_MUSIAL' },
  { pattern: /carew/i, archetype: 'ROD_CAREW' },
  { pattern: /yastrzemski|yaz/i, archetype: 'CARL_YASTRZEMSKI' },
  { pattern: /ted.*williams/i, archetype: 'TED_WILLIAMS' },
  { pattern: /pete.*rose/i, archetype: 'PETE_ROSE' },
  { pattern: /joe.*morgan/i, archetype: 'JOE_MORGAN' },
  { pattern: /jim.*rice/i, archetype: 'JIM_RICE' },
  { pattern: /eddie.*murray/i, archetype: 'EDDIE_MURRAY' },
  { pattern: /cal.*ripken/i, archetype: 'CAL_RIPKEN' },
  { pattern: /wade.*boggs/i, archetype: 'WADE_BOGGS' },
  { pattern: /reggie.*jackson/i, archetype: 'REGGIE_JACKSON' },
  { pattern: /frank.*robinson/i, archetype: 'FRANK_ROBINSON' },
  { pattern: /carlton.*fisk|pudge/i, archetype: 'CARLTON_FISK' },
  { pattern: /boog.*powell/i, archetype: 'BOOG_POWELL' },
  { pattern: /al.*bumbry/i, archetype: 'AL_BUMBRY' }
];

/**
 * Procedurally generates a deterministic batter style based on player name hash + ratings.
 *
 * @param {Object} player
 * @param {'L'|'R'} side
 * @returns {Object}
 */
export function generateProceduralStyle(player, side = 'R') {
  const name = player?.name || 'Batter';
  const id = player?.id || name;
  const hash = hashString(`${name}_${id}`);

  // Normalise pseudo-random numbers in [0, 1)
  const r1 = ((hash >>> 0) & 0xff) / 255;
  const r2 = ((hash >>> 8) & 0xff) / 255;
  const r3 = ((hash >>> 16) & 0xff) / 255;
  const r4 = ((hash >>> 24) & 0xff) / 255;

  const ratings = player?.ratings || {};
  const power = Number(ratings.power ?? 5);
  const hitAndRun = Number(ratings.hitAndRun ?? 5);
  const runs = Number(ratings.runs ?? 5);
  const fbPct = Number(ratings.fbPct ?? 35);

  // Stance width: power hitters lean wider, speedsters medium
  const baseWidth = power >= 7 ? 4 + r1 * 5 : (runs >= 7 ? 1 + r1 * 4 : r1 * 6 - 1);
  const stanceWidth = Math.round(clamp(baseWidth, -4, 10));

  // Crouch: speed/contact hitters crouch lower for strike-zone compactness
  const crouchBase = (10 - power) * 0.7 + (hitAndRun >= 7 ? 3 : 0) + r2 * 6;
  const crouch = Math.round(clamp(crouchBase, -2, 14));

  // Open vs Closed: slight variety, slight open bias for pull hitters
  const openClosed = Math.round((r3 - 0.45) * 12);

  // Hand height: power hitters tend to hold hands higher
  const handHeight = Math.round((power >= 7 ? -3 - r4 * 8 : (hitAndRun >= 7 ? 2 + r4 * 6 : (r4 - 0.5) * 12)));

  // Horizontal hands: deeper load position
  const handX = Math.round((r2 - 0.6) * 8);

  // Bat angle: flatter for contact/slap hitters (-0.25), steeper for sluggers (-0.85)
  const batAngle = power >= 7 ? -0.65 - r1 * 0.25 : (hitAndRun >= 7 ? -0.30 - r1 * 0.25 : -0.55 + (r1 - 0.5) * 0.3);

  // Bat length: 60-64 units
  const batLength = 60 + Math.round(r3 * 4);

  // Waggle style & rate
  const waggleRate = 0.80 + r2 * 0.55;
  let waggleStyle = 'standard';
  if (r4 < 0.20 && hitAndRun >= 6) waggleStyle = 'barrel_circle';
  else if (r4 < 0.40 && power >= 7) waggleStyle = 'pump';
  else if (r4 < 0.55) waggleStyle = 'subtle';

  // Stride type: power hitters kick or step; contact hitters tap or step
  let strideType = 'step';
  if (power >= 8 && r1 > 0.4) strideType = 'leg_kick';
  else if (hitAndRun >= 7 && r2 > 0.4) strideType = 'toe_tap';

  const strideLength = strideType === 'leg_kick' ? 12 + Math.round(r3 * 4) : 7 + Math.round(r3 * 5);

  // Follow-through: high power + high fly-ball tend to release one-handed
  const followThrough = (power >= 8 && fbPct >= 38) || (power >= 7 && r4 > 0.5) ? 'one_hand' : 'two_hand';

  // Attack angle: uppercut (+0.05 to +0.20) for power; flat (-0.02 to +0.05) for contact
  const attackAngle = clamp((power - 4) * 0.025 + (fbPct - 30) * 0.0025 + (r1 - 0.5) * 0.04, -0.04, 0.20);

  const checkSwingAggression = clamp(0.38 + (power * 0.02) + (r3 - 0.5) * 0.1, 0.35, 0.62);

  return {
    id: `PROCEDURAL_${hash.toString(16)}`,
    name,
    side,
    stanceWidth,
    crouch,
    openClosed,
    handHeight,
    handX,
    batAngle,
    batLength,
    waggleRate,
    waggleStyle,
    strideType,
    strideLength,
    followThrough,
    attackAngle,
    checkSwingAggression
  };
}

/**
 * Returns a fully articulated batter style for the given player.
 * Deterministic based on player identity and ratings.
 *
 * @param {Object|string|null} player - Batter player object or string name
 * @param {'L'|'R'|null} [side=null] - Current batting side (critical for switch hitters)
 * @returns {Object}
 */
export function getBatterStyle(player, side = null) {
  const pName = typeof player === 'string' ? player : (player?.name || '');
  const pId = player?.id || '';

  // Determine batting handedness
  let effectiveSide = side;
  if (!effectiveSide) {
    if (player && typeof player === 'object' && player.bats) {
      effectiveSide = player.bats === 'L' ? 'L' : 'R';
    } else {
      effectiveSide = 'R';
    }
  }

  // Check historic archetypes
  const queryStr = `${pName} ${pId}`.toLowerCase();
  for (const entry of HISTORIC_NAME_MAP) {
    if (entry.pattern.test(queryStr)) {
      const arch = BATTER_ARCHETYPES[entry.archetype];
      if (arch) {
        return {
          ...arch,
          side: effectiveSide,
          name: pName || arch.name
        };
      }
    }
  }

  // Fallback to deterministic procedural style
  return generateProceduralStyle(typeof player === 'object' ? player : { name: pName }, effectiveSide);
}

/**
 * Generates an individualized keyframe pose dictionary tailored to a batter style.
 *
 * @param {Object} style - Batter style from getBatterStyle
 * @returns {Object} Set of keyframes: { STANCE, LOAD, STRIDE_PLANT, ROTATION, CONTACT, FOLLOW_ONE_HAND, FOLLOW_TWO_HAND, CHECK_SWING, TAKE }
 */
export function generateBatterPoses(style) {
  const B = BASE_BATTER_POSES;
  const sw = style.stanceWidth || 0;
  const cr = style.crouch || 0;
  const oc = style.openClosed || 0;
  const hh = style.handHeight || 0;
  const hx = style.handX || 0;
  const ba = style.batAngle ?? -0.55;
  const bl = style.batLength ?? 62;
  const aa = style.attackAngle || 0;
  const sl = style.strideLength || 9;

  // 1. STANCE
  const STANCE = {
    ...B.STANCE,
    fFoot: [B.STANCE.fFoot[0] + sw, B.STANCE.fFoot[1] + oc],
    fKnee: [B.STANCE.fKnee[0] + sw * 0.6, B.STANCE.fKnee[1] + cr * 0.5 + oc * 0.4],
    nKnee: [B.STANCE.nKnee[0], B.STANCE.nKnee[1] + cr * 0.6],
    pelvis: [B.STANCE.pelvis[0] - cr * 0.2, B.STANCE.pelvis[1] + cr],
    neck: [B.STANCE.neck[0], B.STANCE.neck[1] + cr],
    head: [B.STANCE.head[0], B.STANCE.head[1] + cr],
    nShoulder: [B.STANCE.nShoulder[0], B.STANCE.nShoulder[1] + cr],
    fShoulder: [B.STANCE.fShoulder[0], B.STANCE.fShoulder[1] + cr],
    hands: [B.STANCE.hands[0] + hx, B.STANCE.hands[1] + cr * 0.7 + hh],
    nElbow: [B.STANCE.nElbow[0] + hx * 0.5, B.STANCE.nElbow[1] + cr * 0.7 + hh * 0.6],
    fElbow: [B.STANCE.fElbow[0] + hx * 0.5, B.STANCE.fElbow[1] + cr * 0.7 + hh * 0.6],
    batAng: ba,
    batLen: bl,
    twist: 0
  };

  // 2. LOAD
  const isKick = style.strideType === 'leg_kick';
  const isTap = style.strideType === 'toe_tap';
  const footLift = isKick ? -22 : (isTap ? -4 : -12);
  const kneeLift = isKick ? -18 : (isTap ? -3 : -8);

  const LOAD = {
    ...B.LOAD,
    fFoot: [B.LOAD.fFoot[0] + sw * 0.8, B.LOAD.fFoot[1] + oc + footLift],
    fKnee: [B.LOAD.fKnee[0] + sw * 0.6, B.LOAD.fKnee[1] + cr * 0.5 + oc * 0.4 + kneeLift],
    nKnee: [B.LOAD.nKnee[0], B.LOAD.nKnee[1] + cr * 0.6],
    pelvis: [B.LOAD.pelvis[0] - 2, B.LOAD.pelvis[1] + cr],
    neck: [B.LOAD.neck[0], B.LOAD.neck[1] + cr],
    head: [B.LOAD.head[0], B.LOAD.head[1] + cr],
    nShoulder: [B.LOAD.nShoulder[0], B.LOAD.nShoulder[1] + cr],
    fShoulder: [B.LOAD.fShoulder[0], B.LOAD.fShoulder[1] + cr],
    hands: [B.LOAD.hands[0] + hx - 3, B.LOAD.hands[1] + cr * 0.7 + hh - 2],
    nElbow: [B.LOAD.nElbow[0] + hx * 0.5, B.LOAD.nElbow[1] + cr * 0.7 + hh * 0.6],
    fElbow: [B.LOAD.fElbow[0] + hx * 0.5, B.LOAD.fElbow[1] + cr * 0.7 + hh * 0.6],
    batAng: ba - 0.22,
    batLen: bl,
    twist: -0.10
  };

  // 3. STRIDE PLANT
  const STRIDE_PLANT = {
    ...B.STRIDE_PLANT,
    fFoot: [B.STRIDE_PLANT.fFoot[0] + sw + sl * 0.4, B.STRIDE_PLANT.fFoot[1] + oc],
    fKnee: [B.STRIDE_PLANT.fKnee[0] + sw * 0.6 + sl * 0.3, B.STRIDE_PLANT.fKnee[1] + cr * 0.4 + oc * 0.3],
    nKnee: [B.STRIDE_PLANT.nKnee[0], B.STRIDE_PLANT.nKnee[1] + cr * 0.5],
    pelvis: [B.STRIDE_PLANT.pelvis[0], B.STRIDE_PLANT.pelvis[1] + cr * 0.9],
    neck: [B.STRIDE_PLANT.neck[0], B.STRIDE_PLANT.neck[1] + cr * 0.9],
    head: [B.STRIDE_PLANT.head[0], B.STRIDE_PLANT.head[1] + cr * 0.9],
    hands: [B.STRIDE_PLANT.hands[0] + hx * 0.5, B.STRIDE_PLANT.hands[1] + cr * 0.6 + hh * 0.7],
    batAng: ba - 0.12,
    batLen: bl,
    twist: 0.10
  };

  // 4. ROTATION & LAG
  const ROTATION = {
    ...B.ROTATION,
    fFoot: [B.ROTATION.fFoot[0] + sw + sl * 0.4, B.ROTATION.fFoot[1] + oc],
    fKnee: [B.ROTATION.fKnee[0] + sw * 0.5 + sl * 0.3, B.ROTATION.fKnee[1] + cr * 0.3],
    pelvis: [B.ROTATION.pelvis[0] + 1, B.ROTATION.pelvis[1] + cr * 0.8],
    neck: [B.ROTATION.neck[0], B.ROTATION.neck[1] + cr * 0.8],
    head: [B.ROTATION.head[0], B.ROTATION.head[1] + cr * 0.8],
    hands: [B.ROTATION.hands[0] + hx * 0.3, B.ROTATION.hands[1] + cr * 0.5 + hh * 0.4],
    batAng: B.ROTATION.batAng + aa * 0.4,
    batLen: bl - 6,
    twist: 0.38
  };

  // 5. CONTACT (Bat aligns with incoming ball at strike zone plane)
  const CONTACT = {
    ...B.CONTACT,
    fFoot: [B.CONTACT.fFoot[0] + sw + sl * 0.4, B.CONTACT.fFoot[1] + oc],
    fKnee: [B.CONTACT.fKnee[0] + sw * 0.5 + sl * 0.3, B.CONTACT.fKnee[1] + cr * 0.3],
    pelvis: [B.CONTACT.pelvis[0] + 2, B.CONTACT.pelvis[1] + cr * 0.8],
    neck: [B.CONTACT.neck[0], B.CONTACT.neck[1] + cr * 0.8],
    head: [B.CONTACT.head[0], B.CONTACT.head[1] + cr * 0.8],
    hands: [B.CONTACT.hands[0], B.CONTACT.hands[1] + cr * 0.5 - aa * 22],
    batAng: B.CONTACT.batAng + aa,
    batLen: bl - 10,
    twist: 0.62
  };

  // 6. FOLLOW-THROUGH (Two-hand classic wrap)
  const FOLLOW_TWO_HAND = {
    ...B.FOLLOW_TWO_HAND,
    fFoot: [B.FOLLOW_TWO_HAND.fFoot[0] + sw + sl * 0.4, B.FOLLOW_TWO_HAND.fFoot[1] + oc],
    fKnee: [B.FOLLOW_TWO_HAND.fKnee[0] + sw * 0.5, B.FOLLOW_TWO_HAND.fKnee[1] + cr * 0.3],
    pelvis: [B.FOLLOW_TWO_HAND.pelvis[0] + 2, B.FOLLOW_TWO_HAND.pelvis[1] + cr * 0.8],
    hands: [B.FOLLOW_TWO_HAND.hands[0], B.FOLLOW_TWO_HAND.hands[1] - aa * 18],
    batAng: B.FOLLOW_TWO_HAND.batAng - aa * 0.5,
    batLen: bl - 4,
    twist: 1.0
  };

  // 7. FOLLOW-THROUGH (One-hand high extension finish)
  const FOLLOW_ONE_HAND = {
    ...B.FOLLOW_ONE_HAND,
    fFoot: [B.FOLLOW_ONE_HAND.fFoot[0] + sw + sl * 0.4, B.FOLLOW_ONE_HAND.fFoot[1] + oc],
    fKnee: [B.FOLLOW_ONE_HAND.fKnee[0] + sw * 0.5, B.FOLLOW_ONE_HAND.fKnee[1] + cr * 0.3],
    pelvis: [B.FOLLOW_ONE_HAND.pelvis[0] + 2, B.FOLLOW_ONE_HAND.pelvis[1] + cr * 0.8],
    hands: [B.FOLLOW_ONE_HAND.hands[0] + 2, B.FOLLOW_ONE_HAND.hands[1] - aa * 24],
    nHand: [B.FOLLOW_ONE_HAND.nHand[0], B.FOLLOW_ONE_HAND.nHand[1] + cr * 0.5],
    batAng: B.FOLLOW_ONE_HAND.batAng - aa * 0.6,
    batLen: bl - 2,
    twist: 1.0
  };

  // 8. CHECK SWING
  const CHECK_SWING = {
    ...B.CHECK_SWING,
    fFoot: [B.CHECK_SWING.fFoot[0] + sw + sl * 0.3, B.CHECK_SWING.fFoot[1] + oc],
    hands: [B.CHECK_SWING.hands[0] + hx * 0.2, B.CHECK_SWING.hands[1] + cr * 0.5 + hh * 0.3],
    batAng: clamp(0.52 + aa * 0.2, 0.35, 0.68), // wrists held firmly before breaking 90°
    batLen: bl - 4,
    twist: 0.28
  };

  // 9. TAKE
  const TAKE = {
    ...B.TAKE,
    fFoot: [B.TAKE.fFoot[0] + sw + sl * 0.2, B.TAKE.fFoot[1] + oc],
    hands: [B.TAKE.hands[0] + hx * 0.4, B.TAKE.hands[1] + cr * 0.6 + hh * 0.5],
    batAng: ba + 0.05,
    batLen: bl,
    twist: 0.05
  };

  return {
    STANCE,
    LOAD,
    STRIDE_PLANT,
    ROTATION,
    CONTACT,
    FOLLOW: style.followThrough === 'one_hand' ? FOLLOW_ONE_HAND : FOLLOW_TWO_HAND,
    FOLLOW_TWO_HAND,
    FOLLOW_ONE_HAND,
    CHECK_SWING,
    TAKE
  };
}

/**
 * Computes the exact interpolated batter pose for any animation progress and player style.
 *
 * Keeps the timing contract intact:
 * - 0.00 to 0.42: Stance & waggle
 * - 0.42 to 0.58: Load
 * - 0.58 to 0.72: Stride plant
 * - 0.72 to 0.90: Rotation accelerating to CONTACT at exactly p = 0.90
 * - 0.90 to 1.00: Follow-through
 * - !didSwing: Check-swing / Take
 *
 * @param {Object} style - Batter style from getBatterStyle
 * @param {number} pitchProg - 0.0 to 1.0 pitch delivery progress
 * @param {boolean} didSwing - True if batter swung, false for take/check
 * @param {number} [timeMs=0] - performance.now() timestamp for waggle
 * @returns {Object} Full figure pose dictionary ready for rendering
 */
export function getBatterSwingPose(style, pitchProg, didSwing, timeMs = 0) {
  const poses = generateBatterPoses(style);

  // 1. Idle Pre-Pitch Waggle (p < 0.42)
  if (pitchProg < 0.42) {
    // Waggle gently settles as pitcher reaches the release point (p >= 0.34)
    const settle = pitchProg >= 0.34 ? Math.max(0, (0.42 - pitchProg) / 0.08) : 1.0;
    const tNow = timeMs || 0;
    const rate = 0.0085 * (style.waggleRate || 1.0);

    const pose = { ...poses.STANCE };
    pose.hands = [...poses.STANCE.hands];
    pose.nElbow = [...poses.STANCE.nElbow];
    pose.fElbow = [...poses.STANCE.fElbow];

    switch (style.waggleStyle) {
      case 'arm_flap': {
        // Joe Morgan iconic back-elbow flap
        const flap = Math.sin(tNow * rate * 1.35) * settle;
        pose.nElbow[1] += flap * 6.5;
        pose.batAng = poses.STANCE.batAng + flap * 0.06;
        pose.hands[0] += flap * 0.8;
        break;
      }
      case 'barrel_circle': {
        // Rod Carew & Wade Boggs elliptical barrel orbit
        const cx = Math.cos(tNow * rate) * settle;
        const sy = Math.sin(tNow * rate) * settle;
        pose.hands[0] += cx * 2.2;
        pose.hands[1] += sy * 1.5;
        pose.batAng = poses.STANCE.batAng + cx * 0.15;
        break;
      }
      case 'pump': {
        // Pete Rose & Jim Rice rhythmic forward/backward trigger pump
        const pump = Math.sin(tNow * rate * 1.15) * settle;
        pose.hands[0] += pump * 2.8;
        pose.hands[1] += pump * 0.9;
        pose.batAng = poses.STANCE.batAng + pump * 0.18;
        break;
      }
      case 'twitch': {
        // Carl Yastrzemski quick nervous bat waggle
        const twitch = (Math.sin(tNow * rate * 1.6) * 0.7 + Math.sin(tNow * rate * 3.2) * 0.3) * settle;
        pose.hands[0] += twitch * 2.0;
        pose.hands[1] += twitch * 1.1;
        pose.batAng = poses.STANCE.batAng + twitch * 0.22;
        break;
      }
      case 'subtle': {
        const wag = Math.sin(tNow * rate * 0.85) * settle;
        pose.batAng = poses.STANCE.batAng + wag * 0.08;
        pose.hands[0] += wag * 1.0;
        pose.hands[1] += wag * 0.6;
        break;
      }
      case 'standard':
      default: {
        const wag = Math.sin(tNow * rate) * settle;
        pose.batAng = poses.STANCE.batAng + wag * 0.13;
        pose.hands[0] += wag * 1.6;
        pose.hands[1] += wag * 1.0;
        break;
      }
    }
    return pose;
  }

  // 2. Load Phase (0.42 <= p < 0.58)
  if (pitchProg < 0.58) {
    const t = smooth((pitchProg - 0.42) / 0.16);
    return blendPose(poses.STANCE, poses.LOAD, t);
  }

  // 3. Stride Plant Phase (0.58 <= p < 0.72)
  if (pitchProg < 0.72) {
    const t = smooth((pitchProg - 0.58) / 0.14);
    return blendPose(poses.LOAD, poses.STRIDE_PLANT, t);
  }

  // 4. Decision Point (p >= 0.72)
  if (!didSwing) {
    // Check-swing vs Disciplined Take
    const agg = style.checkSwingAggression ?? 0.45;
    if (agg >= 0.42) {
      if (pitchProg < 0.84) {
        // Starts offering at pitch toward check-swing
        const t = smooth((pitchProg - 0.72) / 0.12);
        return blendPose(poses.STRIDE_PLANT, poses.CHECK_SWING, t);
      }
      // Wrists lock and ease back toward take posture while watching pitch into mitt
      const t = smooth((pitchProg - 0.84) / 0.16);
      return blendPose(poses.CHECK_SWING, poses.TAKE, t * 0.65);
    }

    // Straight disciplined take
    const t = smooth((pitchProg - 0.72) / 0.28);
    return blendPose(poses.STRIDE_PLANT, poses.TAKE, t * 0.9);
  }

  // 5. Swing: Rotation & Lag (0.72 <= p < 0.82)
  if (pitchProg < 0.82) {
    const t = smooth((pitchProg - 0.72) / 0.10);
    return blendPose(poses.STRIDE_PLANT, poses.ROTATION, t);
  }

  // 6. Swing: Drive to Contact (0.82 <= p < 0.90)
  // Reaches EXACT CONTACT at p = 0.90!
  if (pitchProg < 0.90) {
    const t = smooth((pitchProg - 0.82) / 0.08);
    return blendPose(poses.ROTATION, poses.CONTACT, t);
  }

  // 7. Follow-Through (0.90 <= p <= 1.00)
  const followTarget = style.followThrough === 'one_hand' ? poses.FOLLOW_ONE_HAND : poses.FOLLOW_TWO_HAND;
  const t = smooth((pitchProg - 0.90) / 0.10);
  return blendPose(poses.CONTACT, followTarget, t);
}
