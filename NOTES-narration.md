# Team narration: notes for the coordinator

Scope: `src/ui/app.js`, `src/ui/fireworks.js` (new), `src/ui/soundEngine.js` (one new method), `NOTES-narration.md`.
Not touched: `fieldRenderer1987.js`, engine files, `index.html`.

## What changed

### 1. Play-by-play narration follows the field

- `handleThrowPitch` records which play-log entries the pitch adds and hides them right away. The play log panel skips hidden entries.
- When the field animation completes, `queueNarration()` queues the entries. The first one appears 750 ms later, then one every 420 ms, oldest first.
- Back-to-back pitches narrate in order because one queue serves them all.
- The scoreboard, count, and box score still update when the animation completes. Only the play-by-play text is delayed.
- Headless sims and New Game flush the queue at once, so they do not wait on it.
- Instant Replay does not touch the queue and does not log anything.

Constants: `NARRATION_DELAY_MS`, `NARRATION_STAGGER_MS` in `app.js`.

### 2. Home-run fireworks

- `src/ui/fireworks.js` exports `HomeRunFireworks`.
  - `new HomeRunFireworks(hostCanvas, { onBurst })`
  - `play(durationMs = 3600)` starts a show and replaces any show already running.
  - `stop()` ends a show early. It is safe to call when idle.
- The overlay is a `<canvas>` appended to the host canvas's parent (`#canvasViewportWrap`). It has `pointer-events: none` and removes itself when the show ends.
- `app.js` calls `scheduleHomeRunFireworks()` for each HR. It finds the first tape frame where the ball's horizontal distance reaches `physicsResult.wallInfo.distanceFt`, then starts the show 1 s after that frame plays.
- The timing assumes the renderer's pitch delivery is 720 ms and the field tape plays at 60 fps. Those values are `PITCH_DELIVERY_MS` and `FIELD_FPS` in `app.js`. If the renderer changes either one, update the constant.

### 3. Pop sound

- `soundEngine.playFireworkPop()` is a short square-wave blip.
- It runs once per burst through the `onBurst` callback. Nothing else in the module touches the sound engine.

## Coordinator wiring

None required. Merge the branch as-is.

## Issues for other teams

- **Renderer spoils the result (`fieldRenderer1987.js`, around the `bannerText` use).** The full-field banner draws `physicsResult.description` from the start of the flight. That text says "HOME RUN!" before the ball lands. The renderer team should delay the banner or drop the outcome wording.
- **Live state during animation.** The offense and defense selects call `renderer.render(this.gameState)` on change. A change mid-animation draws the live (post-pitch) state. Low priority.

## Verification

- `node --check` passes on `app.js`, `fireworks.js`, and `soundEngine.js`.
- A Node smoke test loaded the real `app.js` against DOM and canvas stubs. It checked:
  - entries stay hidden after the animation and reveal after about 750 ms;
  - multiple entries reveal oldest first, at 750, +420, +420 ms;
  - headless sims flush the queue without delay;
  - fireworks start about 2.72 s after the pitch on a 300 ft fence test case;
  - the overlay has `pointer-events: none`, sits over the canvas, and removes itself;
  - all five rockets burst inside the show.
- Not verified: the look of the fireworks and banner in a real browser. Nothing was rendered on screen. Check the show on a live page.
- Engine files are unchanged, so `validate_stats_cli.py` was not run.
