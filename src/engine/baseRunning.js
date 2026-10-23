/**
 * Earl Weaver Baseball (1987) — Base Running & Outfield Throws
 *
 * Decides once, with dice and ratings, where every runner ends up on a ball in play. The same plan drives
 * the field animation (runner paths, throws, cutoff men, the umpire's call) and `gameState.js` (bases,
 * runs, outs), so the screen and the scoreboard always agree.
 *
 * Outfield hits:
 * - The lead runner tries for the extra base on a die roll weighted by his speed, the outs, where the ball
 *   went, the thrower's arm, the manager's aggressiveness and, on singles, the coach's read of runner vs.
 *   throw. A second roll, weighted by arm and speed, decides whether a runner who goes is thrown out.
 * - Strong arms throw straight to the base; weak arms hit the cutoff man, who relays. When the runner
 *   scores easily, the throw goes to second, to a cutoff man who holds it, or to the relay man, who holds it.
 * - The animation's timing is fitted to the dice: a runner who is out arrives after the ball, a runner who
 *   is safe beats it.
 */

import { getLastName } from '../data/rosters.js';

export const BASE_COORDS = {
  HOME: { x: 0, y: 0, z: 0 },
  FIRST: { x: 63.64, y: 63.64, z: 0 },
  SECOND: { x: 0, y: 127.28, z: 0 },
  THIRD: { x: -63.64, y: 63.64, z: 0 },
  MOUND: { x: 0, y: 60.5, z: 0.83 }
};

// Indexed by base number along the basepaths (0 = home, 4 = home again after scoring)
const BASE_POINTS = [BASE_COORDS.HOME, BASE_COORDS.FIRST, BASE_COORDS.SECOND, BASE_COORDS.THIRD, BASE_COORDS.HOME];
const BASE_KEYS = ['HOME', '1B', '2B', '3B', 'HOME'];
const BASE_NAMES = ['home', 'first', 'second', 'third', 'home'];
const OUTFIELD = ['LF', 'CF', 'RF'];
const DIAMOND_CENTER = { x: 0, y: 63.64 };
// Scored and retired runners jog off toward the third-base dugout
const EXIT_POINT = { x: -40, y: -24 };

// The batter's follow-through before he breaks for first (matches the engine's time to first base)
const BATTER_BREAK_SEC = 0.48;
const FIELDER_REACTION_SEC = 0.22;
// Charge, field and crow-hop before an outfielder's throw; longer off a wall carom
const OUTFIELD_TRANSFER_SEC = 0.85;
const WALL_TRANSFER_SEC = 1.1;
const RELAY_TURN_SEC = 0.45;
// Longest an outfielder holds the ball (a bobble, a slow transfer) so a runner beats his throw by a step
const MAX_THROW_DELAY_SEC = 0.35;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerpPoint = (a, b, f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: 0 });

/**
 * Baserunner sprint speed in ft/s: runnerSpeedFps = 22.5 + runner.ratings.runs * 0.65
 */
export function getRunnerSpeedFps(player = {}) {
  const runs = player?.ratings?.runs ?? player?.ratings?.speed ?? 6;
  return 22.5 + runs * 0.65;
}

/**
 * Interpolates (x, y) along the basepaths from progress in bases (0 = home, 1 = 1B, 2 = 2B, 3 = 3B, 4 = home)
 */
export function getCoordsAlongBasepath(progressFloat) {
  const clamped = Math.max(0, Math.min(4, progressFloat));
  const idx = Math.min(3, Math.floor(clamped));
  const frac = clamped - idx;
  const p0 = BASE_POINTS[idx];
  const p1 = BASE_POINTS[idx + 1];
  return {
    x: Math.round((p0.x + (p1.x - p0.x) * frac) * 100) / 100,
    y: Math.round((p0.y + (p1.y - p0.y) * frac) * 100) / 100
  };
}

/**
 * Basepath position for a runner who rounds `roundedBases`: he swings wide in the last 30 ft before each
 * one, cuts the inside corner of the bag and drifts out a step past it.
 */
function getRunnerPathCoords(progress, roundedBases) {
  const p = getCoordsAlongBasepath(progress);
  for (const base of roundedBases) {
    const d = base - progress;
    let bulgeFt = 0;
    if (d > 0 && d < 0.35) bulgeFt = 7 * Math.sin((Math.PI * d) / 0.35);
    else if (d <= 0 && d > -0.15) bulgeFt = 2.5 * Math.sin((Math.PI * -d) / 0.15);
    if (bulgeFt > 0) {
      const b = BASE_POINTS[base];
      const len = distance(b, DIAMOND_CENTER);
      p.x += ((b.x - DIAMOND_CENTER.x) / len) * bulgeFt;
      p.y += ((b.y - DIAMOND_CENTER.y) / len) * bulgeFt;
    }
  }
  return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
}

function makeRunner(player, from, startProg) {
  const fallback = from === 0 ? 'Batter' : `Runner ${from}B`;
  return {
    id: player?.id || player?.name || (from === 0 ? 'batter' : `runner_${from}`),
    name: player?.name || fallback,
    label: getLastName(player?.name || (from === 0 ? 'BAT' : `R${from}`)).slice(0, 3).toUpperCase(),
    from,
    to: from,
    out: false,
    scores: false,
    rbi: true,
    earned: true,
    slide: false,
    speedFps: getRunnerSpeedFps(player),
    startProg,
    read: 0,
    // Visual legs along the basepaths: run to `to`, leaving no earlier than `waitUntil` (seconds after contact)
    legs: [],
    // Freeze in place after this time (a batter who stops running once his fly ball is caught)
    stopAt: null
  };
}

