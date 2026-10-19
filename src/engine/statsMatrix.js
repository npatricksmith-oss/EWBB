/**
 * Earl Weaver Baseball (1987) — Stage 1: Statistical Matchup Matrix
 * Based on Don Daglow & Eddie Dombrower's Two-Stage Play Resolution Pipeline.
 *
 * Stage 1 evaluates the L/R platoon matchup between Batter and Pitcher,
 * pitcher stamina/fatigue degradation, count leverage, and Manager tactical calls
 * to produce either:
 *   1. A non-batted pitch outcome ('BALL', 'CALLED_STRIKE', 'SWINGING_STRIKE', 'FOUL', 'HBP')
 *   2. Or 'IN_PLAY' accompanied by a 3D batted-ball launch vector (`launchVector`)
 *      that is handed off to Stage 2 (`physicsEngine.js`) where ballpark geometry,
 *      wind, turf/grass physics, and fielder speeds determine the actual result.
 */

const DEG_TO_RAD = Math.PI / 180;
const MPH_TO_FPS = 1.46667;

/**
 * Normalizes offensive play names from UI codes or human-readable labels
 */
export function normalizeOffensePlay(play) {
  if (!play) return 'NORMAL';
  const key = String(play).trim().toUpperCase().replace(/[\s&-]+/g, '_');
  if (key.includes('RUN_AND_HIT') || key.includes('RUN_HIT')) return 'RUN_AND_HIT';
  if (key.includes('HIT_AND_RUN') || key.includes('HIT_RUN')) return 'HIT_AND_RUN';
  if (key.includes('SACRIFICE') || key === 'SAC_BUNT') return 'SACRIFICE_BUNT';
  if (key.includes('BUNT_FOR_HIT') || key === 'DRAG_BUNT') return 'BUNT_FOR_HIT';
  if (key.includes('SQUEEZE')) return 'SQUEEZE_BUNT';
  if (key.includes('STEAL')) return 'STEAL';
  if (key.includes('TAKE')) return 'TAKE_PITCH';
  return 'NORMAL';
}

/**
 * Normalizes defensive play names from UI codes or human-readable labels
 */
export function normalizeDefensePlay(play) {
  if (!play) return 'NORMAL';
  const key = String(play).trim().toUpperCase().replace(/[\s&-]+/g, '_');
  if (key.includes('INTENTIONAL_WALK') || key === 'IBB') return 'INTENTIONAL_WALK';
  if (key.includes('PITCH_OUT') || key === 'PITCHOUT') return 'PITCH_OUT';
  if (key.includes('PITCH_AROUND')) return 'PITCH_AROUND';
  if (key.includes('INFIELD_IN')) return 'INFIELD_IN';
  if (key.includes('GUARD_LINES')) return 'GUARD_LINES';
  if (key.includes('CHARGE_BUNT') || key.includes('BUNT_DEFENSE')) return 'CHARGE_BUNT';
  if (key.includes('HOLD_RUNNER') || key.includes('HOLD')) return 'HOLD_RUNNER';
  if (key.includes('DEEP')) return 'OUTFIELD_DEEP';
  return 'NORMAL';
}

/**
 * Extracts normalized L/R platoon split stats for a batter against a pitcher's throwing hand.
 * Also computes effective batter box side ('L' or 'R') accounting for switch-hitters ('S').
 */
