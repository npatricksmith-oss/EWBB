# NOTES-batter.md — Team Batter (Task 3) Implementation Report

## 1. Research: 1950s–1980s Hitters' Stances & Swing Mechanics

Our historical research into classic hitters from the 1950s through the 1980s revealed distinct mechanical configurations across stances, pre-pitch timing triggers, kinetic load/stride phases, rotational uncoiling, and follow-throughs:

- **Stan Musial (“The Man”):**
  - *Stance:* Deep crouch in the back of the box, completely closed off with front shoulder tucked toward the plate ("a little kid peeking around the corner to see if the cops were coming").
  - *Mechanics:* Knees deeply flexed, torso coiled tight. Hands held back with a steep cocked bat angle. As the pitch arrived, he uncoiled explosively from his hips, generating tremendous torque into a smooth two-handed finish.
- **Rod Carew:**
  - *Stance:* Extraordinary deep crouch with a wide-open stance (lead foot pulled back from the plate).
  - *Mechanics:* Held the bat nearly horizontal/parallel to the ground (~15° angle) with loose hands at chest height. Used a hypnotic circular barrel waggle and a minimal toe-tap stride to execute an inside-out line-drive stroke spraying hits to all fields.
- **Carl Yastrzemski (“Yaz”):**
  - *Stance:* Upright posture with hands held sky-high above the crown of his batting helmet, bat pointing almost straight up.
  - *Mechanics:* Peered intently over his back shoulder with a rapid, nervous double-sine bat waggle. In load, his hands gathered even higher before dropping with tremendous leverage into the hitting zone.
- **Ted Williams (“The Splendid Splinter”):**
  - *Stance:* The blueprint from *The Science of Hitting* (1971). Textbook balance, slight knee bend, slightly open front foot for hip clearance, hands relaxed at rear shoulder height with bat at a classic 45° angle.
  - *Mechanics:* Emphasized starting the swing from the lower half, rotating the hips first to create hip-shoulder separation. Advocated a slight upward attack angle (+6° to +14°) to match the downward trajectory of the incoming pitch, finishing in a magnificent, balanced high two-handed follow-through.
- **Pete Rose (“Charlie Hustle”):**
  - *Stance:* Extreme low, tense crouch crowding the plate, wide base with a low center of gravity.
  - *Mechanics:* Rhythmic forward/backward pump waggle, short aggressive stride/toe tap, violent flat slash swing through the zone, two-handed wrap.
- **Joe Morgan:**
  - *Stance:* Upright, slightly open stance.
  - *Mechanics:* The iconic visual tic of baseball history — as he waited for the delivery, he flapped his back elbow rhythmically up and down like a chicken wing. Explosive hip clearance and compact turn.
- **Jim Rice:**
  - *Stance:* Imposing, upright power posture with a wide base, bat cocked back steep over the shoulder.
  - *Mechanics:* Rhythmic trigger pump, explosive front foot plant, and terrifying forearm/wrist roll delivering massive exit velocity, finishing in a high one-handed power release.
- **Eddie Murray (“Steady Eddie”):**
  - *Stance:* Calm, relaxed upright balance from both sides of the plate (switch-hitter).
  - *Mechanics:* Low-to-medium quiet hands, subtle waggle, smooth balanced step stride, fluid sweeping swing through the zone.
- **Cal Ripken Jr. (1987):**
  - *Stance:* His famous 1987 wide stance with deep knee bend, bat resting relatively flat/low off the rear shoulder.
  - *Mechanics:* Calm subtle waggle, short compact stride, level rotational stroke driving line drives to the gaps.
- **Wade Boggs:**
  - *Stance:* Disciplined crouch, square stance, high hands with bat pointed nearly upright.
  - *Mechanics:* Elliptical barrel circles, subtle toe-tap timing trigger, legendary inside-out bat path driving outside pitches off the Green Monster or into left field, compact two-handed finish.
