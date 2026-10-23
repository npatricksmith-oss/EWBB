#!/usr/bin/env python3
"""Builds an EWB team module from a roster spec plus Haiku scouting ratings.

Usage: build_team.py tracking/tasks/teams/<id>.json tracking/results/<scouting>.json [...]

Real stats (season totals and L/R platoon splits) come from baseball-reference via
bin/bref.py. Ratings the stats can express (power, contact, speed, fly-ball rate,
bunting, velocity, control, stamina) come from the formulas below, which were
calibrated against the hand-set Orioles and Red Sox ratings in src/data/rosters.js.
Defensive range, arm, durability, pitcher bunting/fielding, and pitch repertoires
come from the scouting JSON.

Writes src/data/teams/<id>.js, regenerates src/data/teams/index.js, and writes a
build report to tracking/results/build_<id>.json.
"""
import glob
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(__file__))
import bref  # noqa: E402

PROJECT_DIR = bref.PROJECT_DIR
TEAMS_DIR = os.path.join(PROJECT_DIR, 'src', 'data', 'teams')
RESULTS_DIR = os.path.join(PROJECT_DIR, 'tracking', 'results')
HAND = {'Right': 'R', 'Left': 'L', 'Both': 'S'}

# Share of a batter's at-bats against left-handed pitchers, and of a pitcher's
# batters faced who hit left-handed, used only when a season has no platoon data.
EST_SHARE_VS_LHP = 0.28
EST_SHARE_LHB = 0.40


def clamp(x, lo=1, hi=10):
    return max(lo, min(hi, int(round(x))))


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def plain(name):
    """'Luis Sánchez' -> 'Luis Sanchez': the 1987 character set had no accents."""
    return unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()


def r3(x):
    return round(x, 3)


# ---------------------------------------------------------------- batters

BAT_COUNTS = ('AB', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'SO', 'SB', 'CS', 'HBP', 'SF', 'SH', 'PA')


def bat_counts(row):
    return {k: int(num(row.get(k))) for k in BAT_COUNTS}


def bat_line(c):
    ab, h = c['AB'], c['H']
    tb = h + c['2B'] + 2 * c['3B'] + 3 * c['HR']
    obd = ab + c['BB'] + c['HBP'] + c['SF']
    return {
        'BA': r3(h / ab) if ab else 0, 'HR': c['HR'], 'RBI': c['RBI'], 'BB': c['BB'], 'SO': c['SO'],
        'AB': ab, 'H': h, 'd2B': c['2B'], 'd3B': c['3B'], 'SB': c['SB'], 'CS': c['CS'],
        'OBA': r3((h + c['BB'] + c['HBP']) / obd) if obd else 0, 'SA': r3(tb / ab) if ab else 0,
    }


def estimate_split(total, share, factors):
    """Splits season counts into (minor, major) parts, scaling rates in the minor part by
    `factors` and giving the remainder to the major part so the two always sum to the total."""
    minor = {}
    for k, v in total.items():
        minor[k] = int(round(v * share * factors.get(k, 1.0)))
    major = {k: total[k] - minor[k] for k in total}
    return minor, major


def reconcile(vs_l, vs_r, total, size_key):
    """Scales partial L/R splits up to the season total. Before ~1950, play-by-play (and so
    platoon data) survives for only some games, so each stat keeps its observed L/R
    distribution but L + R is forced to equal the season total. Returns the scaled splits
    and the share of the season the splits covered."""
    covered = vs_l[size_key] + vs_r[size_key]
    coverage = covered / total[size_key] if total[size_key] else 1.0
    l_share = vs_l[size_key] / covered if covered else 0.5
    new_l, new_r = {}, {}
    for k, t in total.items():
        seen = vs_l.get(k, 0) + vs_r.get(k, 0)
        new_l[k] = int(round(t * (vs_l.get(k, 0) / seen if seen else l_share)))
        new_r[k] = t - new_l[k]
    return new_l, new_r, coverage


