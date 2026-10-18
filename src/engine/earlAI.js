/**
 * Earl Weaver Baseball (1987) — "Ask Earl" Tactical Advisor & AI Manager Engine
 * Based on Don Daglow's interviews with Hall of Fame Baltimore Orioles manager Earl Weaver
 * documented in the April 1987 issue of Computer Gaming World (#36) and "Weaver on Strategy".
 *
 * Key Pillars of Earl Weaver's Tactical Logic encoded in EWB 1.0:
 * 1. "Momentum is tomorrow's starting pitcher." Pitching, 3-run homers, and team defense win games.
 * 2. Never give away one of your 27 precious outs with a Sacrifice Bunt ("If you play for one run,
 *    that's all you'll get").
 * 3. Prefer the "Run & Hit" over the strict "Hit & Run" when a fast runner is on 1st base with < 2 outs
 *    and a low-strikeout contact hitter is at the plate—so the batter doesn't swing at a bad ball.
 * 4. Obsessive Left/Right Platoon Index Card tracking (`vsLHP` vs `vsRHP` OBA and SLG splits).
 * 5. Pitcher fatigue monitoring (`pitchCount` vs `fatigue * 13` threshold) and ballpark geometry awareness.
 */

import { getEffectivePlatoonMatchup } from './statsMatrix.js';
import { getWallAtAngle } from '../data/ballparks.js';

/**
 * Extracts normalized state fields from `gameState` regardless of minor caller schema variations
 */
function extractSituation(gameState = {}) {
  const inning = gameState.inning ?? 1;
  const half = gameState.half || (gameState.isTopInning === false ? 'BOTTOM' : 'TOP');
  const outs = gameState.outs ?? 0;
  const count = gameState.count || { balls: gameState.balls ?? 0, strikes: gameState.strikes ?? 0 };
  const bases = gameState.bases || [null, null, null];

  const batter = gameState.batter || gameState.currentBatter || {
    name: 'Current Batter',
    bats: 'R',
    ratings: { power: 6, contact: 6, runs: 6 },
    splits: {}
  };
  const pitcher = gameState.pitcher || gameState.currentPitcher || {
    name: 'Current Pitcher',
    throws: 'R',
    ratings: { speed: 7, control: 7, fatigue: 7 },
    splits: {}
  };
  const park = gameState.park || gameState.ballpark || {
    id: 'memorial',
    name: 'Memorial Stadium',
    surface: 'Grass',
    environment: 'Outdoor',
    prevailingWind: 'Left to Right',
    avgWindMph: 8,
    fenceDistances: [309, 335, 365, 380, 400, 400, 380, 365, 335, 309],
    fenceHeights: [14, 14, 7, 7, 7, 7, 7, 14, 14]
  };

  const pitcherPitchCount =
    gameState.pitcherPitchCount ??
    pitcher.pitchCount ??
    gameState.pitchCount ??
    45;

  const awayScore = gameState.awayScore ?? gameState.score?.away ?? 0;
  const homeScore = gameState.homeScore ?? gameState.score?.home ?? 0;
  const isOffenseTop = String(half).toUpperCase().startsWith('T');
  const offenseScore = isOffenseTop ? awayScore : homeScore;
  const defenseScore = isOffenseTop ? homeScore : awayScore;
  const scoreDiff = offenseScore - defenseScore;

  return {
    inning,
    half,
    outs,
    count,
    bases,
    batter,
    pitcher,
    park,
    pitcherPitchCount,
    offenseScore,
    defenseScore,
    scoreDiff
  };
}

/**
 * Formats a `.312` style batting stat string
 */
function fmtStat(val) {
  const num = Number(val) || 0;
  return num.toFixed(3).replace(/^0/, '');
}

/**
 * "Ask Earl" Interactive Tactical Advisor (`askEarlAdvisor(gameState)`)
 *
 * Returns `{ headline, recommendation, reasoning, earlQuote, suggestedOffensePlay, suggestedDefensePlay }`
 */
