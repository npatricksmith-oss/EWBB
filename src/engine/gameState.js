/**
 * Earl Weaver Baseball (1987) — Full Baseball Rules State Machine, Box Score & Headless Simulator
 *
 * Connects:
 * - Stage 1 Statistical Matchup Matrix (`src/engine/statsMatrix.js`)
 * - Stage 2 3D Virtual Ballfield Physics (`src/engine/physicsEngine.js`)
 * - "Ask Earl" Tactical AI (`src/engine/earlAI.js`)
 * - Rosters, Managers, and Ballparks (`src/data/`)
 *
 * Supports both:
 * 1. Pitch-by-Pitch Interactive Play (driving the 1987 Split-Screen & Full-Field Canvas)
 * 2. Instant Headless Simulation (simulating a half-inning or full 9-inning game in milliseconds)
 */

import { BALLPARKS } from '../data/ballparks.js';
import { getManager } from '../data/managers.js';
import { cloneTeamRoster } from '../data/rosters.js';
import { resolvePitchStep, normalizeOffensePlay, normalizeDefensePlay } from './statsMatrix.js';
import { simulateBattedBall } from './physicsEngine.js';
import { chooseAIManagerPlay } from './earlAI.js';

export class EWBGameState {
  constructor({
    awayTeamId = 'boston',
    homeTeamId = 'baltimore',
    parkId = 'fenway',
    awayManagerId = 'mcnamara',
    homeManagerId = 'weaver'
  } = {}) {
    this.resetGame({ awayTeamId, homeTeamId, parkId, awayManagerId, homeManagerId });
  }

  resetGame({
    awayTeamId = 'boston',
    homeTeamId = 'baltimore',
    parkId = 'fenway',
    awayManagerId = 'mcnamara',
    homeManagerId = 'weaver'
  } = {}) {
    this.awayTeam = cloneTeamRoster(awayTeamId);
    this.homeTeam = cloneTeamRoster(homeTeamId);
    this.park = JSON.parse(JSON.stringify(BALLPARKS[parkId] || BALLPARKS.fenway));
    this.awayManager = getManager(awayManagerId);
    this.homeManager = getManager(homeManagerId);

    this.inning = 1;
    this.half = 'TOP'; // 'TOP' (Away batting) | 'BOTTOM' (Home batting)
    this.outs = 0;
    this.count = { balls: 0, strikes: 0 };
    this.bases = [null, null, null]; // [1st, 2nd, 3rd]
    this.isGameOver = false;
    this.winner = null;

    this.offensePlay = 'NORMAL';
    this.defensePlay = 'NORMAL';

    // Lineup cursors (0..8)
    this.lineupIndex = { away: 0, home: 0 };

    // Active starting pitchers
    this.activePitcherIndex = { away: 0, home: 0 };
    this.usedPitcherIndices = { away: new Set([0]), home: new Set([0]) };

    // Initialize in-game box score stats on each player
    this.initBoxScore();

    // Play-by-play log (newest first)
    this.playLog = [
      {
        inning: 1,
        half: 'TOP',
        text: `⚾ Play Ball at ${this.park.name} (${this.park.city})! ${this.awayTeam.city} ${this.awayTeam.name} (${this.awayManager.name}) vs. ${this.homeTeam.city} ${this.homeTeam.name} (${this.homeManager.name}).`,
        type: 'INFO'
      }
    ];
  }

  initBoxScore() {
    this.lineScore = {
      away: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      home: [0, 0, 0, 0, 0, 0, 0, 0, 0]
    };
    this.totals = {
      away: { R: 0, H: 0, E: 0, LOB: 0 },
      home: { R: 0, H: 0, E: 0, LOB: 0 }
    };

    for (const team of [this.awayTeam, this.homeTeam]) {
      for (const b of team.lineup) {
        b.gameStats = { AB: 0, R: 0, H: 0, d2B: 0, d3B: 0, HR: 0, RBI: 0, BB: 0, SO: 0, SB: 0, CS: 0 };
      }
      for (const p of team.pitchers) {
        p.pitchCount = 0;
        p.gameStats = { IP_OUTS: 0, H: 0, R: 0, ER: 0, BB: 0, SO: 0, HR: 0 };
      }
    }
  }