def batter_splits(split_page, total, bats):
    plato = {r['split_name']: r for r in split_page.get('plato', [])}
    for l_key, r_key, source in (('vs LHP', 'vs RHP', 'platoon'), ('vs LH Starter', 'vs RH Starter', 'starter-hand')):
        if l_key in plato and r_key in plato:
            vs_l, vs_r, coverage = reconcile(bat_counts(plato[l_key]), bat_counts(plato[r_key]), total, 'AB')
            return vs_l, vs_r, source, coverage
    # No platoon data: typical platoon gaps (same-handed matchups ~8% worse)
    f = {'L': 0.90, 'R': 1.04, 'S': 1.0}[bats]
    factors = {'H': f, '2B': f, '3B': f, 'HR': f * f, 'RBI': f, 'BB': 1.0, 'SO': 2 - f}
    vs_l, vs_r = estimate_split(total, EST_SHARE_VS_LHP, factors)
    return vs_l, vs_r, 'estimated', 0.0


# Before 1951 caught-stealing was rarely recorded; assume a 65% success rate
CS_PER_SB_UNRECORDED = 0.54


def steal_attempts(sb, cs):
    return sb + (cs if cs or not sb else round(sb * CS_PER_SB_UNRECORDED))


def league_rates(row):
    n = {k: num(row.get(k)) for k in ('PA', 'AB', 'H', '1B', '3B', 'HR', 'SB', 'CS', 'BB', 'SO', 'HBP', 'SH')}
    return {
        'steal': steal_attempts(n['SB'], n['CS']) / (n['1B'] + n['BB'] + n['HBP']),
        'triple': n['3B'] / (n['AB'] - n['SO'] - n['HR']),
        'so': n['SO'] / n['PA'],
        'ba': n['H'] / n['AB'],
        'sh': n['SH'] / n['PA'],
    }


def era_tables():
    """League rates for every season, plus the 1975-86 baseline the rating formulas were fit on."""
    seasons = {yr: league_rates(r) for yr, r in bref.league_batting()['seasons'].items()}
    base_years = [str(y) for y in range(1975, 1987)]
    baseline = {k: sum(seasons[y][k] for y in base_years) / len(base_years) for k in seasons['1982']}
    return seasons, baseline


ERA_RATES, BASELINE_RATES = None, None


def batter_ratings(c, line, scout, year):
    global ERA_RATES, BASELINE_RATES
    if ERA_RATES is None:
        ERA_RATES, BASELINE_RATES = era_tables()
    lg, ref = ERA_RATES[str(year)], BASELINE_RATES
    # Express era-dependent rates (steals, triples, strikeouts, sacrifices, average) as if the
    # player's league had 1975-86 norms, so deadball-era hitters don't all rate 10
    rel = lambda value, key: value * ref[key] / lg[key]
    ab, pa = max(c['AB'], 1), max(c['PA'] or c['AB'] + c['BB'] + c['HBP'] + c['SF'] + c['SH'], 1)
    iso = line['SA'] - line['BA']
    hr_ab = c['HR'] / ab
    singles = c['H'] - c['2B'] - c['3B'] - c['HR']
    on_first = max(singles + c['BB'] + c['HBP'], 1)
    steal_rate = rel(steal_attempts(c['SB'], c['CS']) / on_first, 'steal')
    triple_rate = rel(c['3B'] / max(ab - c['SO'] - c['HR'], 1), 'triple')
    power = clamp(iso * 29 + hr_ab * 40)
    runs = clamp(3 + 20 * steal_rate + 120 * triple_rate)
    # Shrink part-time players' average and sacrifice rate toward typical values
    weight = pa / (pa + 250)
    ba = ref['ba'] + (line['BA'] - lg['ba']) * weight
    sh_rate = rel(c['SH'] / max(pa, 450), 'sh')
    return {
        'power': power,
        # Strikeouts: geometric mean of raw and era-relative rate, so a high-strikeout slugger
        # of a low-strikeout era (Ruth 1921) rates below average without bottoming out
        'hitAndRun': clamp(11.5 - 38 * (c['SO'] / pa * rel(c['SO'] / pa, 'so')) ** 0.5 + 20 * (ba - 0.270)),
        'bunt': clamp(2 + 0.6 * runs + 100 * sh_rate - 0.4 * (power - 5)),
        'fbPct': clamp(26 + 450 * hr_ab, 20, 65),
        'runs': runs,
        'range': clamp(scout.get('range', 5)),
        'arm': clamp(scout.get('arm', 5)),
        'durability': clamp(scout.get('durability', 7)),
    }


