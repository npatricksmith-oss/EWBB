# Team Pitcher: notes for the coordinator

## What changed

- **`src/ui/pitcherStyles.js` (new).** Builds each pitcher's delivery from a hash of their name, adjusted by their speed and control ratings. It also builds the keyframes for every phase.
- **`src/ui/fieldRenderer1987.js`.**
  - `PITCHER_POSES` is removed. Its keyframes now come from `pitcherStyles.js`.
  - `drawDuelPitcher` uses the new phase timeline and each pitcher's style. Its signature is unchanged.
  - The import line is the only other edit.
- Nothing else changed. No ball, batter, `drawDuelViewport`, `app.js`, or engine code was touched.

## Exports from `pitcherStyles.js`

- `getPitcherStyle(pitcher)`: returns the style object (cached by name). Fields: `armSlot`, `releaseAngle`, `lean`, `windup`, `legKick` (0–1), `tempo`, `glove`, `look`, `followThrough`.
- `getReleasePointOffset(pitcher, unit = DUEL_PITCHER_SCALE)`: returns `{ dx, dy }`, the throwing hand relative to the pitcher's feet on the mound, in screen pixels. Left-handers are mirrored in `dx`.
- `getPitcherPoses(style)` and `buildPitcherPoses(style)`: the per-phase keyframes.
- `DUEL_PITCHER_SCALE = 0.66`: the screen scale of the duel pitcher. The renderer now reads this constant instead of a local `k`.

## Wiring the coordinator must do

**Start the pitch flight at the hand.** `drawDuelViewport` still starts the ball at a fixed point:

```js
const startX = cx + (isLeftyP ? 6 : -6);
const startY = moundY - 60;
```

Replace it with the hand position:

```js
import { getReleasePointOffset } from './pitcherStyles.js';
const rel = getReleasePointOffset(pitcher);
const startX = cx + rel.dx;
const startY = moundY + rel.dy;
```

`pitcher` is `gameState.currentPitcher`. I did not make this edit because the flight code is outside my scope.

## Timeline

Progress 0.42 is still the release frame: the ball leaves the hand there, and the throwing hand is at its release keyframe at that instant. `PITCH_WINDUP_MS` (1100 ms) covers progress 0 to 0.42 for both deliveries.

The lead-in follows the windup vs. stretch research in `research/pitching_windup_vs_stretch.md`.

| Progress | Windup (bases empty) | Stretch (runners on) |
|---|---|---|
| idle | `SET`: square, hands at the chest | `SIGN`: side-on, hands apart, glancing at the runner |
| 0.00–0.05 | `WIND`: hands rise overhead (stay at the chest for hidden-ball and drop windups) | `GATHER` (0–0.045): hands meet at the chest |
| 0.05–0.11 | `ROCKER`: the glove-side foot steps back | `STRETCH` (0.045–0.09): hands settle at the belt |
| 0.11–0.17 | `PIVOT`: pivot foot into the slot, body turns side-on | full stop (0.09–0.21, about 300 ms) |
| 0.17–0.26 | `LIFT`: knee to the chest; high kickers coil until the plate sees the back number | `STRETCH_LIFT` (0.21–0.28): knee to belt height, staying in front |
| 0.26–0.27 | balance point | |
| 0.27–0.30 | `BREAK`: hands part at the belt as the knee starts down | `STRETCH_BREAK`: same, from the lower lift |
| 0.30–0.33 | `STRIDE`: shoulders closed; the glove arm leads toward third, the throwing hand swings down and back past the far hip | same |
| 0.33–0.355 | `LOAD`: hips open; the throwing elbow rises behind the body | same |
| 0.355–0.385 | `COCK`: the hand rises on the far side, then crosses to the cocked position, arcing over the cap when that position is up by the head. Cocked and layback hand heights drop with the arm slot (beside the shoulder for sidearm, below it for submarine). The glove pulls in. | same |
| 0.385–0.40 | `LAYBACK`: shoulders nearly square, elbow leads, hand drops behind the head | same |
| 0.40–0.42 | The whip into release, at full speed. | same |
| 0.42 | Release. | same |
| 0.42–0.70 | Follow-through. The back foot lifts on high-kick deliveries. | same |

Both deliveries use `tempo` as an ease exponent on their first phase. While a pose's `back` is above 0.5, the renderer draws both arms behind the jersey and shows the number; a knee lifted above the hip is drawn in front of the jersey. `tFootSide` and `gFootSide` (0 toe-on, 1 along the rubber) turn each cleat; the pivot foot lies along the rubber from the pivot (or the stretch) until it drags off at release.

## Arm slots and variation

- **Arm slots:** overhand, three-quarter, sidearm, submarine. Each has a release angle, a torso lean toward the glove side, a throwing-shoulder drop, and a pelvis sink.
- **Ratings:**
  - `speed` sets the leg kick (faster means higher). Speed of 4 or lower raises the odds of sidearm and submarine.
  - `control` sets the tempo.
- **Variation:** each pitcher gets a small seeded jitter on release angle, lean, glove height, kick and tempo. The jitter is deterministic.
- **Signature deliveries:** a small table keyed by last name overrides the random choices for Marichal, Ryan, Tiant, Valenzuela, Seaver, Quisenberry and Tekulve.
- **Left-handers:** the renderer mirrors x, so keyframes never depend on handedness.

## Research summary

Sources I checked:

- **Marichal:** high kick, with the foot reportedly above the cap at the top of the kick. [lavidabaseball.com](https://lavidabaseball.com/el-profe-image-marichal-kick)
- **Tiant:** pivots with his back to the plate, looks toward the infield, and varies his release point. [Public's Radio](https://thepublicsradio.org/on-sports/farewell-to-a-red-sox-legend-luis-tiant/), [Christian Science Monitor, 1982](https://www.csmonitor.com/1982/0824/082427.html)
- **Quisenberry:** a low sidearm or submarine delivery adopted from Kent Tekulve, with a sinker around 84 mph. [SABR bio](https://sabr.org/bioproj/person/dan-quisenberry)
- **Seaver:** drop-and-drive, with the back knee bent deeply before the drive. [MLB obituary](https://www.mlb.com/amp/news/tom-seaver-dies-at-75.html), [Frontiers review](https://www.frontiersin.org/articles/10.3389/fspor.2021.670395/full)

Not researched: Valenzuela's skyward look and Nolan Ryan's kick. I modelled both from memory, so treat them as unverified. Stretch and set positions are modelled on common practice.

These sources give no joint angles or release-point measurements, so the keyframes are stylised. They read as the named deliveries at 0.66 scale. They have not been checked against film.

## Verification

- `node --check` passes on both files.
- A Node smoke test covers:
  - the style is deterministic across calls;
  - all keyframe sets share the same keys and contain only finite numbers;
  - left-handers mirror right-handers in `dx`;
  - `drawDuelPitcher` runs across 0–1 progress in windup and stretch for four pitchers, using a stub canvas;
  - at progress 0.42 the release hand matches `getReleasePointOffset`.
- Not run: a browser visual check. The shapes were checked with an ASCII stick-figure dump, not on screen.
- Not run: `validate_stats_cli.py`. I changed no engine files.
