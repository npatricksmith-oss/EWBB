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

### Resolved: The 1986–1990 MLBPA season disks are out of scope
- The user declined them (2026-10-21). We ship only the base game's teams.

### Resolved: Era teams keep the designated hitter
- The user chose not to add pitcher batting (2026-10-21). Every team, including NL and pre-1973 teams, bats nine hitters with a DH.

### Resolved: Ballparks and managers for the new teams
- Added Anaheim Stadium, Atlanta-Fulton County Stadium, Gene Mauch, and Joe Torre (`58b9692`). The Angels default to Anaheim and Mauch; the Braves to Atlanta-Fulton County and Torre.

### Resolved: Scope of "all teams included in the original 1987 game"
- Built the 8 era all-star teams plus the 1982 Angels and Braves.
