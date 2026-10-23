# Handoff — 2026-10-23 (afternoon)

## Where things stand

The user keeps a task list in the Google Doc **"EWBB Updates"** (file ID `1e66R8u6aTyTDs-V0nfm13RRWPgE4o_SqrdWUUQK06a8`, top of My Drive). Its three items:

1. **Pitcher's pivot foot.** Done in `cd374f6`.
2. **Base runners.** Done (this session).
3. **Outfield throws.** Done (this session).

The user's rule for 2 and 3: keep the dice rolls; make the animation show the rolled result realistically.

## What was built

New module `src/engine/baseRunning.js`. `planBaseRunning()` decides every runner's fate once, and both the animation and the game state use that plan, so they can no longer disagree.

- **Out plays** (grounders, fielder's choices, double plays, sacrifices, caught flies) keep the old `gameState.js` rules.
- **Outfield hits** roll dice: does the lead runner go (speed, outs, hit side and depth, arm, manager `runAggressively`, and on singles the coach's read of runner vs. throw), is he thrown out, is it close enough to draw a throw, does the trailing runner move up, does the batter take a base on the throw (only when a return throw could not get him).
- **Throws:** strong arms (8+) throw straight in; weak arms hit the cutoff man (3B on throws home from LF, 1B from CF/RF, SS to third), who relays. Extra-base hits go through a relay man (SS on the left side, 2B on the right). An easy score draws a throw to second, a cutoff man who holds it, or a relay man who holds it. Bases the cutoff men leave are covered and the pitcher backs up.
- **Timing fit:** the tape is fitted to the dice. On extra-base hits the outfielder runs to where he would have cut the ball off, then chases it down along its roll. The runner's jump, a late wave at third and (at most 0.35 s) a slow release cover the rest. The ball beats every runner called out and trails every runner called safe.
- **Runner paths:** wide turns before rounded bases, round-and-hold, slides on close plays, and scored or retired runners jog off.
- **Rules:** time plays (a run after the third out does not count) and walk-offs (play ends at the winning run; later outs and runs do not count; a game-ending hit is credited with only the bases the winning run needed; a late throw to first becomes a fielder's choice).
- Also fixed in passing: the ball shown in a fielder's hands before he reached it, the first baseman tossing to an empty bag, and double-play feeds reaching second before the pivot man.

`gameState.applyPhysicsOutcome` now applies `phys.runnerPlan` (bases, runs, outs). `physicsResult` also carries `throwPlan`.

## Numbers

- Over 200 simulated games, a runner on second scores on an outfield single about 70% of the time (about 87% with two outs) and is thrown out about 4%. First to third: about 28%. Scoring from first on a double: about 50%.
- Runs per team-game: **5.43** over 10 seasons of 162, against **5.56** for the old code over 9 seasons (about 2% fewer). The old rules let every runner on second score with two outs. The all-teams smoke run moves either way within noise (6.64 old; 6.70–7.11 new).

## Not done / possible next steps

- Not watched in the live game yet; checked only with headless filmstrips.
- Outs on the bases happen only at home and third. No rundowns, no tag-ups from second, no runner thrown out trying for second.
- The descriptions still say "stand-up triple" when the batter slides.

## How to check

- No `node`. Headless Chrome via flatpak works with the sandbox disabled. A small runner that imports a module in Chrome and posts back JSON is the quickest way to run engine probes; the filmstrip harness renders `FieldRenderer1987` frames into a grid. Both lived in the session scratchpad and are gone; rebuild if needed.
- `python3 validate_stats_cli.py 162` (needs the sandbox disabled for Chrome). Run several seasons; one season's R/G swings by ±0.3.
- `codex exec` in the background needs `< /dev/null` or it waits on stdin.

## Working rules (from memory)

- Commit and push to `main` after each verified fix without asking. `git push` needs the sandbox disabled.
- Time and log codex/agy runs in `tracking/MODEL_COMPARISON.md`. Codex uses GPT-6 models only.
- Name files by absolute path when talking to the user.
- The sandbox drops empty read-only placeholder files (`.bashrc`, `.gitconfig`, `.claude/agents` and others) in the repo root. Never commit them.
- Leave `.worktrees/teams-1980s` alone; another session works there.