  get battingSide() {
    return this.half === 'TOP' ? 'away' : 'home';
  }

  get fieldingSide() {
    return this.half === 'TOP' ? 'home' : 'away';
  }

  get battingTeam() {
    return this.half === 'TOP' ? this.awayTeam : this.homeTeam;
  }

  get fieldingTeam() {
    return this.half === 'TOP' ? this.homeTeam : this.awayTeam;
  }

  get currentBatter() {
    const side = this.battingSide;
    const team = this.battingTeam;
    const idx = this.lineupIndex[side] % 9;
    return team.starters ? team.starters[idx] : team.lineup[idx];
  }

  get currentPitcher() {
    const side = this.fieldingSide;
    const team = this.fieldingTeam;
    const idx = this.activePitcherIndex[side] || 0;
    return team.pitchers[idx] || team.pitchers[0];
  }

  get awayScore() {
    return this.totals.away.R;
  }

  get homeScore() {
    return this.totals.home.R;
  }

  get pitcherPitchCount() {
    return this.currentPitcher?.pitchCount || 0;
  }

  /**
   * Substitutes a relief pitcher from the bullpen
   */
  changePitcher(side, pitcherIdx) {
    const team = side === 'away' ? this.awayTeam : this.homeTeam;
    if (pitcherIdx >= 0 && pitcherIdx < team.pitchers.length) {
      this.activePitcherIndex[side] = pitcherIdx;
      if (this.usedPitcherIndices && this.usedPitcherIndices[side]) {
        this.usedPitcherIndices[side].add(pitcherIdx);
      }
      const newP = team.pitchers[pitcherIdx];
      this.logPlay(`🔄 Bullpen Call: ${team.city} brings in ${newP.role} ${newP.name} (${newP.throws}HP, ${newP.splits.T.ERA.toFixed(2)} ERA).`, 'SUB');
    }
  }

  /**
   * Pinch-hits or substitutes a bench player into the active 9-man batting order
   */
  pinchHit(side, starterSlotIdx, benchIdx) {
    const team = side === 'away' ? this.awayTeam : this.homeTeam;
    if (!team.starters || !team.bench) return false;
    const oldPlayer = team.starters[starterSlotIdx];
    const newPlayer = team.bench[benchIdx];
    if (!oldPlayer || !newPlayer) return false;

    // Inherit defensive position; the lifted player leaves the game for good (no re-entry)
    newPlayer.pos = oldPlayer.pos;
    team.starters[starterSlotIdx] = newPlayer;
    team.bench.splice(benchIdx, 1);
    // Keep every player who has batted in this slot so the box score retains the lifted starter's line
    team.slotHistory[starterSlotIdx].push(newPlayer);

    this.logPlay(
      `🃏 Platoon Move: ${team.city} sends up ${newPlayer.name} (${newPlayer.bats}HB) to pinch-hit for ${oldPlayer.name} at ${newPlayer.pos}!`,
      'SUB'
    );
    return true;
  }

  /**
   * Maps the 9 defensive positions ('P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF')
   * to the active fielding team's players so Stage 2 3D physics uses real player speeds, arms, and names.
   */
  getDefenseFieldersMap() {
    const fTeam = this.fieldingTeam;
    const pitcher = this.currentPitcher;
    const map = { P: pitcher };
    const starters = fTeam.starters || fTeam.lineup.slice(0, 9);
    for (const p of starters) {
      if (p.pos && p.pos !== 'DH') {
        map[p.pos] = p;
      }
    }
    return map;
  }

  logPlay(text, type = 'PLAY') {
    this.playLog.unshift({
      inning: this.inning,
      half: this.half,
      outs: this.outs,
      score: `${this.awayTeam.abbrev} ${this.awayScore} - ${this.homeTeam.abbrev} ${this.homeScore}`,
      text,
      type
    });
    if (this.playLog.length > 120) {
      this.playLog.pop();
    }
  }

