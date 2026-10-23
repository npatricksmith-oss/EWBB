#!/usr/bin/env python3
"""Lists the 1980s roster picks that skip a player's iconic season, with the evidence.

An iconic season is one with a top-3 MVP or Cy Young finish, or a Rookie of the Year win,
for the same club. For each rostered player whose rated season is not his best iconic one,
prints both lines side by side. For each club it also lists the top save seasons, so the
closer pick can be checked against the club's signature reliever.

Writes tracking/results/iconic_80s.json.

Usage: iconic_80s.py
"""
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bref  # noqa: E402

TASKS = os.path.join(bref.PROJECT_DIR, 'tracking', 'tasks', 'teams')
RESULTS = os.path.join(bref.PROJECT_DIR, 'tracking', 'results')
TEAM80 = os.path.join(bref.CACHE_DIR, 'team80')


def award_rank(awards, code):
    for a in awards.split(','):
        if a.startswith(code + '-'):
            return int(a.split('-')[1])
    return None


def iconic(awards):
    marks = []
    for code, cut in (('MVP', 3), ('CYA', 3), ('ROY', 1)):
        rank = award_rank(awards, code)
        if rank and rank <= cut:
            marks.append(f'{code}-{rank}')
    return marks


def bat_line(r):
    return {'war': r.get('b_war'), 'pa': r.get('b_pa'), 'avg': r.get('b_batting_avg'), 'obp': r.get('b_onbase_perc'),
            'slg': r.get('b_slugging_perc'), 'hr': r.get('b_hr'), 'sb': r.get('b_sb'),
            'ops+': r.get('b_onbase_plus_slugging_plus'), 'awards': r.get('awards', '')}


def pitch_line(r):
    return {'war': r.get('p_war'), 'ip': r.get('p_ip'), 'w': r.get('p_w'), 'l': r.get('p_l'),
            'era': r.get('p_earned_run_avg'), 'era+': r.get('p_earned_run_avg_plus'), 'sv': r.get('p_sv'),
            'so': r.get('p_so'), 'awards': r.get('awards', '')}


def main():
    out = {}
    for path in sorted(glob.glob(os.path.join(TASKS, '*_80s.json'))):
        team = json.load(open(path))
        franchise = team['franchise']
        seasons = {}
        for f in sorted(glob.glob(os.path.join(TEAM80, f'{franchise}_*.json'))):
            seasons[int(f[-9:-5])] = json.load(open(f))
        flags = []
        for kind, players in (('batting', team['batters']), ('pitching', team['pitchers'])):
            line = bat_line if kind == 'batting' else pitch_line
            for p in players:
                lines = {y: line(d[kind][p['bref']]) for y, d in seasons.items() if p['bref'] in d[kind]}
                icons = {y: iconic(l['awards']) for y, l in lines.items() if iconic(l['awards'])}
                if icons and p['year'] not in icons:
                    flags.append({'name': p['name'], 'slot': p.get('pos') or p.get('role'), 'rated': p['year'],
                                  'ratedLine': lines.get(p['year']), 'iconic': {y: lines[y] for y in icons}})
        saves = sorted(((int(r.get('p_sv') or 0), y, r['name'], pid) for y, d in seasons.items()
                        for pid, r in d['pitching'].items()), reverse=True)[:5]
        closer = next(p for p in team['pitchers'] if p['role'] == 'CL')
        out[team['id']] = {'flags': flags, 'closer': f"{closer['name']} {closer['year']}",
                           'topSaves': [f'{n} {y}: {sv} SV' for sv, y, n, _ in saves]}
    json.dump(out, open(os.path.join(RESULTS, 'iconic_80s.json'), 'w'), indent=1, ensure_ascii=False)
    for tm, t in out.items():
        print(f"\n== {tm}  closer {t['closer']}  | top saves: {'; '.join(t['topSaves'][:3])}")
        for f in t['flags']:
            print(f"  {f['name']} ({f['slot']}) rated {f['rated']}: {f['ratedLine']}")
            for y, l in f['iconic'].items():
                print(f'      iconic {y}: {l}')


if __name__ == '__main__':
    main()
