# Handoff: 1980s franchise teams

Branch `feat/teams-1980s`, worktree `/var/home/natex/Projects/EWBB/.worktrees/teams-1980s`. Work only there. Another session works on gameplay in `/var/home/natex/Projects/EWBB` on `main`; don't touch that checkout until the merge step.

The request is the Google Doc "Feature-add-teams" (file ID `1GLT7jcH54rToQhVUtVoWDG7WEmXP8smvwWJwgNApUhc`) in the Drive folder "Agent Inbox".

## Done

- **Data:** `bin/scan_decade.py` cached all 260 team-seasons (26 franchises, 1980–89) in `tracking/results/bref_cache/team80/`.
- **Rosters:** `bin/pick_80s.py` wrote all 26 roster specs to `tracking/tasks/teams/<tm>_80s.json`. Its docstring gives the rules. Codex gpt-6.1-sol reviewed the method and the rosters twice; the fixes are in.
- **Ratings inputs:**
  - Sonnet scouting for all 26 teams is in `tracking/results/scouting_80s_<tm>.json`.
  - `bin/defense_80s.py` blends fielding stats with that scouting and writes `defense_80s_<tm>.json`. These are the files the build reads.
- **Managers:**
  - `bin/managers_80s.py` writes `src/data/managers80s.js`, which `managers.js` merges in. All 24 managers load.
  - Each spec's `defaultManagerId` is set.
  - The research behind the profiles is in `tracking/results/manager_research_80s.json`. Corrales and Trebelhorn have no sourced quote, so their first advice line stands in. Rose's quote is unverified.
- **Knuckleballers:** `bin/build_team.py` rates their pitch speed at 3.
- **UI:**
  - `src/ui/app.js` groups the team pickers by era and shows an "'80s" tag on the scoreboard.
  - The Commissioner's Disk editor shows each player's season.
  - `index.html` styles the tag.
- **Docs:** ARCHITECTURE.md, AGENTS.md and README.md are updated, and the 26 IDs are in `tracking/tasks/teams/order.json`.
- **Built so far:** `atl_80s` builds and plays (30 headless games ran clean).

## Finished, 2026-10-23

- **Builds:** all 26 teams build. The only warning was Honeycutt's 1983, split with the Dodgers; the user chose Nolan Ryan 1989 in his place (`HAND_STARTERS` in `bin/pick_80s.py`, scouting copied from the Astros file).
- **Smoke test:** 1,332 games across all 37 teams, no errors.
- **Run scoring:** 1,300 games among the '80s teams average 4.78 runs per team-game, a little above the 4-4.5 expected. All-decade lineups face all-decade staffs, so both sides are stronger than a real 1980s league (about 4.3). Royals score most (6.07), Mariners least (3.80).
- **Manifest** written, and the Codex runs logged in `tracking/MODEL_COMPARISON.md`.
- **Left:** the follow-ups, real 1980s parks (`tracking/tasks/task_04_parks_80s.md`) and multi-season league simulation.

## User decisions, 2026-10-23 (answers in the Google Doc)

- **Iconic seasons: hand-pick.** `HAND_PICKS` and `HAND_CLOSERS` in `bin/pick_80s.py` move seven players to their MVP or Cy Young season (Murphy 1983, Ripken 1983, Dawson 1987, Hoyt 1983, Valenzuela 1981, Viola 1988, Mattingly 1985) and make Fingers 1981 Milwaukee's closer, with Plesac (1986) as the reliever. `bin/iconic_80s.py` lists the evidence for every flagged pick in `tracking/results/iconic_80s.json`. Sutcliffe's 1984 Cy Young stays out: he split that season with Cleveland. Specs and the defense files for the eight affected teams are regenerated; atl and bal must be rebuilt.
- **Ballparks: follow-up.** See `tracking/tasks/task_04_parks_80s.md`.
- **Rating formulas, decided in doc comments:**
  - Pitcher speed and control stay centered on 7, the original game's scale.
  - Batter speed weighs success. In `build_team.py`, a runner whose success rate trails his league's loses steal credit by the cube of the ratio, with 5 league-average attempts mixed in. Above-average success adds nothing. Rafael Ramírez stays 9: his 66% matched his league.
  - Power's slope halves above 6. Only seasons with about .335 ISO and up reach 10: 12 of the 130 era-team batters (Ruth 1921, Maris 1961), down from 39.
  - Outfield arms are the scouting judgment alone (`defense_80s.py`). Dwight Evans now rates 9. Catchers still blend caught-stealing rate at half weight.
  - The ten existing era teams are rebuilt with these formulas, and only ratings changed. The atlanta and california specs had stale parks and managers, now fixed to match the committed modules. Smoke test, 1,100 games each: 6.66 runs per team-game before, 6.65 after.
- **Close calls, settled with the user:** Ozzie Smith 1987 replaces 1989, and Sutter (1984) closes for the Cardinals with Worrell (1987) as the reliever. Strawberry 1987, Henderson 1980 and Gossage 1982 stay on the rules.