  /**
   * Executes one single pitch (and if put in play, its full 3D physics resolution).
   * Returns `{ pitchStep, physicsResult, playSummary }` for either visual animation or headless sim.
   */
  stepPitch({ offensePlay, defensePlay, useAIManagers = false } = {}) {
    if (this.isGameOver) {
      return { isGameOver: true };
    }

    const batter = this.currentBatter;

    // Determine tactical plays
    if (useAIManagers) {
      const offMgr = this.half === 'TOP' ? this.awayManager : this.homeManager;
      const defMgr = this.half === 'TOP' ? this.homeManager : this.awayManager;
      const offChoice = chooseAIManagerPlay(this, offMgr);
      const defChoice = chooseAIManagerPlay(this, defMgr);
      if (defChoice.shouldChangePitcher && this.count.balls === 0 && this.count.strikes === 0) {
        const usedSet = this.usedPitcherIndices?.[this.fieldingSide] || new Set([this.activePitcherIndex[this.fieldingSide]]);
        const pitchers = this.fieldingTeam.pitchers || [];
        let relieverIdx = pitchers.findIndex((p, idx) => !usedSet.has(idx) && (p.role === 'CL' || p.role === 'RP'));
        if (relieverIdx === -1) {
          relieverIdx = pitchers.findIndex((p, idx) => !usedSet.has(idx));
        }
        if (relieverIdx !== -1) {
          this.changePitcher(this.fieldingSide, relieverIdx);
        }
      }
      this.offensePlay = normalizeOffensePlay(offensePlay || offChoice.offensePlay || 'NORMAL');
      this.defensePlay = normalizeDefensePlay(defensePlay || defChoice.defensePlay || 'NORMAL');
    } else {
      this.offensePlay = normalizeOffensePlay(offensePlay || this.offensePlay || 'NORMAL');
      this.defensePlay = normalizeDefensePlay(defensePlay || this.defensePlay || 'NORMAL');
    }

    const pitcher = this.currentPitcher;

    // Build context for Stage 1 (Stats Matrix) & Stage 2 (3D Physics)
    const context = {
      batter,
      pitcher,
      park: this.park,
      count: { ...this.count },
      outs: this.outs,
      bases: [...this.bases],
      offensePlay: this.offensePlay,
      defensePlay: this.defensePlay,
      pitcherPitchCount: pitcher.pitchCount || 0,
      fieldingTeam: this.fieldingTeam,
      battingTeam: this.battingTeam,
      defenseFielders: this.getDefenseFieldersMap(),
      runAggressively: (this.half === 'TOP' ? this.awayManager : this.homeManager)?.runAggressively ?? 5,
      // Bottom of the 9th or later: the play ends when this many runs have scored
      runsToWin: this.half === 'BOTTOM' && this.inning >= 9 ? this.awayScore - this.homeScore + 1 : null
    };

    const pitchStep = resolvePitchStep(context);

    let physicsResult = null;
    let playSummary = '';

    // Handle Intentional Walk immediately
    if (pitchStep.outcome === 'INTENTIONAL_WALK') {
      const ibbPitches = Math.max(1, 4 - (this.count.balls || 0));
      pitcher.pitchCount = (pitcher.pitchCount || 0) + ibbPitches;
      batter.gameStats.BB += 1;
      pitcher.gameStats.BB += 1;
      const runs = this.advanceForcedWalk(batter);
      playSummary = `Intentional Walk issued to ${batter.name}.${runs > 0 ? ` (${runs} run scored!)` : ''}`;
      this.logPlay(playSummary, 'WALK');
      this.nextBatter();
      this.checkEndOfHalfInning();
      return { pitchStep, physicsResult, playSummary };
    }

    pitcher.pitchCount = (pitcher.pitchCount || 0) + 1;

    // Check stolen base / Run & Hit baserunner break on non-in-play pitches
    let stealNote = '';
    const inningBeforeSteal = this.inning;
    const halfBeforeSteal = this.half;
    if (
      pitchStep.outcome !== 'IN_PLAY' &&
      pitchStep.outcome !== 'FOUL' &&
      (this.offensePlay === 'STEAL' || (this.offensePlay === 'RUN_AND_HIT' && pitchStep.outcome === 'BALL'))
    ) {
      stealNote = this.resolveStealAttempt(pitchStep);
      // If Caught Stealing recorded the 3rd out and ended the half-inning, return immediately!
      if (this.isGameOver || this.inning !== inningBeforeSteal || this.half !== halfBeforeSteal) {
        this.logPlay(stealNote, 'OUT');
        return { pitchStep, physicsResult, playSummary: stealNote };
      }
    }

    if (pitchStep.outcome === 'BALL') {
      this.count.balls += 1;
      if (this.count.balls >= 4) {
        batter.gameStats.BB += 1;
        pitcher.gameStats.BB += 1;
        const runs = this.advanceForcedWalk(batter);
        playSummary = `Ball 4 — ${batter.name} draws a walk off ${pitcher.name}.${runs > 0 ? ` ${runs} run(s) forced home!` : ''} ${stealNote}`.trim();
        this.logPlay(playSummary, 'WALK');
        this.nextBatter();
        this.checkEndOfHalfInning();
      } else {
        playSummary = `${pitchStep.pitchType} (${pitchStep.mph} mph) — Ball (${this.count.balls}-${this.count.strikes}). ${stealNote}`.trim();
        if (stealNote) this.logPlay(playSummary, 'STEAL');
      }
      return { pitchStep, physicsResult, playSummary };
    }

    if (pitchStep.outcome === 'HBP') {
      const runs = this.advanceForcedWalk(batter);
      playSummary = `${batter.name} hit by pitch!${runs > 0 ? ` ${runs} run(s) score!` : ''}`;
      this.logPlay(playSummary, 'WALK');
      this.nextBatter();
      this.checkEndOfHalfInning();
      return { pitchStep, physicsResult, playSummary };
    }

    if (pitchStep.outcome === 'CALLED_STRIKE' || pitchStep.outcome === 'SWINGING_STRIKE') {
      this.count.strikes += 1;
      const sType = pitchStep.outcome === 'SWINGING_STRIKE' ? 'Swinging strike' : 'Called strike';
      if (this.count.strikes >= 3) {
        batter.gameStats.AB += 1;
        batter.gameStats.SO += 1;
        pitcher.gameStats.SO += 1;
        pitcher.gameStats.IP_OUTS += 1;
        this.outs += 1;
        playSummary = `Strike 3 (${sType.toLowerCase()} on ${pitchStep.mph} mph ${pitchStep.pitchType}) — ${batter.name} strikes out! ${stealNote}`.trim();
        this.logPlay(playSummary, 'OUT');
        this.nextBatter();
        this.checkEndOfHalfInning();
      } else {
        playSummary = `${sType} (${pitchStep.mph} mph ${pitchStep.pitchType}) — Count ${this.count.balls}-${this.count.strikes}. ${stealNote}`.trim();
        if (stealNote) this.logPlay(playSummary, 'STEAL');
      }
      return { pitchStep, physicsResult, playSummary };
    }

    if (pitchStep.outcome === 'FOUL') {
      const isBuntAttempt = ['SACRIFICE_BUNT', 'BUNT_FOR_HIT', 'SQUEEZE_BUNT'].includes(this.offensePlay);
      if (this.count.strikes < 2) {
        this.count.strikes += 1;
      } else if (isBuntAttempt) {
        // Two-strike foul bunt is an automatic Strike 3 out!
        batter.gameStats.AB += 1;
        batter.gameStats.SO += 1;
        pitcher.gameStats.SO += 1;
        pitcher.gameStats.IP_OUTS += 1;
        this.outs += 1;
        playSummary = `Foul bunt on Strike 2 — ${batter.name} is called out on strikes!`;
        this.logPlay(playSummary, 'OUT');
        this.nextBatter();
        this.checkEndOfHalfInning();
        return { pitchStep, physicsResult, playSummary };
      }
      playSummary = `Foul ball off ${batter.name}'s bat (${this.count.balls}-${this.count.strikes}).`;
      return { pitchStep, physicsResult, playSummary };
    }

    // Stage 2: Ball is IN_PLAY -> Hand launchVector to the 3D Virtual Ballfield Physics Engine!
    if (pitchStep.outcome === 'IN_PLAY') {
      physicsResult = simulateBattedBall(pitchStep.launchVector, context);
      playSummary = this.applyPhysicsOutcome(batter, pitcher, physicsResult);
      this.nextBatter();
      this.checkEndOfHalfInning();
      // Reset single-pitch tactical overrides
      this.offensePlay = 'NORMAL';
      return { pitchStep, physicsResult, playSummary };
    }

    return { pitchStep, physicsResult, playSummary };
  }

