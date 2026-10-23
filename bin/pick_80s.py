#!/usr/bin/env python3
"""Picks a 1980s all-decade roster and manager for each franchise from the decade scan.

Reads tracking/results/bref_cache/team80/<TM>_<year>.json (written by bin/scan_decade.py)
and writes one roster spec per franchise to tracking/tasks/teams/<id>.json, in the format
bin/build_team.py reads, plus tracking/results/pick_80s.json with the scores behind
every choice.

Rules (from the "Feature-add-teams" request):
- Each franchise's best players of 1980-1989, ranked by baseball-reference WAR earned
  with that franchise in the decade, plus a quarter of their best season's WAR to break
  near-ties in favour of the higher peak.
- The best player at each position starts. A player qualifies at a position he played in
  at least 30% of his games with the franchise (DH games included) or 150 games.
- The DH is the best remaining bat, ranked by OPS+ over his plate appearances, which
  leaves out fielding and the positional adjustment.
- Bench: the four best players left, any position (the game has no injuries), ranked by
  the higher of their WAR score and their batting score, since they mostly pinch-hit.
- Four starters, a reliever, and a dedicated closer: the best of the relievers with at
  least 60% of the franchise's most saves in the decade.
- Each player is rated on his best 1980s season with the franchise, preferring
  seasons spent mostly at his roster position.
- Manager: whoever managed the franchise for the most games in the decade.
- Hand picks (HAND_PICKS below) override the season rule for MVP and Cy Young winners
  whose award season lost to a better WAR season, and name a club's signature closer.

Usage: pick_80s.py [TM ...]   (default: all 26 franchises)
"""
import itertools
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bref  # noqa: E402
from scan_decade import FRANCHISES, OUT_DIR, YEARS  # noqa: E402

TASKS = os.path.join(bref.PROJECT_DIR, 'tracking', 'tasks', 'teams')
RESULTS = os.path.join(bref.PROJECT_DIR, 'tracking', 'results')
FIELD_POS = ('C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF')
APP_KEY = {p: 'games_at_' + p.lower() for p in FIELD_POS + ('DH',)}

# 1980s identity: city, nickname, abbreviation, colors (jersey, cap/trim), the closest park
# the game models, and the franchise's 1980s home park for the source note
INFO = {
    'BAL': ('Baltimore', 'Orioles', '#df4601', '#000000', 'memorial'),
    'BOS': ('Boston', 'Red Sox', '#bd3039', '#0c2340', 'fenway'),
    'CAL': ('California', 'Angels', '#ba0021', '#003263', 'anaheim'),
    'CHW': ('Chicago', 'White Sox', '#0f2a5c', '#c8102e', 'memorial'),
    'CLE': ('Cleveland', 'Indians', '#c8102e', '#0c2340', 'memorial'),
    'DET': ('Detroit', 'Tigers', '#0c2340', '#fa4616', 'memorial'),
    'KCR': ('Kansas City', 'Royals', '#004687', '#7bb2dd', 'metrodome'),
    'MIL': ('Milwaukee', 'Brewers', '#12284b', '#ffc52f', 'memorial'),
    'MIN': ('Minnesota', 'Twins', '#002b5c', '#d31145', 'metrodome'),
    'NYY': ('New York', 'Yankees', '#0c2340', '#c4ced3', 'memorial'),
    'OAK': ('Oakland', "A's", '#003831', '#efb21e', 'anaheim'),
    'SEA': ('Seattle', 'Mariners', '#0058a3', '#ffc72c', 'metrodome'),
    'TEX': ('Texas', 'Rangers', '#003278', '#c0111f', 'anaheim'),
    'TOR': ('Toronto', 'Blue Jays', '#134a8e', '#1d2d5c', 'metrodome'),
    'ATL': ('Atlanta', 'Braves', '#ce1141', '#13274f', 'fulton'),
    'CHC': ('Chicago', 'Cubs', '#0e3386', '#cc3433', 'wrigley'),
    'CIN': ('Cincinnati', 'Reds', '#c6011f', '#000000', 'metrodome'),
    'HOU': ('Houston', 'Astros', '#eb6e1f', '#002d62', 'metrodome'),
    'LAD': ('Los Angeles', 'Dodgers', '#005a9c', '#ef3e42', 'anaheim'),
    'MON': ('Montreal', 'Expos', '#003087', '#e4002c', 'metrodome'),
    'NYM': ('New York', 'Mets', '#002d72', '#ff5910', 'fulton'),
    'PHI': ('Philadelphia', 'Phillies', '#8c1d40', '#6cace4', 'metrodome'),
    'PIT': ('Pittsburgh', 'Pirates', '#fdb827', '#27251f', 'metrodome'),
    'SDP': ('San Diego', 'Padres', '#5c3a21', '#f4a21e', 'fulton'),
    'SFG': ('San Francisco', 'Giants', '#fd5a1e', '#27251f', 'wrigley'),
    'STL': ('St. Louis', 'Cardinals', '#c41e3a', '#0c2340', 'metrodome'),
}

