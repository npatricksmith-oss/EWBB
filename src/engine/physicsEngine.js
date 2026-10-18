/**
 * Earl Weaver Baseball (1987) — Stage 2: 3D Virtual Ballfield Physics Engine
 * Based on Eddie Dombrower's 3D coordinate ballfield physics architecture.
 *
 * Once the ball leaves the bat in Stage 1 (`statsMatrix.js`), player batting stats
 * no longer dictate the outcome—3D physics, wind, grass vs. artificial turf bounce,
 * ballpark fence distances & wall heights (e.g. the 37-ft Fenway Green Monster),
 * and the 9 fielders' real-time interception & arm strength determine the result.
 *
 * Coordinate System (in feet):
 * - Home Plate: (0, 0, 0)
 * - +y axis: Straight through the pitcher's mound (0, 60.5) and 2nd Base (0, 127.28) to Center Field
 * - +x axis: Toward Right Field foul side; -x axis: Toward Left Field foul side
 * - +z axis: Altitude above the playing surface (gravity g = 32.174 ft/s^2)
 */

import { getWallAtAngle } from '../data/ballparks.js';
import { normalizeOffensePlay, normalizeDefensePlay } from './statsMatrix.js';

const GRAVITY_FPS2 = 32.174;
const DT = 1 / 60;
const MAX_TIME_SEC = 7.5;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MPH_TO_FPS = 1.46667;

export const BASE_COORDS = {
  HOME: { x: 0, y: 0, z: 0 },
  FIRST: { x: 63.64, y: 63.64, z: 0 },
  SECOND: { x: 0, y: 127.28, z: 0 },
  THIRD: { x: -63.64, y: 63.64, z: 0 },
  MOUND: { x: 0, y: 60.5, z: 0.83 }
};

export const FIELDER_POSITIONS_LIST = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

/**
 * Returns the starting `(x, y)` coordinates in feet for all 9 defensive positions,
 * dynamically shifted by `defensePlay` ('INFIELD_IN', 'GUARD_LINES', 'CHARGE_BUNT', 'HOLD_RUNNER')
 * and baserunner occupancy.
 */
export function getInitialFielderPositions(defensePlay = 'NORMAL', bases = [null, null, null]) {
  const def = normalizeDefensePlay(defensePlay);
  const runnerOnFirst = Boolean(bases[0]);
  const doublePlayDepth = runnerOnFirst && !bases[2];

  // Standard 1987 EWB defensive alignment in feet
  const coords = {
    P:   { x: 0,      y: 60.5,  z: 0 },
    C:   { x: 0,      y: -3.5,  z: 0 },
    '1B': { x: 62.0,  y: 82.0,  z: 0 },
    '2B': { x: 36.0,  y: 136.0, z: 0 },
    '3B': { x: -60.0, y: 80.0,  z: 0 },
    SS:  { x: -36.0,  y: 136.0, z: 0 },
    LF:  { x: -138.0, y: 245.0, z: 0 },
    CF:  { x: 0.0,    y: 295.0, z: 0 },
    RF:  { x: 138.0,  y: 245.0, z: 0 }
  };

  if (runnerOnFirst || def === 'HOLD_RUNNER') {
    // 1B holds runner on the bag
    coords['1B'] = { x: 59.5, y: 66.5, z: 0 };
  }

  if (doublePlayDepth && def === 'NORMAL') {
    // Middle infielders pinch closer to 2B for the twin killing
    coords['2B'] = { x: 28.0, y: 129.0, z: 0 };
    coords.SS = { x: -28.0, y: 129.0, z: 0 };
  }

  if (def === 'INFIELD_IN') {
    coords['1B'] = { x: 52.0, y: 66.0, z: 0 };
    coords['2B'] = { x: 25.0, y: 102.0, z: 0 };
    coords.SS = { x: -25.0, y: 102.0, z: 0 };
    coords['3B'] = { x: -50.0, y: 64.0, z: 0 };
  } else if (def === 'CHARGE_BUNT') {
    coords['1B'] = { x: 42.0, y: 52.0, z: 0 };
    coords['3B'] = { x: -40.0, y: 50.0, z: 0 };
    coords['2B'] = { x: 46.0, y: 96.0, z: 0 }; // 2B covers 1st base bag
  } else if (def === 'GUARD_LINES') {
    coords['1B'] = { x: 68.0, y: 84.0, z: 0 };
    coords['3B'] = { x: -68.0, y: 82.0, z: 0 };
    coords.LF = { x: -158.0, y: 242.0, z: 0 };
    coords.RF = { x: 158.0, y: 242.0, z: 0 };
  } else if (def === 'OUTFIELD_DEEP') {
    coords.LF = { x: -145.0, y: 272.0, z: 0 };
    coords.CF = { x: 0.0, y: 322.0, z: 0 };
    coords.RF = { x: 145.0, y: 272.0, z: 0 };
  }

  return coords;
}

/**
 * Computes wind velocity vector (wx, wy) in ft/s from ballpark weather attributes
 */
function getParkWindVectorFps(park = {}) {
  if (!park || park.environment === 'Indoor' || !park.avgWindMph) {
    return { wx: 0, wy: 0 };
  }
  const windFps = park.avgWindMph * MPH_TO_FPS;
  const dir = String(park.prevailingWind || 'None').toLowerCase();

  if (dir.includes('left to right')) {
    return { wx: windFps, wy: windFps * 0.12 };
  }
  if (dir.includes('right to left')) {
    return { wx: -windFps, wy: windFps * 0.12 };
  }
  if (dir.includes('in from center') || dir.includes('blowing in')) {
    return { wx: 0, wy: -windFps };
  }
  if (dir.includes('out to center') || dir.includes('blowing out')) {
    return { wx: 0, wy: windFps };
  }
  if (dir.includes('out to right')) {
    return { wx: windFps * 0.707, wy: windFps * 0.707 };
  }
  if (dir.includes('out to left')) {
    return { wx: -windFps * 0.707, wy: windFps * 0.707 };
  }
  return { wx: 0, wy: 0 };
}

/**
 * Helper to look up a fielder object and their speed/arm/error ratings
 */
function buildFielderAgents(defenseFielders = {}, initialCoords = {}) {
  const agents = {};
  for (const pos of FIELDER_POSITIONS_LIST) {
    const raw = defenseFielders[pos] || {};
    const ratings = raw.ratings || {};
    const range = ratings.range ?? ratings.rnge ?? (pos === 'CF' || pos === 'SS' ? 8 : 6);
    const runs = ratings.runs ?? ratings.speed ?? (pos === 'CF' ? 8 : 6);
    const arm = ratings.arm ?? (pos === 'RF' || pos === '3B' || pos === 'SS' || pos === 'C' ? 8 : 6);
    const hands = ratings.hands ?? ratings.fielding ?? 7;

    // Exact speed and throw velocity formulas from specification:
    // speedFps = 23 + fielder.ratings.range * 0.45 + fielder.ratings.runs * 0.35
    // throwSpeedFps = 108 + fielder.ratings.arm * 4.2
    const speedFps = 23 + range * 0.45 + runs * 0.35;
    const throwSpeedFps = 108 + arm * 4.2;

    const start = initialCoords[pos] || { x: 0, y: 100, z: 0 };
    agents[pos] = {
      pos,
      name: raw.name || pos,
      x: start.x,
      y: start.y,
      z: 0,
      startX: start.x,
      startY: start.y,
      range,
      runs,
      arm,
      hands,
      speedFps,
      throwSpeedFps
    };
  }
  return agents;
}

