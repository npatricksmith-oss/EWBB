# Handoff: 1980s franchise teams (branch feat/teams-1980s, worktree .worktrees/teams-1980s)

Request: Google Doc "Feature-add-teams" in Drive folder "Agent Inbox".

## Done
- `bin/scan_decade.py`: all 260 team-seasons (26 franchises, 1980-89) cached in `tracking/results/bref_cache/team80/`. Tied-game manager records and the `washiu_01` (U L Washington) ID bug are fixed and refetched.
- `bin/pick_80s.py`: all 26 roster specs in `tracking/tasks/teams/<tm>_80s.json`, revised after two Codex gpt-6.1-sol reviews (strict positions, CF can play corners, full-time seasons only, 2-WAR season rule, best closer among top savers).
- `bin/defense_80s.py`, `bin/managers_80s.py`: written, not yet run end to end.
- `tracking/results/manager_research_80s.json`: 19 manager profiles from a Sonnet research agent. Check quotes flagged in each `sources` (Corrales and Trebelhorn have no quote; Rose's is unverified).
- `src/ui/app.js`, `index.html`: team pickers grouped by era, "'80s" scoreboard tag, player season shown in the editor.
- Scouting for atl, bos, cal: `tracking/results/scouting_80s_<tm>.json`.

## Left
1. Finish fetching player and split pages (a background fetch may have cached some in `bref_cache/`; rerun the same loop over all specs — cached pages are skipped).
2. Scouting for the other 23 teams: `python3 bin/scouting_prompt.py tracking/tasks/teams/<tm>_80s.json | claude -p --model sonnet` (the 2026-10-23 run hit the usage limit).
3. `python3 bin/defense_80s.py`, then `python3 bin/build_team.py tracking/tasks/teams/<tm>_80s.json tracking/results/defense_80s_<tm>.json` per team; append the 26 ids to `tracking/tasks/teams/order.json`; fix any "split the season between clubs" warnings.
4. `python3 bin/managers_80s.py` -> `src/data/managers80s.js`; merge `MANAGERS_80S` into `MANAGERS` in `managers.js`; set each spec's `defaultManagerId` (existing ids: weaver, herzog, anderson, mauch, torre).
5. `node bin/smoke_teams.mjs` (inside the ewbb toolbox), `python3 validate_stats_cli.py 10`, a Codex review of the built ratings, docs (ARCHITECTURE.md, write_manifest.py), log Codex runs in MODEL_COMPARISON.md (round 1: 150 s, 4.4 KB; round 2: 298 s), merge to main and push.
