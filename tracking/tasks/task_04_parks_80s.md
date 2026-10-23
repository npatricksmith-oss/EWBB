Follow-up task (user decision, 2026-10-23): add the real 1980s home parks for the '80s franchise teams. Not started.

The game models six parks in src/data/ballparks.js (fenway, memorial, wrigley, metrodome, anaheim, fulton). Six '80s teams play in their own park; the other 20 use the closest match through `defaultParkId` in tracking/tasks/teams/<tm>_80s.json, set by INFO in bin/pick_80s.py.

| Team | Uses now | Real 1980s park |
|---|---|---|
| CHW | memorial | Comiskey Park |
| CIN | metrodome | Riverfront Stadium |
| CLE | memorial | Cleveland Stadium |
| DET | memorial | Tiger Stadium |
| HOU | metrodome | Astrodome |
| KCR | metrodome | Royals Stadium |
| LAD | anaheim | Dodger Stadium |
| MIL | memorial | County Stadium |
| MIN | metrodome | Metropolitan Stadium (1980-81), then the Metrodome, which exists |
| MON | metrodome | Stade Olympique |
| NYM | fulton | Shea Stadium |
| NYY | memorial | Yankee Stadium |
| OAK | anaheim | Oakland-Alameda County Coliseum |
| PHI | metrodome | Veterans Stadium |
| PIT | metrodome | Three Rivers Stadium |
| SDP | fulton | Jack Murphy Stadium |
| SEA | metrodome | Kingdome |
| SFG | wrigley | Candlestick Park |
| STL | metrodome | Busch Stadium |
| TEX | anaheim | Arlington Stadium |
| TOR | metrodome | Exhibition Stadium |

Steps:
1. For each park, research the 1980s dimensions (lines, alleys, center), wall heights, surface (grass or turf) and park factors, and add an entry to src/data/ballparks.js in the existing format.
2. Draw each park's field outline in the 1987 EWB 1.0 isometric view, matching the existing parks.
3. Point each team's `defaultParkId` (INFO in bin/pick_80s.py and the spec) at its park, then rebuild the team modules.
4. Play each park headless and check that run scoring tracks the park factor.
