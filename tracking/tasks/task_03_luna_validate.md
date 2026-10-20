Validate generated Earl Weaver Baseball roster modules. Do NOT edit any file; report only.

Files to check: every team module in src/data/teams/ except index.js (10 teams: 8 era teams plus california.js and atlanta.js).
Reference schema: the hand-built teams in src/data/rosters.js (TEAMS.baltimore, TEAMS.boston) and the typedefs at the top of that file.

Write and run a throwaway Node script in $TMPDIR (not in the repo) that imports each module and checks:
1. Roster shape: exactly 13 lineup entries; the first 9 have isStarter true and cover C,1B,2B,3B,SS,LF,CF,RF,DH once each; the last 4 have isStarter false; 5-6 pitchers with role SP/RP/CL, at least 3 SP and exactly one CL.
2. Batter splits: T, L, R each have BA,HR,RBI,BB,SO,AB,H,d2B,d3B,SB,CS,OBA,SA. For counting stats, L + R equals T (allow a difference of 1 for RBI, SB, CS). BA = H/AB and SA = (H + d2B + 2*d3B + 3*HR)/AB within 0.001. OBA >= BA. H >= d2B + d3B + HR.
3. Pitcher splits: T has W,L,ERA,GS,SV,IP,H,ER,HR,BB,SO,WP,HB,BALK; ERA = 9*ER/IP within 0.02, where IP like 229.1 means 229 1/3 innings. L and R have BA,OBA,SA,HR,BB,SO,baMod,hrMod,bbMod,soMod; L.H + R.H equals T.H unless the pitcher's source.splits is 'estimated'.
4. Ratings: batter power, hitAndRun, bunt, runs, range, arm, durability and pitcher speed, control, fatigue, bunt, fielding are integers 1-10; fbPct is an integer 20-65; pitches is a non-empty array of strings.
5. IDs are unique across all modules; bats is L/R/S; throws is L/R.

Reply with a short plain-text report: one line per check (PASS or FAIL), then each failure as "team / player / field: expected X, got Y". No other prose.