/** Sends a runner to base `to` (4 = scores), leaving after `read` seconds. */
function advance(r, to, { read = 0, slide = false, rbi = true, earned = true } = {}) {
  r.to = to;
  r.scores = to === 4;
  r.rbi = rbi;
  r.earned = earned;
  r.slide = slide;
  r.read = read;
  r.legs = to > r.startProg ? [{ to, waitUntil: read }] : [];
}

/** Lets a runner take the turn past base `base`, then return to it. */
function roundAndHold(r, base, read, overrunBases = 0.1) {
  r.to = base;
  r.scores = false;
  r.read = read;
  r.legs = [{ to: base + overrunBases, waitUntil: read }, { to: base }];
}

/** Turns legs into timed segments; also records the arrival time, the furthest progress and rounded bases. */
function scheduleRunner(r) {
  const segs = [];
  let prog = r.startProg;
  let t = 0;
  for (const leg of r.legs) {
    const depart = Math.max(t, leg.waitUntil ?? 0);
    const arrive = depart + (Math.abs(leg.to - prog) * 90) / r.speedFps;
    segs.push({ from: prog, to: leg.to, depart, arrive });
    prog = leg.to;
    t = arrive;
  }
  r.segs = segs;
  r.endProg = prog;
  r.endTime = t;
  const maxProg = Math.max(r.startProg, ...segs.map((s) => s.to));
  r.roundedBases = [1, 2, 3].filter((b) => r.startProg < b && maxProg > b + 0.01);
  return r;
}

/** When a retired runner was put out: the force or putout throw for forces, the tag as he arrives otherwise. */
const outTimeOf = (r) => r.outTime ?? r.endTime;

/** Seconds after contact when the runner reaches his final base. */
function arrivalSec(r) {
  return scheduleRunner(r).endTime;
}

/** Delays a runner's departure so he reaches his final base no earlier than `notBeforeSec`. */
function arriveNoEarlierThan(r, notBeforeSec) {
  const late = notBeforeSec - arrivalSec(r);
  if (late > 0 && r.legs.length) {
    r.legs[0].waitUntil = (r.legs[0].waitUntil ?? 0) + late;
    scheduleRunner(r);
  }
}

function shiftLegs(legs, dt) {
  for (const leg of legs) {
    leg.tStart += dt;
    leg.tEnd += dt;
  }
}

/**
 * Snapshot of one runner `t` seconds after contact, in the frame format the renderer draws.
 */
function runnerSnapshotAt(r, t) {
  const tt = r.stopAt != null ? Math.min(t, r.stopAt) : t;
  let prog = r.startProg;
  let seg = null;
  for (const s of r.segs) {
    if (tt < s.depart) break;
    if (tt < s.arrive) {
      prog = s.from + ((s.to - s.from) * (tt - s.depart)) / Math.max(0.001, s.arrive - s.depart);
      seg = s;
      break;
    }
    prog = s.to;
  }

  let { x, y } = getRunnerPathCoords(prog, r.roundedBases);
  let isMoving = Boolean(seg) && (r.stopAt == null || t < r.stopAt);
  const lastSeg = r.segs[r.segs.length - 1];
  const isSliding = isMoving && r.slide && seg === lastSeg && seg.to > seg.from && (seg.to - prog) * 90 <= 13;

  // Runners who scored or were put out jog toward the dugout once the play at their base is over
  const exitStart = r.endTime + 0.7;
  if ((r.scores || r.out) && t > exitStart) {
    const jogFps = r.speedFps * 0.45;
    const total = distance({ x, y }, EXIT_POINT);
    const f = Math.min(1, ((t - exitStart) * jogFps) / Math.max(1, total));
    x += (EXIT_POINT.x - x) * f;
    y += (EXIT_POINT.y - y) * f;
    isMoving = f < 1;
  }

  return {
    id: r.id,
    name: r.name,
    label: r.label,
    startBase: r.from,
    targetBase: r.to,
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    isMoving,
    stridePhase: Math.round(t * r.speedFps * 0.68 * 100) / 100,
    isSliding,
    isOut: r.out
  };
}

/** Runner snapshots for every frame time; the batter-runner comes first. */
export function buildRunnerSnapshots(runnerPlan, t) {
  return [runnerPlan.batter, ...runnerPlan.runners].map((r) => runnerSnapshotAt(r, t));
}

/** Seconds after contact when the last runner stops on his base (before any jog off the field). */
export function lastRunnerArrivalSec(runnerPlan) {
  return Math.max(0, ...[runnerPlan.batter, ...runnerPlan.runners].map((r) => (r.stopAt != null ? r.stopAt : r.endTime)));
}

// Average speed of a throw over its flight: long throws lose about a fifth of their release speed to drag
function throwFlightSec(thrower, distFt) {
  const avgSpeed = thrower.throwSpeedFps * (1 - 0.22 * Math.min(1, distFt / 220));
  return Math.max(0.28, distFt / avgSpeed);
}