export function getEffectivePlatoonMatchup(batter = {}, pitcher = {}, pitcherPitchCount = 0) {
  const pitcherHand = (pitcher.throws || 'R').toUpperCase() === 'L' ? 'L' : 'R';
  const rawBatterHand = (batter.bats || 'R').toUpperCase();
  // Switch-hitters ('S') bat Right against LHP, Left against RHP
  const effectiveBatterHand =
    rawBatterHand === 'S'
      ? (pitcherHand === 'L' ? 'R' : 'L')
      : (rawBatterHand === 'L' ? 'L' : 'R');

  const bSplits = batter.splits || {};
  const bSplit =
    (pitcherHand === 'L'
      ? (bSplits.L || bSplits.vsLHP || bSplits.left)
      : (bSplits.R || bSplits.vsRHP || bSplits.right)) ||
    bSplits.T ||
    batter.stats ||
    {};
  const bTotal = bSplits.T || bSplit || {};

  const pSplits = pitcher.splits || {};
  const pSplit =
    (effectiveBatterHand === 'L'
      ? (pSplits.L || pSplits.vsLHB || pSplits.left)
      : (pSplits.R || pSplits.vsRHB || pSplits.right)) ||
    pSplits.T ||
    pitcher.stats ||
    {};

  const bRatings = batter.ratings || {};
  const pRatings = pitcher.ratings || {};

  // Pitcher fatigue threshold: fatigue rating (1-10) * 13 pitches
  const fatigueRating = pRatings.fatigue ?? pRatings.stamina ?? 7;
  const fatigueThreshold = fatigueRating * 13;
  const overPitches = Math.max(0, pitcherPitchCount - fatigueThreshold);
  // Fatigue penalty scales progressively once past threshold
  const fatiguePenalty = overPitches > 0 ? Math.min(0.075, overPitches * 0.002) : 0;

  // Extract batter's platoon split numbers (with fallback to Total split)
  const bAb = Math.max(1, bSplit.AB ?? bSplit.ab ?? bTotal.AB ?? 500);
  const bAvg = bSplit.BA ?? bSplit.avg ?? bSplit.ba ?? bTotal.BA ?? 0.275;
  const bObp = bSplit.OBA ?? bSplit.obp ?? bSplit.oba ?? bTotal.OBA ?? Math.min(0.450, bAvg + 0.068);
  const bSlg = bSplit.SA ?? bSplit.slg ?? bTotal.SA ?? (bAvg + 0.145);
  const bHr = bSplit.HR ?? bSplit.hr ?? bTotal.HR ?? 15;
  const b2B = bSplit.d2B ?? bSplit['2B'] ?? bTotal.d2B ?? 28;
  const b3B = bSplit.d3B ?? bSplit['3B'] ?? bTotal.d3B ?? 3;
  const bBb = bSplit.BB ?? bSplit.bb ?? bTotal.BB ?? 55;
  const bSo = bSplit.SO ?? bSplit.so ?? bTotal.SO ?? 75;
  const bPa = bAb + bBb;

  const bHrPerAb = bSplit.hrRate ?? Math.max(0.002, bHr / bAb);
  const b2BPerAb = Math.max(0.015, b2B / bAb);
  const b3BPerAb = Math.max(0.001, b3B / bAb);
  const bBbRate = bSplit.bbRate ?? Math.max(0.025, bBb / bPa);
  const bSoRate = bSplit.soRate ?? bSplit.kRate ?? Math.max(0.035, bSo / bPa);

  // Extract pitcher's L/R opponent split relative to rotation baseline (.222 AVG, .282 OBA, .335 SA)
  const pAvgAgainst = pSplit.BA ?? pSplit.avg ?? pSplit.ba ?? pSplit.avgAgainst ?? 0.222;
  const pObpAgainst = pSplit.OBA ?? pSplit.obp ?? pSplit.oba ?? (pAvgAgainst + 0.060);
  const pSlgAgainst = pSplit.SA ?? pSplit.slg ?? (pAvgAgainst + 0.115);

  // Modulate batter's true platoon split by pitcher quality differential (centered at 1.0 for the BAL/BOS staff mean)
  const pHitFactor = Math.max(0.84, Math.min(1.18, 0.72 + 0.28 * (pAvgAgainst / 0.222)));
  const pObpFactor = Math.max(0.85, Math.min(1.18, 0.74 + 0.26 * (pObpAgainst / 0.282)));
  const pSlgFactor = Math.max(0.84, Math.min(1.20, 0.74 + 0.26 * (pSlgAgainst / 0.335)));

  const combinedAvg = Math.max(0.175, Math.min(0.410, bAvg * pHitFactor + fatiguePenalty * 0.45));
  const combinedObp = Math.max(combinedAvg + 0.020, Math.min(0.495, bObp * pObpFactor + fatiguePenalty * 0.60));
  const combinedSlg = Math.max(combinedAvg + 0.035, Math.min(0.740, bSlg * pSlgFactor + fatiguePenalty * 0.85));

  const combinedBbRate = Math.max(0.025, Math.min(0.220, bBbRate * pObpFactor + fatiguePenalty * 0.25));
  const combinedSoRate = Math.max(0.035, Math.min(0.320, bSoRate * (2 - pHitFactor) - fatiguePenalty * 0.20));
  const combinedHrPerAb = Math.max(0.002, Math.min(0.115, bHrPerAb * pSlgFactor + fatiguePenalty * 0.08));
  const combined2BPerAb = Math.max(0.015, Math.min(0.115, b2BPerAb * pHitFactor));
  const combined3BPerAb = Math.max(0.001, Math.min(0.030, b3BPerAb));

  // Derive power & contact ratings (1-10)
  const iso = Math.max(0, combinedSlg - combinedAvg);
  const powerRating = bRatings.power ?? Math.min(10, Math.max(1, Math.round(iso * 38 + bHrPerAb * 75)));
  const contactRating = bRatings.contact ?? bRatings.hitAndRun ?? Math.min(10, Math.max(1, Math.round((1 - combinedSoRate) * 10.5)));

  return {
    pitcherHand,
    effectiveBatterHand,
    isPlatoonAdvantage: effectiveBatterHand !== pitcherHand,
    fatigueRating,
    fatigueThreshold,
    isPitcherTired: overPitches > 0,
    fatiguePenalty,
    combinedAvg,
    combinedObp,
    combinedSlg,
    combinedBbRate,
    combinedSoRate,
    combinedHrPerAb,
    combined2BPerAb,
    combined3BPerAb,
    powerRating,
    contactRating
  };
}