def season_rows(rows, year):
    rows = [r for r in rows if r.get('year_id') == str(year)]
    totals = [r for r in rows if re.fullmatch(r'\d+TM', r.get('team_name_abbr', ''))]
    return rows, (totals[0] if totals else (rows[0] if rows else None))


def check_team(name, pid, year, rows, franchise, warnings):
    """Warns when a franchise team's player did not play for it that season, or split the
    season between clubs (his season line and splits then include the other club)."""
    if not franchise:
        return
    teams = {r.get('team_name_abbr') for r in rows}
    if franchise not in teams:
        warnings.append(f'{name} ({pid}) {year}: played for {sorted(teams)}, not {franchise}')
    elif any(re.fullmatch(r'\d+TM', t or '') for t in teams):
        warnings.append(f'{name} ({pid}) {year}: split the season between clubs {sorted(teams)}')


def build_batter(spec, scout, league, warnings, franchise=None):
    pid, year = spec['bref'], spec['year']
    info = dict(bref.player(pid))
    info['name'] = plain(info['name'])
    rows, _ = season_rows(info['batting'], year)
    leagues = {r.get('comp_name_abbr') for r in rows}
    if league and league not in leagues:
        warnings.append(f'{info["name"]} ({pid}) {year}: league {sorted(leagues)} is not {league}')
    check_team(info['name'], pid, year, rows, franchise, warnings)
    page = bref.splits(pid, year, 'b')
    total_rows = [r for r in page.get('total', []) if r.get('split_name', '').endswith('Totals')]
    if not total_rows:
        raise RuntimeError(f'{pid} {year}: no batting totals on split page')
    total = bat_counts(total_rows[0])
    bats = HAND.get(info['bats'], 'R')
    vs_l, vs_r, source, coverage = batter_splits(page, total, bats)
    line = bat_line(total)
    if scout.get('name') and plain(scout['name']).split()[-1].lower() not in info['name'].lower():
        warnings.append(f'{pid}: scouting name "{scout["name"]}" does not match "{info["name"]}"')
    player = {
        'id': '',
        'name': info['name'],
        'pos': spec['pos'],
        'pos2': spec.get('pos2'),
        'bats': bats,
        'throws': HAND.get(info['throws'], 'R'),
        'isStarter': spec['isStarter'],
        'splits': {'T': line, 'L': bat_line(vs_l), 'R': bat_line(vs_r)},
        'ratings': batter_ratings(total, line, scout, year),
        'source': {'bref': pid, 'season': year, 'splits': source, 'csRecorded': bool(total['CS'] or year >= 1951)},
    }
    if source != 'estimated' and coverage < 0.995:
        player['source']['splitCoverage'] = round(coverage, 2)
    if not player['pos2']:
        del player['pos2']
    return player


# ---------------------------------------------------------------- pitchers

def pit_counts(row):
    return {k: int(num(row.get(k))) for k in ('PA', 'AB', 'H', 'HR', 'BB', 'SO', 'HBP', 'SF', '2B', '3B')}


def opp_line(c):
    ab = c['AB']
    tb = c['H'] + c['2B'] + 2 * c['3B'] + 3 * c['HR']
    obd = ab + c['BB'] + c['HBP'] + c['SF']
    return {
        'BA': r3(c['H'] / ab) if ab else 0,
        'OBA': r3((c['H'] + c['BB'] + c['HBP']) / obd) if obd else 0,
        'SA': r3(tb / ab) if ab else 0,
    }


def pa_of(c):
    return max(c['PA'] or (c['AB'] + c['BB'] + c['HBP'] + c['SF']), 1)