  resolveStealAttempt(pitchStep) {
    const catcher = (this.fieldingTeam.starters || this.fieldingTeam.lineup).find((p) => p.pos === 'C') || { ratings: { arm: 6 } };
    const pitchOutBonus = this.defensePlay === 'PITCH_OUT' ? 0.35 : 0;

    // Attempt steal of 2nd if runner on 1st and 2nd is empty
    if (this.bases[0] && !this.bases[1]) {
      const runner = this.bases[0];
      const runSpeed = runner.ratings?.runs || 6;
      const cArm = catcher.ratings?.arm || 6;
      const successProb = Math.max(0.15, Math.min(0.92, 0.58 + (runSpeed - cArm) * 0.06 - pitchOutBonus));

      if (Math.random() < successProb) {
        this.bases[1] = runner;
        this.bases[0] = null;
        runner.gameStats.SB += 1;
        return `🏃 ${runner.name} steals 2nd base!`;
      } else {
        this.bases[0] = null;
        runner.gameStats.CS += 1;
        this.outs += 1;
        this.currentPitcher.gameStats.IP_OUTS += 1;
        this.checkEndOfHalfInning();
        return `🚫 ${runner.name} caught stealing 2nd (${catcher.name} gunned him down)!`;
      }
    }
    return '';
  }

