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

Progress 0.42 is still the release frame: the ball leaves the hand there, and the throwing hand is at its release keyframe at that instant.

| Progress | Phase |
|---|---|
| 0.00–0.16 | Windup. Hands rise overhead, or stay at the chest for hidden-ball and drop windups. Stretch: hands stay at the chest. |
| 0.16–0.30 | Leg lift. Kick height comes from `legKick`. Stretch: half the kick. |
| 0.30–0.36 | Stride. The glove-side foot lands toward the plate. |
| 0.36–0.42 | Arm cock, then the whip into release. |
| 0.42 | Release. |
| 0.42–0.86 | Follow-through. The back foot lifts on high-kick deliveries. |

The windup uses `tempo` as an ease exponent on the rise.

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