function makeThrowLeg(fromPos, toPos, fromPt, toPt, tStart, thrower) {
  const d = distance(fromPt, toPt);
  return {
    fromPos,
    toPos,
    fromPt: { x: fromPt.x, y: fromPt.y, z: 0 },
    toPt: { x: toPt.x, y: toPt.y, z: 0 },
    tStart,
    tEnd: tStart + throwFlightSec(thrower, d),
    peakZ: Math.min(14, 5.5 + d * 0.035)
  };
}

function fielderArrivalSec(fielder, pt) {
  return FIELDER_REACTION_SEC + distance({ x: fielder.startX, y: fielder.startY }, pt) / fielder.speedFps;
}

/**
 * How far an outfielder throws on the fly to a base. Strong arms (8+) throw home from medium depth;
 * weaker arms hit the cutoff man on anything long.
 */
function directThrowRangeFt(arm) {
  return arm >= 8 ? 200 + 30 * (arm - 8) : 140 + 10 * (arm - 5);
}

/** How far `value` falls outside [lo, hi]. */
function windowError(value, lo, hi) {
  return value < lo ? lo - value : value > hi ? value - hi : 0;
}

/**
 * Plans an outfield hit. First the dice: does the lead runner go, is he out, is it close enough to draw a
 * throw; do trailing runners and the batter move up. Then the timing: where along the ball's roll the
 * outfielder picks it up, and whether he throws straight in or hits the cutoff man, so the ball and the
 * runners arrive in the order the dice decided.
 */