/**
 * Helper to compute baserunner sprint speed in ft/s:
 * runnerSpeedFps = 22.5 + runner.ratings.runs * 0.65
 */
function getRunnerSpeedFps(player = {}) {
  const runs = player?.ratings?.runs ?? player?.ratings?.speed ?? 6;
  return 22.5 + runs * 0.65;
}

/**
 * Interpolates a baserunner's (x, y) position along the basepaths from baseIndex (0=Home, 1=1B, 2=2B, 3=3B, 4=Home)
 */
function getCoordsAlongBasepath(progressFloat) {
  const waypoints = [
    BASE_COORDS.HOME,
    BASE_COORDS.FIRST,
    BASE_COORDS.SECOND,
    BASE_COORDS.THIRD,
    BASE_COORDS.HOME
  ];
  const clamped = Math.max(0, Math.min(4, progressFloat));
  const idx = Math.min(3, Math.floor(clamped));
  const frac = clamped - idx;
  const p0 = waypoints[idx];
  const p1 = waypoints[idx + 1];
  return {
    x: Math.round((p0.x + (p1.x - p0.x) * frac) * 100) / 100,
    y: Math.round((p0.y + (p1.y - p0.y) * frac) * 100) / 100
  };
}

/**
 * Stage 2 Primary Entry Point:
 * Simulates the 3D batted ball flight, wind, turf/grass bounces, outfield wall collision/carom,
 * fielder pursuit/interception, and throwing vs. baserunning in `dt = 1/60s` steps.
 *
 * @param {Object} launchVector - Output from `statsMatrix.js`
 * @param {Object} context - `{ batter, pitcher, park, outs, bases, offensePlay, defensePlay, defenseFielders }`
 * @returns {Object} Complete deterministic `PlayPhysicsResult`
 */
