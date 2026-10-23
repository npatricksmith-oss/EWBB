#!/usr/bin/env python3
"""Builds each 1980s franchise team as soon as bin/fetch_80s.py has cached all its pages.

Runs alongside the fetch: polls every 30 seconds, builds every team whose player and split
pages are all cached (bin/build_team.py with tracking/results/defense_80s_<tm>.json), and
exits when all 26 are built. Teams already built are rebuilt, which is harmless.

Usage: build_80s.py
"""
import glob
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
import bref  # noqa: E402

TASKS = os.path.join(bref.PROJECT_DIR, 'tracking', 'tasks', 'teams')
RESULTS = os.path.join(bref.PROJECT_DIR, 'tracking', 'results')


def cached(team):
    for kind, players in (('b', team['batters']), ('p', team['pitchers'])):
        for p in players:
            for key in (f"player_{p['bref']}", f"split_{kind}_{p['bref']}_{p['year']}"):
                if not os.path.exists(os.path.join(bref.CACHE_DIR, key + '.json')):
                    return False
    return True


def main():
    todo = sorted(glob.glob(os.path.join(TASKS, '*_80s.json')))
    while todo:
        for path in list(todo):
            team = json.load(open(path))
            if cached(team):
                tm = team['id'].split('_')[0]
                run = subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'build_team.py'),
                                      path, os.path.join(RESULTS, f'defense_80s_{tm}.json')],
                                     capture_output=True, text=True)
                print(run.stdout, run.stderr, flush=True)
                todo.remove(path)
        if todo:
            time.sleep(30)
    print('ALL BUILT', flush=True)


if __name__ == '__main__':
    main()