# Hand picks, chosen by the user over the rules: an MVP or Cy Young season with the club
# replaces a better-WAR season unless the WAR gap tops 2.5 or the player split the award
# season between clubs (Sutcliffe 1984). Evidence: bin/iconic_80s.py.
HAND_PICKS = {
    ('ATL', 'murphda05'): 1983,  # MVP 1983 (and 1982) over 1987
    ('BAL', 'ripkeca01'): 1983,  # MVP over 1984
    ('CHC', 'dawsoan01'): 1987,  # MVP, 49 HR, over 1988
    ('CHW', 'hoytla01'): 1983,   # Cy Young over 1982
    ('LAD', 'valenfe01'): 1981,  # Cy Young and Rookie of the Year over 1985
    ('MIN', 'violafr01'): 1988,  # Cy Young over 1987
    ('NYY', 'mattido01'): 1985,  # MVP over 1986
}
# Closer by hand: Fingers's 1981 MVP and Cy Young season over Plesac, who moves to RP
HAND_CLOSERS = {'MIL': 'fingero01'}


def num(v):
    try:
        return float(str(v).replace(',', ''))
    except (TypeError, ValueError):
        return 0.0


def ip_outs(ip):
    whole = int(num(ip))
    return whole * 3 + round((num(ip) - whole) * 10)


def load(team):
    seasons = {}
    for year in YEARS:
        with open(os.path.join(OUT_DIR, f'{team}_{year}.json')) as f:
            seasons[year] = json.load(f)
    return seasons


def collect_batters(seasons):
    """Per player: decade WAR, games by position, and each season's line with the franchise."""
    players = {}
    for year, d in seasons.items():
        for pid, row in d['batting'].items():
            app = d['appearances'].get(pid, {})
            if num(app.get('games_at_p')) > 0.5 * max(num(app.get('games_all')), 1):
                continue  # a pitcher who batted
            p = players.setdefault(pid, {'name': row['name'], 'war': 0.0, 'games': {}, 'seasons': {}})
            p['bats'] = app.get('bats') or p.get('bats')
            war = num(row.get('b_war'))
            p['war'] += war
            games = {pos: num(app.get(key)) for pos, key in APP_KEY.items()}
            for pos, g in games.items():
                p['games'][pos] = p['games'].get(pos, 0) + g
            p['seasons'][year] = {'year': year, 'war': war, 'pa': num(row.get('b_pa')), 'games': games,
                                  'opsPlus': num(row.get('b_onbase_plus_slugging_plus'))}
    return players


def collect_pitchers(seasons):
    players = {}
    for year, d in seasons.items():
        for pid, row in d['pitching'].items():
            p = players.setdefault(pid, {'name': row['name'], 'war': 0.0, 'g': 0, 'gs': 0, 'sv': 0, 'seasons': {}})
            war = num(row.get('p_war'))
            p['war'] += war
            p['g'] += num(row.get('p_g'))
            p['gs'] += num(row.get('p_gs'))
            p['sv'] += num(row.get('p_sv'))
            p['throws'] = d['appearances'].get(pid, {}).get('throws') or p.get('throws')
            p['seasons'][year] = {'war': war, 'ip': ip_outs(row.get('p_ip')) / 3, 'g': num(row.get('p_g')),
                                  'gs': num(row.get('p_gs')), 'sv': num(row.get('p_sv'))}
    return players


def peak(p):
    return max((s['war'] for s in p['seasons'].values()), default=0.0)


def score(p):
    return round(p['war'] + 0.25 * peak(p), 1)


def bat_value(s):
    """Batting value of one season, on roughly a WAR scale: plate appearances weighted by OPS+
    above a bench bat's 90 (600 PA at 150 OPS+ is worth about 5)."""
    return s['pa'] * (s['opsPlus'] - 90) / 7500


def bat_score(p):
    values = [bat_value(s) for s in p['seasons'].values()]
    return round(sum(values) + 0.25 * max(values, default=0), 1)