/**
 * Selects pitch type, speed (MPH), and 3D home-plate crossing trajectory
 * for the right-1/3 Batter/Pitcher Duel view in EWB 1.0.
 */
function generatePitchDelivery(pitcher = {}, effectiveBatterHand = 'R', count = { balls: 0, strikes: 0 }, offPlay = 'NORMAL', defPlay = 'NORMAL', fatiguePenalty = 0) {
  const pRatings = pitcher.ratings || {};
  const speedRating = pRatings.speed ?? pRatings.velocity ?? 6;
  const controlRating = pRatings.control ?? 6;
  const fatigueMphDrop = fatiguePenalty > 0 ? Math.min(4.5, fatiguePenalty * 55) : 0;

  // Base fastball velocity: 82 + speed * 1.6 mph
  const fastballBaseMph = 82 + speedRating * 1.6 - fatigueMphDrop;

  // Special defensive plays override pitch selection
  if (defPlay === 'INTENTIONAL_WALK') {
    const sideSign = effectiveBatterHand === 'L' ? -1 : 1;
    return {
      pitchType: 'INTENTIONAL_BALL',
      pitchName: 'Intentional Ball',
      velocityMph: Math.round((66 + Math.random() * 4) * 10) / 10,
      plateX: sideSign * (2.6 + Math.random() * 0.4),
      plateZ: 3.4 + Math.random() * 0.4,
      curveBreakX: 0,
      curveBreakZ: -0.1,
      inStrikeZone: false
    };
  }

  if (defPlay === 'PITCH_OUT') {
    const sideSign = effectiveBatterHand === 'L' ? -1 : 1;
    return {
      pitchType: 'PITCH_OUT',
      pitchName: 'Pitchout Fastball',
      velocityMph: Math.round((fastballBaseMph + 0.5) * 10) / 10,
      plateX: sideSign * (2.1 + Math.random() * 0.35),
      plateZ: 3.6 + Math.random() * 0.35,
      curveBreakX: 0,
      curveBreakZ: 0.1,
      inStrikeZone: false
    };
  }

  // Select repertoire based on pitcher's actual pitches array or default repertoire
  const rawPitches = pitcher.pitches || pitcher.repertoire || ['4-Seam Fastball', 'Curveball', 'Changeup', 'Slider'];
  let pitchType = 'FOUR_SEAM';
  let pitchName = rawPitches[0] || 'Fastball';
  const r = Math.random();
  const isFastballCount = count.balls >= 2 && count.balls > count.strikes;

  const pickIndex = isFastballCount && r < 0.68
    ? 0
    : r < 0.48
    ? 0
    : r < 0.68
    ? Math.min(rawPitches.length - 1, 1)
    : r < 0.85
    ? Math.min(rawPitches.length - 1, 2)
    : Math.min(rawPitches.length - 1, 3);

  pitchName = rawPitches[pickIndex] || 'Fastball';
  const upperName = pitchName.toUpperCase();
  if (upperName.includes('SLIDER')) pitchType = 'SLIDER';
  else if (upperName.includes('CURVE')) pitchType = 'CURVEBALL';
  else if (upperName.includes('CHANGE') || upperName.includes('PALM') || upperName.includes('FORK') || upperName.includes('SCREW') || upperName.includes('SPLIT')) pitchType = 'CHANGEUP';
  else pitchType = 'FOUR_SEAM';

  const handSign = (pitcher.throws || 'R').toUpperCase() === 'L' ? -1 : 1;
  let velocityMph = fastballBaseMph;
  let curveBreakX = -0.15 * handSign;
  let curveBreakZ = 0.25;

  if (pitchType === 'SLIDER') {
    velocityMph = fastballBaseMph - (5.5 + Math.random() * 2.5);
    curveBreakX = 0.65 * handSign;
    curveBreakZ = -0.45;
  } else if (pitchType === 'CURVEBALL') {
    velocityMph = fastballBaseMph - (10.5 + Math.random() * 3.5);
    curveBreakX = 0.45 * handSign;
    curveBreakZ = -1.15;
  } else if (pitchType === 'CHANGEUP') {
    velocityMph = fastballBaseMph - (8.0 + Math.random() * 2.5);
    curveBreakX = -0.35 * handSign;
    curveBreakZ = -0.60;
  } else {
    velocityMph = fastballBaseMph + (Math.random() * 2.4 - 1.2);
  }

  const controlScatter = Math.max(0.32, (11 - controlRating) * 0.11 + fatiguePenalty * 3.2);
  const nibblingFactor = defPlay === 'PITCH_AROUND' ? 1.45 : 1.0;

  const targetCornerX = (Math.random() < 0.5 ? -1 : 1) * (0.48 * nibblingFactor);
  const targetZ = 2.45 + (Math.random() - 0.5) * 1.0 * nibblingFactor;

  const plateX = Math.round((targetCornerX + (Math.random() - 0.5) * 2 * controlScatter) * 100) / 100;
  const plateZ = Math.round(Math.max(0.35, targetZ + (Math.random() - 0.5) * 2 * controlScatter * 1.15) * 100) / 100;

  const inStrikeZone = Math.abs(plateX) <= 0.78 && plateZ >= 1.55 && plateZ <= 3.55;

  return {
    pitchType,
    pitchName,
    velocityMph: Math.round(velocityMph * 10) / 10,
    plateX,
    plateZ,
    curveBreakX: Math.round(curveBreakX * 100) / 100,
    curveBreakZ: Math.round(curveBreakZ * 100) / 100,
    inStrikeZone
  };
}