def pitcher_split(c, tot):
    line = opp_line(c)
    tline = opp_line(tot)
    rate = lambda d, k: d[k] / pa_of(d)
    mod = lambda a, b: r3(a / b) if b else 1.0
    return {
        'AB': c['AB'], 'H': c['H'], 'HR': c['HR'], 'BB': c['BB'], 'SO': c['SO'],
        'BA': line['BA'], 'OBA': line['OBA'], 'SA': line['SA'],
        'baMod': mod(line['BA'], tline['BA']),
        'hrMod': mod(rate(c, 'HR'), rate(tot, 'HR')),
        'bbMod': mod(rate(c, 'BB'), rate(tot, 'BB')),
        'soMod': mod(rate(c, 'SO'), rate(tot, 'SO')),
    }


def build_pitcher(spec, scout, league, lg_avgs, warnings, franchise=None):
    pid, year = spec['bref'], spec['year']
    info = dict(bref.player(pid))
    info['name'] = plain(info['name'])
    rows, std = season_rows(info['pitching'], year)
    if not std:
        raise RuntimeError(f'{pid} {year}: no pitching season row')
    leagues = {r.get('comp_name_abbr') for r in rows}
    if league and league not in leagues:
        warnings.append(f'{info["name"]} ({pid}) {year}: league {sorted(leagues)} is not {league}')
    check_team(info['name'], pid, year, rows, franchise, warnings)
    page = bref.splits(pid, year, 'p')
    total_rows = [r for r in page.get('total', []) if r.get('split_name', '').endswith('Totals')]
    tot = pit_counts(total_rows[0]) if total_rows else None
    if tot:
        # The split page's season line can differ by a few from the standard pitching line
        # (e.g. walks); match the standard line so T and L + R agree
        for k, std_key in (('H', 'p_h'), ('HR', 'p_hr'), ('BB', 'p_bb'), ('SO', 'p_so'), ('HBP', 'p_hbp')):
            tot[k] = int(num(std.get(std_key)))
    plato = {r['split_name']: r for r in page.get('plato', [])}
    throws = HAND.get(info['throws'], 'R')
    coverage = 1.0
    if tot and 'vs LHB' in plato and 'vs RHB' in plato:
        tot['PA'] = tot['PA'] or tot['AB'] + tot['BB'] + tot['HBP'] + tot['SF']
        vs_l, vs_r, coverage = reconcile(pit_counts(plato['vs LHB']), pit_counts(plato['vs RHB']), tot, 'PA')
        source = 'platoon'
    else:
        if not tot:
            # No opponent batting line at all: rebuild one from the standard pitching row
            h, bb, so, hr = (int(num(std[k])) for k in ('p_h', 'p_bb', 'p_so', 'p_hr'))
            hbp = int(num(std.get('p_hbp')))
            bf = int(num(std.get('p_bfp'))) or round(num(std['p_ip']) * 4.3)
            ab = bf - bb - hbp
            tot = {'PA': bf, 'AB': ab, 'H': h, 'HR': hr, 'BB': bb, 'SO': so, 'HBP': hbp, 'SF': 0,
                   '2B': round(h * 0.16), '3B': round(h * 0.04)}
        # Same-handed batters hit ~8% worse; opposite-handed batters are the minor share for RHP
        f = 0.92 if throws == 'L' else 1.06
        factors = {'H': f, '2B': f, '3B': f, 'HR': f * f, 'BB': f, 'SO': 2 - f}
        vs_l, vs_r = estimate_split(tot, EST_SHARE_LHB, factors)
        source = 'estimated'
    g, gs = int(num(std['p_g'])), int(num(std['p_gs']))
    ip_str = std['p_ip']
    ip = int(num(ip_str)) + round((num(ip_str) % 1) * 10) / 3
    k9, bb9 = num(std['p_so']) * 9 / ip, num(std['p_bb']) * 9 / ip
    lg = lg_avgs.get(str(year), {})
    lg_k9, lg_bb9 = num(lg.get('strikeouts_per_nine')) or 5.0, num(lg.get('bases_on_balls_per_nine')) or 3.2
    if spec['role'] == 'SP':
        fatigue = clamp(2 + ip / max(gs + 0.3 * (g - gs), 1))
    else:
        fatigue = clamp(2 + 1.6 * ip / max(g, 1))
    t_line = opp_line(tot)
    if scout.get('name') and plain(scout['name']).split()[-1].lower() not in info['name'].lower():
        warnings.append(f'{pid}: scouting name "{scout["name"]}" does not match "{info["name"]}"')
    pitcher = {
        'id': '',
        'name': info['name'],
        'role': spec['role'],
        'throws': throws,
        'splits': {
            'T': {
                'W': int(num(std['p_w'])), 'L': int(num(std['p_l'])), 'ERA': num(std['p_earned_run_avg']),
                'GS': gs, 'SV': int(num(std['p_sv'])), 'IP': num(ip_str), 'H': int(num(std['p_h'])),
                'ER': int(num(std['p_er'])), 'HR': int(num(std['p_hr'])), 'BB': int(num(std['p_bb'])),
                'SO': int(num(std['p_so'])), 'WP': int(num(std.get('p_wp'))), 'HB': int(num(std.get('p_hbp'))),
                'BALK': int(num(std.get('p_bk'))), 'BA': t_line['BA'], 'OBA': t_line['OBA'], 'SA': t_line['SA'],
            },
            'L': pitcher_split(vs_l, tot),
            'R': pitcher_split(vs_r, tot),
        },
        'ratings': {
            'speed': clamp(2 + 5 * k9 / lg_k9),
            'control': clamp(13 - 6 * bb9 / lg_bb9),
            'fatigue': fatigue,
            'bunt': clamp(scout.get('bunt', 4)),
            'fielding': clamp(scout.get('fielding', 6)),
        },
        'pitches': scout.get('pitches') or ['4-Seam Fastball', 'Curveball', 'Changeup'],
        'source': {'bref': pid, 'season': year, 'splits': source},
    }
    # Knuckleballers strike batters out without velocity; rate the pitch speed, not the K/9
    if pitcher['pitches'][0] == 'Knuckleball':
        pitcher['ratings']['speed'] = 3
    if source != 'estimated' and coverage < 0.995:
        pitcher['source']['splitCoverage'] = round(coverage, 2)
    return pitcher


