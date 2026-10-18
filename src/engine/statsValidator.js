/**
 * Earl Weaver Baseball (1987) — Statistical Engine Validator & Season Benchmark Suite
 *
 * Simulates N full games between the Baltimore Orioles and Boston Red Sox
 * (rotating through the 4-man starting rotations and alternating Memorial Stadium & Fenway Park)
 * and compares simulated player/team slash lines (BA, OBA, SA, HR%, BB%, SO%)
 * against the historical game data in `src/data/rosters.js`.
 */

import { EWBGameState } from './gameState.js';
import { TEAMS } from '../data/rosters.js';

/**
 * Runs a multi-game statistical validation series and returns detailed
 * player-by-player, team-by-team, and ballpark comparison telemetry.
 *
 * @param {number} numGames - Number of full games to simulate (e.g. 40, 80, 162)
 * @returns {Object} Full validation report comparing Simulated vs Historical stats
 */
export function runStatisticalValidation(numGames = 80) {
  const startTime = performance.now();

  const playerSim = {};
  const initPlayerSim = (player, teamId) => {
    const key = player.id || player.name;
    if (!playerSim[key]) {
      playerSim[key] = {
        id: key,
        name: player.name,
        teamId,
        pos: player.pos,
        bats: player.bats,
        actual: player.splits?.T || {},
        actualL: player.splits?.L || {},
        actualR: player.splits?.R || {},
        AB: 0,
        R: 0,
        H: 0,
        d2B: 0,
        d3B: 0,
        HR: 0,
        RBI: 0,
        BB: 0,
        SO: 0,
        SB: 0,
        CS: 0
      };
    }
  };

  for (const p of TEAMS.baltimore.lineup.slice(0, 9)) initPlayerSim(p, 'baltimore');
  for (const p of TEAMS.boston.lineup.slice(0, 9)) initPlayerSim(p, 'boston');

  const teamTotals = {
    baltimore: { G: 0, W: 0, L: 0, R: 0, AB: 0, H: 0, d2B: 0, d3B: 0, HR: 0, BB: 0, SO: 0, SB: 0, CS: 0 },
    boston:    { G: 0, W: 0, L: 0, R: 0, AB: 0, H: 0, d2B: 0, d3B: 0, HR: 0, BB: 0, SO: 0, SB: 0, CS: 0 }
  };

  const parkStats = {
    memorial: { games: 0, runs: 0, hits: 0, doubles: 0, triples: 0, hrs: 0, wallHits: 0 },
    fenway:   { games: 0, runs: 0, hits: 0, doubles: 0, triples: 0, hrs: 0, wallHits: 0 }
  };

  for (let g = 0; g < numGames; g++) {
    const isFenway = g % 2 === 1;
    const parkId = isFenway ? 'fenway' : 'memorial';
    const awayTeamId = isFenway ? 'baltimore' : 'boston';
    const homeTeamId = isFenway ? 'boston' : 'baltimore';

    const game = new EWBGameState({
      awayTeamId,
      homeTeamId,
      parkId,
      awayManagerId: awayTeamId === 'baltimore' ? 'weaver' : 'mcnamara',
      homeManagerId: homeTeamId === 'baltimore' ? 'weaver' : 'mcnamara'
    });

    // Rotate starting pitchers across the 4-man rotation (indices 0..3)
    const rotIdx = Math.floor(g / 2) % 4;
    game.activePitcherIndex = { away: rotIdx, home: rotIdx };
    game.usedPitcherIndices = { away: new Set([rotIdx]), home: new Set([rotIdx]) };

    game.simulateHeadless({ mode: 'FULL_GAME', maxPitches: 650 });

    const pStat = parkStats[parkId];
    pStat.games += 1;
    pStat.runs += game.awayScore + game.homeScore;

    const recordTeam = (teamObj, teamKey, scored, allowed) => {
      const t = teamTotals[teamKey];
      t.G += 1;
      t.R += scored;
      if (scored > allowed) t.W += 1;
      else t.L += 1;

      for (const b of teamObj.lineup.slice(0, 9)) {
        initPlayerSim(b, teamKey);
        const ps = playerSim[b.id || b.name];
        const gs = b.gameStats || {};
        ps.AB += gs.AB || 0;
        ps.R += gs.R || 0;
        ps.H += gs.H || 0;
        ps.d2B += gs.d2B || 0;
        ps.d3B += gs.d3B || 0;
        ps.HR += gs.HR || 0;
        ps.RBI += gs.RBI || 0;
        ps.BB += gs.BB || 0;
        ps.SO += gs.SO || 0;
        ps.SB += gs.SB || 0;
        ps.CS += gs.CS || 0;

        t.AB += gs.AB || 0;
        t.H += gs.H || 0;
        t.d2B += gs.d2B || 0;
        t.d3B += gs.d3B || 0;
        t.HR += gs.HR || 0;
        t.BB += gs.BB || 0;
        t.SO += gs.SO || 0;
        t.SB += gs.SB || 0;
        t.CS += gs.CS || 0;

        pStat.hits += gs.H || 0;
        pStat.doubles += gs.d2B || 0;
        pStat.triples += gs.d3B || 0;
        pStat.hrs += gs.HR || 0;
      }
    };

    recordTeam(
      awayTeamId === 'baltimore' ? game.awayTeam : game.homeTeam,
      'baltimore',
      awayTeamId === 'baltimore' ? game.awayScore : game.homeScore,
      awayTeamId === 'baltimore' ? game.homeScore : game.awayScore
    );
    recordTeam(
      awayTeamId === 'boston' ? game.awayTeam : game.homeTeam,
      'boston',
      awayTeamId === 'boston' ? game.awayScore : game.homeScore,
      awayTeamId === 'boston' ? game.homeScore : game.awayScore
    );
  }

  // Compute derived slash lines & compare against historical splits
  // Note: Baltimore's 4-man rotation has 3 LHP + 1 RHP (so BOS hitters face ~75% LHP / 25% RHP),
  // while Boston's 4-man rotation has 1 LHP + 3 RHP (so BAL hitters face ~25% LHP / 75% RHP).
  const playersReport = Object.values(playerSim).map((p) => {
    const ab = Math.max(1, p.AB);
    const pa = ab + p.BB;
    const singles = Math.max(0, p.H - p.d2B - p.d3B - p.HR);
    const tb = singles + p.d2B * 2 + p.d3B * 3 + p.HR * 4;

    const simBA = p.H / ab;
    const simOBA = (p.H + p.BB) / Math.max(1, pa);
    const simSA = tb / ab;
    const simHR600 = Math.round((p.HR / ab) * 600);
    const sim2B600 = Math.round((p.d2B / ab) * 600);
    const sim3B600 = Math.round((p.d3B / ab) * 600);

    // Weight historical L/R splits by opposing rotation handedness (BAL faces 25% L / 75% R; BOS faces 75% L / 25% R)
    const wL = p.teamId === 'boston' ? 0.75 : 0.25;
    const wR = 1 - wL;
    const sL = p.actualL?.AB ? p.actualL : p.actual;
    const sR = p.actualR?.AB ? p.actualR : p.actual;
    const actT = p.actual;

    const lAb = Math.max(1, sL.AB || 150);
    const rAb = Math.max(1, sR.AB || 400);

    const actBA = (sL.BA ?? actT.BA ?? 0.275) * wL + (sR.BA ?? actT.BA ?? 0.275) * wR;
    const actOBA = (sL.OBA ?? actT.OBA ?? 0.345) * wL + (sR.OBA ?? actT.OBA ?? 0.345) * wR;
    const actSA = (sL.SA ?? actT.SA ?? 0.440) * wL + (sR.SA ?? actT.SA ?? 0.440) * wR;
    const actHR600 = Math.round((((sL.HR || 0) / lAb) * wL + ((sR.HR || 0) / rAb) * wR) * 600);
    const act2B600 = Math.round((((sL.d2B || 0) / lAb) * wL + ((sR.d2B || 0) / rAb) * wR) * 600);

    return {
      id: p.id,
      name: p.name,
      teamId: p.teamId,
      pos: p.pos,
      bats: p.bats,
      AB: p.AB,
      H: p.H,
      d2B: p.d2B,
      d3B: p.d3B,
      HR: p.HR,
      BB: p.BB,
      SO: p.SO,
      SB: p.SB,
      CS: p.CS,
      sim: {
        BA: Number(simBA.toFixed(3)),
        OBA: Number(simOBA.toFixed(3)),
        SA: Number(simSA.toFixed(3)),
        HR600: simHR600,
        d2B600: sim2B600,
        d3B600: sim3B600
      },
      actual: {
        BA: Number(actBA.toFixed(3)),
        OBA: Number(actOBA.toFixed(3)),
        SA: Number(actSA.toFixed(3)),
        HR600: actHR600,
        d2B600: act2B600,
        totalBA: Number((actT.BA ?? actBA).toFixed(3)),
        totalOBA: Number((actT.OBA ?? actOBA).toFixed(3)),
        totalSA: Number((actT.SA ?? actSA).toFixed(3))
      },
      diff: {
        BA: Number((simBA - actBA).toFixed(3)),
        OBA: Number((simOBA - actOBA).toFixed(3)),
        SA: Number((simSA - actSA).toFixed(3)),
        HR600: simHR600 - actHR600
      }
    };
  });

  const summarizeTeam = (tKey) => {
    const t = teamTotals[tKey];
    const ab = Math.max(1, t.AB);
    const pa = ab + t.BB;
    const singles = Math.max(0, t.H - t.d2B - t.d3B - t.HR);
    const tb = singles + t.d2B * 2 + t.d3B * 3 + t.HR * 4;
    const simBA = t.H / ab;
    const simOBA = (t.H + t.BB) / Math.max(1, pa);
    const simSA = tb / ab;

    // Historical starter weighted average for this team (platoon-adjusted for opposing rotation L/R mix)
    const starters = TEAMS[tKey].lineup.slice(0, 9);
    const wL = tKey === 'boston' ? 0.75 : 0.25;
    const wR = 1 - wL;
    let sumBA = 0, sumOBA = 0, sumSA = 0, sumBBPct = 0, sumSOPct = 0, sumHRRate = 0, sum2BRate = 0;

    for (const s of starters) {
      const sL = s.splits.L || s.splits.T;
      const sR = s.splits.R || s.splits.T;
      const lAb = Math.max(1, sL.AB);
      const rAb = Math.max(1, sR.AB);
      const lPa = lAb + (sL.BB || 0);
      const rPa = rAb + (sR.BB || 0);

      sumBA += sL.BA * wL + sR.BA * wR;
      sumOBA += sL.OBA * wL + sR.OBA * wR;
      sumSA += sL.SA * wL + sR.SA * wR;
      sumBBPct += ((sL.BB / lPa) * wL + (sR.BB / rPa) * wR) * 100;
      sumSOPct += ((sL.SO / lPa) * wL + (sR.SO / rPa) * wR) * 100;
      sumHRRate += (sL.HR / lAb) * wL + (sR.HR / rAb) * wR;
      sum2BRate += (sL.d2B / lAb) * wL + (sR.d2B / rAb) * wR;
    }

    const n = starters.length;
    const actBA = sumBA / n;
    const actOBA = sumOBA / n;
    const actSA = sumSA / n;

    return {
      ...t,
      runsPerGame: Number((t.R / Math.max(1, t.G)).toFixed(2)),
      sim: {
        BA: Number(simBA.toFixed(3)),
        OBA: Number(simOBA.toFixed(3)),
        SA: Number(simSA.toFixed(3)),
        BBPct: Number(((t.BB / pa) * 100).toFixed(1)),
        SOPct: Number(((t.SO / pa) * 100).toFixed(1)),
        HRPer162: Math.round((t.HR / Math.max(1, t.G)) * 162),
        d2BPer162: Math.round((t.d2B / Math.max(1, t.G)) * 162)
      },
      actual: {
        BA: Number(actBA.toFixed(3)),
        OBA: Number(actOBA.toFixed(3)),
        SA: Number(actSA.toFixed(3)),
        BBPct: Number((sumBBPct / n).toFixed(1)),
        SOPct: Number((sumSOPct / n).toFixed(1)),
        HRPer162: Math.round((sumHRRate / n) * 5550),
        d2BPer162: Math.round((sum2BRate / n) * 5550)
      }
    };
  };

  const elapsedMs = Math.round(performance.now() - startTime);

  return {
    numGames,
    elapsedMs,
    teams: {
      baltimore: summarizeTeam('baltimore'),
      boston: summarizeTeam('boston')
    },
    parks: parkStats,
    players: playersReport
  };
}
