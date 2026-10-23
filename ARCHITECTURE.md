# Earl Weaver Baseball (EWBB) — Collaborative Agentic Architecture & Design Log

> **Project Goal:** A faithful recreation of Don Daglow and Eddie Dombrower's 1987 ***Earl Weaver Baseball* (EWB 1.0)** using a **Modern Retro-Pro Hybrid (Style C)** presentation that strictly preserves the **1987 EWB 1.0 split-screen diamond + batter/pitcher duel view** (and full-field ball-in-play view), paired with crisp high-DPI scoreboards, Commissioner's Disk editors, and the *"Ask Earl"* tactical AI.

---

## 1. Core Architectural Pillars (From Historical Research)

See [`research/README.md`](file:///var/home/natex/Projects/EWBB/research/README.md) for full historical citations from the April 1987 *Computer Gaming World* (#36) developer interviews and 2024 SABR interview with Eddie Dombrower.

### Pillar 1: The Two-Stage Play Resolution Pipeline
Unlike purely statistical table-lookup games or purely arcade action games, EWB resolves every plate appearance in two decoupled stages:
1. **Stage 1 — Statistical Matchup Matrix (`src/engine/statsMatrix.js`):**
   - Evaluates the Batter's Left/Right platoon split (`vsLHP` or `vsRHP`) against the Pitcher's Left/Right split, adjusted for pitcher fatigue (`1–10` stamina rating vs pitch count), pitch selection, count leverage, and Manager tactical call (`Run & Hit`, `Hit & Run`, `Sacrifice Bunt`, `Squeeze`, `Pitch Around`, `Pitch Out`).
   - Produces either a non-batted outcome (`Strike`, `Ball`, `Swinging Strike`, `Foul`, `HBP`, `Balk`, `Wild Pitch`) OR a **3D batted-ball launch vector** (`exitVelocityFps`, `launchAngleDeg`, `sprayAngleDeg`, `spinRate`).
2. **Stage 2 — 3D Virtual Ballfield Physics Override (`src/engine/physicsEngine.js`):**
   - Once the ball leaves the bat, **stats no longer dictate the outcome—physics and park geometry do**.
   - Simulated in real-world units (**feet** and **seconds**) on a 3D coordinate system where Home Plate is `(0, 0, 0)`:
     - $+y$ = Straight out through Center Field (2nd base is at `(0, 127.28, 0)`).
     - $+x$ = Toward Right Field foul side; $-x$ = Toward Left Field foul side.
     - $+z$ = Altitude above the field in feet ($g = 32.174\text{ ft/s}^2$).
   - **Ballpark Geometry Override:** Uses the park's 10 fence distance markers (`Left Pole` to `Right Pole`) and 9 wall height segments (`Left 1..3`, `Center 1..3`, `Right 1..3`). A high fly ball hit 318 feet down the left-field line is a routine home run at Memorial Stadium (309 ft, 14 ft wall), a loud single off the 37-foot Green Monster at Fenway Park (310 ft, 37 ft wall), or caught on the warning track at Wrigley Field (355 ft).
   - **Surface Physics:** `Grass` dampens bounce restitution ($e \approx 0.42$) and slows rolling balls faster; `Artificial Turf` (e.g., Metrodome) increases bounce restitution ($e \approx 0.64$) and preserves ground-ball velocity through the infield gaps.
   - **Fielder Interception & Throws:** All 9 fielders move from their tactical starting coordinates at speeds (`24–31 ft/s`) derived from their `RNGE` (`1–10`) and `RUNS` (`1–10`) ratings, and throw to bases at velocities (`110–148 ft/s`) derived from their `ARM` (`1–10`) rating.

### Pillar 2: Decoupled Headless Sim vs. 60fps Visual Playback
- As Eddie Dombrower explained in his 2024 SABR interview, the simulation engine runs on virtual ballfield coordinates completely independent of screen pixels.
- Every play generates a deterministic `PlayResult` containing both the statistical accounting AND a frame-by-frame `trajectoryFrames[]` / `fielderFrames[]` / `runnerFrames[]` tape.
- **Visual Mode:** Plays back the tape at 60fps on the 1987 Split-Screen / Full-Field Canvas (and supports **Instant Replay** of any play from the tape!).
- **Headless Mode:** Skips frame rendering to simulate a half-inning or full 9-inning game in milliseconds using the exact same physics engine.

### Pillar 3: Strict 1987 EWB 1.0 Visual Layout (`src/ui/fieldRenderer1987.js`)
Per project requirements, **we do not use the 1991 EWB II broadcast camera**. We strictly use the **1987 EWB 1.0 view**:
- **Pre-Pitch & Pitch Delivery (Split-Screen):**
  - **Left 2/3 Viewport:** Isometric 1987 diamond showing custom outfield walls (with distance numbers painted on the wall and true-to-scale wall heights), mowed grass or turf, all 9 fielders (dynamically shifted by defensive strategy), and baserunners taking leads/stealing.
  - **Right 1/3 Viewport:** Catcher's-eye pitcher/batter duel (matching the original's low camera): a large side-on batter fills the foreground beside the plate, the pitcher stands small on the mound against the batter's eye (the camera sits off-center away from the batter, so the mound shifts to that side and the batter never hides the pitcher), and the pitch grows in depth perspective with late break into the catcher's mitt (or a contact flash on a swing).