# ---------------------------------------------------------------- output

def js_value(v):
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, str):
        return "'" + v.replace('\\', '\\\\').replace("'", "\\'") + "'"
    if isinstance(v, float):
        return repr(v)
    if isinstance(v, list):
        return '[' + ', '.join(js_value(x) for x in v) + ']'
    if isinstance(v, dict):
        return '{ ' + ', '.join(f'{k}: {js_value(x)}' for k, x in v.items()) + ' }'
    return str(v)


def fmt_rate(k, v):
    # Rates print like the hand-written teams: 0.318, 2.09, 1.042
    if k in ('BA', 'OBA', 'SA'):
        return f'{v:.3f}'
    if k == 'ERA':
        return f'{v:.2f}'
    if k == 'IP':
        return f'{v:.1f}'
    if k.endswith('Mod'):
        return f'{v:.3f}'
    return js_value(v)


def js_line(d):
    return '{ ' + ', '.join(f'{k}: {fmt_rate(k, v)}' for k, v in d.items()) + ' }'


def js_player(p, indent='    '):
    lines = [indent + '{']
    for k, v in p.items():
        if k == 'splits':
            lines.append(f'{indent}  splits: {{')
            lines.append(',\n'.join(f'{indent}    {s}: {js_line(v[s])}' for s in ('T', 'L', 'R')))
            lines.append(f'{indent}  }},')
        else:
            lines.append(f'{indent}  {k}: {js_value(v)},')
    lines[-1] = lines[-1].rstrip(',')
    lines.append(indent + '}')
    return '\n'.join(lines)


def const_name(team_id):
    return re.sub(r'\W', '_', team_id).upper()