/**
 * Generates the Stage 1 3D Batted-Ball Launch Vector once contact puts the ball IN_PLAY.
 * Follows Don Daglow's 1987 CGW architecture:
 *   1. Uses the batter/pitcher platoon split probabilities (`combinedAvg`, `combinedHrPerAb`,
 *      `combined2BPerAb`, `combined3BPerAb`) to roll the intended batted-ball tier.
 *   2. Samples a realistic 3D launch vector (`exitVelocityMph`, `launchAngleDeg`, `sprayAngleDeg`)
 *      from that tier's sub-table so Stage 2 (`physicsEngine.js`) resolves the play physically!
 */
export function generateBattedBallLaunchVector(batter = {}, pitcher = {}, matchup = {}, pitchDelivery = {}, offPlay = 'NORMAL', defPlay = 'NORMAL') {
  const bRatings = batter.ratings || {};
  const power = matchup.powerRating ?? bRatings.power ?? 5;
  const speed = bRatings.runs ?? bRatings.speed ?? 5;
  const fbPct = (bRatings.fbPct ?? 45) / 100;

  // Handle Bunt plays explicitly
  const isBunt =
    offPlay === 'SACRIFICE_BUNT' ||
    offPlay === 'BUNT_FOR_HIT' ||
    offPlay === 'SQUEEZE_BUNT';

  if (isBunt) {
    const buntSpeedMph = offPlay === 'BUNT_FOR_HIT'
      ? 36 + Math.random() * 14
      : 26 + Math.random() * 13;
    const downThird = offPlay === 'BUNT_FOR_HIT'
      ? true
      : Math.random() < 0.58;
    const sprayAngleDeg = downThird
      ? -(23 + Math.random() * 16)
      : (23 + Math.random() * 16);
    const launchAngleDeg = -8 + Math.random() * 11;
    const launchRad = launchAngleDeg * DEG_TO_RAD;
    const sprayRad = sprayAngleDeg * DEG_TO_RAD;
    const exitVelocityFps = buntSpeedMph * MPH_TO_FPS;
    const horizSpeedFps = exitVelocityFps * Math.cos(launchRad);

    return {
      contactType: 'BUNT',
      intendedResult: 'BUNT',
      buntType: offPlay,
      exitVelocityMph: Math.round(buntSpeedMph * 10) / 10,
      exitVelocityFps: Math.round(exitVelocityFps * 10) / 10,
      launchAngleDeg: Math.round(launchAngleDeg * 10) / 10,
      sprayAngleDeg: Math.round(sprayAngleDeg * 10) / 10,
      vx: Math.round(horizSpeedFps * Math.sin(sprayRad) * 100) / 100,
      vy: Math.round(horizSpeedFps * Math.cos(sprayRad) * 100) / 100,
      vz: Math.round(exitVelocityFps * Math.sin(launchRad) * 100) / 100,
      spinRateRpm: 600,
      batterHand: matchup.effectiveBatterHand,
      speedRating: speed
    };
  }

  // Compute per-Ball-In-Play (BIP) probabilities from the batter/pitcher platoon split
  const soPerAb = Math.min(0.42, (matchup.combinedSoRate || 0.12) / Math.max(0.55, 1 - (matchup.combinedBbRate || 0.09)));
  const bipPerAb = Math.max(0.55, 1 - soPerAb);

  // Calibrate BIP sub-table probabilities to account for Stage 2 defensive plays, wall caroms, and ground-ball singles
  // (the OUT sub-table converts only ~1% of balls into hits now that every landing bounces, so the hit tiers carry ~97%)
  const hrPerBip = Math.min(0.16, ((matchup.combinedHrPerAb || 0.03) / bipPerAb) * 0.98);
  const triplePerBip = Math.min(0.04, ((matchup.combined3BPerAb || 0.005) / bipPerAb) * 0.72);
  const doublePerBip = Math.min(0.18, ((matchup.combined2BPerAb || 0.05) / bipPerAb) * 0.91);
  const totalHitPerBip = Math.min(0.54, ((matchup.combinedAvg || 0.275) / bipPerAb) * 0.97);
  const singlePerBip = Math.max(0.03, totalHitPerBip - hrPerBip - triplePerBip - doublePerBip);

  const pullSign = matchup.effectiveBatterHand === 'L' ? 1 : -1;
  const bipRoll = Math.random();

  let contactType = 'GROUNDER';
  let intendedResult = 'OUT';
  let exitVelocityMph = 84;
  let launchAngleDeg = 4;
  let sprayAngleDeg = 0;

  if (bipRoll < hrPerBip) {
    // 1. DEEP DRIVE (HOME RUN / WALL CAROM) SUB-TABLE
    contactType = 'FLY_BALL';
    intendedResult = 'HOME_RUN';
    launchAngleDeg = 27.5 + Math.random() * 5.5; // 27.5°..33° optimal carry arc
    exitVelocityMph = 104.5 + Math.random() * 7.5 + (power - 5) * 0.35;
    const pullRoll = Math.random();
    if (pullRoll < 0.68) {
      sprayAngleDeg = pullSign * (15 + Math.random() * 27);
    } else if (pullRoll < 0.90) {
      sprayAngleDeg = (Math.random() - 0.5) * 28;
    } else {
      sprayAngleDeg = -pullSign * (15 + Math.random() * 25);
    }
  } else if (bipRoll < hrPerBip + triplePerBip) {
    // 2. DEEP GAP / ALLEY TRIPLE SUB-TABLE
    contactType = 'LINE_DRIVE';
    intendedResult = 'TRIPLE';
    launchAngleDeg = 11.5 + Math.random() * 3.0; // Low screaming liner that bounces at ~205 ft and skips past the outfielders into the 240+ ft alley
    exitVelocityMph = 99.0 + Math.random() * 5.0;
    const alleySign = Math.random() < 0.58 ? 1 : -1;
    sprayAngleDeg = alleySign * (17.5 + Math.random() * 3.5);
  } else if (bipRoll < hrPerBip + triplePerBip + doublePerBip) {
    // 3. ALLEY / FOUL-LINE DOUBLE SUB-TABLE
    contactType = 'LINE_DRIVE';
    intendedResult = 'DOUBLE';
    launchAngleDeg = 10.5 + Math.random() * 3.2; // Bounces in gap/down line at 185-215 ft before OF can catch in air
    exitVelocityMph = 90.0 + Math.random() * 5.5;
    if (Math.random() < 0.72) {
      const gapSign = Math.random() < 0.55 ? pullSign : -pullSign;
      sprayAngleDeg = gapSign * (17.5 + Math.random() * 4.5);
    } else {
      const lineSign = Math.random() < 0.60 ? pullSign : -pullSign;
      sprayAngleDeg = lineSign * (39.0 + Math.random() * 4.0);
    }
  } else if (bipRoll < hrPerBip + triplePerBip + doublePerBip + singlePerBip) {
    // 4. CRISP SINGLE (TEXAS LEAGUER / HOLE LINER) SUB-TABLE
    contactType = 'LINE_DRIVE';
    intendedResult = 'SINGLE';
    launchAngleDeg = 10.2 + Math.random() * 3.2; // Bounces cleanly at 165-195 ft on outfield grass in front of OF
    exitVelocityMph = 81.5 + Math.random() * 6.0;
    const holeRoll = Math.random();
    if (holeRoll < 0.38) {
      sprayAngleDeg = -20.5 - Math.random() * 4.0; // 5.5 hole between 3B and SS
    } else if (holeRoll < 0.76) {
      sprayAngleDeg = 20.5 + Math.random() * 4.0; // 3.5 hole between 1B and 2B
    } else {
      sprayAngleDeg = (Math.random() - 0.5) * 8.0; // Center grass over 2B
    }
  } else {
    // 5. ROUTINE OUT SUB-TABLE (Grounders to IF, Fly Balls to OF, Pop-Ups)
    intendedResult = 'OUT';
    const outRoll = Math.random();
    const groundOutShare = Math.max(0.35, Math.min(0.68, 0.92 - fbPct));
    const flyOutShare = Math.max(0.22, Math.min(0.52, fbPct * 0.78));

    if (outRoll < groundOutShare) {
      contactType = 'GROUNDER';
      launchAngleDeg = -9 + Math.random() * 11; // -9°..+2°
      exitVelocityMph = 72 + Math.random() * 14;
      // Directed near one of the infielders (3B: -36°, SS: -15°, 2B: +15°, 1B: +36°, P: 0°)
      const ifTargets = [-36, -15, -14, 14, 15, 36, 0];
      const baseAngle = ifTargets[Math.floor(Math.random() * ifTargets.length)];
      sprayAngleDeg = baseAngle + (Math.random() - 0.5) * 6.5;
    } else if (outRoll < groundOutShare + flyOutShare) {
      contactType = 'FLY_BALL';
      launchAngleDeg = 28 + Math.random() * 11; // 28°..39°
      exitVelocityMph = 80 + Math.random() * 8.5; // Carries 235-295 ft so OF catches it
      // Directed within reach of LF (-29°), CF (0°), or RF (+29°)
      const ofTargets = [-29, 0, 29];
      const baseAngle = ofTargets[Math.floor(Math.random() * ofTargets.length)];
      sprayAngleDeg = baseAngle + (Math.random() - 0.5) * 16;
    } else {
      contactType = 'POP_UP';
      launchAngleDeg = 52 + Math.random() * 18;
      exitVelocityMph = 64 + Math.random() * 11;
      sprayAngleDeg = (Math.random() - 0.5) * 65;
    }
  }

  sprayAngleDeg = Math.max(-44.0, Math.min(44.0, sprayAngleDeg));
  const exitVelocityFps = exitVelocityMph * MPH_TO_FPS;
  const spinRateRpm =
    contactType === 'FLY_BALL'
      ? Math.round(1800 + Math.random() * 900)
      : contactType === 'LINE_DRIVE'
      ? Math.round(1400 + Math.random() * 700)
      : Math.round(900 + Math.random() * 800);

  const launchRad = launchAngleDeg * DEG_TO_RAD;
  const sprayRad = sprayAngleDeg * DEG_TO_RAD;
  const horizSpeedFps = exitVelocityFps * Math.cos(launchRad);
  const vx = horizSpeedFps * Math.sin(sprayRad);
  const vy = horizSpeedFps * Math.cos(sprayRad);
  const vz = exitVelocityFps * Math.sin(launchRad);

  return {
    contactType,
    intendedResult,
    exitVelocityMph: Math.round(exitVelocityMph * 10) / 10,
    exitVelocityFps: Math.round(exitVelocityFps * 10) / 10,
    launchAngleDeg: Math.round(launchAngleDeg * 10) / 10,
    sprayAngleDeg: Math.round(sprayAngleDeg * 10) / 10,
    spinRateRpm,
    vx: Math.round(vx * 100) / 100,
    vy: Math.round(vy * 100) / 100,
    vz: Math.round(vz * 100) / 100,
    batterHand: matchup.effectiveBatterHand,
    speedRating: speed
  };
}

