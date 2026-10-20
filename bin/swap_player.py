#!/usr/bin/env python3
"""Replaces one player in a roster spec and its scouting file.

Usage: swap_player.py <team_id> <old_bref> '<spec json>' '<scouting json>'
The new spec keeps the old player's pos/isStarter/role unless the spec JSON overrides them.
"""
import json
import os
import sys

PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
team_id, old, spec, scout = sys.argv[1], sys.argv[2], json.loads(sys.argv[3]), json.loads(sys.argv[4])
spec_path = os.path.join(PROJECT_DIR, 'tracking', 'tasks', 'teams', f'{team_id}.json')
scout_path = os.path.join(PROJECT_DIR, 'tracking', 'results', f'scouting_{team_id}.json')
team, scouting = json.load(open(spec_path)), json.load(open(scout_path))
for group in ('batters', 'pitchers'):
    for i, p in enumerate(team[group]):
        if p['bref'] == old:
            kept = {k: v for k, v in p.items() if k in ('pos', 'pos2', 'isStarter', 'role')}
            team[group][i] = {**kept, **spec}
            break
    else:
        continue
    break
else:
    sys.exit(f'{old} not on {team_id}')
scouting.pop(old, None)
scouting[spec['bref']] = scout
team.setdefault('coordinatorEdits', []).append(f"{old} -> {spec['bref']} {spec.get('year')}")
json.dump(team, open(spec_path, 'w'), indent=1)
json.dump(scouting, open(scout_path, 'w'), indent=1)
print(f"{team_id}: {old} -> {spec['bref']}")
