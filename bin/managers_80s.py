#!/usr/bin/env python3
"""Derives EWB strategy sliders for the 1980s franchise managers from their teams' stats.

For every manager picked by bin/pick_80s.py, sums the seasons he managed in 1980-1989 (all
franchises, weighted by the games he managed) and compares his teams with the
league that season:
- steal2nd: steal attempts per time on first base (5 = league average, 10 = double it)
- sacBunt: sacrifice hits per plate appearance
- intentionalWalk: intentional walks issued per batter faced
- relievePitcherAfter: complete-game rate (more complete games, longer leash)
- runAggressively: baserunning runs (baseball-reference Rbaser) per season
Team stats also reflect the players, so each of these is averaged with the researched
reputation value. The other sliders, the bio and the quotes come from the research file
tracking/results/manager_research_80s.json (written by a research agent, checked by hand).

Usage: managers_80s.py      Writes src/data/managers80s.js and tracking/results/managers_80s.json.
"""
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bref  # noqa: E402
from pick_80s import ip_outs, num  # noqa: E402
from scan_decade import FRANCHISES, OUT_DIR, YEARS  # noqa: E402

TASKS = os.path.join(bref.PROJECT_DIR, 'tracking', 'tasks', 'teams')
RESULTS = os.path.join(bref.PROJECT_DIR, 'tracking', 'results')
OUT_JS = os.path.join(bref.PROJECT_DIR, 'src', 'data', 'managers80s.js')
ALL = FRANCHISES['AL'] + FRANCHISES['NL']
# Managers who already have hand-written profiles in src/data/managers.js
EXISTING = {'weaveea99': 'weaver', 'herzowh01': 'herzog', 'anderSp01': 'anderson', 'andersp01': 'anderson',
            'mcnamjo99': 'mcnamara', 'mauchge01': 'mauch', 'torrejo01': 'torre'}
SLIDERS = ('platoonLineups', 'steal2nd', 'steal3rd', 'doubleSteal', 'sacBunt', 'buntForHit', 'squeezeBunt',
           'hitAndRun', 'runAndHit', 'pitchOut', 'pitchAround', 'intentionalWalk', 'chargeBunt', 'guardLines',
           'infieldIn', 'runAggressively', 'pinchHitInning', 'relievePitcherAfter', 'chooseHitterBy',
           'choosePitcherBy')


def clamp(x, lo=1, hi=10):
    return max(lo, min(hi, int(round(x))))


def rates(d):
    """Team-season rates the sliders compare against the league."""
    b, p = d['totals']['batting'], d['totals']['pitching']
    singles = num(b['b_h']) - num(b['b_doubles']) - num(b['b_triples']) - num(b['b_hr'])
    on_first = singles + num(b['b_bb']) + num(b['b_hbp'])
    games = num(p['p_g']) or 162
    return {
        'steal': (num(b['b_sb']) + num(b['b_cs'])) / on_first,
        'sac': num(b['b_sh']) / num(b['b_pa']),
        'ibb': num(p['p_ibb']) / num(p['p_bfp']),
        'cg': num(p['p_cg']) / games,
        'baserun': sum(num(v.get('b_runs_baserunning')) for v in d['value'].values()) * 162 / games,
    }