  advanceForcedWalk(batter) {
    let runsScored = 0;
    if (this.bases[0] && this.bases[1] && this.bases[2]) {
      this.scoreRun(this.bases[2], batter, true, true);
      runsScored += 1;
      this.bases[2] = this.bases[1];
      this.bases[1] = this.bases[0];
      this.bases[0] = batter;
    } else if (this.bases[0] && this.bases[1]) {
      this.bases[2] = this.bases[1];
      this.bases[1] = this.bases[0];
      this.bases[0] = batter;
    } else if (this.bases[0]) {
      this.bases[1] = this.bases[0];
      this.bases[0] = batter;
    } else {
      this.bases[0] = batter;
    }
    return runsScored;
  }

  scoreRun(runner, batter, creditRBI = true, isEarned = true) {
    if (!runner) return;
    const side = this.battingSide;
    const innIdx = Math.max(0, this.inning - 1);
    while (this.lineScore[side].length <= innIdx) {
      this.lineScore[side].push(0);
    }
    this.lineScore[side][innIdx] += 1;
    this.totals[side].R += 1;
    if (runner.gameStats) runner.gameStats.R += 1;
    if (creditRBI && batter?.gameStats) batter.gameStats.RBI += 1;
    const p = this.currentPitcher;
    if (p?.gameStats) {
      p.gameStats.R += 1;
      if (isEarned) p.gameStats.ER += 1;
    }
  }