- **Reggie Jackson (“Mr. October”):**
  - *Stance:* Wide power base, high hands held back and ready to strike.
  - *Mechanics:* Pronounced leg-kick stride, violent rotational hip turn with aggressive uppercut launch tilt (+18°), iconic towering one-handed follow-through admiring the blast as the ball carried into the upper deck.
- **Additional Legends:**
  - *Frank Robinson:* Upright stance crowding the plate, ferocious coil, quick compact power stroke.
  - *Carlton Fisk:* Tall upright catcher stance, high hands, high leg kick, two-handed high drive.
  - *Boog Powell:* Massive slugger crouch, wide stance, heavy load, two-handed high wrap.
  - *Al Bumbry:* Speedster slap-hitter stance, open, quick stride heading toward first base.

---

## 2. Multi-Phase Swing Kinetic Choreography & Timing Contract

The animation timing strictly honors the engine and renderer contracts across `pitchProg` (0.0 to 1.0):

| `pitchProg` | Phase | Kinetic Action |
|---|---|---|
| **0.00 – 0.42** | **Stance & Idle Waggle** | Batter waits in the box. Supports 6 distinct waggle styles (`arm_flap`, `barrel_circle`, `pump`, `twitch`, `subtle`, `standard`). From `0.34` to `0.42`, waggle smoothly settles as the pitcher reaches release. |
| **0.42 – 0.58** | **Load** | Hands drift back and up into the power launch slot; weight shifts to rear leg; front foot initiates stride (`leg_kick`, `toe_tap`, or `step`). |
| **0.58 – 0.72** | **Stride Plant** | Front foot reaches forward and plants firmly into the batter's box dirt; hips brace and begin turning while hands stay back, creating elastic tension (rotational kinetic chain). |
| **0.72 – 0.82** | **Rotation & Bat Lag** *(Swung)* | Hips snap open; rear heel lifts and pivots onto toe ("squish the bug"); rear knee drives inward; elbows slot into ribs; bat barrel lags behind hands into the hitting zone. |
| **0.82 – 0.90** | **Drive to Contact** *(Swung)* | Hands extend through the strike zone; wrists snap; bat whips into the plane. |
| **0.90** | **CONTACT (Exact Milestone)** | **Bat meets the incoming pitch at the strike zone plane at exactly `pitchProg = 0.90`**. Perfectly synchronizes with the ball arrival and contact flash! |
| **0.90 – 1.00** | **Follow-Through** *(Swung)* | - *One-Hand Finish:* Trailing hand releases at `p >= 0.92`, tucking near ribs while lead arm extends high skyward with bat.<br>- *Two-Hand Finish:* Both hands remain locked on grip, wrapping smoothly over the front shoulder.<br>Head tracks ball trajectory. |
| **0.72 – 1.00** | **Check-Swing / Take** *(!swung)* | - *Check-Swing:* Batter offers at pitch but abruptly locks wrists before the 90° plane (`batAng ~ 0.52 rad`), hips check, and eyes track the pitch into the mitt.<br>- *Disciplined Take:* Hands hold quiet in take posture watching the ball cross home plate. |

---

## 3. New Module: `src/ui/batterStyles.js`

### Exports:
1. `getBatterStyle(player, side = null)`
   - Deterministic style generator.
   - First checks player name and ID against historical patterns for classic legends (Musial, Carew, Yaz, Williams, Rose, Morgan, Rice, Murray, Ripken, Boggs, Reggie, Robinson, Fisk, Powell, Bumbry).
   - If no historic match, procedurally derives an individualized style using a 32-bit FNV-1a hash of the player's identity modulated by their 1–10 ratings (`power`, `hitAndRun`, `bunt`, `fbPct`, `runs`).
   - Generates: `stanceWidth`, `crouch`, `openClosed`, `handHeight`, `handX`, `batAngle`, `batLength`, `waggleRate`, `waggleStyle`, `strideType`, `strideLength`, `followThrough`, `attackAngle`, `checkSwingAggression`, `side`.
   - Handles left-handed, right-handed, and switch hitters (respecting the `side` parameter passed in).