def main():
    data = {(t, y): json.load(open(os.path.join(OUT_DIR, f'{t}_{y}.json'))) for t in ALL for y in YEARS}
    league_of = {t: lg for lg, ts in FRANCHISES.items() for t in ts}
    team_rates = {k: rates(d) for k, d in data.items()}
    league = {}
    for (t, y), r in team_rates.items():
        acc = league.setdefault((league_of[t], y), {k: [] for k in r})
        for k, v in r.items():
            acc[k].append(v)
    league = {k: {s: sum(v) / len(v) for s, v in acc.items()} for k, acc in league.items()}

    picked = {}
    for path in sorted(glob.glob(os.path.join(TASKS, '*_80s.json'))):
        spec = json.load(open(path))
        picked.setdefault(spec['manager']['bref'], []).append(spec['id'])

    research_path = os.path.join(RESULTS, 'manager_research_80s.json')
    research = json.load(open(research_path)) if os.path.exists(research_path) else {}
    report, profiles = {}, []
    for mid, team_ids in sorted(picked.items()):
        ratio = {k: 0.0 for k in ('steal', 'sac', 'ibb', 'cg')}
        baserun, weight, games, seasons = 0.0, 0.0, 0, []
        name = None
        for (t, y), d in data.items():
            for m in d['managers']:
                if m['id'] != mid:
                    continue
                name = m['name']
                g = m['w'] + m['l']
                r, lg = team_rates[(t, y)], league[(league_of[t], y)]
                for k in ratio:
                    ratio[k] += g * (r[k] / lg[k] if lg[k] else 1)
                baserun += g * (r['baserun'] - lg['baserun'])
                weight += g
                games += g
                seasons.append(f'{t} {y} ({m["w"]}-{m["l"]})')
        ratio = {k: v / weight for k, v in ratio.items()}
        baserun /= weight
        stats = {
            'steal2nd': clamp(5 * ratio['steal']),
            'sacBunt': clamp(5 * ratio['sac']),
            'intentionalWalk': clamp(5 * ratio['ibb']),
            'relievePitcherAfter': max(95, min(130, round(110 + 25 * (ratio['cg'] - 1)))),
            'runAggressively': clamp(5 + baserun / 2.5),
        }
        report[mid] = {'name': name, 'teams': team_ids, 'games': games, 'seasons': seasons,
                       'ratios': {k: round(v, 2) for k, v in ratio.items()},
                       'baserunRunsPerSeason': round(baserun, 1), 'statSliders': stats,
                       'existingProfile': EXISTING.get(mid)}
        if mid in EXISTING:
            continue
        res = research.get(mid)
        if not res:
            print(f'no research for {name} ({mid}); skipping profile', file=sys.stderr)
            continue
        # Team stats also reflect the roster (fast teams steal more, durable rotations finish
        # more games), so each stat slider is averaged with the manager's documented reputation
        sliders = dict(res['sliders'])
        for k, v in stats.items():
            sliders[k] = round((v + res['sliders'][k]) / 2) if k in res['sliders'] else v
        # Steals of third and double steals follow the steal-of-second tendency
        sliders['steal3rd'] = clamp(sliders['steal2nd'] * 0.8 + res['sliders'].get('steal3rd', 5) * 0.2)
        sliders['doubleSteal'] = clamp(sliders['steal2nd'] * 0.7 + res['sliders'].get('doubleSteal', 5) * 0.3)
        profiles.append({'id': res['id'], 'name': name, 'team': res['team'], 'bio': res['bio'],
                         'quote': res['quote'], 'quotes': res['quotes'],
                         **{k: sliders[k] for k in SLIDERS}})
        report[mid]['profile'] = res['id']

    with open(os.path.join(RESULTS, 'managers_80s.json'), 'w') as f:
        json.dump(report, f, indent=1)
    write_js(profiles)
    for mid, r in report.items():
        print(f"{r['name']:20} {r['games']:5} G {','.join(r['teams']):16} {r['ratios']} "
              f"baserun {r['baserunRunsPerSeason']:+} -> {r['statSliders']}")


def js(v):
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, str):
        return "'" + v.replace('\\', '\\\\').replace("'", '’') + "'"
    if isinstance(v, list):
        return '[\n' + ',\n'.join('      ' + js(x) for x in v) + '\n    ]'
    return str(v)


def write_js(profiles):
    body = []
    for p in profiles:
        lines = [f'  {p["id"]}: {{']
        for k, v in p.items():
            if k == 'platoonLineups':
                lines.append('    // 19 EWB Strategy Parameters')
            lines.append(f'    {k}: {js(v)},')
        lines[-1] = lines[-1].rstrip(',')
        lines.append('  }')
        body.append('\n'.join(lines))
    text = """/**
 * Managers of the 1980s franchise teams (src/data/teams/*_80s.js), in the 19-slider EWB schema
 * documented in managers.js, which merges them into MANAGERS.
 *
 * Generated by bin/managers_80s.py; edit tracking/results/manager_research_80s.json and rebuild
 * rather than editing this file. The steal, sacrifice, intentional-walk, complete-game and
 * baserunning sliders come from each manager's 1980s team stats against the league; the rest,
 * with the bios and quotes, come from the research file.
 */

export const MANAGERS_80S = {
""" + ',\n\n'.join(body) + '\n};\n'
    with open(OUT_JS, 'w') as f:
        f.write(text)


if __name__ == '__main__':
    main()
