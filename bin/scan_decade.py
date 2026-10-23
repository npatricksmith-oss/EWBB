#!/usr/bin/env python3
"""Fetches every 1980-1989 team-season page for the 26 MLB franchises of the decade.

Keeps, per team-season: player batting, pitching, fielding and fielding-value rows
(with baseball-reference IDs), games by position and handedness from the appearances
table, team totals, managers with their records, and the ballpark. Writes one compact
JSON per season to tracking/results/bref_cache/team80/<TM>_<year>.json, fetched through
bin/bref.py's rate-limited client so reruns never refetch.

Usage: scan_decade.py [TM ...]   (default: all 26 franchises)
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bref  # noqa: E402

YEARS = range(1980, 1990)
FRANCHISES = {
    'AL': ['BAL', 'BOS', 'CAL', 'CHW', 'CLE', 'DET', 'KCR', 'MIL', 'MIN', 'NYY', 'OAK', 'SEA', 'TEX', 'TOR'],
    'NL': ['ATL', 'CHC', 'CIN', 'HOU', 'LAD', 'MON', 'NYM', 'PHI', 'PIT', 'SDP', 'SFG', 'STL'],
}
OUT_DIR = os.path.join(bref.CACHE_DIR, 'team80')

BAT_KEEP = ('b_war', 'b_games', 'b_pa', 'b_ab', 'b_r', 'b_h', 'b_doubles', 'b_triples', 'b_hr', 'b_rbi',
            'b_sb', 'b_cs', 'b_bb', 'b_so', 'b_batting_avg', 'b_onbase_perc', 'b_slugging_perc',
            'b_onbase_plus_slugging_plus', 'b_hbp', 'b_sh', 'b_sf', 'b_ibb', 'pos', 'awards', 'team_position')
PIT_KEEP = ('p_war', 'p_w', 'p_l', 'p_earned_run_avg', 'p_g', 'p_gs', 'p_gf', 'p_cg', 'p_sho', 'p_sv', 'p_ip',
            'p_h', 'p_er', 'p_hr', 'p_bb', 'p_ibb', 'p_so', 'p_hbp', 'p_bfp', 'p_earned_run_avg_plus',
            'p_fip', 'p_whip', 'awards', 'team_position')
FLD_KEEP = ('f_games_distinct', 'f_innings', 'f_chances', 'f_po', 'f_assists', 'f_errors', 'f_dp',
            'f_fielding_perc', 'f_tz_runs_total', 'f_sb_catcher_only', 'f_cs_catcher_only',
            'f_cs_perc_catcher_only', 'pos', 'awards')
APP_KEEP = ('bats', 'throws', 'games_all', 'games_started_all', 'games_at_p', 'games_at_c', 'games_at_1b',
            'games_at_2b', 'games_at_3b', 'games_at_ss', 'games_at_lf', 'games_at_cf', 'games_at_rf',
            'games_at_of', 'games_at_dh')
VAL_KEEP = ('b_runs_fielding', 'b_runs_baserunning', 'b_war_def', 'b_war_off')


def table_rows(page, table_id):
    m = re.search(r'<table[^>]*id="%s".*?</table>' % table_id, page, re.S)
    if not m:
        return []
    out = []
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>', m.group(0), re.S):
        cells = dict(re.findall(r'<t[hd][^>]*data-stat="([^"]+)"[^>]*>(.*?)</t[hd]>', row, re.S))
        if 'name_display' not in cells:
            continue
        pid = re.search(r'/players/\w/([a-z0-9.\']+)\.shtml', cells['name_display'])
        cells = {k: bref._clean(v) for k, v in cells.items()}
        cells['bref'] = pid.group(1) if pid else None
        out.append(cells)
    return out


def keep(rows, fields):
    players, totals = {}, None
    for r in rows:
        slim = {k: r[k] for k in fields if k in r}
        if r['bref']:
            slim['name'] = re.sub(r'[*#]', '', r['name_display']).strip()
            players[r['bref']] = slim
        elif r.get('name_display') == 'Team Totals':
            totals = slim
    return players, totals


def extract(page):
    head = re.sub(r'\s+', ' ', page[page.find('<div id="meta"'):page.find('<div id="meta"') + 8000])
    mgr_html = re.search(r'Managers?: </strong>(.*?)<p>', head)
    managers = [{'id': i, 'name': bref._clean(n), 'w': int(w), 'l': int(l)}
                # Records can carry ties: (94-68-1)
                for i, n, w, l in re.findall(r'/managers/([a-z0-9]+)\.shtml">(.*?)</a>&nbsp;\((\d+)-(\d+)(?:-\d+)?\)',
                                              mgr_html.group(1) if mgr_html else '')]
    park = re.search(r'Ballpark:</strong>\s*(.*?)\s*</p>', head)
    record = re.search(r'Record:</strong>\s*(\d+)-(\d+)', head)
    batting, bat_tot = keep(table_rows(page, 'players_standard_batting'), BAT_KEEP)
    pitching, pit_tot = keep(table_rows(page, 'players_standard_pitching'), PIT_KEEP)
    fielding, _ = keep(table_rows(page, 'players_standard_fielding'), FLD_KEEP)
    appearances, _ = keep(table_rows(page, 'appearances'), APP_KEEP)
    value, _ = keep(table_rows(page, 'players_value_batting'), VAL_KEEP)
    return {
        'managers': managers,
        'park': bref._clean(park.group(1)) if park else None,
        'record': [int(record.group(1)), int(record.group(2))] if record else None,
        'batting': batting, 'pitching': pitching, 'fielding': fielding,
        'appearances': appearances, 'value': value,
        'totals': {'batting': bat_tot, 'pitching': pit_tot},
    }


def season(team, year):
    path = os.path.join(OUT_DIR, f'{team}_{year}.json')
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    url = f'{bref.BASE}/teams/{team}/{year}.shtml'
    data = extract(bref._get(url))
    data['url'] = url
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    return data


def main():
    teams = sys.argv[1:] or FRANCHISES['AL'] + FRANCHISES['NL']
    for team in teams:
        for year in YEARS:
            d = season(team, year)
            mgrs = ', '.join(f"{m['name']} {m['w']}-{m['l']}" for m in d['managers'])
            print(f'{team} {year}: {len(d["batting"])} bat, {len(d["pitching"])} pit, {mgrs}', flush=True)


if __name__ == '__main__':
    main()