2. `generateBatterPoses(style)`
   - Generates fully articulated keyframes tailored to the specific batter style: `STANCE`, `LOAD`, `STRIDE_PLANT`, `ROTATION`, `CONTACT`, `FOLLOW_ONE_HAND`, `FOLLOW_TWO_HAND`, `CHECK_SWING`, `TAKE`.
3. `getBatterSwingPose(style, pitchProg, didSwing, timeMs)`
   - Evaluates and blends the exact kinetic pose at any moment during the pitch delivery.
4. `BATTER_ARCHETYPES`
   - Registry of handcrafted iconic batter archetypes.
5. `BASE_BATTER_POSES`
   - Canonical 150-unit tall keyframes.
6. `blendPose(a, b, t)`
   - Robust pose interpolation supporting decoupled hands (`nHand`, `fHand`) for one-handed finishes.
7. Math utilities: `smooth(t)`, `lerp(a, b, t)`, `clamp(val, min, max)`, `hashString(str)`.

---

## 4. Updates to `src/ui/fieldRenderer1987.js`

1. **Imports:**
   - Imported `getBatterStyle`, `getBatterSwingPose`, `BASE_BATTER_POSES` from `./batterStyles.js`.
2. **`BATTER_POSES` Export:**
   - Exported `BATTER_POSES = { ...BASE_BATTER_POSES, FOLLOW: BASE_BATTER_POSES.FOLLOW_TWO_HAND }` so all existing and external consumers continue to find `STANCE`, `LOAD`, `CONTACT`, `FOLLOW`, plus new intermediate poses.
3. **`PIXEL_SPRITES.BATTING`:**
   - Enhanced full-field home plate batter sprite with a 2-pixel wide tapered wooden barrel highlight and skin gripping the handle, retaining the 11×15 pixel art grid.
4. **`drawDuelBatter` Method:**
   - Signature: `drawDuelBatter(ctx, x, footY, team, side, pitchProg, didSwing, isHome = false, batter = null)`
   - Backward-compatible with 8-argument calls; falls back gracefully to `this.lastGameState?.currentBatter` when `batter` is omitted.
   - Animated rear foot pivoting onto the ball of the foot during swing rotation/contact (`squish the bug`).
   - Dynamic motion smear on the bat during swing acceleration (`0.74 < pitchProg < 0.97`).
   - Batting gloves drawn on near and lead hands during one-handed follow-through release.
   - Bat layer ordering based on torso rotation twist.

---

## 5. Verification & Testing

1. **Syntax Check:**
   - `node --check src/ui/batterStyles.js` -> Passed clean.
   - `node --check src/ui/fieldRenderer1987.js` -> Passed clean.
2. **Deterministic Archetype & Math Tests:**
   - Verified 15 historic archetypes and procedural generators across power, contact, and speed archetypes.
   - Verified absence of `NaN` or invalid coordinates across all progress milestones (0.0 to 1.0).
3. **Headless Canvas Rendering Smoke Tests:**
   - Simulated 560 combinations of players (Musial, Carew, Yaz, Williams, Rose, Morgan, Rice, Murray, Ripken, Boggs, Reggie, Powell, Fisk, unknown rookies), batting sides (`L` and `R`), pitch progress values (`0.0`, `0.25`, `0.42`, `0.55`, `0.70`, `0.75`, `0.85`, `0.90`, `0.95`, `1.0`), and swing decisions (`didSwing = true / false`).
   - Verified 8-parameter caller signature compatibility and null batter fallback.

---

## 6. Coordinator Wiring Notes

- **Zero Breaking Changes:**
  - `drawDuelViewport` does **not** need any modification. It calls `this.drawDuelBatter(...)` with 8 arguments, and `drawDuelBatter` automatically detects the current batter from `this.lastGameState.currentBatter`.
  - If the coordinator desires, they can explicitly pass `gameState.currentBatter` as the 9th argument in `drawDuelViewport`, but this is purely optional.
- **Zero Build / Zero Dependencies:**
  - Standard native ES modules with explicit `.js` extensions.