export function simulateBattedBall(launchVector = {}, context = {}) {
  const park = context.park || {
    name: 'Memorial Stadium',
    surface: 'Grass',
    environment: 'Outdoor',
    prevailingWind: 'Left to Right',
    avgWindMph: 8,
    fenceDistances: [309, 335, 365, 380, 400, 400, 380, 365, 335, 309],
    fenceHeights: [14, 14, 7, 7, 7, 7, 7, 14, 14]
  };

  const batter = context.batter || { name: 'Batter', ratings: { runs: 6 } };
  const outs = context.outs ?? 0;
  const bases = context.bases || [null, null, null];
  const offPlay = normalizeOffensePlay(context.offensePlay);
  const defPlay = normalizeDefensePlay(context.defensePlay);

  const contactType = launchVector.contactType || 'LINE_DRIVE';
  const exitVelocityMph = launchVector.exitVelocityMph ?? 92;
  const exitVelocityFps = launchVector.exitVelocityFps ?? exitVelocityMph * MPH_TO_FPS;
  const launchAngleDeg = launchVector.launchAngleDeg ?? 16;
  const sprayAngleDeg = launchVector.sprayAngleDeg ?? 0;

  // Initial 3D velocity components
  const launchRad = launchAngleDeg * DEG_TO_RAD;
  const sprayRad = sprayAngleDeg * DEG_TO_RAD;
  let vx = launchVector.vx ?? exitVelocityFps * Math.cos(launchRad) * Math.sin(sprayRad);
  let vy = launchVector.vy ?? exitVelocityFps * Math.cos(launchRad) * Math.cos(sprayRad);
  let vz = launchVector.vz ?? exitVelocityFps * Math.sin(launchRad);

  // Ball starts at contact point 3 feet above home plate
  let x = 0;
  let y = 2.0;
  let z = 3.0;

  // Surface bounce & friction coefficients
  const isTurf = park.surface === 'Artificial Turf';
  const verticalRestitution = isTurf ? 0.64 : 0.40;
  const bounceHorizontalKeep = isTurf ? 0.86 : 0.72;
  const rollingDecelFps2 = isTurf ? 7.5 : 14.5;

  // Wind vector in ft/s
  const { wx, wy } = getParkWindVectorFps(park);

  // Outfield wall geometry at initial spray angle (also updated dynamically along flight)
  let wallInfo = {
    ...getWallAtAngle(park, sprayAngleDeg),
    parkName: park.name || 'Ballpark'
  };

  // Pre-pass or analytical estimate of first ground touchdown for fielder pursuit target
  const initialCoords = getInitialFielderPositions(defPlay, bases);
  const fielders = buildFielderAgents(context.defenseFielders || {}, initialCoords);

  // First, run a fast kinematics pass of the ball trajectory so we know where the ball is heading,
  // when/where it first touches the ground or hits the wall, and which fielders can intercept it.
  const ballSteps = [];
  let t = 0;
  let bounceCount = 0;
  let firstBounceTime = null;
  let firstBouncePoint = null;
  let hitWall = false;
  let wallCaromPoint = null;
  let isHomeRun = false;
  let peakDistanceFt = 0;
  let maxAltitudeFt = z;

  // Aerodynamic drag & backspin lift tuned for realistic sea-level MLB distances in feet
  const dragCoeff = 0.00162;
  const magnusLiftFactor = launchAngleDeg > 10 && launchAngleDeg < 45 ? 0.11 : 0.04;

  while (t < MAX_TIME_SEC) {
    const rHoriz = Math.hypot(x, y);
    if (rHoriz > peakDistanceFt) {
      peakDistanceFt = rHoriz;
    }
    if (z > maxAltitudeFt) {
      maxAltitudeFt = z;
    }

    const currentAngleDeg = Math.atan2(x, Math.max(0.1, y)) * RAD_TO_DEG;
    const currentWall = getWallAtAngle(park, currentAngleDeg);

    // Check Outfield Fence Collision / Home Run
    if (!isHomeRun && !hitWall && rHoriz >= currentWall.distanceFt) {
      wallInfo = {
        distanceFt: currentWall.distanceFt,
        heightFt: currentWall.heightFt,
        parkName: park.name || 'Ballpark'
      };

      if (z > currentWall.heightFt && bounceCount === 0) {
        // HOME RUN over the outfield fence!
        isHomeRun = true;
        ballSteps.push({ t, x, y, z, vx, vy, vz, bounceCount, hitWall, isHomeRun: true });
        break;
      } else {
        // WALL CAROM! (Either in the air off the Green Monster / Metrodome bag, or rolling into the wall)
        hitWall = true;
        wallCaromPoint = { x, y, z: Math.max(0, z), t };
        // Clamp ball just inside wall and reverse radial velocity with restitution 0.55
        const scaleBack = (currentWall.distanceFt - 1.2) / Math.max(1, rHoriz);
        x *= scaleBack;
        y *= scaleBack;
        const ux = x / Math.max(1, currentWall.distanceFt);
        const uy = y / Math.max(1, currentWall.distanceFt);
        const vRadial = vx * ux + vy * uy;
        if (vRadial > 0) {
          vx -= (1 + 0.55) * vRadial * ux;
          vy -= (1 + 0.55) * vRadial * uy;
        }
        vz *= 0.55;
      }
    }

    ballSteps.push({ t, x, y, z, vx, vy, vz, bounceCount, hitWall, isHomeRun: false });

    // Integrate next step dt
    if (z > 0.05 || vz > 0) {
      // Airborne flight with aerodynamic drag, wind drift, and Magnus lift
      const relVx = vx - wx * 0.38;
      const relVy = vy - wy * 0.38;
      const relSpeed = Math.hypot(relVx, relVy, vz);

      const ax = -dragCoeff * relSpeed * relVx;
      const ay = -dragCoeff * relSpeed * relVy;
      const az = -GRAVITY_FPS2 - dragCoeff * relSpeed * vz + GRAVITY_FPS2 * magnusLiftFactor * Math.exp(-t * 0.45);

      vx += ax * DT;
      vy += ay * DT;
      vz += az * DT;
      x += vx * DT;
      y += vy * DT;
      z += vz * DT;

      if (z <= 0) {
        z = 0;
        if (firstBounceTime === null) {
          firstBounceTime = t;
          firstBouncePoint = { x, y };
        }
        bounceCount += 1;
        if (Math.abs(vz) * verticalRestitution > 2.2 && bounceCount <= 5) {
          vz = -vz * verticalRestitution;
          vx *= bounceHorizontalKeep;
          vy *= bounceHorizontalKeep;
        } else {
          vz = 0;
          vx *= bounceHorizontalKeep;
          vy *= bounceHorizontalKeep;
        }
      }
    } else {
      // Rolling along the grass or artificial turf
      z = 0;
      const groundSpeed = Math.hypot(vx, vy);
      if (groundSpeed <= 0.5) {
        vx = 0;
        vy = 0;
        ballSteps.push({ t: t + DT, x, y, z: 0, vx: 0, vy: 0, vz: 0, bounceCount, hitWall, isHomeRun: false });
        break;
      }
      const nextSpeed = Math.max(0, groundSpeed - rollingDecelFps2 * DT);
      const ratio = nextSpeed / groundSpeed;
      vx *= ratio;
      vy *= ratio;
      x += vx * DT;
      y += vy * DT;
    }

    t += DT;
  }

  // Determine landing / target point for fielders
  const finalBallStep = ballSteps[ballSteps.length - 1];
  const landingPoint = firstBouncePoint || { x: finalBallStep.x, y: finalBallStep.y };
  const hangTimeSec = firstBounceTime ?? finalBallStep.t;

  // Evaluate Fielder Interception (Fly Ball Catch vs Ground Ball Cutoff vs Outfield Retrieval)
  let interceptedStepIndex = ballSteps.length - 1;
  let primaryFielderPos = 'CF';
  let caughtInAir = false;
  let fieldingError = false;
  let interceptPoint = { x: finalBallStep.x, y: finalBallStep.y, z: 0 };
  let interceptTimeSec = finalBallStep.t;

  if (isHomeRun) {
    // Choose nearest outfielder who watches/chases it to the wall
    primaryFielderPos = sprayAngleDeg < -15 ? 'LF' : sprayAngleDeg > 15 ? 'RF' : 'CF';
  } else {
    // 1. Check if any fielder can catch the ball in the air before firstBounceTime (and before it hits the wall!)
    const hitWallInFlight = hitWall && wallCaromPoint && (firstBounceTime === null || wallCaromPoint.t <= firstBounceTime + 0.02);
    if (firstBounceTime !== null && firstBounceTime > 0.38 && !hitWallInFlight) {
      let bestAirFielder = null;
      let bestMarginSec = -999;

      for (const pos of FIELDER_POSITIONS_LIST) {
        // Infielders only track pop-ups/fly balls (launchAngle >= 22°) in Step 1; low liners are checked in Step 2
        const isOutfielder = pos === 'LF' || pos === 'CF' || pos === 'RF';
        if (!isOutfielder && launchAngleDeg < 22) continue;

        const f = fielders[pos];
        const distToLand = Math.hypot(landingPoint.x - f.startX, landingPoint.y - f.startY);
        // Shallow sinking base-hit liners (< 16.5°) landing more than 18 ft in front of an outfielder bounce cleanly
        if (isOutfielder && launchAngleDeg < 16.5 && distToLand > 18) continue;
        // Sinking line drives (< 19°) are harder for outfielders to read off the bat than high fly balls
        const linerReadDelay = isOutfielder && launchAngleDeg < 19 ? 0.42 : 0;
        const reactionSec = Math.max(0.18, 0.38 - f.range * 0.02) + linerReadDelay;
        const travelTimeSec = reactionSec + Math.max(0, distToLand - 3.2) / f.speedFps;
        const marginSec = firstBounceTime - travelTimeSec;

        if (marginSec >= -0.06 && marginSec > bestMarginSec) {
          bestMarginSec = marginSec;
          bestAirFielder = pos;
        }
      }

      if (bestAirFielder) {
        const f = fielders[bestAirFielder];
        const catchProb = bestMarginSec >= 0.14
          ? 0.992
          : Math.min(0.94, 0.42 + (bestMarginSec + 0.06) * 2.2 + f.range * 0.03);

        if (Math.random() < catchProb) {
          caughtInAir = true;
          primaryFielderPos = bestAirFielder;
          interceptedStepIndex = Math.max(1, Math.min(ballSteps.length - 1, Math.round(firstBounceTime / DT)));
          const stepAtCatch = ballSteps[interceptedStepIndex];
          interceptPoint = { x: stepAtCatch.x, y: stepAtCatch.y, z: Math.max(2.5, stepAtCatch.z) };
          interceptTimeSec = stepAtCatch.t;
        }
      }
    }

    // 2. Check line-drive snare by an infielder once per fielder at closest approach (only for true liners >= 7.5 deg)
    if (!caughtInAir && !hitWallInFlight && launchAngleDeg >= 7.5 && launchAngleDeg <= 21) {
      for (const pos of ['P', '1B', '2B', '3B', 'SS']) {
        const f = fielders[pos];
        let minStepIdx = -1;
        let minDist = 999;
        for (let i = 4; i < ballSteps.length; i++) {
          const step = ballSteps[i];
          if (step.bounceCount > 0 || step.y > 155) break;
          if (step.z <= 8.0) {
            const d = Math.hypot(step.x - f.startX, step.y - f.startY);
            if (d < minDist) {
              minDist = d;
              minStepIdx = i;
            }
          }
        }
        if (minStepIdx !== -1) {
          const step = ballSteps[minStepIdx];
          const reactionSec = 0.26;
          const maxReach = Math.min(4.4, 2.2 + Math.max(0, step.t - reactionSec) * f.speedFps * 0.35);
          if (minDist <= maxReach && Math.random() < 0.35) {
            caughtInAir = true;
            primaryFielderPos = pos;
            interceptedStepIndex = minStepIdx;
            interceptPoint = { x: step.x, y: step.y, z: step.z };
            interceptTimeSec = step.t;
            break;
          }
        }
      }
    }

    // 3. If not caught in the air, find the earliest ground/carom interception by any of the 9 fielders AFTER first bounce
    if (!caughtInAir) {
      let foundGroundIntercept = false;
      const firstBounceDist = firstBouncePoint ? Math.hypot(firstBouncePoint.x, firstBouncePoint.y) : 0;
      const bouncedBeyondInfield = firstBounceDist >= 142;

      for (let i = 5; i < ballSteps.length; i++) {
        const step = ballSteps[i];
        // Fielder can only field a ground/bouncing ball after it has bounced (bounceCount >= 1) and z <= 6.5 ft
        if (step.bounceCount === 0 || step.z > 6.5) continue;

        for (const pos of FIELDER_POSITIONS_LIST) {
          const isOutfielder = pos === 'LF' || pos === 'CF' || pos === 'RF';
          // Line drives / fly balls that first bounce in the outfield (>= 142 ft) are fielded by outfielders
          if (bouncedBeyondInfield && !isOutfielder) continue;

          const f = fielders[pos];
          const d = Math.hypot(step.x - f.startX, step.y - f.startY);
          const reactionSec = pos === 'P' ? 0.24 : Math.max(0.18, 0.34 - f.range * 0.016);
          const reachableDist = Math.max(0, (step.t - reactionSec) * f.speedFps) + 2.8;

          if (d <= reachableDist) {
            primaryFielderPos = pos;
            interceptedStepIndex = i;
            interceptPoint = { x: step.x, y: step.y, z: step.z };
            interceptTimeSec = step.t;
            foundGroundIntercept = true;
            break;
          }
        }
        if (foundGroundIntercept) break;
      }

      // 4. If the ball came to rest or rolled deep before any fielder reached it, find nearest fielder to retrieve it
      if (!foundGroundIntercept) {
        let bestRetrievalTime = 999;
        for (const pos of FIELDER_POSITIONS_LIST) {
          const f = fielders[pos];
          const d = Math.hypot(finalBallStep.x - f.startX, finalBallStep.y - f.startY);
          const tReach = 0.30 + d / f.speedFps;
          if (tReach < bestRetrievalTime) {
            bestRetrievalTime = tReach;
            primaryFielderPos = pos;
          }
        }
        interceptTimeSec = Math.max(finalBallStep.t, bestRetrievalTime + 0.35);
        interceptPoint = { x: finalBallStep.x, y: finalBallStep.y, z: 0 };
        interceptedStepIndex = ballSteps.length - 1;
      }
    }
  }

  // Only count wall hit if the ball actually reached the wall prior to being fielded/intercepted
  const hitWallBeforeIntercept = Boolean(hitWall && wallCaromPoint && wallCaromPoint.t <= interceptTimeSec + 0.02);
  hitWall = hitWallBeforeIntercept;

  // Resolve exact baseball outcome, baserunner advancement, and throws
  const primaryFielder = fielders[primaryFielderPos];
  const batterRunnerSpeedFps = getRunnerSpeedFps(batter);
  const timeToFirstBaseSec = 0.48 + 90 / batterRunnerSpeedFps; // ~3.65s (elite speed) to ~4.25s (slow)

  let outcome = 'OUT_GROUND';
  let basesReached = 0; // for batter: 0=out, 1=1B, 2=2B, 3=3B, 4=HR
  let runsScored = 0;
  let outsRecorded = 0;

  if (isHomeRun) {
    outcome = 'HOME_RUN';
    basesReached = 4;
    runsScored = 1 + bases.filter(Boolean).length;
  } else if (caughtInAir) {
    outsRecorded = 1;
    if (contactType === 'POP_UP' || peakDistanceFt < 145) {
      outcome = 'OUT_POP';
    } else if (contactType === 'LINE_DRIVE' && launchAngleDeg < 21) {
      outcome = 'OUT_LINE';
    } else {
      outcome = 'OUT_FLY';
    }

    // Check Sacrifice Fly when runner is on 3rd with < 2 outs and fly ball is deep enough (>= 225 ft)
    if (outs < 2 && bases[2] && peakDistanceFt >= 225) {
      const runner3BSpeed = getRunnerSpeedFps(bases[2]);
      const tagUpRunTime = 90 / (runner3BSpeed * 1.03);
      const throwDistToHome = Math.hypot(interceptPoint.x, interceptPoint.y);
      const throwTimeToHome = 0.56 + throwDistToHome / primaryFielder.throwSpeedFps;
      if (tagUpRunTime < throwTimeToHome) {
        outcome = 'SAC_FLY';
        runsScored = 1;
      }
    }
  } else {
    // Ball hit the ground or caromed off the wall!
    const isOutfielderPickup = primaryFielderPos === 'LF' || primaryFielderPos === 'CF' || primaryFielderPos === 'RF';
    const isInfieldPickup =
      !isOutfielderPickup &&
      Math.hypot(interceptPoint.x, interceptPoint.y) < 160 &&
      !hitWallBeforeIntercept;

    if (isInfieldPickup) {
      // Check for rare fielding error on hard-hit grounders
      const errorChance = Math.max(0.008, (11 - primaryFielder.hands) * 0.0055);
      if (Math.random() < errorChance) {
        fieldingError = true;
        outcome = 'ERROR';
        basesReached = 1;
      } else if (contactType === 'BUNT' && offPlay === 'SACRIFICE_BUNT' && outs < 2 && (bases[0] || bases[1])) {
        outcome = 'SAC_BUNT_OUT';
        outsRecorded = 1;
        basesReached = 0;
      } else {
        // Compute pickup transfer time + throw to 1st Base (or 2B->1B Double Play)
        const transferSec = 0.46 + Math.max(0, (8 - primaryFielder.hands) * 0.03);
        const distToFirst = Math.hypot(
          interceptPoint.x - BASE_COORDS.FIRST.x,
          interceptPoint.y - BASE_COORDS.FIRST.y
        );
        const throwTimeSec = distToFirst / primaryFielder.throwSpeedFps;
        const totalDefenseTimeSec = interceptTimeSec + transferSec + throwTimeSec;

        // Check Double Play opportunity (Runner on 1st, < 2 outs, grounder fielded cleanly in < 2.2s)
        const runnerOnFirst = bases[0];
        const isHitAndRunOrSteal = offPlay === 'HIT_AND_RUN' || offPlay === 'RUN_AND_HIT' || offPlay === 'STEAL';

        if (runnerOnFirst && outs < 2 && !isHitAndRunOrSteal && interceptTimeSec < 2.15 && primaryFielderPos !== '1B') {
          const distToSecond = Math.hypot(
            interceptPoint.x - BASE_COORDS.SECOND.x,
            interceptPoint.y - BASE_COORDS.SECOND.y
          );
          const pivotFielder = primaryFielderPos === '2B' ? fielders.SS : fielders['2B'];
          const throwTo2BSec = distToSecond / primaryFielder.throwSpeedFps;
          const relayTurnSec = 0.52;
          const relayTo1BSec = 90 / pivotFielder.throwSpeedFps;
          const totalDpTime = interceptTimeSec + 0.38 + throwTo2BSec + relayTurnSec + relayTo1BSec;

          if (totalDpTime < timeToFirstBaseSec + 0.12) {
            outcome = 'DOUBLE_PLAY';
            outsRecorded = 2;
            basesReached = 0;
          } else if (interceptTimeSec + 0.38 + throwTo2BSec < 90 / getRunnerSpeedFps(runnerOnFirst)) {
            outcome = 'FIELDERS_CHOICE';
            outsRecorded = 1;
            basesReached = 1;
          } else if (totalDefenseTimeSec < timeToFirstBaseSec) {
            outcome = 'OUT_GROUND';
            outsRecorded = 1;
            basesReached = 0;
          } else {
            outcome = 'SINGLE';
            basesReached = 1;
          }
        } else if (totalDefenseTimeSec < timeToFirstBaseSec) {
          outcome = 'OUT_GROUND';
          outsRecorded = 1;
          basesReached = 0;
        } else {
          // Beat out an infield single!
          outcome = 'SINGLE';
          basesReached = 1;
        }
      }
    } else {
      // Ball reached the outfield grass/turf or caromed off the wall!
      const distToSecond = Math.hypot(
        interceptPoint.x - BASE_COORDS.SECOND.x,
        interceptPoint.y - BASE_COORDS.SECOND.y
      );
      const isGapOrLine =
        (Math.abs(sprayAngleDeg) >= 13 && Math.abs(sprayAngleDeg) <= 27) ||
        Math.abs(sprayAngleDeg) >= 36;
      const turnAndTransferSec = hitWallBeforeIntercept
        ? (wallInfo.heightFt >= 25 && wallInfo.distanceFt <= 325 ? 0.85 : 1.35)
        : isGapOrLine && peakDistanceFt >= 240
        ? 1.15
        : 0.42;

      const throwToSecondArrivalSec =
        interceptTimeSec + turnAndTransferSec + distToSecond / primaryFielder.throwSpeedFps;
      const runnerToSecondSec = 171 / batterRunnerSpeedFps;
      const intended = launchVector.intendedResult;

      if (
        (intended === 'TRIPLE' && peakDistanceFt >= 275) ||
        (intended === 'HOME_RUN' && hitWallBeforeIntercept && peakDistanceFt >= 355 && batterRunnerSpeedFps >= 28.5 && Math.random() < 0.18)
      ) {
        outcome = 'TRIPLE';
        basesReached = 3;
      } else if (
        (intended === 'DOUBLE' && peakDistanceFt >= 200 && !(hitWallBeforeIntercept && wallInfo.heightFt >= 25 && wallInfo.distanceFt <= 320 && batterRunnerSpeedFps < 26.8 && Math.random() < 0.28)) ||
        (intended === 'HOME_RUN' && hitWallBeforeIntercept)
      ) {
        outcome = 'DOUBLE';
        basesReached = 2;
      } else {
        outcome = 'SINGLE';
        basesReached = 1;
      }
    }
  }

  // Determine post-interception Throw & Relay choreography for 60fps animation
  let throwPlan = null;
  if (!isHomeRun) {
    if (outcome === 'DOUBLE_PLAY') {
      const pivotPos = primaryFielderPos === '2B' ? 'SS' : '2B';
      const dist1 = Math.hypot(interceptPoint.x - BASE_COORDS.SECOND.x, interceptPoint.y - BASE_COORDS.SECOND.y);
      const tStart1 = interceptTimeSec + 0.30;
      const tEnd1 = tStart1 + Math.max(0.22, dist1 / primaryFielder.throwSpeedFps);
      const tStart2 = tEnd1 + 0.34;
      const dist2 = Math.hypot(BASE_COORDS.SECOND.x - BASE_COORDS.FIRST.x, BASE_COORDS.SECOND.y - BASE_COORDS.FIRST.y);
      const pivotSpeed = fielders[pivotPos]?.throwSpeedFps || 132;
      const tEnd2 = tStart2 + dist2 / pivotSpeed;
      throwPlan = {
        legs: [
          { fromPos: primaryFielderPos, toPos: pivotPos, fromPt: interceptPoint, toPt: BASE_COORDS.SECOND, tStart: tStart1, tEnd: tEnd1, peakZ: 6.5 },
          { fromPos: pivotPos, toPos: '1B', fromPt: BASE_COORDS.SECOND, toPt: BASE_COORDS.FIRST, tStart: tStart2, tEnd: tEnd2, peakZ: 7.0 }
        ],
        callBase: '1B',
        callType: 'OUT',
        callTime: tEnd2
      };
    } else if (outcome === 'FIELDERS_CHOICE') {
      const pivotPos = primaryFielderPos === '2B' ? 'SS' : '2B';
      const dist1 = Math.hypot(interceptPoint.x - BASE_COORDS.SECOND.x, interceptPoint.y - BASE_COORDS.SECOND.y);
      const tStart1 = interceptTimeSec + 0.32;
      const tEnd1 = tStart1 + Math.max(0.24, dist1 / primaryFielder.throwSpeedFps);
      throwPlan = {
        legs: [
          { fromPos: primaryFielderPos, toPos: pivotPos, fromPt: interceptPoint, toPt: BASE_COORDS.SECOND, tStart: tStart1, tEnd: tEnd1, peakZ: 6.5 }
        ],
        callBase: '2B',
        callType: 'OUT',
        callTime: tEnd1
      };
    } else if (outcome === 'OUT_GROUND' || outcome === 'SAC_BUNT_OUT') {
      const dist1 = Math.hypot(interceptPoint.x - BASE_COORDS.FIRST.x, interceptPoint.y - BASE_COORDS.FIRST.y);
      const tStart1 = interceptTimeSec + 0.34;
      const tEnd1 = tStart1 + Math.max(0.22, dist1 / primaryFielder.throwSpeedFps);
      throwPlan = {
        legs: [
          { fromPos: primaryFielderPos, toPos: '1B', fromPt: interceptPoint, toPt: BASE_COORDS.FIRST, tStart: tStart1, tEnd: tEnd1, peakZ: 7.5 }
        ],
        callBase: '1B',
        callType: 'OUT',
        callTime: tEnd1
      };
    } else if (outcome === 'SAC_FLY') {
      const distHome = Math.hypot(interceptPoint.x - BASE_COORDS.HOME.x, interceptPoint.y - BASE_COORDS.HOME.y);
      const tStart1 = interceptTimeSec + 0.38;
      const tEnd1 = tStart1 + Math.max(0.45, distHome / primaryFielder.throwSpeedFps);
      throwPlan = {
        legs: [
          { fromPos: primaryFielderPos, toPos: 'C', fromPt: interceptPoint, toPt: BASE_COORDS.HOME, tStart: tStart1, tEnd: tEnd1, peakZ: 14.0 }
        ],
        callBase: 'HOME',
        callType: 'SAFE',
        callTime: tEnd1
      };
    } else if (!caughtInAir && (outcome === 'SINGLE' || outcome === 'DOUBLE' || outcome === 'TRIPLE' || outcome === 'ERROR')) {
      // Outfielder or infielder fires throw into the target base (2B for single/double, 3B for triple, 1B for infield hit)
      const targetCoords =
        outcome === 'TRIPLE'
          ? BASE_COORDS.THIRD
          : outcome === 'DOUBLE' || Math.hypot(interceptPoint.x, interceptPoint.y) > 155
          ? BASE_COORDS.SECOND
          : BASE_COORDS.FIRST;
      const receiverPos =
        targetCoords === BASE_COORDS.THIRD ? '3B' : targetCoords === BASE_COORDS.SECOND ? 'SS' : '1B';
      const distThrow = Math.hypot(interceptPoint.x - targetCoords.x, interceptPoint.y - targetCoords.y);
      const tStart1 = interceptTimeSec + (hitWall ? 0.48 : 0.34);
      const tEnd1 = tStart1 + Math.max(0.28, distThrow / primaryFielder.throwSpeedFps);
      throwPlan = {
        legs: [
          { fromPos: primaryFielderPos, toPos: receiverPos, fromPt: interceptPoint, toPt: targetCoords, tStart: tStart1, tEnd: tEnd1, peakZ: Math.min(13, 5.5 + distThrow * 0.03) }
        ],
        callBase: outcome === 'TRIPLE' ? '3B' : outcome === 'DOUBLE' ? '2B' : '1B',
        callType: 'SAFE',
        callTime: Math.min(tEnd1, (basesReached * 90) / batterRunnerSpeedFps)
      };
    } else if (caughtInAir) {
      throwPlan = {
        legs: [],
        callBase: Math.hypot(interceptPoint.x, interceptPoint.y) > 165 ? '2B' : '1B',
        callType: 'OUT',
        callTime: interceptTimeSec + 0.1
      };
    }
  }

  const lastThrowEndSec =
    throwPlan && throwPlan.legs.length > 0
      ? throwPlan.legs[throwPlan.legs.length - 1].tEnd
      : interceptTimeSec;

  // Build 60fps synchronized animation frames (`ball`, `fielders`, `runners`, `umpireCall`) for the 1987 Full-Field Canvas & Instant Replay
  const totalPlayFrames = isHomeRun
    ? Math.min(ballSteps.length + 45, 360)
    : Math.min(360, Math.ceil((Math.max(lastThrowEndSec, interceptTimeSec) + 0.72) / DT));

  const frames = [];
  for (let i = 0; i < totalPlayFrames; i++) {
    const step = ballSteps[Math.min(i, Math.min(ballSteps.length - 1, interceptedStepIndex))];
    const frameTime = i * DT;

    // 1. Compute 3D Ball State (Batted Flight -> Fielder Transfer -> 3D Throw/Relay Flight -> Receiver Glove)
    let ballState;
    let activeThrowLeg = null;
    let ballHolderPos = null;

    if (!isHomeRun && i >= interceptedStepIndex) {
      if (throwPlan && throwPlan.legs.length > 0) {
        for (const leg of throwPlan.legs) {
          if (frameTime < leg.tStart) {
            ballHolderPos = leg.fromPos;
            ballState = {
              x: Math.round(leg.fromPt.x * 100) / 100,
              y: Math.round(leg.fromPt.y * 100) / 100,
              z: 4.2,
              vx: 0,
              vy: 0,
              vz: 0,
              isThrow: false
            };
            break;
          } else if (frameTime >= leg.tStart && frameTime <= leg.tEnd) {
            activeThrowLeg = leg;
            const prog = Math.max(0, Math.min(1, (frameTime - leg.tStart) / Math.max(0.05, leg.tEnd - leg.tStart)));
            const bx = leg.fromPt.x + (leg.toPt.x - leg.fromPt.x) * prog;
            const by = leg.fromPt.y + (leg.toPt.y - leg.fromPt.y) * prog;
            const bz = 4.5 + Math.sin(prog * Math.PI) * (leg.peakZ - 4.5);
            ballState = {
              x: Math.round(bx * 100) / 100,
              y: Math.round(by * 100) / 100,
              z: Math.round(bz * 100) / 100,
              vx: Math.round(((leg.toPt.x - leg.fromPt.x) / (leg.tEnd - leg.tStart)) * 10) / 10,
              vy: Math.round(((leg.toPt.y - leg.fromPt.y) / (leg.tEnd - leg.tStart)) * 10) / 10,
              vz: 0,
              isThrow: true
            };
            break;
          }
        }
        if (!ballState) {
          const finalLeg = throwPlan.legs[throwPlan.legs.length - 1];
          ballHolderPos = finalLeg.toPos;
          ballState = {
            x: Math.round(finalLeg.toPt.x * 100) / 100,
            y: Math.round(finalLeg.toPt.y * 100) / 100,
            z: 3.8,
            vx: 0,
            vy: 0,
            vz: 0,
            isThrow: false
          };
        }
      } else {
        ballHolderPos = primaryFielderPos;
        ballState = {
          x: Math.round(interceptPoint.x * 100) / 100,
          y: Math.round(interceptPoint.y * 100) / 100,
          z: caughtInAir ? 5.0 : 3.2,
          vx: 0,
          vy: 0,
          vz: 0,
          isThrow: false
        };
      }
    } else {
      ballState = {
        x: Math.round(step.x * 100) / 100,
        y: Math.round(step.y * 100) / 100,
        z: Math.round(Math.max(0, step.z) * 100) / 100,
        vx: Math.round(step.vx * 10) / 10,
        vy: Math.round(step.vy * 10) / 10,
        vz: Math.round(step.vz * 10) / 10,
        isThrow: false
      };
    }

    // 2. Position all 9 fielders with kinetic poses (`READY`, `RUNNING`, `FIELDING_GROUND`, `FIELDING_AIR`, `THROWING`, `RECEIVING`)
    const secondBaseCoverPos = interceptPoint.x >= 0 ? 'SS' : '2B';
    const fielderSnapshot = {};
    for (const pos of FIELDER_POSITIONS_LIST) {
      const f = fielders[pos];
      let targetX = f.startX;
      let targetY = f.startY;

      if (pos === primaryFielderPos) {
        targetX = interceptPoint.x;
        targetY = interceptPoint.y;
      } else if (pos === '1B' && !isHomeRun && !caughtInAir) {
        targetX = BASE_COORDS.FIRST.x;
        targetY = BASE_COORDS.FIRST.y;
      } else if (pos === 'P' && primaryFielderPos === '1B' && !isHomeRun && !caughtInAir) {
        // Pitcher covers 1st when 1B fields the ball!
        targetX = BASE_COORDS.FIRST.x - 4;
        targetY = BASE_COORDS.FIRST.y;
      } else if (pos === secondBaseCoverPos && !isHomeRun && !caughtInAir) {
        targetX = BASE_COORDS.SECOND.x;
        targetY = BASE_COORDS.SECOND.y;
      } else if (pos === '3B' && !isHomeRun && outcome === 'TRIPLE') {
        targetX = BASE_COORDS.THIRD.x;
        targetY = BASE_COORDS.THIRD.y;
      } else if (['LF', 'CF', 'RF'].includes(pos)) {
        targetX = f.startX + (interceptPoint.x - f.startX) * 0.45;
        targetY = f.startY + (interceptPoint.y - f.startY) * 0.45;
      }

      const dx = targetX - f.startX;
      const dy = targetY - f.startY;
      const dist = Math.hypot(dx, dy);
      const reactionDelay = pos === primaryFielderPos ? 0.14 : 0.22;
      const maxMove = Math.max(0, frameTime - reactionDelay) * f.speedFps;
      const ratio = dist > 0.01 ? Math.min(1, maxMove / dist) : 1;
      const isMoving = dist > 1.5 && ratio > 0 && ratio < 1;

      let pose = isMoving ? 'RUNNING' : 'READY';
      if (!isHomeRun && pos === primaryFielderPos) {
        if (Math.abs(frameTime - interceptTimeSec) <= 0.22) {
          pose = caughtInAir ? 'FIELDING_AIR' : 'FIELDING_GROUND';
        } else if (frameTime > interceptTimeSec && frameTime <= interceptTimeSec + 0.55 && throwPlan?.legs?.length) {
          pose = 'THROWING';
        }
      } else if (activeThrowLeg && pos === activeThrowLeg.fromPos) {
        pose = 'THROWING';
      } else if (activeThrowLeg && pos === activeThrowLeg.toPos) {
        pose = 'RECEIVING';
      }

      fielderSnapshot[pos] = {
        x: Math.round((f.startX + dx * ratio) * 100) / 100,
        y: Math.round((f.startY + dy * ratio) * 100) / 100,
        z: pose === 'FIELDING_AIR' && maxAltitudeFt > 7 ? 2.5 : 0,
        vx: isMoving ? (dx / dist) * f.speedFps : 0,
        vy: isMoving ? (dy / dist) * f.speedFps : 0,
        isMoving,
        stridePhase: Math.round(frameTime * f.speedFps * 0.65 * 100) / 100,
        pose,
        hasBall: pos === ballHolderPos
      };
    }

    // 3. Position Baserunners with running stride cycles and head/feet-first slides into bases
    const runnerSnapshot = [];
    const targetBatterBase = isHomeRun ? 4 : Math.max(1, basesReached);
    const rawBatterProg = (frameTime * batterRunnerSpeedFps) / 90;
    const batterProgress = Math.min(targetBatterBase, rawBatterProg);
    const batterCoords = getCoordsAlongBasepath(batterProgress);
    const batterDistRemainingFt = (targetBatterBase - batterProgress) * 90;
    const batterSliding =
      !isHomeRun &&
      targetBatterBase >= 2 &&
      batterDistRemainingFt > 0 &&
      batterDistRemainingFt <= 13;

    runnerSnapshot.push({
      id: batter.id || batter.name || 'batter',
      name: batter.name || 'Batter',
      label: (batter.name || 'BAT').split(' ').pop().slice(0, 3).toUpperCase(),
      startBase: 0,
      targetBase: basesReached,
      x: batterCoords.x,
      y: batterCoords.y,
      isMoving: batterProgress < targetBatterBase,
      stridePhase: Math.round(frameTime * batterRunnerSpeedFps * 0.68 * 100) / 100,
      isSliding: batterSliding
    });

    for (let bIdx = 0; bIdx < 3; bIdx++) {
      const r = bases[bIdx];
      if (!r) continue;
      const rSpeed = getRunnerSpeedFps(r);
      const startBaseNum = bIdx + 1;
      const leadOffset =
        offPlay === 'RUN_AND_HIT' || offPlay === 'HIT_AND_RUN' || offPlay === 'STEAL'
          ? 0.28
          : 0.11;
      const isForced = bIdx === 0 || (bIdx === 1 && bases[0]) || (bIdx === 2 && bases[0] && bases[1]);
      let advanceBases = 0;
      if (isHomeRun) {
        advanceBases = 4 - startBaseNum;
      } else if (basesReached >= 1) {
        advanceBases = basesReached;
      } else if (outcome === 'SAC_FLY' && startBaseNum === 3) {
        advanceBases = 1;
      } else if (outcome === 'SAC_BUNT_OUT' || isForced) {
        advanceBases = 1;
      }

      const maxTargetBase = Math.min(4, startBaseNum + advanceBases);
      const rProgress =
        caughtInAir && outcome !== 'SAC_FLY'
          ? startBaseNum + leadOffset * 0.5
          : caughtInAir && outcome === 'SAC_FLY' && startBaseNum === 3
          ? frameTime < interceptTimeSec
            ? 3.04
            : Math.min(4, 3.04 + ((frameTime - interceptTimeSec) * rSpeed) / 90)
          : advanceBases === 0
          ? startBaseNum + leadOffset * 0.75
          : Math.min(maxTargetBase, startBaseNum + leadOffset + (frameTime * rSpeed) / 90);

      const clampedProg = Math.min(maxTargetBase, rProgress);
      const rCoords = getCoordsAlongBasepath(clampedProg);
      const remFt = (maxTargetBase - clampedProg) * 90;
      const isSliding = !isHomeRun && advanceBases > 0 && (!caughtInAir || outcome === 'SAC_FLY') && remFt > 0 && remFt <= 13;

      runnerSnapshot.push({
        id: r.id || r.name || `runner_${startBaseNum}`,
        name: r.name || `Runner ${startBaseNum}B`,
        label: (r.name || `R${startBaseNum}`).split(' ').pop().slice(0, 3).toUpperCase(),
        startBase: startBaseNum,
        targetBase: maxTargetBase,
        x: rCoords.x,
        y: rCoords.y,
        isMoving: advanceBases > 0 && clampedProg < maxTargetBase && (!caughtInAir || outcome === 'SAC_FLY'),
        stridePhase: Math.round(frameTime * rSpeed * 0.68 * 100) / 100,
        isSliding
      });
    }

    const wallHitFlash =
      hitWall && wallCaromPoint && Math.abs(frameTime - wallCaromPoint.t) <= 0.14;

    const umpireCall =
      throwPlan && frameTime >= throwPlan.callTime - 0.05
        ? { base: throwPlan.callBase, call: throwPlan.callType }
        : null;

    frames.push({
      t: Math.round(frameTime * 1000) / 1000,
      ball: ballState,
      fielders: fielderSnapshot,
      runners: runnerSnapshot,
      wallHitFlash,
      umpireCall
    });
  }

  const roundedDistanceFt = Math.round(peakDistanceFt);
  const description = buildPlayByPlayDescription({
    batter,
    primaryFielder,
    outcome,
    contactType,
    roundedDistanceFt,
    sprayAngleDeg,
    hitWall,
    wallInfo,
    park,
    isTurf
  });

  return {
    outcome,
    hitWall,
    wallInfo,
    distanceFt: roundedDistanceFt,
    maxAltitudeFt: Math.round(maxAltitudeFt),
    hangTimeSec: Math.round(hangTimeSec * 100) / 100,
    PrimaryFielderPos: primaryFielderPos,
    primaryFielderPos,
    basesReached,
    outsRecorded,
    runsScored,
    fieldingError,
    launchVector,
    frames,
    description
  };
}