export function askEarlAdvisor(gameState = {}) {
  const sit = extractSituation(gameState);
  const {
    inning,
    outs,
    count,
    bases,
    batter,
    pitcher,
    park,
    pitcherPitchCount,
    scoreDiff
  } = sit;

  const matchup = getEffectivePlatoonMatchup(batter, pitcher, pitcherPitchCount);
  const [r1, r2, r3] = bases;
  const runner1Speed = r1?.ratings?.runs ?? r1?.ratings?.speed ?? 0;

  // Determine pull-side wall geometry for ballpark context
  const pullAngle = matchup.effectiveBatterHand === 'L' ? 35 : -35;
  const pullWall = getWallAtAngle(park, pullAngle);

  let suggestedOffensePlay = 'NORMAL';
  let suggestedDefensePlay = 'NORMAL';
  let headline = '';
  let recommendation = '';
  let reasoning = '';
  let earlQuote = '';

  // --- OFFENSIVE TACTICAL EVALUATION ---
  // Case 1: Runner on 1st (or 1st & 2nd), 0 outs, close game — Classic situation where conventional managers bunt, and Earl Weaver refuses!
  if ((r1 && !r2 && !r3 && outs < 2 && runner1Speed >= 7 && matchup.contactRating >= 6)) {
    suggestedOffensePlay = 'RUN_AND_HIT';
    headline = `CALL THE RUN & HIT — DON'T GIVE UP AN OUT!`;
    recommendation = `Offense: Run & Hit with ${r1.name || 'the runner'} on 1st (${runner1Speed}/10 speed) and ${batter.name} at the plate.`;
    reasoning = [
      `Other managers would lay down a sacrifice bunt here, and that's why they lose! Your most precious commodity is your 27 outs.`,
      `${r1.name || 'Your runner'} has ${runner1Speed}/10 speed on first and ${batter.name} makes high-rate contact (${matchup.contactRating}/10 contact).`,
      `Put on the Run & Hit: the runner breaks on the pitch to stay out of the double play, and if the pitch is in the strike zone ${batter.name} drives it through the vacated hole. If it's a ball, he takes it and you've got a stolen base!`,
      `Matchup Index Card: ${batter.name} (${matchup.effectiveBatterHand}HB) vs ${pitcher.name} (${matchup.pitcherHand}HP) projects ${fmtStat(matchup.combinedObp)} OBA / ${fmtStat(matchup.combinedSlg)} SLG.`
    ].join(' ');
    earlQuote = `"If you play for one run, that's all you'll get! Never give away one of your 27 outs with a sacrifice bunt when you can Run & Hit and play for a three-run inning!"`;
  } else if ((r1 || r2) && outs === 0 && Math.abs(scoreDiff) <= 1 && matchup.powerRating >= 4) {
    // Conventional bunt situation where runner is slow — Earl explicitly warns against bunting!
    suggestedOffensePlay = 'NORMAL';
    headline = `PUT THE BUNT SIGN AWAY — SWING AWAY FOR THE BIG INNING!`;
    recommendation = `Offense: Swing Away (Normal) with ${batter.name}. Refuse the Sacrifice Bunt!`;
    reasoning = [
      `Conventional textbook managers love to sacrifice bunt with nobody out in a tight game, trading 1 of your 3 outs in the inning just to move a runner 90 feet.`,
      `My Orioles index cards prove that giving away outs lowers your total run expectancy! ${batter.name} has ${matchup.powerRating}/10 power (${fmtStat(matchup.combinedObp)} OBA / ${fmtStat(matchup.combinedSlg)} SLG vs ${matchup.pitcherHand === 'L' ? 'LHP' : 'RHP'}).`,
      `Pull-side wall at ${park.name} is ${pullWall.distanceFt} ft (${pullWall.heightFt} ft high). Let ${batter.name} drive the ball into the alley or over the fence!`
    ].join(' ');
    earlQuote = `"On my club, nobody bunts unless the pitcher's hitting—and thank goodness for the DH! The best play in baseball is a walk, a base hit, and a three-run homer!"`;
  } else if (matchup.isPitcherTired) {
    // Pitcher is past their stamina threshold!
    suggestedOffensePlay = count.balls >= 2 && count.strikes === 0 ? 'TAKE_PITCH' : 'NORMAL';
    headline = `${pitcher.name.toUpperCase()} IS OUT OF GAS (${pitcherPitchCount} PITCHES)!`;
    recommendation = `Offense: Work the count & look for a belt-high mistake (${pitcher.name} is past his ${matchup.fatigueThreshold}-pitch stamina limit).`;
    reasoning = [
      `${pitcher.name} has thrown ${pitcherPitchCount} pitches against a fatigue rating of ${matchup.fatigueRating}/10 (threshold: ${matchup.fatigueThreshold} pitches).`,
      `His fastball is losing life and his control is slipping (+${Math.round(matchup.fatiguePenalty * 1000)} pts to opposing OBA/SLG).`,
      `With ${batter.name} (${matchup.effectiveBatterHand}HB) holding a ${fmtStat(matchup.combinedObp)} OBA / ${fmtStat(matchup.combinedSlg)} SLG matchup, make him throw strikes or yank him for the bullpen!`
    ].join(' ');
    earlQuote = `"Watch the pitcher's release point after 95 pitches—when the ball starts staying up around the belt, that's when three-run homers happen!"`;
  } else {
    // Platoon & Ballpark analysis
    const platoonNote = matchup.isPlatoonAdvantage
      ? `Platoon Advantage (${matchup.effectiveBatterHand}HB vs ${matchup.pitcherHand}HP): ${batter.name} posts a strong ${fmtStat(matchup.combinedObp)} OBA / ${fmtStat(matchup.combinedSlg)} SLG split.`
      : `Same-Side Matchup (${matchup.effectiveBatterHand}HB vs ${matchup.pitcherHand}HP): ${pitcher.name} holds the platoon edge (${fmtStat(matchup.combinedAvg)} AVG / ${fmtStat(matchup.combinedObp)} OBA).`;

    const parkNote =
      park.surface === 'Artificial Turf'
        ? `At ${park.name}, the Artificial Turf rockets grounders through the infield (0.64 bounce restitution).`
        : `${park.name} features a ${pullWall.distanceFt}-ft pull-side fence (${pullWall.heightFt} ft high) with ${park.avgWindMph || 0} mph wind (${park.prevailingWind || 'calm'}).`;

    suggestedOffensePlay = 'NORMAL';
    headline = matchup.isPlatoonAdvantage
      ? `FAVORABLE PLATOON SPLIT FOR ${batter.name.toUpperCase()}`
      : `TOUGH SAME-SIDE MATCHUP — WORK THE COUNT FOR A WALK`;
    recommendation = `Offense: Normal Swing (${batter.name} vs ${pitcher.name}).`;
    reasoning = `${platoonNote} ${parkNote} Wait for a pitch in the strike zone—a base on balls is just as good as a single to start a rally!`;
    earlQuote = `"Check the index cards in my back pocket: every batter has a split against lefties and righties, and every ballpark wall changes where doubles and homers live."`;
  }

  // --- DEFENSIVE TACTICAL EVALUATION ---
  if (r3 && outs < 2 && inning >= 7 && scoreDiff >= 0 && scoreDiff <= 1) {
    suggestedDefensePlay = 'INFIELD_IN';
    recommendation += ` | Defense: Bring the Infield In to cut off the tying/go-ahead run at the plate.`;
  } else if (matchup.powerRating >= 9 && r2 && !r1 && outs > 0 && Math.abs(scoreDiff) <= 2) {
    suggestedDefensePlay = 'PITCH_AROUND';
    recommendation += ` | Defense: Pitch Around ${batter.name} (${matchup.powerRating}/10 Power) with first base open!`;
  } else if (r1 && runner1Speed >= 8 && outs < 2) {
    suggestedDefensePlay = 'HOLD_RUNNER';
    recommendation += ` | Defense: Hold ${r1.name || 'the runner'} close at 1st base (${runner1Speed}/10 speed).`;
  } else if (inning >= 8 && outs < 2 && !r1 && scoreDiff < 0 && scoreDiff >= -2) {
    suggestedDefensePlay = 'GUARD_LINES';
    recommendation += ` | Defense: Guard the Lines late to prevent a cheap extra-base hit down the chalk.`;
  }

  return {
    headline,
    recommendation,
    reasoning,
    earlQuote,
    suggestedOffensePlay,
    suggestedDefensePlay,
    matchupSummary: {
      batterHand: matchup.effectiveBatterHand,
      pitcherHand: matchup.pitcherHand,
      isPlatoonAdvantage: matchup.isPlatoonAdvantage,
      projectedAvg: matchup.combinedAvg,
      projectedObp: matchup.combinedObp,
      projectedSlg: matchup.combinedSlg,
      isPitcherTired: matchup.isPitcherTired,
      pitcherPitchCount,
      fatigueThreshold: matchup.fatigueThreshold,
      pullWallDistanceFt: pullWall.distanceFt,
      pullWallHeightFt: pullWall.heightFt
    }
  };
}

