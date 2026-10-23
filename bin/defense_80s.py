#!/usr/bin/env python3
"""Blends fielding stats into the scouting ratings for the 1980s franchise teams.

The scouting JSON (an LLM's judgment of range, arm and durability from reputation and
Gold Gloves) is blended with what the decade scan measured for the player's season:
- range: Total Zone fielding runs (baseball-reference "Rfield") per full season, plus a
  Gold Glove bonus. A DH is rated on his fielding at every position in the decade.
- arm: catchers by caught-stealing rate against that season's league catchers;
  outfielders by assists per inning against that season's outfielders. Infield arms
  have no counting stat, so they stay with the scouting judgment.
- durability: share of the team's games he played that season.
Pitcher ratings (bunting, fielding, repertoire) come from the scouting JSON unchanged.

Usage: defense_80s.py [tm ...]   (lower-case franchise codes; default: all 26)
Reads tracking/results/scouting_80s_<tm>.json and writes tracking/results/defense_80s_<tm>.json,
which bin/build_team.py reads, printing each rating with its stat and scouting parts.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bref  # noqa: E402
from pick_80s import ip_outs, num, FIELD_POS  # noqa: E402
from scan_decade import FRANCHISES, OUT_DIR, YEARS  # noqa: E402

TASKS = os.path.join(bref.PROJECT_DIR, 'tracking', 'tasks', 'teams')
RESULTS = os.path.join(bref.PROJECT_DIR, 'tracking', 'results')
OF_KEYS = ('games_at_lf', 'games_at_cf', 'games_at_rf')


def clamp(x, lo=1, hi=10):
    return max(lo, min(hi, int(round(x))))


def innings(row):
    return ip_outs(row.get('f_innings')) / 3


def league_norms():
    """Per season: catchers' caught-stealing rate and outfielders' assists per 1,350 innings."""
    norms = {}
    for year in YEARS:
        cs = att = of_a = of_inn = 0
        for team in FRANCHISES['AL'] + FRANCHISES['NL']:
            with open(os.path.join(OUT_DIR, f'{team}_{year}.json')) as f:
                d = json.load(f)
            for pid, fld in d['fielding'].items():
                app = d['appearances'].get(pid, {})
                games = {k: num(app.get(k)) for k in ('games_at_c',) + OF_KEYS + ('games_at_1b', 'games_at_2b',
                                                                               'games_at_3b', 'games_at_ss')}
                total = sum(games.values()) or 1
                if games['games_at_c'] / total > 0.9:
                    cs += num(fld.get('f_cs_catcher_only'))
                    att += num(fld.get('f_cs_catcher_only')) + num(fld.get('f_sb_catcher_only'))
                elif sum(games[k] for k in OF_KEYS) / total > 0.9:
                    of_a += num(fld.get('f_assists'))
                    of_inn += innings(fld)
        norms[year] = {'cs': cs / att if att else 0.35, 'ofAssists': 1350 * of_a / of_inn if of_inn else 8.0}
    return norms


def seasons_for(team):
    out = {}
    for year in YEARS:
        with open(os.path.join(OUT_DIR, f'{team}_{year}.json')) as f:
            out[year] = json.load(f)
    return out


def fielding_runs_rate(rows):
    """Fielding runs per 1,350 innings, shrunk toward average for part-time gloves."""
    runs = sum(num(v.get('b_runs_fielding')) for v, _ in rows)
    inn = sum(innings(f) for _, f in rows)
    return runs * 1350 / (inn + 400)


def batter_defense(pid, spec, seasons, norms, scout):
    year = spec['year']
    d = seasons[year]
    fld, val, app = d['fielding'].get(pid, {}), d['value'].get(pid, {}), d['appearances'].get(pid, {})
    parts = {}
    if spec['pos'] == 'DH':
        rows = [(s['value'].get(pid, {}), s['fielding'].get(pid, {})) for s in seasons.values() if pid in s['fielding']]
    else:
        rows = [(val, fld)]
    rate = fielding_runs_rate(rows)
    gold = 'GG' in (fld.get('awards') or '')
    stat_range = 5 + rate / 3.5 + (0.75 if gold else 0)
    parts['range'] = {'fieldingRunsPer1350': round(rate, 1), 'goldGlove': gold, 'stat': round(stat_range, 1),
                      'scout': scout.get('range')}
    rng = 0.6 * stat_range + 0.4 * scout['range'] if 'range' in scout else stat_range

    games = {k: num(app.get(k)) for k in ('games_at_c',) + OF_KEYS}
    field_games = sum(num(app.get('games_at_' + p.lower())) for p in FIELD_POS) or 1
    arm, stat_arm = scout.get('arm', 5), None
    if spec['pos'] == 'C' or games['games_at_c'] / field_games > 0.7:
        cs = num(fld.get('f_cs_catcher_only'))
        att = cs + num(fld.get('f_sb_catcher_only'))
        if att:
            weight = att / (att + 60)
            stat_arm = 5 + weight * (cs / att - norms[year]['cs']) * 30
            parts['arm'] = {'csPct': round(cs / att, 3), 'leagueCsPct': round(norms[year]['cs'], 3), 'attempts': int(att)}
    elif spec['pos'] in ('LF', 'CF', 'RF') or sum(games[k] for k in OF_KEYS) / field_games > 0.7:
        inn = innings(fld)
        if inn:
            per = 1350 * num(fld.get('f_assists')) / (inn + 300)
            stat_arm = 5 + (per - norms[year]['ofAssists']) / 2.5
            parts['arm'] = {'assistsPer1350': round(per, 1), 'leagueOf': round(norms[year]['ofAssists'], 1)}
    if stat_arm is not None:
        parts['arm'].update({'stat': round(stat_arm, 1), 'scout': scout.get('arm')})
        arm = 0.5 * stat_arm + 0.5 * scout['arm'] if 'arm' in scout else stat_arm

    team_games = sum(d['record'] or [162, 0]) or 162
    stat_dur = 1 + 9 * num(app.get('games_all')) / team_games
    parts['durability'] = {'games': int(num(app.get('games_all'))), 'teamGames': team_games,
                           'stat': round(stat_dur, 1), 'scout': scout.get('durability')}
    dur = 0.5 * stat_dur + 0.5 * scout['durability'] if 'durability' in scout else stat_dur
    return {'name': spec.get('name'), 'range': clamp(rng), 'arm': clamp(arm), 'durability': clamp(dur),
            'basis': parts}


def main():
    norms = league_norms()
    with open(os.path.join(RESULTS, 'league_norms_80s.json'), 'w') as f:
        json.dump(norms, f, indent=1)
    teams = sys.argv[1:] or [t.lower() for t in FRANCHISES['AL'] + FRANCHISES['NL']]
    for tm in teams:
        spec = json.load(open(os.path.join(TASKS, f'{tm}_80s.json')))
        scout_path = os.path.join(RESULTS, f'scouting_80s_{tm}.json')
        scouting = json.load(open(scout_path)) if os.path.exists(scout_path) else {}
        seasons = seasons_for(spec['franchise'])
        out = {}
        for b in spec['batters']:
            r = batter_defense(b['bref'], b, seasons, norms, scouting.get(b['bref'], {}))
            out[b['bref']] = r
            print(f"{spec['abbrev']} {b['name']:22}{b['pos']:3} RNG {r['range']:2} ARM {r['arm']:2} DUR {r['durability']:2}  "
                  f"{json.dumps(r['basis'])}")
        for p in spec['pitchers']:
            out[p['bref']] = scouting.get(p['bref'], {'name': p['name']})
        with open(os.path.join(RESULTS, f'defense_80s_{tm}.json'), 'w') as f:
            json.dump(out, f, indent=1)


if __name__ == '__main__':
    main()