def pos_share(p, pos):
    """Share of his games with the franchise played at `pos`, DH games included."""
    return p['games'][pos] / (sum(p['games'][q] for q in FIELD_POS + ('DH',)) or 1)


def eligible(p, pos):
    """Played the position in at least 30% of his games with the franchise, DH games
    included, or in 150 games. A centre fielder can also play a corner."""
    played = lambda q: pos_share(p, q) >= 0.3 or p['games'][q] >= 150
    return played(pos) or (pos in ('LF', 'RF') and played('CF'))


def most_played(games):
    """The fielding position with the most games, or DH for a player who never took the field."""
    pos = max(FIELD_POS, key=lambda q: games[q])
    return pos if games[pos] else 'DH'


def primary(p):
    """Usual fielding position; a pinch-hitter takes the lifted player's spot, so this is a label."""
    return most_played(p['games'])


def qualified(s):
    """A full-time season: 300 plate appearances, or 200 in strike-shortened 1981."""
    return s['pa'] >= (200 if s['year'] == 1981 else 300)


def best_season(p, pos=None):
    """Best qualifying season by WAR. A DH is rated on his best bat, ignoring his glove. For a
    fielder, seasons spent mostly at `pos` win unless another is better by more than 2 WAR;
    any outfield spot counts for an outfielder (Henderson's 1985 in centre for a left fielder)."""
    seasons = [(y, s) for y, s in p['seasons'].items() if qualified(s)]
    if pos == 'DH':
        return max(seasons, key=lambda ys: bat_value(ys[1]))[0]
    best = max(seasons, key=lambda ys: ys[1]['war'])
    if pos:
        spots = ('LF', 'CF', 'RF') if pos in ('LF', 'CF', 'RF') else (pos,)
        at_pos = [(y, s) for y, s in seasons
                  if sum(s['games'][q] for q in spots) >= 0.5 * max(sum(s['games'][q] for q in FIELD_POS + ('DH',)), 1)]
        if at_pos:
            best_at_pos = max(at_pos, key=lambda ys: ys[1]['war'])
            if best[1]['war'] - best_at_pos[1]['war'] <= 2:
                best = best_at_pos
    return best[0]


def assign_starters(batters):
    """Fills C..RF to maximise total score: exhaustive over each slot's top candidates. Playing
    a man away from his usual position costs up to 3 (WAR scale), so with equal scores the
    centre fielder plays centre."""
    ranked = sorted(batters.items(), key=lambda kv: -score(kv[1]))
    cands = {pos: [pid for pid, p in ranked if eligible(p, pos)][:5] for pos in FIELD_POS}
    best, best_total = None, -1e9
    for combo in itertools.product(*(cands[pos] or [None] for pos in FIELD_POS)):
        picked = [c for c in combo if c]
        if len(set(picked)) < len(picked):
            continue
        total = sum(score(batters[c]) + 3 * pos_share(batters[c], pos) for pos, c in zip(FIELD_POS, combo) if c)
        if total > best_total:
            best, best_total = combo, total
    return dict(zip(FIELD_POS, best))


def second_pos(p, pos):
    others = sorted((q for q in FIELD_POS if q != pos and p['games'][q] >= 20), key=lambda q: -p['games'][q])
    return others[0] if others else None


def batting_order(starters, batters, picks):
    """Leadoff: best on-base with speed; 3: best hitter; 4: most power; then by OPS+.
    Steals and homers count per plate appearance, so strike-shortened 1981 isn't penalised."""
    line = {pid: picks[pid]['line'] for pid in starters}
    rest = list(starters)

    def take(key):
        pid = max(rest, key=key)
        rest.remove(pid)
        return pid

    order = [None] * 9
    per_pa = lambda pid, k: line[pid][k] / max(line[pid]['pa'], 1)
    order[0] = take(lambda pid: line[pid]['obp'] + 1.5 * per_pa(pid, 'sb'))
    order[2] = take(lambda pid: line[pid]['opsPlus'])
    order[3] = take(lambda pid: line[pid]['slg'] - line[pid]['avg'] + 2 * per_pa(pid, 'hr'))
    order[1] = take(lambda pid: line[pid]['obp'] + line[pid]['avg'])
    order[4] = take(lambda pid: line[pid]['slg'])
    for i in range(5, 9):
        order[i] = take(lambda pid: line[pid]['opsPlus'])
    return order


