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
  - **Right 1/3 Viewport:** Behind-home-plate pitcher/batter duel showing pitcher windup, pitch trajectory & break into the catcher's mitt, and batter stance/swing.
- **Ball in Play (Full-Field 1987 Isometric View):**
  - When contact is made, the right 1/3 partition opens up so the full isometric ballpark fills the canvas (matching [`amiga_01.jpg`](file:///var/home/natex/Projects/EWBB/research/images/amiga_01.jpg)), tracking the white baseball in 3D height $+z$ and its dark ground shadow at $(x, y, 0)$.

---

## 2. Module Map & Agent Responsibilities

| File Path | Responsibility | Status |
| :--- | :--- | :--- |
| [`research/README.md`](file:///var/home/natex/Projects/EWBB/research/README.md) | Historical archive, developer interviews, 54 reference screenshots | ✅ Complete |
| [`research/visual_styles.html`](file:///var/home/natex/Projects/EWBB/research/visual_styles.html) | Visual comparison of 1987 vs 1991 vs Style C Hybrid | ✅ Complete |
| [`src/data/ballparks.js`](file:///var/home/natex/Projects/EWBB/src/data/ballparks.js) | 10-distance / 9-height ballpark schema + Fenway, Memorial, Wrigley, Metrodome | ✅ Complete |
| [`src/data/managers.js`](file:///var/home/natex/Projects/EWBB/src/data/managers.js) | 19-parameter EWB Manager schema + Earl Weaver, Whitey Herzog, Sparky Anderson, John McNamara | ✅ Complete |
| [`src/data/rosters.js`](file:///var/home/natex/Projects/EWBB/src/data/rosters.js) | L/R Platoon Batter & Pitcher schemas + Baltimore Orioles & Boston Red Sox rosters | ✅ Complete |
| [`src/engine/statsMatrix.js`](file:///var/home/natex/Projects/EWBB/src/engine/statsMatrix.js) | Stage 1: Platoon matchup matrix, pitch outcome & 3D launch vector generator | ✅ Complete |
| [`src/engine/physicsEngine.js`](file:///var/home/natex/Projects/EWBB/src/engine/physicsEngine.js) | Stage 2: 3D ball flight, wind, turf/grass bounce, wall collision, fielder/runner AI | ✅ Complete |
| [`src/engine/earlAI.js`](file:///var/home/natex/Projects/EWBB/src/engine/earlAI.js) | "Ask Earl" tactical advisor + autonomous AI manager decision engine | ✅ Complete |
| [`src/engine/gameState.js`](file:///var/home/natex/Projects/EWBB/src/engine/gameState.js) | Baseball rules state machine, lineup/bullpen substitutions, box score & play log | ✅ Complete |
| [`src/engine/statsValidator.js`](file:///var/home/natex/Projects/EWBB/src/engine/statsValidator.js) & [`validate_stats_cli.py`](file:///var/home/natex/Projects/EWBB/validate_stats_cli.py) | 162-game Statistical Engine Validator & Season Benchmark Suite (Browser + CLI) | ✅ Complete |
| [`src/ui/fieldRenderer1987.js`](file:///var/home/natex/Projects/EWBB/src/ui/fieldRenderer1987.js) | 1987 EWB 1.0 Split-Screen & Full-Field HiDPI Canvas renderer, articulated sprites & Instant Replay | ✅ Complete |
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
   - **Stage 1 (`generateBattedBallLaunchVector`) -> Stage 2 (`simulateBallInPlay`):** Converts per-BIP probabilities (`hrPerBip`, `triplePerBip`, `doublePerBip`, `singlePerBip`) into realistic 3D launch vectors (`exitVelocityMph`, `launchAngleDeg`, `sprayAngleDeg`) which are resolved physically by Stage 2 ballistics, wall geometry, and fielder interception.
   - **162-Game Season Benchmark (`python3 validate_stats_cli.py 162` or the 📊 Stats Lab UI tab):** Executes 162 full 9-inning games (~96,000 pitches and ~9,600 3D trajectories) in ~4.2 seconds, matching historical Orioles and Red Sox team and individual `BA`, `OBA`, `SA`, `2B`, `3B`, `HR`, `BB%`, and `SO%`.
2. **1987 Amiga EWB 1.0 Graphics & Choreography (`fieldRenderer1987.js`):**
   - **HiDPI (`devicePixelRatio`) Canvas Scaling:** Renders crisp vector stadium curves, true perspective warning tracks and grass-cut arcs, and Citgo/Fenway scoreboard landmarks.
   - **Articulated Multi-Pose Sprites:** Replaces blocky rectangles with articulated 1987 Amiga figures featuring batting helmets, stirrup socks, 60Hz sinusoidal running leg/arm cycles, glove-reach and throwing poses, 5-stage pitcher delivery choreography (`SET -> LEG_KICK -> STRIDE -> RELEASE -> FOLLOW_THROUGH`), and 5-stage batter swing rotation (`STANCE -> COIL -> SWING -> CONTACT -> FOLLOW_THROUGH`), plus crouched catcher & umpire figures in the right-1/3 duel viewport.
   - **Real-Time 60Hz Frame Pacing & Pre-Pitch State Snapshots:** Uses `performance.now()` (`elapsedSec * 60`) for display-rate-independent playback and snapshots pre-pitch batter/runner state before `stepPitch()` so animations never show next-batter uniform/runner pops.
