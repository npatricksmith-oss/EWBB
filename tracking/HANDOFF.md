# Handoff — 2026-10-23

## Where things stand

The user keeps a task list in Google Drive: the Google Doc **"EWBB Updates"**. It sits at the top of My Drive, not in the empty "Agent Inbox" folder. Its file ID is `1e66R8u6aTyTDs-V0nfm13RRWPgE4o_SqrdWUUQK06a8`. It lists three items:

1. **Pitcher's pivot foot.** Done in `cd374f6`, pushed to `main`.
2. **Base runners.** Not started.
3. **Outfield throws.** Not started.

The user's goal for items 2 and 3: **keep the dice rolls. Make the on-field animation show the rolled result realistically.** Don't replace the statistical outcomes with physics.

## Item 1: what was done

The pivot foot now slides to the throwing-arm end of the rubber at the pivot and stays there through the lift and stride. That's the third-base end for a righty; lefties get the mirror image. The stretch stance sits toward the same end, and the shadow follows the planted feet.

- Code: `src/ui/pitcherStyles.js` (keyframes) and the shadow in `drawDuelPitcher` in `src/ui/fieldRenderer1987.js`.
- Frames: `research/images/pitching/game_pivot_foot_rhp.png` and `game_pivot_foot_lhp.png`.
- Not yet watched in a live game. The user may want the offset adjusted. The pivot foot's x is about -10 keyframe units in `pivotFrame`, `liftFrame`, `stretchLegs`, `strideLegs` and `strideAir`.

## Items 2 and 3: the requests

**Base runners**
- When a play lets a runner take an extra base, show it. For example, a runner scoring from second rounds third and heads home.
- Runners make realistic choices, such as whether a runner on first tries for third on a hit to the outfield.

**Outfield throws**
- Weak-armed outfielders hit the cutoff man, who relays the ball. Strong-armed outfielders throw straight home or to the lead base.
- Sometimes a good throw or relay gets a runner out at home.
- When a fast runner will score easily on a single, the outfielder throws to second or to a relay man who holds the ball. No pointless throw home.

## Root cause found: the animation and the game state disagree

The two sides decide runner advancement separately.

- **Game state** (`src/engine/gameState.js`, about lines 482–580) decides after the play:
  - Single: a runner on second scores if his `runs` rating is 6 or more, or with two outs. A runner on first goes to third only on a hit-and-run or run-and-hit.
  - Double: a runner on first scores if `runs` is 7 or more.
- **Animation** (`simulateBattedBall` in `src/engine/physicsEngine.js`, about lines 955–1000) moves every runner forward by `basesReached`, the batter's bases.

So on a single the animation stops the runner from second at third while the scoreboard counts his run. That is the mismatch the user sees.

**Suggested fix:** decide each runner's destination once, with the same dice and ratings as today, before the frames are built. Pass that plan into `simulateBattedBall` through `context`, then:
- build the runner frames from the plan, rounding third when a runner is headed home;
- have the game state apply the same plan instead of deciding again.

Keep `gameState.js` lines 371 onward (the `simulateBattedBall` call) as the hookup point.

## Throws today

`throwPlan` is built in `physicsEngine.js` at about lines 683–770.
- A hit gets one throw, to second, third or first. It never goes home, and no cutoff man is involved.
- Throw speed is `108 + arm * 4.2` ft/s (line 143), so arm ratings are already available for choosing between the cutoff and a direct throw.
- `throwPlan.legs` already supports several legs (the double play uses two), so a relay is one more leg.
- `callBase`, `callType` and `callTime` drive the safe/out call; the renderer reads them at about line 1006.
- The renderer plays the frames in `fieldRenderer1987.js` at about line 2591.

## Outs on the bases

Nothing in the game state puts a runner out on a hit yet. An out at the plate needs:
- a die roll, decided up front with the runner's plan;
- an out added in `gameState.js`, with the run not scored;
- a throw whose arrival beats the runner in the frames.

Re-run `python3 validate_stats_cli.py 10` afterward to check that runs per game stay realistic.

## How to check visuals

- No `node` on PATH. Headless Chrome (flatpak) works, with the sandbox disabled:
  `flatpak run --filesystem=<dir> com.google.Chrome --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=3000 --window-size=1800,1000 --screenshot=<out.png> <url>`
- Serve the harness with `python3 -m http.server <port> --bind 127.0.0.1`, also with the sandbox disabled. A server started inside the sandbox isn't reachable from Chrome. Kill servers when done: the last session left 60 running.
- Last session's filmstrip harness (pitcher only) is at `/tmp/claude-1000/-var-home-natex-Projects-EWBB/073dc456-850a-4e75-b8d4-4c22b7212c3c/scratchpad/h/index.html`. `/tmp` may have been cleared since. For base running, build a harness that calls `simulateBattedBall` with a fixed launch vector and runners on base, then draws frames from the full-field view.

## Working rules (from memory)

- Commit and push to `main` after each verified fix without asking. `git push` needs the sandbox disabled.
- If you use codex or agy workers, time each run and log it in `tracking/MODEL_COMPARISON.md`. Codex uses GPT-6 models only.
- Name files by absolute path when talking to the user.
