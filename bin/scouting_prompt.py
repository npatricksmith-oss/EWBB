#!/usr/bin/env python3
"""Writes the Haiku scouting-ratings prompt for one or more team specs to stdout."""
import json
import sys

PITCH_NAMES = ('4-Seam Fastball, 2-Seam Fastball, Sinker, Cutter, Slider, Curveball, Knuckle Curve, '
               'Changeup, Palmball, Screwball, Forkball, Splitter, Knuckleball, Spitball')

players = []
for path in sys.argv[1:]:
    team = json.load(open(path))
    for b in team['batters']:
        players.append(f"- {b['bref']} | {b.get('name', '')} | batter | {b['year']} | {b['pos']}")
    for p in team['pitchers']:
        players.append(f"- {p['bref']} | {p.get('name', '')} | pitcher | {p['year']} | {p['role']}")

print(f"""You are a baseball historian rating players for an Earl Weaver Baseball (1987) recreation.
Stats come from baseball-reference separately; you supply only scouting judgments that stats cannot show.

For each player below (baseball-reference ID | name | type | season | position or role), rate him for that season on a 1-10 scale
(1 = worst in MLB, 5 = average regular, 10 = best of his era), using his contemporary reputation, Gold Gloves, and fielding records.
If the name is blank, identify the player from the baseball-reference ID.

Batters: "range" (defensive range at the listed position; DH = his range at his usual field position),
"arm" (throwing arm strength and accuracy), "durability" (ability to play every day without injury that season).
Pitchers: "bunt" (sacrifice bunting skill), "fielding" (fielding his position, pickoff move),
"pitches" (his 2-4 primary pitches, best first, chosen only from: {PITCH_NAMES}).

Players:
""" + "\n".join(players) + """

Reply with ONLY a JSON object, no prose and no code fences, keyed by baseball-reference ID:
{"downibr01": {"name": "Brian Downing", "range": 6, "arm": 5, "durability": 9},
 "zahnge01": {"name": "Geoff Zahn", "bunt": 4, "fielding": 7, "pitches": ["Sinker", "Curveball", "Changeup"]}}""")
