#!/usr/bin/env python3
"""Caches the player and split pages every 1980s franchise roster needs before building.

bin/build_team.py fetches these too, but one pass up front (about 2.5 hours at the polite
request rate) lets scouting and review run while it downloads. Cached pages are skipped.

Usage: fetch_80s.py
"""
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bref  # noqa: E402

TASKS = os.path.join(bref.PROJECT_DIR, 'tracking', 'tasks', 'teams')


def main():
    todo = []
    for path in sorted(glob.glob(os.path.join(TASKS, '*_80s.json'))):
        team = json.load(open(path))
        todo += [(p['bref'], p['year'], 'b') for p in team['batters']]
        todo += [(p['bref'], p['year'], 'p') for p in team['pitchers']]
    print(f'{len(todo)} players', flush=True)
    for i, (pid, year, kind) in enumerate(todo):
        try:
            bref.player(pid)
            bref.splits(pid, year, kind)
        except Exception as e:  # keep going; the build reports anything still missing
            print('FAIL', pid, year, kind, e, flush=True)
        if i % 25 == 0:
            print(i, pid, year, flush=True)
    print('done', flush=True)


if __name__ == '__main__':
    main()