  /**
   * Moves the runners exactly as the physics engine's `runnerPlan` shows them on the field:
   * outs on the bases, runs, and the new base state. Returns the runs scored.
   */
  applyRunnerPlan(plan, batter) {
    const before = [...this.bases];
    const next = [null, null, null];
    const pitcher = this.currentPitcher;
    let runs = 0;
    for (const r of [plan.batter, ...plan.runners]) {
      const player = r.from === 0 ? batter : before[r.from - 1];
      if (!player) continue;
      if (r.out) {
        if (this.outs < 3) {
          this.outs += 1;
          pitcher.gameStats.IP_OUTS += 1;
        }
      } else if (r.scores) {
        // Every run on the plan crosses before any out on the same play (lead runners score first)
        this.scoreRun(player, batter, r.rbi, r.earned);
        runs += 1;
      } else if (r.to >= 1 && r.to <= 3) {
        next[r.to - 1] = player;
      }
    }
    this.bases = next;
    return runs;
  }

  /**
   * Translates the 3D physics outcome into official baseball scoring and box score updates.
   * Base advancement comes from `phys.runnerPlan`, the same plan the field animation plays.
   */
  applyPhysicsOutcome(batter, pitcher, phys) {
    const side = this.battingSide;
    const plan = phys.runnerPlan;
    // A game-ending play goes in the book as only what the winning run needed
    const outType = plan.creditedOutcome || phys.outcome;
    const isHit = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HOME_RUN'].includes(outType);

    if (isHit || outType === 'ERROR') {
      batter.gameStats.AB += 1;
      if (isHit) {
        batter.gameStats.H += 1;
        this.totals[side].H += 1;
        pitcher.gameStats.H += 1;
      } else {
        this.totals[this.fieldingSide].E += 1;
      }
      if (outType === 'DOUBLE') batter.gameStats.d2B += 1;
      if (outType === 'TRIPLE') batter.gameStats.d3B += 1;
      if (outType === 'HOME_RUN') {
        batter.gameStats.HR += 1;
        pitcher.gameStats.HR += 1;
      }
    } else if (outType !== 'SAC_FLY' && outType !== 'SAC_BUNT_OUT') {
      // Sacrifices are not official at-bats
      batter.gameStats.AB += 1;
    }

    const runsOnPlay = this.applyRunnerPlan(plan, batter);
    const runNote = runsOnPlay > 0 ? ` (${runsOnPlay} R scored!)` : '';

    if (outType === 'HOME_RUN') {
      const hrLabel = runsOnPlay === 4 ? 'GRAND SLAM!' : runsOnPlay === 3 ? 'EARL WEAVER 3-RUN HOMER!' : `${runsOnPlay}-RUN HOME RUN!`;
      const msg = `🎆 ${hrLabel} ${phys.description || `${batter.name} launches it ${Math.round(phys.distanceFt)} ft!`}`;
      this.logPlay(msg, 'HR');
      return msg;
    }

    const msgByOutcome = {
      TRIPLE: [`🔥 TRIPLE! ${phys.description}${runNote}`, 'HIT'],
      DOUBLE: [`⚡ DOUBLE! ${phys.description}${runNote}`, 'HIT'],
      SINGLE: [`✅ SINGLE! ${phys.description}${runNote}`, 'HIT'],
      ERROR: [`⚠️ ERROR! ${phys.description}${runNote}`, 'HIT'],
      DOUBLE_PLAY: [`🛑 DOUBLE PLAY! ${phys.description}`, 'OUT'],
      SAC_FLY: [`✈️ SACRIFICE FLY! ${phys.description} (${runsOnPlay} run scores!)`, 'OUT'],
      SAC_BUNT_OUT: [`⚾ SACRIFICE BUNT: ${phys.description}`, 'OUT']
    };
    // A game-ending fielder's choice may leave no out on the play
    if (plan.creditedOutcome === 'FIELDERS_CHOICE') msgByOutcome.FIELDERS_CHOICE = [`⚾ FIELDER'S CHOICE! ${phys.description}${runNote}`, 'PLAY'];
    // Standard outs: fly out, line out, pop out, ground out, fielder's choice
    const [msg, type] = msgByOutcome[outType] || [`🔴 OUT (${this.outs} Out): ${phys.description}`, 'OUT'];
    this.logPlay(msg, type);
    return msg;
  }

