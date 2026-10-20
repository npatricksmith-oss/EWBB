#!/usr/bin/env python3
"""Polite baseball-reference.com fetcher with a parsed-JSON cache.

Fetches player standard pages, split pages, and team-season pages, keeps only
the tables the roster builder needs, and caches them under
tracking/results/bref_cache/ so reruns never refetch. Requests are spaced
REQUEST_GAP seconds apart: the site blocks clients for an hour (HTTP 429) well before its
published 20-requests-per-minute limit, so the fetcher waits out any 429 and retries.
"""
import html
import json
import os
import re
import subprocess
import sys
import time

PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CACHE_DIR = os.path.join(PROJECT_DIR, 'tracking', 'results', 'bref_cache')
BASE = 'https://www.baseball-reference.com'
REQUEST_GAP = 10.0
_last_request = 0.0


def _get(url):
    global _last_request
    for _ in range(3):
        wait = REQUEST_GAP - (time.time() - _last_request)
        if wait > 0:
            time.sleep(wait)
        _last_request = time.time()
        proc = subprocess.run(
            ['curl', '-s', '-L', '-D', '-', '-A', 'Mozilla/5.0 (EWBB roster builder)', '-w', '\n%{http_code}', url],
            capture_output=True, text=True,
        )
        body, _, code = proc.stdout.rpartition('\n')
        if code == '429':
            retry = re.search(r'(?im)^retry-after:\s*(\d+)', body)
            pause = int(retry.group(1)) + 30 if retry else 3600
            print(f'bref: rate limited, sleeping {pause}s', file=sys.stderr, flush=True)
            time.sleep(pause)
            continue
        if code != '200':
            raise RuntimeError(f'HTTP {code} for {url}')
        # B-Ref hides most tables inside HTML comments
        return body.replace('<!--', '').replace('-->', '')
    raise RuntimeError(f'still rate limited after retries: {url}')


def _clean(cell):
    return html.unescape(re.sub(r'<[^>]+>', '', cell)).strip()


def _tables(page):
    """Returns [(table_id, [row_dict, ...]), ...] keyed by each cell's data-stat."""
    out = []
    for m in re.finditer(r'<table[^>]*id="([^"]+)".*?</table>', page, re.S):
        rows = []
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>', m.group(0), re.S):
            cells = re.findall(r'<t[hd][^>]*data-stat="([^"]+)"[^>]*>(.*?)</t[hd]>', row, re.S)
            rows.append({k: _clean(v) for k, v in cells})
        out.append((m.group(1), rows))
    return out


def _cached(key, url, extract):
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, key + '.json')
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    data = extract(_get(url))
    data['url'] = url
    with open(path, 'w') as f:
        json.dump(data, f, indent=1)
    return data


def player(bref_id):
    """Name, handedness, and season rows from the player's standard batting/pitching tables."""
    def extract(page):
        name = _clean(re.search(r'<h1[^>]*>(.*?)</h1>', page, re.S).group(1))
        bats = re.search(r'<strong>Bats: </strong>\s*(\w+)', page)
        throws = re.search(r'<strong>Throws: </strong>\s*(\w+)', page)
        batting, pitching = [], []
        for _, rows in _tables(page):
            for r in rows:
                if not re.fullmatch(r'\d{4}', r.get('year_id', '')):
                    continue
                if 'p_w' in r and 'p_ip' in r:
                    pitching.append(r)
                elif 'b_ab' in r and 'b_h' in r:
                    batting.append(r)
        # Standard tables appear more than once on the page; keep one copy of each row
        dedupe = lambda rows: list({json.dumps(r, sort_keys=True): r for r in rows}.values())
        return {
            'name': name,
            'bats': bats.group(1) if bats else None,
            'throws': throws.group(1) if throws else None,
            'batting': dedupe(batting),
            'pitching': dedupe(pitching),
        }
    return _cached(f'player_{bref_id}', f'{BASE}/players/{bref_id[0]}/{bref_id}.shtml', extract)


def splits(bref_id, year, kind):
    """Season total and platoon rows from a split page. kind: 'b' (batting) or 'p' (pitching)."""
    def extract(page):
        keep = {}
        for tid, rows in _tables(page):
            if tid in ('total', 'plato'):
                keep[tid] = [r for r in rows if r.get('split_name') not in (None, '', 'Split')]
        return keep
    url = f'{BASE}/players/split.fcgi?id={bref_id}&year={year}&t={kind}'
    return _cached(f'split_{kind}_{bref_id}_{year}', url, extract)


def league_averages():
    """Per-season MLB pitching averages (SO9, BB9) used to rate pitchers against their era."""
    def extract(page):
        seasons = {}
        for _, rows in _tables(page):
            for r in rows:
                yr = r.get('year_ID') or r.get('year_id') or ''
                if re.fullmatch(r'\d{4}', yr) and 'strikeouts_per_nine' in r:
                    seasons[yr] = r
        return {'seasons': seasons}
    return _cached('league_pitching', f'{BASE}/leagues/majors/pitch.shtml', extract)


def league_batting():
    """Per-season MLB batting totals used to rate batters against their era."""
    def extract(page):
        seasons = {}
        for _, rows in _tables(page):
            for r in rows:
                yr = r.get('year_ID') or r.get('year_id') or ''
                if re.fullmatch(r'\d{4}', yr) and 'SB' in r:
                    seasons[yr] = r
        return {'seasons': seasons}
    return _cached('league_batting', f'{BASE}/leagues/majors/bat.shtml', extract)


def team_season(team, year):
    """Team-season roster rows (player IDs, positions, playing time)."""
    def extract(page):
        batting, pitching = [], []
        for _, rows in _tables(page):
            for r in rows:
                if not r.get('ranker', '').isdigit():
                    continue
                if 'p_w' in r and 'p_sv' in r:
                    pitching.append(r)
                elif 'b_ab' in r and 'b_rbi' in r:
                    batting.append(r)
        ids = re.findall(r'data-append-csv="([a-z0-9.]+)"[^>]*data-stat="name_display"[^>]*>(.*?)</t', page, re.S)
        return {'batting': batting, 'pitching': pitching, 'ids': [(i, _clean(n)) for i, n in ids]}
    return _cached(f'team_{team}_{year}', f'{BASE}/teams/{team}/{year}.shtml', extract)


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'player':
        print(json.dumps(player(sys.argv[2]), indent=1)[:3000])
    elif cmd == 'splits':
        print(json.dumps(splits(sys.argv[2], sys.argv[3], sys.argv[4]), indent=1)[:3000])
    elif cmd == 'team':
        print(json.dumps(team_season(sys.argv[2], sys.argv[3]), indent=1)[:6000])
    elif cmd == 'league':
        d = league_averages()
        print(len(d['seasons']), json.dumps(list(d['seasons'].items())[:2], indent=1))