def season_line(seasons, pid, year):
    row = seasons[year]['batting'][pid]
    return {'avg': num(row['b_batting_avg']), 'obp': num(row['b_onbase_perc']), 'slg': num(row['b_slugging_perc']),
            'hr': num(row['b_hr']), 'sb': num(row['b_sb']), 'opsPlus': num(row['b_onbase_plus_slugging_plus']),
            'pa': num(row['b_pa']), 'war': num(row['b_war'])}


def pick_team(team):
    seasons = load(team)
    batters = collect_batters(seasons)
    pitchers = collect_pitchers(seasons)
    picks = {}

    # Only players with a full-time season with the club can be rated fairly
    batters = {pid: p for pid, p in batters.items() if any(qualified(s) for s in p['seasons'].values())}

    def add(pid, pos, starter, why):
        p = batters[pid]
        year = HAND_PICKS.get((team, pid)) or best_season(p, pos)
        # A bench player is rated on his best season and labelled with that season's position
        pos = pos or most_played(p['seasons'][year]['games'])
        picks[pid] = {'pos': pos, 'year': year, 'isStarter': starter, 'why': why,
                      'decadeWar': round(p['war'], 1), 'score': score(p),
                      'line': season_line(seasons, pid, year)}

    starters = assign_starters(batters)
    for pos, pid in starters.items():
        add(pid, pos, True, 'best at position')
    left = {pid: p for pid, p in batters.items() if pid not in picks}
    dh = max(left, key=lambda pid: bat_score(left[pid]))
    add(dh, 'DH', True, 'best remaining bat')
    left.pop(dh)

    for _ in range(4):
        pid = max(left, key=lambda pid: max(score(left[pid]), bat_score(left[pid])))
        add(pid, None, False, 'best remaining player')
        left.pop(pid)

    order = batting_order([starters[pos] for pos in FIELD_POS] + [dh], batters, picks)
    bench_ids = [pid for pid in picks if not picks[pid]['isStarter']]

    # Pitchers, each needing a full-time season in his role: a starter 120 IP (80 in 1981),
    # a reliever 50 IP (35 in 1981), a closer 10 saves
    def role_seasons(pid, role):
        short = lambda y: y == 1981
        ok = {
            'SP': lambda y, s: s['ip'] >= (80 if short(y) else 120) and s['gs'] >= 0.5 * s['g'],
            'RP': lambda y, s: s['ip'] >= (35 if short(y) else 50) and s['gs'] < 0.2 * max(s['g'], 1),
            'CL': lambda y, s: s['sv'] >= 10,
        }[role]
        return [(y, s) for y, s in pitchers[pid]['seasons'].items() if ok(y, s)]

    relievers = {pid: p for pid, p in pitchers.items() if p['gs'] < 0.2 * p['g']}
    closers = [pid for pid in relievers if role_seasons(pid, 'CL')]
    top_saves = max(pitchers[pid]['sv'] for pid in closers)
    closer = HAND_CLOSERS.get(team) or max((pid for pid in closers if pitchers[pid]['sv'] >= 0.6 * top_saves),
                                           key=lambda pid: score(pitchers[pid]))
    sps = sorted((pid for pid, p in pitchers.items()
                  if p['gs'] >= 0.5 * p['g'] and pid != closer and role_seasons(pid, 'SP')),
                 key=lambda pid: -score(pitchers[pid]))[:4]
    rp = max((pid for pid in relievers if pid != closer and role_seasons(pid, 'RP')),
             key=lambda pid: score(pitchers[pid]))
    staff = []

    def pitcher_season(pid, role):
        if (team, pid) in HAND_PICKS:
            return HAND_PICKS[team, pid]
        return max(role_seasons(pid, role),
                   key=lambda ys: ys[1]['war'] + (0.05 * ys[1]['sv'] if role == 'CL' else 0))[0]

    for pid, role in [(s, 'SP') for s in sps] + [(rp, 'RP'), (closer, 'CL')]:
        p = pitchers[pid]
        year = pitcher_season(pid, role)
        row = seasons[year]['pitching'][pid]
        staff.append({'bref': pid, 'name': p['name'], 'year': year, 'role': role,
                      'decadeWar': round(p['war'], 1), 'decadeSv': int(p['sv']), 'score': score(p),
                      'line': f"{row['p_w']}-{row['p_l']}, {row['p_earned_run_avg']} ERA, {row['p_ip']} IP, {row['p_sv']} SV, {row['p_war']} WAR"})

    # Manager: most games with the franchise in the decade
    mgr_games = {}
    for d in seasons.values():
        for m in d['managers']:
            g = mgr_games.setdefault(m['id'], {'name': m['name'], 'g': 0, 'w': 0, 'l': 0, 'years': []})
            g['g'] += m['w'] + m['l']
            g['w'] += m['w']
            g['l'] += m['l']
    for year, d in seasons.items():
        for m in d['managers']:
            mgr_games[m['id']]['years'].append(year)
    manager_id = max(mgr_games, key=lambda k: mgr_games[k]['g'])

    city, name, color1, color2, park = INFO[team]
    league = next(lg for lg, teams in FRANCHISES.items() if team in teams)
    tid = team.lower() + '_80s'
    batter_specs = []
    for pid in order + bench_ids:
        pk = picks[pid]
        spec = {'bref': pid, 'name': batters[pid]['name'], 'year': pk['year'], 'pos': pk['pos']}
        pos2 = second_pos(batters[pid], pk['pos'])
        if pos2:
            spec['pos2'] = pos2
        spec['isStarter'] = pk['isStarter']
        batter_specs.append(spec)
    spec = {
        # "'80s" in the nickname marks the team wherever the game prints city and name
        'id': tid, 'era': '1980s', 'city': city, 'name': f"'80s {name}", 'abbrev': team, 'idPrefix': tid,
        'league': league, 'franchise': team,
        'primaryColor': color1, 'secondaryColor': color2, 'defaultParkId': park,
        'defaultManagerId': None, 'manager': {'bref': manager_id, **mgr_games[manager_id]},
        'source': f'{city} {name} 1980-1989 all-decade team: each player\'s best season with the club in the decade',
        'batters': batter_specs,
        'pitchers': [{'bref': s['bref'], 'name': s['name'], 'year': s['year'], 'role': s['role']} for s in staff],
    }
    report = {
        'team': tid,
        'batters': [{'bref': pid, 'name': batters[pid]['name'], **{k: v for k, v in picks[pid].items()}}
                    for pid in order + bench_ids],
        'pitchers': staff,
        'managers': sorted(({'bref': k, **v} for k, v in mgr_games.items()), key=lambda m: -m['g']),
        'nextBest': {
            'batters': sorted(({'bref': pid, 'name': p['name'], 'score': max(score(p), bat_score(p)), 'pos': primary(p)}
                               for pid, p in left.items()), key=lambda r: -r['score'])[:6],
            'starters': sorted(({'bref': pid, 'name': p['name'], 'score': score(p)} for pid, p in pitchers.items()
                                if p['gs'] >= 0.5 * p['g'] and pid not in sps), key=lambda r: -r['score'])[:3],
            'relievers': sorted(({'bref': pid, 'name': p['name'], 'score': score(p), 'sv': int(p['sv'])}
                                 for pid, p in pitchers.items() if p['gs'] < 0.2 * p['g'] and pid not in (rp, closer)),
                                key=lambda r: -r['score'])[:3],
        },
    }
    return spec, report