/**
 * Primary Stage 1 entry point: resolves a single pitch step in the Batter/Pitcher duel.
 */
export function resolvePitchStep(context = {}) {
  const {
    batter = { name: 'Batter', bats: 'R', ratings: { power: 5, contact: 6, runs: 5 }, splits: {} },
    pitcher = { name: 'Pitcher', throws: 'R', ratings: { speed: 6, control: 6, fatigue: 7 }, splits: {} },
    park = {},
    count = { balls: 0, strikes: 0 },
    outs = 0,
    bases = [null, null, null],
    offensePlay = 'NORMAL',
    defensePlay = 'NORMAL',
    pitcherPitchCount = 0
  } = context;

  const offPlay = normalizeOffensePlay(offensePlay);
  const defPlay = normalizeDefensePlay(defensePlay);

  const matchup = getEffectivePlatoonMatchup(batter, pitcher, pitcherPitchCount);
  const pitchDelivery = generatePitchDelivery(
    pitcher,
    matchup.effectiveBatterHand,
    count,
    offPlay,
    defPlay,
    matchup.fatiguePenalty
  );

  const finalizePitchStep = (step) => {
    const pd = step.pitchDelivery || {};
    const outcome = step.outcome || step.pitchOutcome;
    const callMap = {
      BALL: 'BALL',
      INTENTIONAL_WALK: 'INTENTIONAL WALK',
      CALLED_STRIKE: 'STRIKE CALLED!',
      SWINGING_STRIKE: 'SWING & A MISS!',
      FOUL: 'FOUL BALL',
      HBP: 'HIT BY PITCH!',
      IN_PLAY: 'BALL IN PLAY!'
    };
    return {
      ...step,
      outcome,
      pitchOutcome: step.pitchOutcome || outcome,
      pitchType: pd.pitchName || pd.pitchType || 'Fastball',
      mph: pd.velocityMph || 90,
      plateX: pd.plateX ?? 0,
      plateZ: pd.plateZ ?? 0.5,
      curveBreakX: pd.curveBreakX ?? 0,
      curveBreakZ: pd.curveBreakZ ?? 0,
      callText: callMap[outcome] || outcome
    };
  };

  // 1. Intentional Walk
  if (defPlay === 'INTENTIONAL_WALK') {
    return finalizePitchStep({
      outcome: 'INTENTIONAL_WALK',
      pitchOutcome: 'BALL',
      isIntentionalWalkPitch: true,
      pitchDelivery,
      matchup,
      offensePlay: offPlay,
      defensePlay: defPlay,
      runnerStealBonus: 0,
      pitchoutBonus: 0,
      launchVector: null,
      description: `${pitcher.name} issues an intentional walk to ${batter.name}.`
    });
  }

  // 2. Pitch Out
  if (defPlay === 'PITCH_OUT') {
    const isSqueeze = offPlay === 'SQUEEZE_BUNT';
    const pitchOutcome = isSqueeze ? 'SWINGING_STRIKE' : 'BALL';
    return finalizePitchStep({
      pitchOutcome,
      isPitchOut: true,
      pitchDelivery,
      matchup,
      offensePlay: offPlay,
      defensePlay: defPlay,
      pitchoutBonus: 0.45,
      launchVector: null,
      description: isSqueeze
        ? `Pitchout! ${batter.name} lunges wildly at the pitchout and misses—runner from third is hung out to dry!`
        : `${pitcher.name} fires a high pitchout so the catcher can gun down any runner!`
    });
  }

  // 3. Hit By Pitch (rare)
  if (!pitchDelivery.inStrikeZone && Math.random() < (0.0025 + matchup.fatiguePenalty * 0.02)) {
    return finalizePitchStep({
      pitchOutcome: 'HBP',
      pitchDelivery,
      matchup,
      offensePlay: offPlay,
      defensePlay: defPlay,
      launchVector: null,
      description: `${pitchDelivery.pitchName} inside clips ${batter.name}! Hit by pitch!`
    });
  }

  // 4. Bunt Plays (Sacrifice Bunt, Bunt for Hit, Squeeze Bunt)
  if (offPlay === 'SACRIFICE_BUNT' || offPlay === 'BUNT_FOR_HIT' || offPlay === 'SQUEEZE_BUNT') {
    if (offPlay !== 'SQUEEZE_BUNT' && !pitchDelivery.inStrikeZone && Math.random() < 0.58) {
      return finalizePitchStep({
        pitchOutcome: 'BALL',
        pitchDelivery,
        matchup,
        offensePlay: offPlay,
        defensePlay: defPlay,
        launchVector: null,
        description: `${batter.name} squares to bunt, then pulls the bat back on a ${pitchDelivery.pitchName.toLowerCase()} out of the zone.`
      });
    }

    const buntRoll = Math.random();
    if (buntRoll < 0.14) {
      return finalizePitchStep({
        pitchOutcome: 'FOUL',
        pitchDelivery,
        matchup,
        offensePlay: offPlay,
        defensePlay: defPlay,
        launchVector: null,
        description: `${batter.name} squares and bunts it foul along the baseline.`
      });
    }
    if (buntRoll < 0.21) {
      return finalizePitchStep({
        pitchOutcome: 'SWINGING_STRIKE',
        pitchDelivery,
        matchup,
        offensePlay: offPlay,
        defensePlay: defPlay,
        launchVector: null,
        description: `${batter.name} tries to lay down a bunt on the ${pitchDelivery.pitchName.toLowerCase()} and misses!`
      });
    }

    const launchVector = generateBattedBallLaunchVector(batter, pitcher, matchup, pitchDelivery, offPlay, defPlay);
    return finalizePitchStep({
      pitchOutcome: 'IN_PLAY',
      pitchDelivery,
      matchup,
      offensePlay: offPlay,
      defensePlay: defPlay,
      launchVector,
      description: `${batter.name} deadens the ${pitchDelivery.pitchName.toLowerCase()} onto the turf!`
    });
  }

  // 5. Take Pitch
  if (offPlay === 'TAKE_PITCH') {
    const isBall = !pitchDelivery.inStrikeZone || Math.random() < 0.25;
    return finalizePitchStep({
      pitchOutcome: isBall ? 'BALL' : 'CALLED_STRIKE',
      pitchDelivery,
      matchup,
      offensePlay: offPlay,
      defensePlay: defPlay,
      launchVector: null,
      description: isBall
        ? `${batter.name} takes the ${pitchDelivery.velocityMph} mph ${pitchDelivery.pitchName.toLowerCase()} for a ball.`
        : `${batter.name} takes a ${pitchDelivery.velocityMph} mph ${pitchDelivery.pitchName.toLowerCase()} on the corner—called strike!`
    });
  }

  // 6. Calibrated Pitch-by-Pitch Markov Progression matching historical BB% and SO%
  // Target PA rates from matchup:
  const targetBbRate = matchup.combinedBbRate || 0.095;
  const targetSoRate = matchup.combinedSoRate || 0.120;

  // Per-pitch ball probability tuned so P(reaching 4 balls before 3 strikes or IN_PLAY) === targetBbRate
  let ballProb = Math.max(0.22, Math.min(0.54, 0.272 + targetBbRate * 1.05));
  if (count.balls === 3) {
    // On 3-ball counts, scale Ball 4 probability directly by batter's walk discipline
    ballProb = Math.max(0.16, Math.min(0.64, targetBbRate * 3.15));
  }
  if (defPlay === 'PITCH_AROUND') {
    ballProb += 0.16;
  }
  if (offPlay === 'HIT_AND_RUN') {
    ballProb *= 0.15;
  }

  // Update visual pitch delivery coordinates to match ball/strike call so a BALL is visibly outside the zone!
  const roll = Math.random();
  if (roll < ballProb) {
    if (pitchDelivery.inStrikeZone) {
      const signX = pitchDelivery.plateX >= 0 ? 1 : -1;
      pitchDelivery.plateX = Math.round(signX * (0.88 + Math.random() * 0.45) * 100) / 100;
      pitchDelivery.inStrikeZone = false;
    }
    return finalizePitchStep({
      pitchOutcome: 'BALL',
      pitchDelivery,
      matchup,
      offensePlay: offPlay,
      defensePlay: defPlay,
      launchVector: null,
      description: `${pitchDelivery.pitchName} (${pitchDelivery.velocityMph} mph) misses outside the zone for a ball.`
    });
  }

  // Ensure strikes/in-play pitches cross in or near the strike zone visually
  if (!pitchDelivery.inStrikeZone) {
    pitchDelivery.plateX = Math.round((Math.random() - 0.5) * 1.35 * 100) / 100;
    pitchDelivery.plateZ = Math.round((1.75 + Math.random() * 1.55) * 100) / 100;
    pitchDelivery.inStrikeZone = true;
  }

  // Remaining probability is distributed between Called Strike, Swinging Strike, Foul, and In Play
  const strikeOrPlayRoll = Math.random();
  let calledStrikeRate;
  let whiffRate;
  let foulRate;

  if (count.strikes < 2) {
    calledStrikeRate = offPlay === 'HIT_AND_RUN' ? 0.03 : 0.27;
    whiffRate = Math.max(0.06, Math.min(0.28, targetSoRate * 1.22));
    foulRate = 0.24;
  } else {
    // Two-strike count: Strike 3 (called + swinging) vs Foul vs In-Play directly reflects targetSoRate!
    const twoStrikeKProb = Math.max(0.08, Math.min(0.54, targetSoRate * 2.08));
    calledStrikeRate = twoStrikeKProb * 0.28;
    whiffRate = twoStrikeKProb * 0.72;
    foulRate = park.foulGrounds === 'Large' ? 0.25 : 0.28;
  }

  if (strikeOrPlayRoll < calledStrikeRate) {
    return finalizePitchStep({
      pitchOutcome: 'CALLED_STRIKE',
      pitchDelivery,
      matchup,
      offensePlay: offPlay,
      defensePlay: defPlay,
      launchVector: null,
      description: `${pitcher.name} paints the corner with a ${pitchDelivery.velocityMph} mph ${pitchDelivery.pitchName.toLowerCase()}—called strike!`
    });
  }

  if (strikeOrPlayRoll < calledStrikeRate + whiffRate) {
    return finalizePitchStep({
      pitchOutcome: 'SWINGING_STRIKE',
      pitchDelivery,
      matchup,
      offensePlay: offPlay,
      defensePlay: defPlay,
      launchVector: null,
      description: `${batter.name} swings through a ${pitchDelivery.velocityMph} mph ${pitchDelivery.pitchName.toLowerCase()}!`
    });
  }

  if (strikeOrPlayRoll < calledStrikeRate + whiffRate + foulRate) {
    return finalizePitchStep({
      pitchOutcome: 'FOUL',
      pitchDelivery,
      matchup,
      offensePlay: offPlay,
      defensePlay: defPlay,
      launchVector: null,
      description: `${batter.name} fouls off the ${pitchDelivery.velocityMph} mph ${pitchDelivery.pitchName.toLowerCase()}.`
    });
  }

  // Contact in Fair Territory -> Stage 1 generates 3D launch vector for Stage 2 physics!
  const launchVector = generateBattedBallLaunchVector(
    batter,
    pitcher,
    matchup,
    pitchDelivery,
    offPlay,
    defPlay
  );

  return finalizePitchStep({
    pitchOutcome: 'IN_PLAY',
    pitchDelivery,
    matchup,
    offensePlay: offPlay,
    defensePlay: defPlay,
    launchVector,
    description: `${batter.name} drives the ${pitchDelivery.velocityMph} mph ${pitchDelivery.pitchName.toLowerCase()} (${launchVector.exitVelocityMph} mph off the bat, ${launchVector.launchAngleDeg}° launch)!`
  });
}