def write_module(team, players, pitchers):
    head = {k: team[k] for k in ('id', 'era', 'league', 'city', 'name', 'abbrev', 'primaryColor', 'secondaryColor',
                                 'defaultParkId', 'defaultManagerId') if k in team}
    body = [f'  {k}: {js_value(v)},' for k, v in head.items()]
    body.append('  lineup: [')
    body.append(',\n'.join(js_player(p) for p in players))
    body.append('  ],')
    body.append('  pitchers: [')
    body.append(',\n'.join(js_player(p) for p in pitchers))
    body.append('  ]')
    text = f"""/**
 * {team['city']} {team['name']} — {team['source']}.
 *
 * Generated by bin/build_team.py from tracking/tasks/teams/{team['id']}.json; edit the spec and rebuild
 * rather than editing this file. Season totals and L/R splits are real baseball-reference.com data
 * (each player's `source.splits` says whether the L/R lines are true platoon splits, splits by the
 * starting pitcher's hand, or estimates). The 1–10 ratings are derived, not the original 1987 disk values.
 */

export const {const_name(team['id'])} = {{
""" + '\n'.join(body) + '\n};\n'
    os.makedirs(TEAMS_DIR, exist_ok=True)
    with open(os.path.join(TEAMS_DIR, team['id'] + '.js'), 'w') as f:
        f.write(text)


def write_index():
    manifest = json.load(open(os.path.join(PROJECT_DIR, 'tracking', 'tasks', 'teams', 'order.json')))
    built = [t for t in manifest if os.path.exists(os.path.join(TEAMS_DIR, t + '.js'))]
    imports = '\n'.join(f"import {{ {const_name(t)} }} from './{t}.js';" for t in built)
    entries = '\n'.join(f'  {t}: {const_name(t)},' for t in built)
    text = f"""/**
 * Historical EWB 1.0 teams built by bin/build_team.py, keyed by team ID in menu order.
 * Regenerated on every build; do not edit by hand.
 */
{imports}

export const HISTORICAL_TEAMS = {{
{entries}
}};
"""
    with open(os.path.join(TEAMS_DIR, 'index.js'), 'w') as f:
        f.write(text)


def main():
    spec_path, scout_paths = sys.argv[1], sys.argv[2:]
    team = json.load(open(spec_path))
    scouting = {}
    for path in scout_paths:
        scouting.update(json.load(open(path)))
    lg_avgs = bref.league_averages()['seasons']
    warnings = []
    prefix = team.get('idPrefix', team['abbrev'].lower())
    franchise = team.get('franchise')
    batters, pitchers = [], []
    for spec in team['batters']:
        p = build_batter(spec, scouting.get(spec['bref'], {}), team.get('league'), warnings, franchise)
        if spec['bref'] not in scouting:
            warnings.append(f'{p["name"]}: no scouting ratings, used defaults')
        batters.append(p)
    for spec in team['pitchers']:
        p = build_pitcher(spec, scouting.get(spec['bref'], {}), team.get('league'), lg_avgs, warnings, franchise)
        if spec['bref'] not in scouting:
            warnings.append(f'{p["name"]}: no scouting ratings, used defaults')
        pitchers.append(p)
    for spec, p in zip(team['batters'] + team['pitchers'], batters + pitchers):
        p['id'] = f"{prefix}_{p['source']['bref']}"
        # Hand-checked corrections, e.g. a knuckleballer's velocity
        p['ratings'].update(spec.get('ratings', {}))
    write_module(team, batters, pitchers)
    write_index()
    report = {'team': team['id'], 'warnings': warnings, 'batters': batters, 'pitchers': pitchers}
    with open(os.path.join(RESULTS_DIR, f'build_{team["id"]}.json'), 'w') as f:
        json.dump(report, f, indent=1)
    print(f'{team["id"]}: {len(batters)} batters, {len(pitchers)} pitchers')
    for p in batters:
        print(f"  {p['name']:22}{p['pos']:3} {p['bats']} {p['source']['splits']:12} "
              f"{p['splits']['T']['BA']:.3f}/{p['splits']['T']['OBA']:.3f}/{p['splits']['T']['SA']:.3f} {p['ratings']}")
    for p in pitchers:
        t = p['splits']['T']
        print(f"  {p['name']:22}{p['role']:3} {p['throws']} {p['source']['splits']:12} "
              f"{t['W']}-{t['L']} {t['ERA']:.2f} {t['IP']} IP {p['ratings']}")
    for w in warnings:
        print('  WARNING', w)


if __name__ == '__main__':
    main()