- **Ball in Play (Full-Field 1987 Isometric View):**
  - When contact is made, the right 1/3 partition opens up so the full isometric ballpark fills the canvas (matching [`amiga_01.jpg`](file:///var/home/natex/Projects/EWBB/research/images/amiga_01.jpg)), tracking the white baseball in 3D height $+z$ and its dark ground shadow at $(x, y, 0)$.

---

## 2. Module Map & Agent Responsibilities

| File Path | Responsibility | Status |
| :--- | :--- | :--- |
| [`research/README.md`](file:///var/home/natex/Projects/EWBB/research/README.md) | Historical archive, developer interviews, 54 reference screenshots | ✅ Complete |
| [`research/visual_styles.html`](file:///var/home/natex/Projects/EWBB/research/visual_styles.html) | Visual comparison of 1987 vs 1991 vs Style C Hybrid | ✅ Complete |
| [`src/data/ballparks.js`](file:///var/home/natex/Projects/EWBB/src/data/ballparks.js) | 10-distance / 9-height ballpark schema + Fenway, Memorial, Wrigley, Metrodome, Anaheim Stadium, Atlanta-Fulton County Stadium | ✅ Complete |
| [`src/data/managers.js`](file:///var/home/natex/Projects/EWBB/src/data/managers.js) | 19-parameter EWB Manager schema + Earl Weaver, Whitey Herzog, Sparky Anderson, John McNamara, Gene Mauch, Joe Torre, merged with `MANAGERS_80S` | ✅ Complete |
| [`src/data/managers80s.js`](file:///var/home/natex/Projects/EWBB/src/data/managers80s.js) | `MANAGERS_80S`: 19 managers of the 1980s franchise teams, generated by [`bin/managers_80s.py`](file:///var/home/natex/Projects/EWBB/bin/managers_80s.py). The steal, sacrifice, intentional-walk, complete-game and baserunning sliders average his 1980s team stats against the league with his researched reputation; the rest, the bios and quotes come from `tracking/results/manager_research_80s.json` | ✅ Complete |
| [`src/data/teams/`](file:///var/home/natex/Projects/EWBB/src/data/teams/) | Generated historical team modules (8 era all-star teams, 1982 Angels & Braves, and the 26 1980s franchise teams `<tm>_80s`) and `index.js` (`HISTORICAL_TEAMS`). A 1980s team carries `era: '1980s'` and a "'80s" nickname; `app.js` groups the team pickers by era and tags it on the scoreboard. Its roster comes from [`bin/scan_decade.py`](file:///var/home/natex/Projects/EWBB/bin/scan_decade.py) (all 260 team-seasons, 1980–89) and [`bin/pick_80s.py`](file:///var/home/natex/Projects/EWBB/bin/pick_80s.py) (best players by WAR with the club; see its docstring for the rules); range, arm and durability blend fielding stats with scouting in [`bin/defense_80s.py`](file:///var/home/natex/Projects/EWBB/bin/defense_80s.py). Built by [`bin/build_team.py`](file:///var/home/natex/Projects/EWBB/bin/build_team.py) from roster specs in `tracking/tasks/teams/`; season totals and L/R splits come from baseball-reference via [`bin/bref.py`](file:///var/home/natex/Projects/EWBB/bin/bref.py). Rebuild instead of hand-editing. `node bin/smoke_teams.mjs` plays every pairing headless | ✅ Complete |
| [`src/data/rosters.js`](file:///var/home/natex/Projects/EWBB/src/data/rosters.js) | L/R Platoon Batter & Pitcher schemas + Baltimore Orioles & Boston Red Sox rosters, merged with `HISTORICAL_TEAMS` into `TEAMS`; `cloneTeamRoster()` (adds `starters`, `bench`, and per-slot `slotHistory` for the box score) and `getLastName()` (suffix-aware surname for labels, e.g. `Cal Ripken Jr.` → `Ripken`) | ✅ Complete |
| [`src/engine/statsMatrix.js`](file:///var/home/natex/Projects/EWBB/src/engine/statsMatrix.js) | Stage 1: Platoon matchup matrix, pitch outcome & 3D launch vector generator | ✅ Complete |
| [`src/engine/physicsEngine.js`](file:///var/home/natex/Projects/EWBB/src/engine/physicsEngine.js) | Stage 2: 3D ball flight, wind, turf/grass bounce, wall collision, fielder/runner AI | ✅ Complete |
| [`src/engine/batBallContact.js`](file:///var/home/natex/Projects/EWBB/src/engine/batBallContact.js) | `shapeBatBallContact()`: nudges each calibrated launch profile by pitch speed, type, location and break plus swing timing, plane and barrel offset (capped at ±1.25° spray, ±0.45° launch, ±0.6 mph). Called by `generateBattedBallLaunchVector()`, whose optional 7th `swing` argument passes explicit controls. Adds `spin` and `contact` metadata to every launch vector and physics result | ✅ Complete |
| [`src/engine/earlAI.js`](file:///var/home/natex/Projects/EWBB/src/engine/earlAI.js) | "Ask Earl" tactical advisor + autonomous AI manager decision engine | ✅ Complete |
| [`src/engine/gameState.js`](file:///var/home/natex/Projects/EWBB/src/engine/gameState.js) | Baseball rules state machine, lineup/bullpen substitutions (a pinch-hit removes the lifted player for the rest of the game), box score & play log | ✅ Complete |
| [`src/engine/statsValidator.js`](file:///var/home/natex/Projects/EWBB/src/engine/statsValidator.js) & [`validate_stats_cli.py`](file:///var/home/natex/Projects/EWBB/validate_stats_cli.py) | 162-game Statistical Engine Validator & Season Benchmark Suite (Browser + CLI) | ✅ Complete |
| [`src/ui/fieldRenderer1987.js`](file:///var/home/natex/Projects/EWBB/src/ui/fieldRenderer1987.js) | 1987 EWB 1.0 Split-Screen & Full-Field HiDPI Canvas renderer, pixel-art field sprites, keyframed duel figures & Instant Replay | ✅ Complete |
| [`src/ui/pitcherStyles.js`](file:///var/home/natex/Projects/EWBB/src/ui/pitcherStyles.js) | Per-pitcher delivery styles (arm slot, leg kick, tempo, glove, look) seeded from the name and the speed/control ratings, with signature deliveries for Marichal, Ryan, Tiant, Valenzuela, Seaver, Quisenberry and Tekulve. Exports `getPitcherStyle()`, `getPitcherPoses()`, `getReleasePointOffset()` (where the pitch flight starts) and `DUEL_PITCHER_SCALE` | ✅ Complete |
| [`src/ui/batterStyles.js`](file:///var/home/natex/Projects/EWBB/src/ui/batterStyles.js) | Per-batter stances and multi-phase swings: named archetypes for iconic hitters, procedural styles for everyone else. Exports `getBatterStyle()`, `getBatterSwingPose()`, `BASE_BATTER_POSES` and the shared `blendPose()` / `lerp` / `smooth` helpers | ✅ Complete |
| [`src/ui/baseballSprite.js`](file:///var/home/natex/Projects/EWBB/src/ui/baseballSprite.js) | Pixel baseball with a 3D seam rotated about a spin axis (`drawPixelBaseball()`), axis choice from pitch type or batted-ball spin (`getVisualBallSpin()`), and a 10–14 fps stepped spin angle (`visualSpinAngle()`) | ✅ Complete |
| [`src/ui/fireworks.js`](file:///var/home/natex/Projects/EWBB/src/ui/fireworks.js) | `HomeRunFireworks`: pixel-art fireworks on an overlay canvas, started by `app.js` about 1 s after a home run clears the wall | ✅ Complete |
| [`src/ui/soundEngine.js`](file:///var/home/natex/Projects/EWBB/src/ui/soundEngine.js) | Web Audio API retro synthesizer (bat crack, mitt pop, crowd roar, organ) | ✅ Complete |
| [`src/ui/app.js`](file:///var/home/natex/Projects/EWBB/src/ui/app.js) & [`index.html`](file:///var/home/natex/Projects/EWBB/index.html) | Main Retro-Pro UI controller, Ask Earl modal, Stats Lab & Commissioner's Disk live editors | ✅ Complete |

---

## 3. Coordinate System & Math Conventions (For All Agents)

1. **Field Coordinates `(x, y, z)` in feet:**
   - Home Plate: `(0, 0, 0)`
   - 1st Base: `(63.64, 63.64, 0)`
   - 2nd Base: `(0, 127.28, 0)`
   - 3rd Base: `(-63.64, 63.64, 0)`
   - Pitcher's Mound: `(0, 60.5, 0.83)`
2. **Spray Angle (`sprayAngleDeg`):**
   - `0°` = dead Center Field (`+y` axis)
   - `-45°` = Left Field foul line (`x = -y`)
   - `+45°` = Right Field foul line (`x = +y`)
   - Conversion from horizontal distance $r$ and spray angle $\theta$:
     $$x = r \sin(\theta), \quad y = r \cos(\theta)$$
3. **Zero-Build Native ES Modules:**
   - All modules in `src/` use standard browser ES Module imports (`import { ... } from './...'`) with full `.js` extensions so the project runs directly in any modern browser without requiring a Node/bundler step, while remaining 100% compatible with Vite/TypeScript.

---

## 4. Statistical Calibration & 1987 Amiga Kinetic Choreography

1. **Two-Stage Statistical Calibration (`statsMatrix.js` + `physicsEngine.js`):**
   - **Stage 1 (`getEffectivePlatoonMatchup` & `resolvePitchStep`):** Combines the batter's `splits.L` / `splits.R` (`BA`, `d2B/AB`, `d3B/AB`, `HR/AB`, `BB/PA`, `SO/PA`) with the pitcher's platoon adjustments (`baMod`, `hrMod`, `bbMod`, `soMod`) and fatigue penalty. Uses a calibrated Markov pitch-by-pitch progression so simulated `BB%` (~11.7%) and `SO%` (~12.5%) match historical game data.
   - **Stage 1 (`generateBattedBallLaunchVector`) -> Stage 2 (`simulateBallInPlay`):** Converts per-BIP probabilities (`hrPerBip`, `triplePerBip`, `doublePerBip`, `singlePerBip`) into realistic 3D launch vectors (`exitVelocityMph`, `launchAngleDeg`, `sprayAngleDeg`) which are resolved physically by Stage 2 ballistics, wall geometry, and fielder interception. Every landing runs the bounce model (no near-ground cutoff), and reported/decision distances (`distanceFt`, sac-fly/2B/3B thresholds) are measured only up to the fielder's interception, not the ball's hypothetical roll. Because the OUT sub-table now converts only ~1% of balls into hits, `totalHitPerBip` carries ~97% of the batter's hit rate.
   - **162-Game Season Benchmark (`python3 validate_stats_cli.py 162` or the 📊 Stats Lab UI tab):** Executes 162 full 9-inning games (~96,000 pitches and ~9,600 3D trajectories) in ~4.2 seconds, matching historical Orioles and Red Sox team and individual `BA`, `OBA`, `SA`, `2B`, `3B`, `HR`, `BB%`, and `SO%`.
2. **1987 Amiga EWB 1.0 Graphics & Choreography (`fieldRenderer1987.js`):**
   - **HiDPI (`devicePixelRatio`) Canvas Scaling:** Renders crisp vector stadium curves, true perspective warning tracks and grass-cut arcs, and Citgo/Fenway scoreboard landmarks.
   - **Pixel-Art Field Sprites (`PIXEL_SPRITES`):** Fielders, runners, coaches, umpires and the batter at the plate are hand-drawn pixel grids (ready crouch, 2-frame run cycle, ground/air fielding, throw, receive, slide, batting stance, umpire SAFE/OUT) with checkerboard-dithered uniform shading like the EGA/Amiga originals. `getPixelSprite()` caches each sprite at device resolution with a soft outline; `drawPixelSprite()` snaps it to whole device pixels. Figures mirror to face their direction of travel (`trackFacing()`, using `playAnim.prevFrame`).
   - **Keyframed Duel Figures:** The duel batter and pitcher are outlined limbs blended between keyframes (`blendPose()`), with dithered shadow sides (`getDitherPattern()`, locked to device pixels), team undershirt sleeves, stirrups, belts and an ear-flap helmet. Each player gets their own style.
     - **Pitcher (`pitcherStyles.js`):** windup and rocker 0–0.14; pivot side-on with the knee lifted up and across 0–0.27; stride with the hands breaking 0.27–0.33; arm cocked behind the head 0.33–0.385; the whip to release at 0.42; follow-through across the glove-side knee to 0.70. Keyframes carry a shoulder `turn` (0 faces the plate, 90 is side-on), a hip width and `tArmBack` (throwing arm drawn behind the body). From the stretch the pitcher starts side-on with a shorter kick. The pitch flight starts at `getReleasePointOffset(pitcher)`.
     - **Batter (`batterStyles.js`, `BATTER_POSES`):** stance and waggle 0–0.42 (both elbows follow the hands), load 0.42–0.54, stride plant 0.54–0.70, launch into the slot 0.70–0.80, sweep to `CONTACT` at exactly 0.90, extension toward the pitcher 0.90–0.97, `WRAP` to 1.03 and the finish, settled and held, by 1.12. Progress past 1.0 comes from `pitchAnim.finishMs`, the time since the pitch ended, so the follow-through takes about 300 ms after contact. The bat is aimed in 3D (`batYaw`, `batPitch`, `batLength`) and `projectBat()` turns it into the screen angle, screen length and depth, so the barrel swings around the body: back toward the catcher, across the plate, away toward the pitcher, then around to the far (field) side of the batter over the lead shoulder. The bat covers the body only while it is on the catcher's side, and once it wraps to the far side it is drawn behind the body and helmet. From `WRAP` on, poses set `armsBehind`: the torso turns into a back view (shoulders driven by `twist`, hips by `hipTwist`, which leads `twist`: the hips start opening in the launch and are mostly open at contact, before the shoulders turn), the helmet shows its back, and the arms, gloves and bat are drawn before the torso so they finish on the far side, over the lead shoulder. The lead arm lies across the chest over the neck. Arms are layered a segment at a time: the lead forearm and bottom glove cover the rear forearm and top glove, and the rear upper arm slips behind the torso once `twist` passes 0.7. The jersey number (`uniform` in the roster, or a steady placeholder from the player id) sits between the shoulder blades and comes into view from `twist` 0.45. A take or check swing drifts back toward the stance. Both arms show and both gloves grip the bat, lead hand below the rear hand; a one-handed follow-through releases the rear hand toward `nHand`.
   - **Pitch Pacing (exported from `fieldRenderer1987.js`):** `PITCH_WINDUP_MS` (800) covers progress 0–0.42 and `PITCH_FLIGHT_MS` (420) covers 0.42–1.0. When a ball is put in play the view cuts to the full field at contact, `PITCH_CONTACT_MS` (progress 0.90); after any other pitch the duel view plays 480 ms more so a swing can finish. `app.js` imports these to time the bat and mitt sounds and the fireworks, so change the timing only here.
   - **Duel Zoom:** the duel scene is drawn `DUEL_ZOOM` (1.3×) larger, anchored at the bottom center, so the batter and pitcher fill the view and only a strip of stands shows under the stat box.
   - **Pitch Calls:** a pitch not put in play turns red (strike or foul) or green (ball) from 65% of its flight and leaves a small marked ball in the zone until the next pitch. The full-field result banner appears 350 ms after the play ends, so it never announces a home run before the ball lands.
   - **Play-by-Play:** `app.js` hides a pitch's log entries until the field animation ends, then reveals them one at a time (`NARRATION_DELAY_MS`, `NARRATION_STAGGER_MS`). Headless sims and New Game flush the queue at once.
   - **Real-Time 60Hz Frame Pacing & Pre-Pitch State Snapshots:** Uses `performance.now()` (`elapsedSec * 60`) for display-rate-independent playback and snapshots pre-pitch batter/runner state before `stepPitch()` so animations never show next-batter uniform/runner pops.
