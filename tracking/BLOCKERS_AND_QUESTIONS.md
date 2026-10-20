# Blockers and Questions for User

Claude Opus 5.5 and the worker agents record blockers and open questions here. Antigravity reports updates to the user.

---

### Blocker 1: The original 1987 rosters and ratings are not available
- **Finding:** Two sources confirm the eight era all-star teams shipped on the game disk ([30-30.club encyclopedia](https://30-30.club/encyclopedia/index.php/Earl_Weaver_Baseball); the SABR review says the Apple II version had only AL 00-30 and NL 00-30). Neither lists the players, and no public source we found does. The 1–10 ratings exist only in the disk's team files.
- **Correction:** The CGW #36 line "the eight great past teams which come on the game disk itself" (`research/articles/cgw_36_review_pp6-9.txt:248`) describes SubLogic's *Pure-Stat Baseball*, not EWB.
- **What we did instead:**
  - **1982 Angels and Braves:** real 1982 rosters. The SABR review's IBM game narrative names these players, and they match baseball-reference.
  - **Era teams:** reconstructed all-star rosters. Haiku picked the players; Opus reviewed and corrected the picks.
  - **Stats:** every season total and L/R split is real baseball-reference data (Retrosheet-derived), not model recall.
  - **Ratings:** derived from the stats by formula, plus Haiku scouting judgments for range, arm, durability, pitcher fielding and bunting, and pitch repertoires.
- **To get authentic data:** if you have original EWB disk images (Amiga, IBM, or Apple II), put them in a new folder inside the project. We can then try to decode the team files and replace the reconstructed rosters and ratings.

### Question 1: Should the 1986–1990 MLBPA season disks be in scope?
- The 26 MLB team rosters came on separate, paid MLBPA Player Stat Disks, not in the base game. This milestone covers only the base game's teams. The same pipeline (`bin/build_team.py`) can build any real team-season in minutes per team.

### Question 2: Ballparks and managers for the new teams
- `src/data/ballparks.js` has only Fenway, Memorial, Wrigley, and the Metrodome, and `src/data/managers.js` has only Weaver, Herzog, Anderson, and McNamara.
- Current stand-ins:
  - **Angels and Braves:** Memorial Stadium; the Angels get McNamara and the Braves get Herzog. Their real 1982 managers were Gene Mauch and Joe Torre.
  - **AL era teams:** Fenway Park and Weaver.
  - **NL era teams:** Wrigley Field and Herzog.
- Add Anaheim Stadium, Atlanta-Fulton County Stadium, Mauch, and Torre?

### Question 3: Era teams use a designated hitter
- The engine never lets pitchers bat, so every team, including NL and pre-1973 teams, fields nine hitters with a DH. Keep this, or add pitcher batting for NL and pre-1973 teams?

### Resolved: Scope of "all teams included in the original 1987 game"
- Built the 8 era all-star teams plus the 1982 Angels and Braves.
