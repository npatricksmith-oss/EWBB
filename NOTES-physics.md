# Physics team handoff

Implemented pitch/swing-conditioned launch shaping in `src/engine/batBallContact.js`, called automatically by `generateBattedBallLaunchVector()` for normal contact and bunts. No UI, game-state, probability-table, or architecture changes.

## Contracts and coordinator wiring

- New export: `shapeBatBallContact(profile, pitchDelivery = {}, batter = {}, swing = {})`. Takes an existing calibrated launch profile and returns its shaped replacement, including recomputed `vx/vy/vz`.
- `generateBattedBallLaunchVector()` accepts an optional seventh argument, `swing`. Existing callers work unchanged. Optional controls: `timing` in seconds (positive early, negative late); `verticalOffset` in inches (positive bat below ball, negative above); `planeDeg`; `batSpeedMph`; `barrelOffset` (-1 handle, 0 sweet spot, +1 end).
- Defaults infer a swing consistent with the matrix's sampled profile, then incorporate pitch velocity, type, plate location, and horizontal/vertical break. Early contact pulls toward LF for RHB / RF for LHB; late contact goes opposite. Inside/outside pitch location changes spray; high/low location and pitch/swing planes change launch. Switch hitters use the effective matchup side.
- Every generated launch vector and `simulateBattedBall()` result exposes `spin = { backspinRpm, sidespinRpm }` and `contact = { timing, verticalOffset, quality, sprayDeg, launchDeg, exitMph, batSpeedMph, swingPlaneDeg, pitchPlaneDeg, barrelOffset }`. Quality is numeric, 0.3–1; barrel offset identifies handle/end versus barrel. Backspin is positive, topspin negative. Sidespin is positive toward RF. The six requested contact fields also have defaults on legacy physics vectors.
- UI team can read `pitchStep.launchVector.contact/spin` before playback and `physicsResult.contact/spin` during playback. No coordinator wiring is required for simulation; UI animation adoption is optional. Pass explicit swing controls as argument seven if desired.
- The collision approximation uses `1.2 * batSpeedMph + 0.2 * pitchMph`, reduced by squared distance from the sweet spot and timing error. Outcome tiers remain authoritative for sampling; shaping is limited to +/-1.25 degrees spray, +/-0.45 degrees launch, +/-0.6 mph exit velocity around that sample. Explicit swing inputs share these limits. This intentionally prevents arcade swing overrides from replacing historical calibration.
- No extra random draws were added. Existing `spinRateRpm` remains available for compatibility. The new signed spin metadata does not alter the existing calibrated aerodynamic lift model; Magnus changes were optional and are deferred. Launch origin remains the existing physics contact point.

## Validation

Syntax checks passed for all three changed JavaScript files. Inline Node assertions verified RHB/LHB timing direction, under/over contact and spin signs, swing plane, barrel quality, bat/pitch speed, high/low and inside/outside location, break, and pitch type. A further 800 generated plays (normal and all three bunt plays) verified finite metadata, switch-hitter side, matching result metadata, and nonempty physics frames. Legacy launch vectors also passed.

Required unseeded `python3 validate_stats_cli.py 300` before and after (SLG is printed as SA by the CLI):

| Team/run | BA | OBA | SLG | HR/162 | BB% | SO% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baltimore historical | .294 | .377 | .488 | 234 | 11.7 | 12.5 |
| Baltimore before | .292 | .379 | .469 | 217 | 12.3 | 12.3 |
| Baltimore after | .293 | .377 | .478 | 240 | 11.9 | 12.3 |
| Boston historical | .296 | .378 | .490 | 218 | 11.7 | 12.5 |
| Boston before | .287 | .365 | .456 | 183 | 10.9 | 13.9 |
| Boston after | .283 | .365 | .465 | 220 | 11.3 | 13.8 |

Historical errors remain comparable: Boston's BA deficit grows .004; its SLG and HR errors improve. Baltimore's slash-line and HR errors improve. BB/SO probabilities were untouched. Existing Boston batting/strikeout deficits remain.

An additional reproducible 300-game comparison used an LCG with seed 1987 (`seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed / 4294967296`). Full-game paths diverge after changed fielding outcomes, so this checks season-level stability, not identical pitch sequences:

| Team/run | BA | OBA | SLG | HR/162 | BB% | SO% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baltimore seeded before | .300 | .385 | .477 | 222 | 12.2 | 12.1 |
| Baltimore seeded after | .299 | .385 | .482 | 230 | 12.3 | 12.0 |
| Boston seeded before | .285 | .370 | .462 | 204 | 11.9 | 13.4 |
| Boston seeded after | .283 | .367 | .447 | 190 | 11.7 | 13.9 |

This second run shows some Boston extra-base-hit variation (SLG down .015), while BA/OBA/BB/SO stay close. No probability constants were retuned to either sample. Both 300-game runs use the final implementation.

The additional required `python3 validate_stats_cli.py 200` completed successfully: Baltimore .302/.385/.484, 235 HR/162, 11.9% BB, 12.5% SO; Boston .284/.367/.454, 198 HR/162, 11.5% BB, 14.0% SO. `git diff --check` passed. The validator prints comparisons rather than enforcing numerical pass/fail thresholds.
