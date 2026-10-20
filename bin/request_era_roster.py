#!/usr/bin/env python3
"""Asks Haiku (via bin/dispatch.py) to pick one EWB era all-star roster.

Usage: request_era_roster.py <team_id> [...]   e.g. al_00_30 nl_00_30

For each team, writes the prompt to tracking/tasks/task_02_<id>.md, the raw reply to
tracking/results/roster_<id>.txt, the roster spec to tracking/tasks/teams/<id>.json,
and the scouting ratings to tracking/results/scouting_<id>.json. Players already
placed on another era team are excluded, so each player appears on one team only.
"""
import glob
import json
import os
import re
import subprocess
import sys

PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
TASKS = os.path.join(PROJECT_DIR, 'tracking', 'tasks')
RESULTS = os.path.join(PROJECT_DIR, 'tracking', 'results')

ERAS = {
    'al_00_30': ('AL', 1901, 1930, '00-30', 'A00', '#1c2841', '#c8102e', 'fenway', 'weaver'),
    'nl_00_30': ('NL', 1900, 1930, '00-30', 'N00', '#3b2a1a', '#d4a017', 'wrigley', 'herzog'),
    'al_31_45': ('AL', 1931, 1945, '31-45', 'A31', '#0c2340', '#b0b7bc', 'fenway', 'weaver'),
    'nl_31_45': ('NL', 1931, 1945, '31-45', 'N31', '#5a1414', '#e8d5a3', 'wrigley', 'herzog'),
    'al_46_60': ('AL', 1946, 1960, '46-60', 'A46', '#003087', '#e4002b', 'fenway', 'weaver'),
    'nl_46_60': ('NL', 1946, 1960, '46-60', 'N46', '#005a9c', '#ef3e42', 'wrigley', 'herzog'),
    'al_61_75': ('AL', 1961, 1975, '61-75', 'A61', '#df4601', '#27251f', 'fenway', 'weaver'),
    'nl_61_75': ('NL', 1961, 1975, '61-75', 'N61', '#c6011f', '#0e3386', 'wrigley', 'herzog'),
}

PITCH_NAMES = ('4-Seam Fastball, 2-Seam Fastball, Sinker, Cutter, Slider, Curveball, Knuckle Curve, '
               'Changeup, Palmball, Screwball, Forkball, Splitter, Knuckleball, Spitball')


def used_ids(skip):
    ids = set()
    for path in glob.glob(os.path.join(TASKS, 'teams', '*.json')):
        if os.path.basename(path)[:-5] in (skip, 'order', 'california', 'atlanta'):
            continue
        team = json.load(open(path))
        ids.update(p['bref'] for p in team['batters'] + team['pitchers'])
    return sorted(ids)


def prompt_for(team_id):
    lg, y0, y1, *_ = ERAS[team_id]
    league = 'American League' if lg == 'AL' else 'National League'
    excluded = used_ids(team_id)
    return f"""You are a baseball historian rebuilding the "{lg} {y0}-{y1}" all-star team that shipped with
Earl Weaver Baseball (Electronic Arts, 1987). The game's era teams gathered the greatest {league}
players of those seasons. Pick the stars a 1987 designer would have chosen: Hall of Famers and the
era's best player at each position.

Roster: 19 players.
- 9 starters, one at each of C, 1B, 2B, 3B, SS, LF, CF, RF, DH (DH = the best remaining hitter, any position).
- 4 bench players: a backup catcher, an infielder, an outfielder, and one more hitter.
- 6 pitchers: 4 starters (role "SP"), 1 reliever ("RP"), and 1 closer ("CL", the era's best relief ace;
  before relief specialists existed, pick a pitcher famous for relief work).

For each player, choose ONE representative season (typically his best) between {y0} and {y1}
in which he played for a {league} team. Give his baseball-reference.com player ID (e.g. "cobbty01",
"ruthba01", "johnswa01"); double-check each ID, because a wrong ID breaks the build.
Never include these players, who are already on other era teams: {', '.join(excluded) or 'none'}.

Also rate each player for that season on a 1-10 scale (1 = worst in MLB, 5 = average regular,
10 = best of his era) from his reputation and fielding record:
- batters: "range" (defensive range at his position), "arm" (throwing arm), "durability" (plays every day).
- pitchers: "bunt" (sacrifice bunting), "fielding", and "pitches" (2-4 primary pitches, best first,
  chosen only from: {PITCH_NAMES}).
Give "pos2", a secondary position he could play, when he had one.

Reply with ONLY a JSON object, no prose and no code fences:
{{"batters": [{{"bref": "cobbty01", "name": "Ty Cobb", "year": 1911, "pos": "CF", "pos2": "RF", "isStarter": true,
   "range": 8, "arm": 7, "durability": 9}}, ...],
 "pitchers": [{{"bref": "johnswa01", "name": "Walter Johnson", "year": 1913, "role": "SP",
   "bunt": 5, "fielding": 7, "pitches": ["4-Seam Fastball", "Curveball"]}}, ...]}}
List the 9 starters first (isStarter true), then the 4 bench players (isStarter false)."""