function planOutfieldHit(ctx, batterR, onBase, rng) {
  const { outcome, outs, fielders, primaryFielderPos, interceptTimeSec, runningPlay } = ctx;
  const aggressiveness = ctx.aggressiveness ?? 5;
  const thrower = fielders[primaryFielderPos];
  const throwerStart = { x: thrower.startX, y: thrower.startY };
  const twoOuts = outs === 2;
  const notes = [];
  const trailingNotes = []; // told after the lead runner's play

  // Secondary leads: with two outs or on a running play the runners break on contact
  for (const r of onBase) {
    r.read = twoOuts || runningPlay ? 0 : 0.3;
    r.startProg = r.from + (runningPlay ? 0.28 : twoOuts ? 0.2 : 0.15);
  }
  const r1 = onBase.find((r) => r.from === 1);
  const r2 = onBase.find((r) => r.from === 2);
  const r3 = onBase.find((r) => r.from === 3);

  const batterBase = outcome === 'TRIPLE' ? 3 : outcome === 'DOUBLE' ? 2 : 1;
  if (batterBase === 1) roundAndHold(batterR, 1, BATTER_BREAK_SEC, 0.12);
  else advance(batterR, batterBase, { read: BATTER_BREAK_SEC, slide: true });
  if (r3) advance(r3, 4, { read: r3.read });
  if (r2 && outcome !== 'SINGLE') advance(r2, 4, { read: r2.read });
  if (r1 && outcome === 'TRIPLE') advance(r1, 4, { read: r1.read });

  // ---- Throws and running times ----
  const pickupTransferSec = (pick) =>
    ctx.wallCaromSec != null && ctx.wallCaromSec <= pick.t + 0.02 ? WALL_TRANSFER_SEC : OUTFIELD_TRANSFER_SEC;

  const routeTo = (pick, targetBase, { hold = false } = {}) => {
    const from = pick.pt;
    // Balls to the right side: the shortstop covers second and the second baseman goes out as relay man
    const coverPos = from.x >= 0 ? 'SS' : '2B';
    const relayPos = from.x >= 0 ? '2B' : 'SS';
    const target = BASE_POINTS[targetBase];
    let receiverPos = targetBase === 4 ? 'C' : targetBase === 3 ? '3B' : coverPos;
    if (receiverPos === primaryFielderPos) receiverPos = targetBase === 3 ? 'SS' : relayPos;
    const d = distance(from, target);
    let cutoffPos = null;
    if (hold || d > directThrowRangeFt(thrower.arm)) {
      cutoffPos =
        outcome !== 'SINGLE' ? relayPos
        : targetBase === 4 ? (primaryFielderPos === 'LF' ? '3B' : '1B')
        : targetBase === 3 ? 'SS'
        : relayPos;
      if (cutoffPos === primaryFielderPos || cutoffPos === receiverPos) cutoffPos = null;
    }

    const release = pick.t + pickupTransferSec(pick);
    const route = { targetBase, coverPos, receiverPos, cutoffPos, hold: hold && Boolean(cutoffPos), legs: [], targets: {} };
    if (!cutoffPos) {
      route.legs.push(makeThrowLeg(primaryFielderPos, receiverPos, from, target, release, thrower));
    } else {
      // Singles: the cutoff man stands in the infield on the line of the throw. Extra-base hits: the relay
      // man goes out toward the ball so neither throw is too long.
      const cutoffPt =
        outcome === 'SINGLE'
          ? lerpPoint(target, from, clamp(d * (targetBase === 4 ? 0.38 : 0.45), 60, 105) / d)
          : lerpPoint(target, from, clamp(d * 0.45, 90, 150) / d);
      route.targets[cutoffPos] = cutoffPt;
      const leg1 = makeThrowLeg(primaryFielderPos, cutoffPos, from, cutoffPt, release, thrower);
      route.legs.push(leg1);
      if (!route.hold) {
        route.legs.push(makeThrowLeg(cutoffPos, receiverPos, cutoffPt, target, leg1.tEnd + RELAY_TURN_SEC, fielders[cutoffPos]));
      }
      // The outfielder waits for his cutoff man to get there
      const late = fielderArrivalSec(fielders[cutoffPos], cutoffPt) + 0.1 - leg1.tEnd;
      if (late > 0) shiftLegs(route.legs, late);
    }
    if (!route.hold) {
      const receiverPt = targetBase === 4 ? { x: 0, y: -2 } : target;
      route.targets[receiverPos] = receiverPt;
      const last = route.legs[route.legs.length - 1];
      const late = fielderArrivalSec(fielders[receiverPos], receiverPt) + 0.1 - last.tEnd;
      if (late > 0) shiftLegs(route.legs, late);
    }
    route.ballArrival = route.legs[route.legs.length - 1].tEnd;
    route.firstCatch = route.legs[0].tEnd;
    return route;
  };
  const shiftRoute = (route, dt) => {
    shiftLegs(route.legs, dt);
    route.ballArrival += dt;
    route.firstCatch += dt;
  };

  // A runner who is safe can have the best jump: running on contact with a longer secondary lead
  const JUMP_LEAD = 0.07;
  const runnerArrival = (r, target) => r.read + ((target - r.startProg) * 90) / r.speedFps;
  const bestJumpArrival = (r, target) => ((target - r.startProg - JUMP_LEAD) * 90) / r.speedFps;
  const batterArrival = BATTER_BREAK_SEC + (batterBase * 90) / batterR.speedFps;

  // ---- The dice ----
  const depthFt = Math.hypot(ctx.interceptPoint.x, ctx.interceptPoint.y);
  const depthAdj = depthFt < 200 ? -0.12 : depthFt > 250 ? 0.08 : 0;
  const armAdj = -0.03 * (thrower.arm - 7);
  const aggAdj = 0.03 * (aggressiveness - 5);
  const sideAdj = { LF: -0.12, CF: 0.05, RF: 0.15 }[primaryFielderPos] ?? 0;
  const speedAdj = (r) => (r.ratings?.runs ?? 6) - 5.5;
  // The coach's read on a single: how this runner's time compares with a typical throw's head start
  const firstPick = { t: interceptTimeSec, pt: ctx.interceptPoint };
  const readAdj = (r, target) => {
    if (outcome !== 'SINGLE') return 0;
    const margin = routeTo(firstPick, target).ballArrival - runnerArrival(r, target);
    return 0.2 * clamp(margin - (target === 4 ? -1.1 : -1.5), -1, 1);
  };

  let lead = null; // the runner the throw goes after: { runner, target, out }
  const easyRunners = []; // runners who took an extra base without drawing the throw

  const attempt = (r, target, goP, outP, closeP) => {
    if (rng() >= goP) {
      roundAndHold(r, target - 1, r.read, target === 4 ? 0.12 : 0.09);
      notes.push(`${r.name} holds at ${BASE_NAMES[target - 1]}.`);
      return;
    }
    const out = rng() < outP;
    const contested = out || rng() < closeP;
    advance(r, target, { read: r.read, slide: contested });
    if (out) {
      r.out = true;
      r.scores = false;
    }
    if (contested) {
      lead = { runner: r, target, out };
    } else {
      easyRunners.push({ runner: r, target });
      notes.push(target === 4 ? `${r.name} scores easily from ${BASE_NAMES[r.from]}.` : `${r.name} goes first to third.`);
    }
  };
  const tryThird = (r) =>
    attempt(
      r,
      3,
      clamp(0.28 + 0.05 * speedAdj(r) + sideAdj + armAdj + aggAdj + readAdj(r, 3) + (twoOuts ? 0.05 : 0) + (runningPlay ? 0.3 : 0), 0.03, 0.95),
      clamp(0.05 + 0.02 * (thrower.arm - 7) - 0.015 * speedAdj(r), 0.01, 0.15),
      0.3
    );

  if (outcome === 'SINGLE') {
    if (r2) {
      attempt(
        r2,
        4,
        clamp(0.65 + 0.06 * speedAdj(r2) + (twoOuts ? 0.3 : 0) + depthAdj + armAdj + aggAdj + readAdj(r2, 4)
          + (primaryFielderPos === 'CF' ? 0.05 : 0) + (runningPlay ? 0.1 : 0), 0.05, 0.97),
        clamp(0.05 + 0.02 * (thrower.arm - 7) - 0.02 * speedAdj(r2) + (depthAdj < 0 ? 0.04 : 0), 0.01, 0.2),
        depthAdj < 0 ? 0.45 : 0.3
      );
      if (r1 && r2.to !== 4) {
        roundAndHold(r1, 2, r1.read, 0.09);
      } else if (r1 && lead) {
        // The throw goes home, so the trailing runner takes third behind it
        if (rng() < clamp(0.45 + 0.05 * speedAdj(r1) + sideAdj + aggAdj + (runningPlay ? 0.3 : 0), 0.1, 0.95)) {
          advance(r1, 3, { read: r1.read });
          trailingNotes.push(`${r1.name} takes third on the throw home.`);
        } else {
          roundAndHold(r1, 2, r1.read, 0.09);
        }
      } else if (r1) {
        tryThird(r1);
      }
    } else if (r1) {
      tryThird(r1);
    }
  } else if (outcome === 'DOUBLE' && r1) {
    attempt(
      r1,
      4,
      clamp(0.42 + 0.08 * speedAdj(r1) + (twoOuts ? 0.25 : 0) + (ctx.hitWall ? 0.08 : 0) + depthAdj + armAdj + aggAdj
        + (runningPlay ? 0.2 : 0), 0.03, 0.95),
      clamp(0.06 + 0.02 * (thrower.arm - 7) - 0.02 * speedAdj(r1), 0.02, 0.2),
      0.4
    );
  }

  // The batter takes the next base while the throw goes in front of him
  const nextBase = batterBase + 1;
  let batterTakesExtra =
    Boolean(lead) && lead.target > nextBase && !onBase.some((r) => !r.out && r.to === nextBase) &&
    rng() < (batterBase === 1 ? 0.6 : 0.3);

  // ---- The timing ----
  // Extra-base hits get past the outfielder: he runs the ball down anywhere along its roll, out to the wall on
  // a triple. Singles are played on the hop, give or take a cautious step.
  const maxDelaySec = outcome === 'SINGLE' ? 0.8 : 6.0;
  const candidates = [{ t: interceptTimeSec, pt: ctx.interceptPoint }];
  for (let t = interceptTimeSec + 1 / 30; t <= interceptTimeSec + maxDelaySec + 1e-6; t += 1 / 30) {
    const pt = ctx.ballAt(t);
    // On an extra-base hit he first runs to where he would have cut the ball off (the animation does the same)
    const pursuitFt = outcome === 'SINGLE'
      ? distance(throwerStart, pt)
      : distance(throwerStart, ctx.interceptPoint) + distance(ctx.interceptPoint, pt);
    if (FIELDER_REACTION_SEC + pursuitFt / thrower.speedFps <= t + 0.02) candidates.push({ t, pt });
  }

  const pickupError = (pick) => {
    let err = 0.05 * (pick.t - interceptTimeSec);
    if (lead) {
      const route = routeTo(pick, lead.target);
      const r = lead.runner;
      const arrive = runnerArrival(r, lead.target);
      // Out: the ball beats him by a step or two (a slow read or late wave covers the rest).
      // Safe: he beats it by a step, with the best jump if he needs it.
      err += lead.out
        ? windowError(route.ballArrival, arrive - 0.5, arrive - 0.2)
        : windowError(route.ballArrival, bestJumpArrival(r, lead.target) + 0.08, arrive + 0.4);
      if (outcome === 'DOUBLE') err += Math.max(0, batterArrival - 1.0 - route.firstCatch);
    } else {
      // A runner who scores easily should not look like he would have been out on a throw
      for (const { runner, target } of easyRunners) {
        err += Math.max(0, bestJumpArrival(runner, target) - 0.3 - routeTo(pick, target).ballArrival);
      }
      if (outcome === 'DOUBLE') err += Math.max(0, batterArrival - 1.0 - routeTo(pick, 3, { hold: true }).firstCatch);
      if (outcome === 'TRIPLE') err += windowError(routeTo(pick, 3).ballArrival, batterArrival + 0.12, batterArrival + 0.7);
    }
    return err;
  };
  let pickup = candidates[0];
  let bestErr = Infinity;
  for (const pick of candidates) {
    const err = pickupError(pick);
    if (err < bestErr - 1e-6) {
      bestErr = err;
      pickup = pick;
    }
  }

  const giveBestJump = (r) => {
    if (r.bestJump) return;
    r.bestJump = true;
    r.read = 0;
    r.startProg += JUMP_LEAD;
    r.legs[0].waitUntil = 0;
  };

  let route = null;
  if (lead && !lead.out) {
    // He beats the throw by a step: the best jump first, then a slower throw if that is not enough
    const r = lead.runner;
    const close = routeTo(pickup, lead.target);
    const beatBy = 0.08 + rng() * 0.25;
    if (arrivalSec(r) + beatBy > close.ballArrival) giveBestJump(r);
    const late = arrivalSec(r) + beatBy - close.ballArrival;
    if (late <= MAX_THROW_DELAY_SEC) {
      if (late > 0) shiftRoute(close, late);
      route = close;
      notes.push(lead.target === 4
        ? `${r.name} scores from ${BASE_NAMES[r.from]}, sliding in ahead of the throw!`
        : `${r.name} goes first to third and beats the throw!`);
    } else {
      // Only a long-held ball would let him beat a throw, so the defense makes no play on him
      r.slide = false;
      easyRunners.unshift({ runner: r, target: lead.target });
      notes.push(lead.target === 4 ? `${r.name} scores from ${BASE_NAMES[r.from]}.` : `${r.name} goes first to third.`);
      lead = null;
      batterTakesExtra = false;
    }
  } else if (lead) {
    const r = lead.runner;
    route = routeTo(pickup, lead.target);
    // The ball must beat him: a slower read, then a late wave around the previous base
    const deficit = route.ballArrival + 0.18 + rng() * 0.15 - arrivalSec(r);
    if (deficit > 0) {
      const extraRead = Math.min(deficit, 0.3);
      r.legs = [{ to: lead.target, waitUntil: r.read + extraRead }];
      if (deficit > extraRead) {
        const pause = lead.target - 0.95;
        const atPause = r.read + extraRead + ((pause - r.startProg) * 90) / r.speedFps;
        r.legs = [{ to: pause, waitUntil: r.read + extraRead }, { to: lead.target, waitUntil: atPause + deficit - extraRead }];
      }
    }
    const via = route.cutoffPos ? ` on the relay from ${fielders[route.cutoffPos].name}` : ` by ${thrower.name}`;
    notes.push(`${r.name} is thrown out at ${lead.target === 4 ? 'the plate' : 'third'}${via}!`);
  }
  if (!lead) {
    // No play on a runner: singles go to second to hold the batter, doubles to the relay man, triples to third.
    // When a throw ahead of the runner would have been close, the cutoff man cuts it off and holds the ball.
    route = outcome === 'SINGLE' ? routeTo(pickup, 2) : outcome === 'DOUBLE' ? routeTo(pickup, 3, { hold: true }) : routeTo(pickup, 3);
    const leadEasy = easyRunners[0];
    if (outcome === 'SINGLE' && leadEasy && routeTo(pickup, leadEasy.target).ballArrival < arrivalSec(leadEasy.runner) + 0.3) {
      const cut = routeTo(pickup, leadEasy.target, { hold: true });
      if (cut.hold) {
        route = cut;
        notes.push(`The throw ${leadEasy.target === 4 ? 'home' : 'to third'} is cut off.`);
      }
    }
    if (outcome === 'TRIPLE' && route.ballArrival < batterArrival + 0.15) shiftRoute(route, batterArrival + 0.15 - route.ballArrival);
    for (const { runner, target } of easyRunners) {
      if (arrivalSec(runner) > routeTo(pickup, target).ballArrival) giveBestJump(runner);
    }
  }

  if (batterTakesExtra) {
    // He goes when the outfielder lets the throw go, and only if a return throw from the base it went to
    // could not get him
    const finalLeg = route.legs[route.legs.length - 1];
    const legs = [{ to: batterBase + 0.12, waitUntil: BATTER_BREAK_SEC }, { to: nextBase, waitUntil: route.legs[0].tStart + 0.15 }];
    const arrive = scheduleRunner({ ...batterR, legs }).endTime;
    const returnThrow = finalLeg.tEnd + 0.5 + throwFlightSec(fielders[finalLeg.toPos], distance(finalLeg.toPt, BASE_POINTS[nextBase]));
    if (arrive + 0.3 <= returnThrow) {
      batterR.to = nextBase;
      batterR.slide = batterBase === 2;
      batterR.legs = legs;
      trailingNotes.push(`${batterR.name} takes ${BASE_NAMES[nextBase]} on the throw.`);
    }
  }

  const fielderTargets = { ...route.targets };
  // Cover the bases the cutoff men leave, and back up the throw
  if (route.cutoffPos === '3B') fielderTargets.SS = { x: BASE_COORDS.THIRD.x + 4, y: BASE_COORDS.THIRD.y + 4 };
  if (route.cutoffPos === '1B' && route.coverPos === 'SS') fielderTargets['2B'] = { x: BASE_COORDS.FIRST.x - 5, y: BASE_COORDS.FIRST.y + 4 };
  if (route.targetBase === 4 && !route.hold) fielderTargets.P = { x: 0, y: -26 };
  else if (route.targetBase === 3 && !route.hold) fielderTargets.P = { x: -84, y: 44 };

  for (const r of [batterR, ...onBase]) scheduleRunner(r);

  const throwPlan = { legs: route.legs };
  if (lead) {
    throwPlan.callBase = BASE_KEYS[lead.target];
    throwPlan.callType = lead.out ? 'OUT' : 'SAFE';
    throwPlan.callTime = Math.max(lead.runner.endTime, route.ballArrival);
  } else {
    throwPlan.callBase = BASE_KEYS[batterBase];
    throwPlan.callType = 'SAFE';
    throwPlan.callTime = batterArrival;
  }
  return { throwPlan, fielderTargets, notes: [...notes, ...trailingNotes], pickup };
}