/**
 * Autonomous AI Manager Decision Engine (`chooseAIManagerPlay(gameState, manager)`)
 * Evaluates a manager's 19-parameter EWB personality profile (Earl Weaver, Whitey Herzog,
 * Sparky Anderson, or custom Commissioner's Disk manager) to select offensive & defensive calls.
 */
export function chooseAIManagerPlay(gameState = {}, manager = {}) {
  const sit = extractSituation(gameState);
  const { inning, outs, count, bases, batter, pitcher, pitcherPitchCount, scoreDiff } = sit;
  const matchup = getEffectivePlatoonMatchup(batter, pitcher, pitcherPitchCount);
  const [r1, r2, r3] = bases;

  // Normalize manager tendencies from managers.js (1-10 scale or 0.0-1.0 scale)
  const p = manager.tendencies || manager.params || manager.ratings || manager || {};
  const scale = (val, fallback) => {
    if (val === undefined || val === null) return fallback;
    const num = Number(val);
    if (!Number.isFinite(num)) return fallback;
    return num >= 1 && Number.isInteger(num) ? num / 10 : num > 1 ? num / 10 : num;
  };

  const isEarl = String(manager.id || manager.name || '').toLowerCase().includes('weaver');
  const stealFreq = scale(p.steal2nd ?? p.steal ?? p.stealFreq, isEarl ? 0.30 : 0.55);
  const runAndHitFreq = scale(p.runAndHit, isEarl ? 0.90 : 0.50);
  const hitAndRunFreq = scale(p.hitAndRun, isEarl ? 0.30 : 0.50);
  const buntFreq = scale(p.sacBunt ?? p.bunt, isEarl ? 0.10 : 0.45);
  const pitchAroundFreq = scale(p.pitchAround ?? p.intentionalWalk, 0.50);

  let offensePlay = 'NORMAL';
  let defensePlay = 'NORMAL';
  const runner1Speed = r1?.ratings?.runs ?? r1?.ratings?.speed ?? 0;

  // 1. Offensive play selection
  if (r1 && !r2 && outs < 2 && runner1Speed >= 7) {
    if ((isEarl || runAndHitFreq >= hitAndRunFreq) && matchup.contactRating >= 6 && Math.random() < runAndHitFreq * 0.45) {
      offensePlay = 'RUN_AND_HIT';
    } else if (runner1Speed >= 8 && Math.random() < stealFreq * 0.35) {
      offensePlay = 'STEAL';
    } else if (matchup.contactRating >= 7 && Math.random() < hitAndRunFreq * 0.35) {
      offensePlay = 'HIT_AND_RUN';
    }
  } else if ((r1 || r2) && !r3 && outs === 0 && Math.abs(scoreDiff) <= 1 && matchup.powerRating <= 4) {
    if (!isEarl && Math.random() < buntFreq * 0.40) {
      offensePlay = 'SACRIFICE_BUNT';
    }
  }

  // 2. Defensive play selection
  if (r3 && outs < 2 && inning >= 7 && Math.abs(scoreDiff) <= 1) {
    defensePlay = 'INFIELD_IN';
  } else if (matchup.powerRating >= 9 && (r2 || r3) && !r1 && outs > 0 && count.balls >= 2) {
    if (Math.random() < pitchAroundFreq * 0.65) {
      defensePlay = count.balls === 3 ? 'INTENTIONAL_WALK' : 'PITCH_AROUND';
    }
  } else if (r1 && runner1Speed >= 8 && outs < 2) {
    if (count.balls >= 1 && count.strikes <= 1 && Math.random() < 0.14) {
      defensePlay = 'PITCH_OUT';
    } else {
      defensePlay = 'HOLD_RUNNER';
    }
  } else if (inning >= 8 && scoreDiff < 0 && scoreDiff >= -2 && !r1) {
    defensePlay = 'GUARD_LINES';
  }

  // 3. Bullpen hook evaluation using manager's relievePitcherAfter threshold or stamina limit
  const fatigueLimit = p.relievePitcherAfter
    ? Math.min(matchup.fatigueThreshold, p.relievePitcherAfter)
    : matchup.fatigueThreshold;
  const shouldWarmUpReliever = pitcherPitchCount >= fatigueLimit - 12;
  const shouldChangePitcher = pitcherPitchCount >= fatigueLimit && (r1 || r2 || r3 || inning >= 7);

  return {
    offensePlay,
    defensePlay,
    shouldWarmUpReliever,
    shouldChangePitcher,
    managerNote: `${manager.name || 'Manager'} signals ${offensePlay} on offense / ${defensePlay} on defense.`
  };
}