def parse_reply(text):
    text = re.sub(r'^```(?:json)?|```$', '', text.strip(), flags=re.M).strip()
    start, end = text.find('{'), text.rfind('}')
    return json.loads(text[start:end + 1])


def request(team_id):
    lg, y0, y1, label, abbrev, c1, c2, park, mgr = ERAS[team_id]
    prompt = prompt_for(team_id)
    with open(os.path.join(TASKS, f'task_02_{team_id}.md'), 'w') as f:
        f.write(prompt + '\n')
    proc = subprocess.run([sys.executable, os.path.join(PROJECT_DIR, 'bin', 'dispatch.py'), 'haiku', prompt],
                          capture_output=True, text=True)
    with open(os.path.join(RESULTS, f'roster_{team_id}.txt'), 'w') as f:
        f.write(proc.stdout + ('\n[stderr]\n' + proc.stderr if proc.stderr else ''))
    if proc.returncode != 0:
        raise RuntimeError(f'{team_id}: dispatch failed: {proc.stderr.strip()}')
    reply = parse_reply(proc.stdout)
    scouting, batters, pitchers = {}, [], []
    for i, b in enumerate(reply['batters']):
        scouting[b['bref']] = {k: b[k] for k in ('name', 'range', 'arm', 'durability') if k in b}
        spec = {k: b[k] for k in ('bref', 'year', 'pos', 'pos2') if b.get(k)}
        # The prompt lists the 9 starters first; Haiku sometimes omits isStarter: true
        spec['isStarter'] = i < 9
        batters.append(spec)
    for p in reply['pitchers']:
        scouting[p['bref']] = {k: p[k] for k in ('name', 'bunt', 'fielding', 'pitches') if k in p}
        pitchers.append({k: p[k] for k in ('bref', 'year', 'role')})
    team = {
        'id': team_id, 'city': lg, 'name': label, 'abbrev': abbrev, 'league': lg,
        'primaryColor': c1, 'secondaryColor': c2, 'defaultParkId': park, 'defaultManagerId': mgr,
        'source': f'{lg} {y0}-{y1} all-star team, a reconstruction of the EWB 1.0 era team (roster picked by Haiku, '
                  f'reviewed by the coordinator; the original 1987 roster is undocumented)',
        'batters': batters, 'pitchers': pitchers,
    }
    with open(os.path.join(TASKS, 'teams', f'{team_id}.json'), 'w') as f:
        json.dump(team, f, indent=1)
    with open(os.path.join(RESULTS, f'scouting_{team_id}.json'), 'w') as f:
        json.dump(scouting, f, indent=1)
    names = ', '.join(f"{b['name']} {b['year']}" for b in reply['batters'] + reply['pitchers'])
    print(f'{team_id}: {len(batters)} batters, {len(pitchers)} pitchers: {names}', flush=True)


if __name__ == '__main__':
    for tid in sys.argv[1:]:
        try:
            request(tid)
        except Exception as e:  # keep going so one bad reply doesn't stall the batch
            print(f'{tid}: FAILED {e}', flush=True)