/** Basepath progress of a runner `t` seconds after contact. */
function progressAt(r, t) {
  let prog = r.startProg;
  for (const s of r.segs) {
    if (t < s.depart) break;
    if (t < s.arrive) return s.from + ((s.to - s.from) * (t - s.depart)) / Math.max(0.001, s.arrive - s.depart);
    prog = s.to;
  }
  return prog;
}

/**
 * Bottom of the 9th or later: the game ends the moment the winning run scores. Runners behind him stop
 * where they are and do not score, and outs made after it do not count. On a hit the batter is credited with
 * only as many bases as the winning runner advanced; a batter whose out at first comes too late reaches on a
 * fielder's choice. Returns the outcome to put in the book when it differs from `outcome`, or null.
 */
function endAtWinningRun(runsToWin, outcome, batterR, onBase, throwPlan, notes) {
  if (!(runsToWin >= 1) || outcome === 'HOME_RUN') return null;
  const winner = onBase.filter((r) => r.scores).sort((a, b) => a.endTime - b.endTime)[runsToWin - 1];
  if (!winner) return null;
  const over = winner.endTime;
  const batterSafeAtFirst = batterR.out && outTimeOf(batterR) > over;
  const dropNotes = (r) => {
    for (let i = notes.length - 1; i >= 0; i--) if (notes[i].startsWith(r.name)) notes.splice(i, 1);
  };
  for (const r of [batterR, ...onBase]) {
    // Outs made before the winning run stand. The batter still runs to first (or his credited base).
    const stillPlaying = r.out ? outTimeOf(r) > over : r !== batterR && r.endTime > over;
    if (r === winner || !stillPlaying) continue;
    r.scores = false;
    r.out = false;
    r.to = Math.min(3, Math.floor(progressAt(r, over)));
    r.stopAt = over;
    // Whatever the play-by-play said about him did not happen
    dropNotes(r);
  }
  // A tag play that would come after the winning run never happens
  if (throwPlan && throwPlan.callTime > over) throwPlan.callTime = Infinity;

  let credited = null;
  const hitBases = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3 }[outcome];
  if (hitBases || batterSafeAtFirst) {
    const bases = hitBases ? Math.max(1, Math.min(hitBases, 4 - winner.from)) : 1;
    batterR.to = bases;
    batterR.out = false;
    batterR.slide = batterR.slide && bases === hitBases;
    batterR.stopAt = null;
    batterR.legs = [{ to: bases, waitUntil: BATTER_BREAK_SEC }];
    dropNotes(batterR);
    credited = hitBases ? ['', 'SINGLE', 'DOUBLE', 'TRIPLE'][bases] : 'FIELDERS_CHOICE';
    if (hitBases && bases < hitBases) {
      notes.push(`The winning run scores first, so it goes in the book as a ${credited.toLowerCase()}.`);
    } else if (!hitBases) {
      notes.push(`The winning run scores before the throw to first, so ${batterR.name} is safe.`);
    }
  }
  // Runners left standing keep a base apart, each ahead of the man behind him
  let behind = batterR.out ? 0 : batterR.to;
  for (const r of [...onBase].sort((a, b) => a.from - b.from)) {
    if (r.out || r.scores) continue;
    r.to = Math.min(3, Math.max(r.to, behind + 1));
    behind = r.to;
  }
  return credited && credited !== outcome ? credited : null;
}