/**
 * Generates an authentic 1987 Earl Weaver Baseball play-by-play call
 * highlighting the 3D physics and ballpark geometry override.
 */
function buildPlayByPlayDescription({
  batter,
  primaryFielder,
  outcome,
  contactType,
  roundedDistanceFt,
  sprayAngleDeg,
  hitWall,
  wallInfo,
  park,
  isTurf
}) {
  const dirLabel =
    sprayAngleDeg < -26
      ? 'down the LF line'
      : sprayAngleDeg < -10
      ? 'into the left-center alley'
      : sprayAngleDeg <= 10
      ? 'to straightaway center field'
      : sprayAngleDeg <= 26
      ? 'into the right-center gap'
      : 'down the RF line';

  const wallName =
    park.id === 'fenway' && sprayAngleDeg < -5
      ? `${wallInfo.heightFt}-ft Green Monster`
      : park.id === 'metrodome' && sprayAngleDeg > 5
      ? `${wallInfo.heightFt}-ft Metrodome RF bag`
      : `${wallInfo.heightFt}-ft ${park.name || 'outfield'} wall`;

  if (outcome === 'HOME_RUN') {
    return `Deep drive ${dirLabel} (${roundedDistanceFt} ft)... clears the ${wallName} (${wallInfo.distanceFt} ft)! HOME RUN for ${batter.name}!`;
  }

  if (hitWall) {
    const hitLabel =
      outcome === 'SINGLE'
        ? `held to a loud wall-ball single!`
        : outcome === 'DOUBLE'
        ? `cruises into second with a stand-up double off the wall!`
        : `races all the way to third for a triple!`;
    return `Deep drive ${dirLabel} (${roundedDistanceFt} ft)... bangs high off the ${wallName}! Fielded on the carom by ${primaryFielder.name}, ${hitLabel}`;
  }

  if (outcome === 'OUT_FLY') {
    const trackNote =
      roundedDistanceFt >= wallInfo.distanceFt - 22
        ? ` on the warning track just in front of the ${wallName}`
        : '';
    return `High fly ball ${dirLabel} (${roundedDistanceFt} ft)... ${primaryFielder.name} tracks it down${trackNote} for the out.`;
  }

  if (outcome === 'SAC_FLY') {
    return `Deep fly ball ${dirLabel} (${roundedDistanceFt} ft) caught by ${primaryFielder.name}. The runner tags from third and beats the ${Math.round(primaryFielder.throwSpeedFps / MPH_TO_FPS)} mph throw home—Sacrifice Fly!`;
  }

  if (outcome === 'OUT_LINE') {
    return `Smoking line drive (${roundedDistanceFt} ft) snared by ${primaryFielder.name} at ${primaryFielder.pos}!`;
  }

  if (outcome === 'OUT_POP') {
    return `Towering pop-up (${roundedDistanceFt} ft)... ${primaryFielder.name} calls for it and squeezes it for the out.`;
  }

  if (outcome === 'DOUBLE_PLAY') {
    return `Sharp grounder to ${primaryFielder.name} at ${primaryFielder.pos}—flips to second for one, relay to first in time! Double Play!`;
  }

  if (outcome === 'FIELDERS_CHOICE') {
    return `Ground ball fielded by ${primaryFielder.name} at ${primaryFielder.pos}, fires to second to force the lead runner. ${batter.name} reaches first on the fielder's choice.`;
  }

  if (outcome === 'SAC_BUNT_OUT') {
    return `${batter.name} lays down a sacrifice bunt fielded by ${primaryFielder.name}, who throws to first while the runners move up 90 feet.`;
  }

  if (outcome === 'OUT_GROUND') {
    return `Ground ball to ${primaryFielder.name} at ${primaryFielder.pos}, fires across the diamond (${Math.round(primaryFielder.throwSpeedFps / MPH_TO_FPS)} mph) to retire ${batter.name}.`;
  }

  if (outcome === 'ERROR') {
    return `Hard grounder to ${primaryFielder.pos}—booted by ${primaryFielder.name}! ${batter.name} reaches first on the error!`;
  }

  const turfNote =
    isTurf && contactType === 'GROUNDER'
      ? ' skids fast off the artificial turf and'
      : '';

  if (outcome === 'TRIPLE') {
    return `Scorching drive ${dirLabel} (${roundedDistanceFt} ft)${turfNote} rolls to the wall! ${batter.name} legs out a stand-up triple!`;
  }

  if (outcome === 'DOUBLE') {
    return `Ripped ${dirLabel} (${roundedDistanceFt} ft)${turfNote} splits the outfielders! ${primaryFielder.name} cuts it off as ${batter.name} slides into second with a double!`;
  }

  return `Sharp hit ${dirLabel} (${roundedDistanceFt} ft)${turfNote} drops in front of ${primaryFielder.name} for a base hit!`;
}
