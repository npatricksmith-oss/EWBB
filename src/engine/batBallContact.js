/**
 * Contact-conditioned shaping of the matrix's calibrated batted-ball profiles.
 * Field x is positive toward RF; RHB pull toward LF. No additional random rolls:
 * the sampled profile describes the swing the hitter attempted on this pitch.
 */
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const round = (value, digits = 3) => Number(value.toFixed(digits));

/**
 * `swing` optionally supplies timing (seconds, positive = early), verticalOffset
 * (inches, positive = bat below ball), planeDeg, batSpeedMph, and barrelOffset
 * (0 = sweet spot, -1 = handle, +1 = end). Defaults are conditioned on the tier.
 * Explicit swing inputs still obey the tier envelope: this is Manage-mode
 * shaping, not an uncalibrated arcade replacement for the matchup matrix.
 */
export function shapeBatBallContact(profile, pitch = {}, batter = {}, swing = {}) {
  const pullSign = profile.batterHand === 'L' ? 1 : -1;
  const pitchMph = clamp(finite(pitch.velocityMph, 90), 40, 110);
  const plateX = clamp(finite(pitch.plateX, 0), -2, 2);
  const plateZ = clamp(finite(pitch.plateZ, 2.5), 0.3, 5);
  const breakX = clamp(finite(pitch.curveBreakX, 0), -2, 2);
  const breakZ = clamp(finite(pitch.curveBreakZ, 0), -2, 2);
  const isBunt = profile.contactType === 'BUNT';
  const power = finite(batter.ratings?.power, 5);
  const defaultBatSpeedMph = isBunt ? 12 : 72 + power * 1.5;
  const batSpeedMph = clamp(finite(swing.batSpeedMph, defaultBatSpeedMph), 5, 95);
  // Approximate descending pitch tangent at contact, including late break.
  const pitchPlaneDeg = -6 + breakZ * 3;
  const swingPlaneDeg = clamp(finite(swing.planeDeg, isBunt ? 0 : 10), -20, 40);
  const offspeed = /CURVE|CHANGE|SLIDER/.test(pitch.pitchType || '') ? 0.002 : 0;
  const timing = clamp(finite(swing.timing,
    profile.sprayAngleDeg * pullSign / 600 + (90 - pitchMph) * 0.0004 + offspeed), -0.12, 0.12);
  // Inside contact pulls; outside contact goes away. Break changes the tangent.
  const rawSpray = pullSign * timing * 600 + plateX * 5 + breakX * 3;
  const baseOffset = (profile.launchAngleDeg - (isBunt ? 0 : 10) - pitchPlaneDeg * 0.3) / 18;
  const verticalOffset = clamp(finite(swing.verticalOffset,
    baseOffset - (plateZ - 2.5) * 0.10 + breakZ * 0.04), -3, 5);
  const rawLaunch = swingPlaneDeg + pitchPlaneDeg * 0.3 + verticalOffset * 18;

  // Square-contact collision approximation. End/handle contact transfers less
  // bat energy. Infer baseline barrel offset from the already selected tier.
  const squareExitMph = 1.2 * batSpeedMph + 0.2 * pitchMph;
  const defaultSquareExitMph = 1.2 * defaultBatSpeedMph + 0.2 * 90;
  const baseBarrelOffset = Math.sqrt(clamp((1 - profile.exitVelocityMph / defaultSquareExitMph) / 0.4, 0, 1));
  const barrelOffset = clamp(finite(swing.barrelOffset,
    baseBarrelOffset + Math.abs(plateX) * 0.015 + Math.abs(breakX) * 0.01), -1, 1);
  const quality = clamp(1 - 0.4 * barrelOffset ** 2 - Math.abs(timing) * 0.08, 0.3, 1);
  const rawExit = squareExitMph * quality;
  const sprayDeg = clamp(rawSpray, Math.max(-44, profile.sprayAngleDeg - 1.25), Math.min(44, profile.sprayAngleDeg + 1.25));
  const launchDeg = clamp(rawLaunch, profile.launchAngleDeg - 0.45, profile.launchAngleDeg + 0.45);
  const exitMph = clamp(rawExit, profile.exitVelocityMph - 0.6, profile.exitVelocityMph + 0.6);
  const speedFps = exitMph * 1.46667;
  const launchRad = launchDeg * Math.PI / 180;
  const sprayRad = sprayDeg * Math.PI / 180;
  const horizontal = speedFps * Math.cos(launchRad);
  const spin = {
    backspinRpm: Math.round(isBunt ? -300 : clamp(verticalOffset * 1150, -2800, 4200)),
    sidespinRpm: Math.round(clamp((rawSpray - pullSign * timing * 600) * 75 + timing * pullSign * 4500, -1800, 1800))
  };
  return {
    ...profile,
    exitVelocityMph: round(exitMph, 1),
    exitVelocityFps: round(speedFps, 1),
    launchAngleDeg: round(launchDeg, 1),
    sprayAngleDeg: round(sprayDeg, 1),
    vx: round(horizontal * Math.sin(sprayRad), 2),
    vy: round(horizontal * Math.cos(sprayRad), 2),
    vz: round(speedFps * Math.sin(launchRad), 2),
    spin,
    contact: {
      timing: round(timing, 4), verticalOffset: round(verticalOffset),
      quality: round(quality), sprayDeg: round(sprayDeg, 1),
      launchDeg: round(launchDeg, 1), exitMph: round(exitMph, 1),
      batSpeedMph: round(batSpeedMph, 1), swingPlaneDeg: round(swingPlaneDeg, 1),
      pitchPlaneDeg: round(pitchPlaneDeg, 1), barrelOffset: round(barrelOffset)
    }
  };
}