  nextBatter() {
    const side = this.battingSide;
    this.lineupIndex[side] = (this.lineupIndex[side] + 1) % 9;
    this.count = { balls: 0, strikes: 0 };
    this.offensePlay = 'NORMAL';
    if (this.defensePlay === 'INTENTIONAL_WALK' || this.defensePlay === 'PITCH_AROUND' || this.defensePlay === 'PITCH_OUT') {
      this.defensePlay = 'NORMAL';
    }
  }

  checkEndOfHalfInning() {
    // Check walk-off win in Bottom of 9th+
    if (this.inning >= 9 && this.half === 'BOTTOM' && this.homeScore > this.awayScore) {
      this.isGameOver = true;
      this.winner = this.homeTeam;
      this.logPlay(`🏆 WALK-OFF VICTORY! ${this.homeTeam.city} wins ${this.homeScore}-${this.awayScore}!`, 'FINAL');
      return;
    }

    if (this.outs < 3) return;

    // Count runners left on base
    const side = this.battingSide;
    const lob = this.bases.filter(Boolean).length;
    this.totals[side].LOB += lob;

    // Clear bases & outs
    this.bases = [null, null, null];
    this.outs = 0;
    this.count = { balls: 0, strikes: 0 };

    if (this.half === 'TOP') {
      // Check if Home team already leads entering Bottom of 9th+
      if (this.inning >= 9 && this.homeScore > this.awayScore) {
        this.isGameOver = true;
        this.winner = this.homeTeam;
        this.logPlay(`🏆 BALLGAME OVER! ${this.homeTeam.city} wins ${this.homeScore}-${this.awayScore}!`, 'FINAL');
        return;
      }
      this.half = 'BOTTOM';
      this.logPlay(`--- End of Top ${this.inning} | ${this.awayTeam.abbrev} ${this.awayScore}, ${this.homeTeam.abbrev} ${this.homeScore} ---`, 'INNING');
    } else {
      if (this.inning >= 9 && this.awayScore !== this.homeScore) {
        this.isGameOver = true;
        this.winner = this.awayScore > this.homeScore ? this.awayTeam : this.homeTeam;
        this.logPlay(`🏆 BALLGAME OVER! ${this.winner.city} ${this.winner.name} wins ${this.awayScore}-${this.homeScore}!`, 'FINAL');
        return;
      }
      this.inning += 1;
      this.half = 'TOP';
      while (this.lineScore.away.length < this.inning) {
        this.lineScore.away.push(0);
        this.lineScore.home.push(0);
      }
      this.logPlay(`=== Start of Inning ${this.inning} | ${this.awayTeam.abbrev} ${this.awayScore}, ${this.homeTeam.abbrev} ${this.homeScore} ===`, 'INNING');
    }
  }

  /**
   * Eddie Dombrower's Decoupled Headless Sim Mode:
   * Simulates the current half-inning or the entire rest of the game in milliseconds
   * using the exact same Two-Stage Stats + 3D Physics engine!
   */
  simulateHeadless({ mode = 'HALF_INNING', maxPitches = 600 } = {}) {
    const startInning = this.inning;
    const startHalf = this.half;
    let pitchesSimulated = 0;
    const t0 = performance.now();

    while (!this.isGameOver && pitchesSimulated < maxPitches) {
      this.stepPitch({ useAIManagers: true });
      pitchesSimulated += 1;

      if (mode === 'HALF_INNING' && (this.inning !== startInning || this.half !== startHalf)) {
        break;
      }
      if (mode === 'AT_BAT' && this.count.balls === 0 && this.count.strikes === 0) {
        break;
      }
    }

    const elapsedMs = Math.round((performance.now() - t0) * 10) / 10;
    return {
      pitchesSimulated,
      elapsedMs,
      awayScore: this.awayScore,
      homeScore: this.homeScore,
      isGameOver: this.isGameOver
    };
  }
}