/**
 * Decides every runner's fate on a ball in play and lays out the throws that show it.
 *
 * Out plays (grounders, fielder's choices, double plays, sacrifices, caught flies) follow fixed rules; hits
 * to the outfield roll for extra bases and outs on the bases. `ctx.throwPlan` holds the engine's throw for
 * non-outfield plays; runner timing is fitted to it so each call (out or safe) matches.
 *
 * Outfield hits also return `pickup` ({ t, pt }): where and when the outfielder picks up the ball.
 * `ctx.runsToWin` (bottom of the 9th or later) ends the play at the winning run.
 *
 * @returns {{ runnerPlan, throwPlan, fielderTargets, notes, pickup }} where `runnerPlan` is
 *   `{ batter, runners: [...], creditedOutcome }`, each runner `{ from, to, out, scores, rbi, earned, ... }`
 *   (to 4 = home); `creditedOutcome` is set when a game-ending play goes in the book differently.
 */
export function planBaseRunning(ctx) {
  const rng = ctx.rng || Math.random;
  const { outcome, bases = [null, null, null], outs = 0, offPlay, defPlay } = ctx;
  const runningPlay = offPlay === 'HIT_AND_RUN' || offPlay === 'RUN_AND_HIT' || offPlay === 'STEAL';
  const leadOff = runningPlay ? 0.28 : 0.11;

  const batterR = makeRunner(ctx.batter, 0, 0);
  batterR.legs = [{ to: 1, waitUntil: BATTER_BREAK_SEC }];
  batterR.out = true;
  batterR.to = 0;
  const onBase = [];
  for (let b = 1; b <= 3; b++) {
    const player = bases[b - 1];
    if (!player) continue;
    const r = makeRunner(player, b, b + leadOff);
    r.ratings = player.ratings;
    onBase.push(r);
  }
  const r1 = onBase.find((r) => r.from === 1);
  const r2 = onBase.find((r) => r.from === 2);
  const r3 = onBase.find((r) => r.from === 3);

  let throwPlan = ctx.throwPlan || null;
  let fielderTargets = {};
  let notes = [];
  let pickup = null;
  const lastLeg = () => throwPlan?.legs?.[throwPlan.legs.length - 1];

  const isHit = ['SINGLE', 'DOUBLE', 'TRIPLE', 'ERROR'].includes(outcome);
  const isOutfieldHit = isHit && ctx.isOutfieldHit;

  if (outcome === 'HOME_RUN') {
    advance(batterR, 4, { read: BATTER_BREAK_SEC });
    batterR.out = false;
    for (const r of onBase) advance(r, 4);
  } else if (isOutfieldHit) {
    batterR.out = false;
    const planned = planOutfieldHit({ ...ctx, runningPlay }, batterR, onBase, rng);
    ({ throwPlan, fielderTargets, notes, pickup } = planned);
  } else if (isHit) {
    // Infield hit or error: everyone moves up one base; the runner on third scores
    const isError = outcome === 'ERROR';
    batterR.out = false;
    batterR.to = 1;
    const forced = (r) => r.from === 1 || (r.from === 2 && r1) || (r.from === 3 && r1 && r2);
    for (const r of onBase) {
      advance(r, r.from + 1, { read: forced(r) ? 0 : 0.3, rbi: !isError, earned: !isError });
    }
    // The batter beats the throw to first
    if (throwPlan?.callType === 'SAFE' && lastLeg()) {
      const late = arrivalSec(batterR) + 0.08 - lastLeg().tEnd;
      if (late > 0) shiftLegs(throwPlan.legs, late);
      throwPlan.callTime = arrivalSec(batterR);
    }
  } else if (ctx.caughtInAir) {
    // The batter gives up on a caught ball; runners hold, except a runner tagging from third on a sac fly
    batterR.stopAt = ctx.interceptTimeSec + 0.25;
    batterR.outTime = ctx.interceptTimeSec;
    for (const r of onBase) r.legs = [{ to: r.from, waitUntil: ctx.interceptTimeSec + 0.1 }];
    if (r3) {
      // Tagging up at third
      r3.startProg = 3;
      r3.legs = [];
    }
    if (outcome === 'SAC_FLY' && r3) {
      r3.startProg = 3;
      advance(r3, 4, { read: ctx.interceptTimeSec + 0.05, slide: true });
      if (lastLeg()) {
        const late = arrivalSec(r3) + 0.1 - lastLeg().tEnd;
        if (late > 0) shiftLegs(throwPlan.legs, late);
        throwPlan.callTime = arrivalSec(r3);
      }
    }
  } else {
    // Grounders: double play, fielder's choice, ground out or sacrifice bunt
    const isDoublePlay = outcome === 'DOUBLE_PLAY';
    const leadForced = outcome === 'FIELDERS_CHOICE' || isDoublePlay;
    const endsInning = outs + (isDoublePlay ? 2 : 1) >= 3;
    if (outcome === 'FIELDERS_CHOICE') {
      batterR.out = false;
      batterR.to = 1;
    }
    if (leadForced && r1) {
      advance(r1, 2, { slide: true });
      r1.out = true;
      r1.scores = false;
    }

    const forced = (r) => r.from === 1 || (r.from === 2 && r1) || (r.from === 3 && r1 && r2);
    const others = onBase.filter((r) => !(leadForced && r === r1));
    if (endsInning) {
      // The third out ends it: no runs, but with two outs everyone was running on contact
      for (const r of others) {
        if (outs === 2 || forced(r)) r.legs = [{ to: Math.min(4, r.from + 1), waitUntil: 0 }];
      }
    } else if (leadForced || outcome === 'SAC_BUNT_OUT') {
      for (const r of others) advance(r, r.from + 1, { read: forced(r) ? 0 : 0.3, rbi: !isDoublePlay });
    } else {
      // Ground out: the runner on third scores unless the infield is in (or he is forced); the runner on
      // second moves up if forced or if third is open
      if (r3) {
        if ((r1 && r2) || defPlay !== 'INFIELD_IN') advance(r3, 4, { read: forced(r3) ? 0 : 0.3 });
      }
      if (r2 && (r1 || !r3 || r3.to === 4)) advance(r2, 3, { read: forced(r2) ? 0 : 0.3 });
      if (r1) advance(r1, 2);
    }

    // Each force or putout lands before its runner does
    if (throwPlan?.legs?.length) {
      const legs = throwPlan.legs;
      if (leadForced && r1) {
        arriveNoEarlierThan(r1, legs[0].tEnd + 0.12);
        r1.outTime = legs[0].tEnd;
      }
      if (batterR.out) {
        arriveNoEarlierThan(batterR, legs[legs.length - 1].tEnd + 0.06);
        batterR.outTime = legs[legs.length - 1].tEnd;
      }
    }
  }

  for (const r of [batterR, ...onBase]) scheduleRunner(r);
  // Time play: once the third out is made, a runner who has not crossed the plate does not score
  const playOuts = [batterR, ...onBase].filter((r) => r.out).sort((a, b) => outTimeOf(a) - outTimeOf(b));
  const thirdOut = playOuts[2 - outs];
  if (thirdOut && isHit) {
    for (const r of onBase) {
      if (r.scores && r.endTime >= outTimeOf(thirdOut)) {
        // Left on base: he had rounded third when the inning ended
        r.scores = false;
        r.to = 3;
        notes.push(`${r.name} crosses the plate after the third out, so the run does not count.`);
      }
    }
  }

  // Runners who stay put step back to their base once the ball is fielded
  for (const r of onBase) {
    if (!r.legs.length && r.startProg !== r.to) r.legs = [{ to: r.to, waitUntil: (ctx.interceptTimeSec ?? 0) + 0.2 }];
  }
  for (const r of [batterR, ...onBase]) scheduleRunner(r);
  const creditedOutcome = endAtWinningRun(ctx.runsToWin, outcome, batterR, onBase, throwPlan, notes);
  scheduleRunner(batterR);
  return { runnerPlan: { batter: batterR, runners: onBase, creditedOutcome }, throwPlan, fielderTargets, notes, pickup };
}
