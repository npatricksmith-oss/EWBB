# Earl Weaver Baseball (1987–1991) — Research & Reference Archive

This folder contains historical research, developer interviews, design documentation, data schemas, and 54 surviving artwork/screenshot files for recreating **Earl Weaver Baseball** (originally developed by **Mirage Graphics** — Don Daglow & Eddie Dombrower — and published by **Electronic Arts** in 1987).

---

## 1. Credits & Versions Overview

### Original *Earl Weaver Baseball* (1987)
- **Publisher:** Electronic Arts
- **Developer:** Mirage Graphics, Inc.
- **Game Design:** Don Daglow & Eddie Dombrower
- **Baseball Strategy / AI Heuristics:** Earl Weaver (Hall of Fame Manager, Baltimore Orioles)
- **Programming, Graphics & Animation (Amiga):** Eddie Dombrower
- **Music & Sound Effects (Amiga / DOS):** Teri Mason (featuring John Philip Sousa's *"The Stars and Stripes Forever"*, real batting-practice bat cracks and dugout glove pops digitized at Anaheim Stadium, and phonetic Amiga speech synthesis)
- **IBM PC (MS-DOS) Port:**
  - *Programming:* Eddie Dombrower, Mark Whittlesey, Bob Dietz, Brian Bender
  - *Art & Animation:* Eddie Dombrower & Robin Lynch
  - *Versions:* 1.0, 1.1 (bug fixes), and **1.5** (1989 enhanced edition with EGA/VGA graphics modes and sound card support)
- **Apple II Port:** Eddie Dombrower, Mark Whittlesey, Larry Rice, John Heitmann
- **Macintosh Port:** Eddie Dombrower, Mark Whittlesey, Bill Rommerdahl, William Buckley
- **Add-Ons:** *Commissioner's Disk* (1988) and yearly MLBPA Season/Team Disks (1987–1990)
- **Cancelled Port:** Sega Genesis prototype (1991)

### *Earl Weaver Baseball II* (1991)
- **Game Design:** Eddie Dombrower
- **Strategy:** Earl Weaver (plus selectable historical manager profiles)
- **Programming:** Eddie Dombrower, Bill Rommerdahl, Robert J. M. Dietz, Mike Burton, Kenneth C. Dullea III, W. Mark Whittlesey
- **Art:** Bob Trupe, Eddie Dombrower
- **Original Music:** Nathan Wang (arranged by Dave Warhol & David Hayes)
- **Sound Effects:** Michael Sanders, Eddie Dombrower
- **Later Ports by Eddie Dombrower:** *I Got It Baseball* (Windows, 2001/2002) and *EWB Baseball* (iOS, 2009)

---

## 2. Developer Interviews & Primary Sources

Full interview and review transcripts are stored in [`articles/`](./articles/):
- [`articles/cgw_36_earl_weaver_interview_pp36-41.txt`](./articles/cgw_36_earl_weaver_interview_pp36-41.txt) — **April 1987 *Computer Gaming World* (#36) joint interview** with **Earl Weaver**, **Eddie Dombrower**, **Don Daglow**, and **Teri Mason**.
- [`articles/cgw_36_review_pp6-9.txt`](./articles/cgw_36_review_pp6-9.txt) — **April 1987 *CGW* feature** (*"Bezbol Been Berry, Berry Good To Me!"*) by Johnny Wilson detailing the exact resolution pipeline.
- [`articles/sabr_ewb2_dombrower_interview.txt`](./articles/sabr_ewb2_dombrower_interview.txt) — **2024 SABR interview with Eddie Dombrower** by Derek Bain covering the physics engine, debugging tools, and EWB II.
- [`articles/sabr_ewb1_review.txt`](./articles/sabr_ewb1_review.txt) — **SABR review & mechanics breakdown** of the 1987 Amiga and IBM PC versions.

### Key Revelations from the Developer Interviews

#### 1. The 10-Hour San Francisco Blackboard Session & Oakland Clubhouse Cards
- **Earl Weaver (*CGW* #36, 1987):**
  > *"The first design session took place during the off-season [in San Francisco]. It was something like ten hours long. It was a blackboard session of everything that I knew about baseball that I could tell Eddie and the EA people in a ten-hour session. So I got a blackboard. I put people in position, told what they do, where they should be, how deep they should be, when you should bring the infield in, etc. ... Later in the year, in Oakland, we played the game for the first time. I made suggestions. For example I might say: 'this is wrong' or 'the cut-off man is too deep' or 'the runners are running too fast.' We had two or three more sessions like that."*
- **Don Daglow (*CGW* #36, 1987):**
  > *"Earl took us back into the clubhouse [in Oakland] and had us look at those [3x5 matchup index] cards so we could figure out how he does it... It helped us decide how computer Earl picks his lineup in the machine, the way he substitutes players, pinch hits, etc."*

#### 2. How the Two-Stage "Stats Matrix -> 3D Physics" Engine Actually Works
- **Stage 1 — Statistical Matchup Matrix:**
  - When a pitch is thrown in Manage mode (or contact is made in Play & Manage mode), a random number is compared against a **combined stat matrix** formed by the interaction of the batter's and pitcher's historical L/R split stats.
  - This determines a **basic play result** (e.g., *double*) and consults a sub-table (e.g., the *doubles table*) to pick a **batted ball profile** (e.g., *line drive smash down the left field line*, *grounder down the 3B line*, *fly ball toward the right-center gap*).
- **Stage 2 — Real-World 3D Physics Override:**
  - **Eddie Dombrower (*CGW* #36, 1987):**
    > *"Everything in this game is really based on the fact that the ball falls at 32 feet per second [squared]. ... EWB still uses percentages. But physics are used to modify the basic play result called for by the statistical matrix. For example, an AstroTurf bounce is totally different than a natural field."*
  - **Johnny Wilson (*CGW* #36, 1987):**
    > *"Once the ball leaves the bat, physics and distances take over. The distance to the wall, the wind, the position of the left fielder and his speed all interact to determine how soon he is able to field the ball. In the case of Fenway Park the ball gets to the short left field wall [the Green Monster] very quickly. What may be a double in any other park in the league turns out in this case to be a long single."*

#### 3. How Baserunning & Stolen Bases Are Resolved Physically
- **Eddie Dombrower (*CGW* #36, 1987) on Alan Wiggins stealing 2nd against catcher Lance Parrish:**
  > *"Part of it is based on the reality of the situation. He runs in a real number of feet per second. Now, Parrish throws in a real number of feet per second. And those two factors more than anything affect this. ... Lance Parrish's arm is rated and Wiggins' speed is rated and his lead-off will be somewhat random. The time he breaks is somewhat random. Those are four variables. There's also the speed of the pitch variable (in the arcade mode that is)."*
- **Don Daglow (*CGW* #36, 1987):**
  > *"The speed rating translates into a figure [feet per second]. We use Project Scoresheet to detail those ratings."*

#### 4. Why the Signature Split-Screen View Was Invented
- **Eddie Dombrower (*CGW* #36, 1987):**
  > *"One thing I discovered was that the TV-like viewpoint in 'World Series Baseball' does not work. The TV view uses a lot of inferred information. In 'World Series Baseball' the basic view was from the centerfield camera, looking over the pitcher's shoulder. That perspective is worthless for the batter. On the other hand, the pitcher does not need the centerfield view in order to select his pitch. So the more optimum view would be from behind the batter and home plate umpire. ... Additionally if you cover up any of the bases during the pitching you place the players at an additional loss. The eye can't readjust quickly to a new screen that again shows the bases. Therefore EWB has a set view of the field on the left side of the screen with a pitching overlay on the right side of the screen."*

#### 5. Why Player Animations Looked So Fluid ("Kinetically Correct")
- Before EWB, Eddie Dombrower created the first microcomputer dance notation and choreography program, giving him a background in human kinetics and mathematical modeling.
- Pitchers visibly differentiate between pitching from the **full windup** and the **stretch**, breaking pitches visibly curve in flight, fielders reach out with their gloves at the last moment, baserunners slide, umpires signal safe/out, and Earl Weaver storms out of the dugout to argue calls (and kick dirt).

#### 6. Decoupled Headless Simulation, Instant Replay, and "Ask Earl"
- **Eddie Dombrower (SABR Interview, 2024):**
  - Because the physics engine ran on virtual coordinates rather than screen pixels, turning off the 10–12 FPS graphics allowed a full 9-inning game to simulate in **seconds**, making EWB the first sports game to support fast-forwarding a full season.
  - **Instant Replay** (with slow motion and freeze-frame) and **Play Sharing** were originally built as internal debugging tools so EA testers in Redwood City could email odd plays to Dombrower to inspect frame-by-frame.
  - **"Ask Earl"** (auto-lineup and situational advice) also doubled as an internal QA tool to ensure teams with edited/oddball rosters always generated valid baseball lineups.

---

## 3. Exact Game Schemas & Options (From Surviving Screens)

### A. Player Schema (See [`images/ewb2_08.jpg`](./images/ewb2_08.jpg))
- **Bio / Metadata:** `First Name`, `Last Name`, `Bats` (`L`/`R`/`S`), `Throws` (`L`/`R`), `Pos1` (Primary Position), `Pos2` (Secondary Position), `Skin`, `Status` (`ACTV` / Days Out injured), `Year`, `Salary ($)`, `Phonetic Name` (for speech synthesis).
- **Historical Batting Splits (`T` Total, `L` vs. LHP, `R` vs. RHP):**
  `BA`, `G`, `AB`, `R`, `H`, `2B`, `3B`, `HR`, `RBI`, `SH`, `BB`, `SO`, `SB`, `CS`, `SA` (SLG), `OBA` (OBP)
- **Batter/Fielder Ratings (1–10 Scale & Derived Rates):**
  - `POWER` (1–10)
  - `H&R` (Hit & Run ability, 1–10)
  - `BUNT` (1–10)
  - `FB%` (Fly Ball %)
  - `RUNS` (Running Speed, 1–10 -> maps to ft/sec)
  - `RNGE` (Fielding Range, 1–10 -> maps to reaction/speed)
  - `ARM` (Throwing Arm Strength, 1–10 -> maps to throw ft/sec)
  - `DUR` (Durability, 1–10)
  - `FA-1`, `FA-2` (Fielding Average at Pos1 & Pos2), `SB%`, `E`, `PO`, `AS`
- **Pitcher Stats & Ratings (1–10 Scale):**
  - Stats (`T`, `L`, `R` splits): `W`, `L`, `ERA`, `GS`, `SV`, `IP`, `H`, `ER`, `HR`, `BB`, `SO`, `WP`, `HB`, `BALK`
  - Ratings (1–10): `Speed (Velocity)`, `Control`, `Fatigue`, `Bunt`, `Fielding`

### B. Ballpark Schema (See [`images/ewb2_07.jpg`](./images/ewb2_07.jpg) & [`images/ewb_1987_amiga_gameplay.jpg`](./images/ewb_1987_amiga_gameplay.jpg))
- **Surface:** `Grass` vs. `Artificial Turf`
- **Environment:** `Indoor` (no wind) vs. `Outdoor`
- **Prevailing Wind Direction:** `Out To Left`, `In From Left`, `Out To Center`, `In From Center`, `Out To Right`, `In From Right`, `Across`, `Swirls`
- **Wind Probability & Speed:** `Wind %` (`0%`–`100%`) and `Avg. Wind` (`1`–`15 mph`)
- **Fence Distances (10 points across the outfield arc, in feet):**
  `Left Pole`, `Left 2`, `L-C 1`, `L-C 2`, `Center 1`, `Center 2`, `R-C 1`, `R-C 2`, `Right 2`, `Right Pole`
- **Fence Heights (9 segments across the outfield arc, in feet):**
  `Left 1`, `Left 2`, `Left 3`, `Center 1`, `Center 2`, `Center 3`, `Right 1`, `Right 2`, `Right 3`
- **Foul Territory Size:** `Foul Grounds` rating (`1`–`5`)
- **Visuals:** Wall `Color`, number of stadium decks (1–3)

### C. Manager Profile & In-Game Strategy Options (See [`images/ewb2_06.jpg`](./images/ewb2_06.jpg))
- **Offensive Calls:**
  - `Swing Away`, `Take Pitch`
  - `Sacrifice Bunt`, `Bunt for a Base Hit`, `Squeeze Bunt`
  - `Steal 2nd`, `Steal 3rd`, `Steal Home`, `Double Steal`
  - `Hit and Run` (batter must swing to protect runner) vs. **`Run and Hit`** (Earl Weaver's preferred play: runner steals, batter only swings if pitch is good)
  - `Run Aggressively` / Baserunner advancement
  - `Pinch Hit`, `Pinch Run`
- **Defensive Calls:**
  - `Pitch Normally`, `Pitch Around`, `Intentional Walk`, `Pitch Out`
  - `Hold Runner`
  - `Infield Depth` (In, Corners In / Charge Bunt, Double Play Depth, Deep) & `Guard the Lines`
  - `Infield / Outfield Left-Right & Depth Shifts` (granular positioning; infielders cannot cross 2B bag)
  - `Visit Mound`, `Warm Up Reliever`, `Change Pitcher`, `Defensive Substitution`
- **Programmable AI Manager Sliders:**
  `Platoon Lineups`, `Steal 2nd`, `Steal 3rd`, `Double Steal`, `Sacrifice Bunt`, `Bunt for a Base Hit`, `Squeeze Bunt`, `Hit and Run`, `Run and Hit`, `Pitch Out`, `Pitch Around`, `Call Intentional Walk`, `Charge the Bunt`, `Guard the Lines`, `Run Aggressively`, `Pinch Hit (Inning threshold)`, `Relieve Pitcher After (Pitch count threshold)`, `Choose Hitter By (e.g. OBA/BA/SA)`, `Choose Pitcher By (e.g. ERA/W-L)`.

---

## 4. Visual Catalog of Surviving Images (`images/`)

| File | Description |
| :--- | :--- |
| [`ewb_1987_dos_cover.jpg`](./images/ewb_1987_dos_cover.jpg) | Original 1987 Electronic Arts square "album sleeve" box cover art featuring Earl Weaver |
| [`ewb_code_wheel.jpg`](./images/ewb_code_wheel.jpg) | Original Season Ticket copy-protection code wheel |
| [`ewb_1987_amiga_gameplay.jpg`](./images/ewb_1987_amiga_gameplay.jpg) | Iconic Amiga split-screen view at Fenway Park (Ty Cobb vs. Bob Gibson, Green Monster visible on left) |
| [`amiga_01.jpg`](./images/amiga_01.jpg) | Amiga full-field view (Baltimore vs. Seattle at the Kingdome, ball in play) |
| [`amiga_02.jpg`](./images/amiga_02.jpg) | Amiga split-screen pitch/bat view (Cal Ripken vs. Mark Langston, stats overlay at top right) |
| [`amiga_03.jpg`](./images/amiga_03.jpg) – [`amiga_19.jpg`](./images/amiga_19.jpg) | Amiga post-game line scores, box scores (batting & pitching), Instant Replay & stat-update menus |
| [`ibm_01.jpg`](./images/ibm_01.jpg) | IBM PC (CGA/EGA) split-screen view (Claudell Washington vs. Geoff Zahn) |
| [`ibm_02.jpg`](./images/ibm_02.jpg) – [`ibm_22.jpg`](./images/ibm_22.jpg) | IBM PC full-field gameplay, extra-inning walk-off play, and post-game box scores |
| [`ewb2_commemorative_cover.jpg`](./images/ewb2_commemorative_cover.jpg) | *Earl Weaver Baseball II: Commemorative Edition* box cover |
| [`ewb2_01.jpg`](./images/ewb2_01.jpg) | EWB II Main Menu over overhead stadium graphic (`F1`–`F10` options) |
| [`ewb2_02.jpg`](./images/ewb2_02.jpg) – [`ewb2_05.jpg`](./images/ewb2_05.jpg) | EWB II TV-style close-up batter/pitcher view, runner lead view, and multi-deck stadium view |
| [`ewb2_06.jpg`](./images/ewb2_06.jpg) | **Edit Managers** screen showing all 19 AI strategy sliders and historical managers |
| [`ewb2_07.jpg`](./images/ewb2_07.jpg) | **Edit Parks** (Ballpark Editor) showing 10 fence distances, 9 fence heights, wind, and turf settings |
| [`ewb2_08.jpg`](./images/ewb2_08.jpg) | **Edit Teams** (Player Editor) showing L/R historical splits and 1–10 skill ratings |
| [`ewb2_09.jpg`](./images/ewb2_09.jpg) | **Commissioner's Disk II** main screen |
