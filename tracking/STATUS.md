# Project Status: 1987 Historical Teams & Players Ingestion

**Status:** Milestone complete. All 10 base-game teams ingested; awaiting answers in `BLOCKERS_AND_QUESTIONS.md`
**Coordinator:** Claude Opus 5.5
**Workers:** Claude Haiku 5.5 (rosters, scouting ratings), Codex Luna 6 (validation)
**Host / User Liaison:** Antigravity

---

## Pipeline

1. **Roster spec** (`tracking/tasks/teams/<id>.json`): players, seasons, positions, roles.
   - 1982 Angels and Braves: picked by Opus from 1982 playing time.
   - Era teams: picked by Haiku (`bin/request_era_roster.py`), then reviewed by Opus; swaps are logged in each spec's `coordinatorEdits`.
2. **Scouting ratings** (`tracking/results/scouting_<id>.json`, `task_01_scouting_1982.json`): Haiku's 1–10 range, arm, durability, pitcher bunt and fielding, and pitch repertoires.
3. **Build** (`bin/build_team.py`):
   - Fetches each player's season totals and L/R splits from baseball-reference (`bin/bref.py`, cached in `tracking/results/bref_cache/`).
   - Derives the stat-based ratings.
   - Writes `src/data/teams/<id>.js` and regenerates `src/data/teams/index.js`.
4. **Validate:**
   - Luna checks the math and schema (`tracking/tasks/task_03_luna_validate.md`).
   - `node bin/smoke_teams.mjs` plays every team pairing headless.
   - `python3 validate_stats_cli.py 10` runs the season benchmark.
5. **Manifest:** `python3 bin/write_manifest.py` regenerates `TEAMS_MANIFEST.md`.

## Milestones
- [x] Worker daemon and dispatcher infrastructure (`bin/queue_worker.py`, `bin/dispatch.py`)
- [x] Confirmed the shipped team list: 8 era all-star teams plus the 1982 Angels and Braves (see `BLOCKERS_AND_QUESTIONS.md`)
- [x] Built the baseball-reference stats pipeline and calibrated the rating formulas against the hand-built Orioles and Red Sox
- [x] Built and ingested the 1982 California Angels and 1982 Atlanta Braves; Luna validation passed
- [x] Built and ingested all 8 era teams. Opus made 18 changes to Haiku's 152 picks: players whose peak fell in another era, a wrong league (Coffman), wrong IDs (Wynn, Pierce, Wilhelm), and lineup fixes (each spec's `coordinatorEdits` lists them)
- [x] Partial pre-1950 splits scaled to season totals; each player's `source.splitCoverage` records how much of the season they cover
- [x] Luna validation of all 10 teams: all checks pass (`tracking/results/task_03_luna_validate_all.txt`)
- [x] `node bin/smoke_teams.mjs 2`: 220 headless games, no errors (6.8 runs per team-game, since every lineup is built from peak seasons)
- [x] `python3 validate_stats_cli.py 10` runs cleanly

## Notes for the next run
- baseball-reference blocked us for an hour (HTTP 429) after about 135 requests at one per 4 s. `bin/bref.py` now waits 10 s between requests and sleeps out any 429. All fetched pages are cached, so rebuilds make no requests.
- Haiku's roster replies sometimes omit `isStarter: true` and invent player IDs. `request_era_roster.py` now sets starters by order, and the build fails fast on a 404 or warns when a name doesn't match.

## Rating formulas (`bin/build_team.py`)
- **Batters:**
  - `power`: from ISO and HR/AB.
  - `hitAndRun`: from strikeout rate and average.
  - `runs`: from steal attempts and triples.
  - `bunt`: from speed, sacrifices, and power.
  - `fbPct`: from HR/AB.
  - Era-dependent rates are scaled to 1975–86 league norms.
- **Pitchers:**
  - `speed`: K/9 against the league.
  - `control`: BB/9 against the league.
  - `fatigue`: innings per start (starters) or per appearance (relievers).
- **Overrides:** a spec's `ratings` field overrides any derived value, e.g. Phil Niekro's knuckleball speed.