def main():
    teams = sys.argv[1:] or FRANCHISES['AL'] + FRANCHISES['NL']
    reports = {}
    path = os.path.join(RESULTS, 'pick_80s.json')
    if os.path.exists(path):
        reports = json.load(open(path))
    for team in teams:
        spec, report = pick_team(team)
        spec_path = os.path.join(TASKS, spec['id'] + '.json')
        if os.path.exists(spec_path):
            # Keep the manager profile id set by bin/managers_80s.py
            old = json.load(open(spec_path))
            spec['defaultManagerId'] = old.get('defaultManagerId')
        with open(spec_path, 'w') as f:
            json.dump(spec, f, indent=1)
        reports[team] = report
        m = spec['manager']
        print(f"\n{spec['city']} {spec['name']} ({spec['id']}) — mgr {m['name']} {m['w']}-{m['l']}")
        for b in report['batters']:
            ln = b['line']
            print(f"  {b['pos']:3}{'' if b['isStarter'] else '*'} {b['name']:22}{b['year']} "
                  f"{ln['avg']:.3f}/{ln['obp']:.3f}/{ln['slg']:.3f} {int(ln['hr'])}HR {int(ln['sb'])}SB "
                  f"WAR {ln['war']}  decade {b['decadeWar']}")
        for s in report['pitchers']:
            print(f"  {s['role']:3} {s['name']:22}{s['year']} {s['line']}  decade {s['decadeWar']} ({s['decadeSv']} SV)")
    with open(path, 'w') as f:
        json.dump(reports, f, indent=1)


if __name__ == '__main__':
    main()
