# Earl Weaver Baseball (1987 EWB 1.0) — Retro-Pro Recreation

A faithful browser-based recreation of Don Daglow and Eddie Dombrower's landmark 1987 computer baseball simulation, ***Earl Weaver Baseball* (EWB 1.0)**, originally published by Electronic Arts.

This project delivers a **Modern Retro-Pro Hybrid** presentation that strictly preserves the original **1987 EWB 1.0 split-screen diamond + pitcher/batter duel view** and full-field isometric ball-in-play perspective, paired with high-DPI modern dashboard panels, complete Commissioner's Disk editors, retro audio synthesis, and the Hall of Fame *"Ask Earl"* tactical advisor.

---

## History & Overview

Released in 1987 for the Commodore Amiga (and later MS-DOS, Apple II, and Macintosh), *Earl Weaver Baseball* was a groundbreaking milestone in sports gaming. Developed by Mirage Graphics (Don Daglow and Eddie Dombrower) with Baltimore Orioles Hall of Fame manager Earl Weaver, the game introduced:
- The first **two-stage baseball simulation pipeline**: statistical probability tables decoupled from real-world 3D physics.
- The iconic **split-screen perspective**: viewing the overall diamond and baserunners simultaneously with a low catcher's-eye duel box.
- Authentic **manager AI profiles** and tactical index cards based on Weaver's actual blackboard sessions and clubhouse matchup notes.
- **Instant Replay** and **headless season simulation**, originally built as internal physics debugging tools.

---

## Features

- **Strict 1987 EWB 1.0 Presentation (Style C Retro-Pro Hybrid):**
  - **Split-Screen Pitch Delivery View:** Left 2/3 shows the isometric diamond, custom fence distances and wall heights, shifted fielders, and baserunners. Right 1/3 displays the behind-the-plate Pitcher vs. Batter duel with animated windups, pitch flight, and batting swings.
  - **Isometric Full-Field View:** Opens seamlessly upon contact to track batted balls in real 3D altitude `z` alongside ground shadows `(x, y, 0)`, wall caroms, warning track bounces, fielder pathfinding, and relay throws.
  - **Optional 1987 CRT Scanline Filter:** Toggleable CRT monitor scanline overlay.
- **Two-Stage Simulation & 3D Virtual Ballfield Physics:**
  - **Stage 1 (Statistical Matchup Matrix):** Evaluates batter and pitcher L/R platoon splits (`splits.L` / `splits.R`), stamina/fatigue curves, count leverage, and tactical manager calls (`Run & Hit`, `Hit & Run`, `Sacrifice Bunt`, `Squeeze`, `Pitch Around`, `Pitch Out`) into pitch results or 3D launch vectors (`exitVelocityFps`, `launchAngleDeg`, `sprayAngleDeg`, `spinRate`).
  - **Stage 2 (3D Real-World Physics Override):** Calculates trajectory ($g = 32.174\text{ ft/s}^2$), wind direction/speed effects, turf vs. grass restitution, exact 10-point fence distances and 9-segment wall caroms (such as Fenway's 37-ft Green Monster), fielder interception based on speed/range ratings, and arm strength throw velocities.
- **"Ask Earl" Tactical Strategy Advisor:**
  - Situational dugout advice directly channeling Earl Weaver's offensive and defensive philosophies (such as his disdain for sacrifice bunts and love of the 3-run homer and "Run & Hit").
- **Manager Profiles:**
  - 19-parameter tactical behavior profiles including Earl Weaver, Whitey Herzog, Sparky Anderson, John McNamara, Gene Mauch, and Joe Torre.
- **Ballparks:**
  - Detailed 10-distance and 9-height wall specifications for iconic stadiums: Fenway Park, Memorial Stadium, Wrigley Field, H.H.H. Metrodome, Anaheim Stadium, and Atlanta-Fulton County Stadium.
- **Rosters & Historical Teams:**
  - Baltimore Orioles and Boston Red Sox rosters with full batting and pitching L/R platoon splits and 1–10 player ratings (`POWER`, `H&R`, `BUNT`, `RUNS`, `RNGE`, `ARM`, `DUR`, `Control`, `Fatigue`).
  - Historical era all-star teams and 1982 Angels/Braves.
- **Instant Replay & Telemetry:**
  - Frame-by-frame 60 FPS replay playback tape generated from deterministic play results.
  - Live 3D physics telemetry readout detailing exit velocity, launch angle, distance, apex height, and hang time.
- **Headless Sim & Stats Validation:**
  - Instant simulation by at-bat, half-inning, or full 9-inning game running the exact same physics and stats engine headless in milliseconds.
- **Commissioner's Disk Live Editors:**
  - In-browser interactive editors to customize ballpark dimensions and wall heights, tweak manager tactical sliders, and adjust player platoon splits and ratings.
- **Retro Sound Engine:**
  - Web Audio API synthesizer recreating classic bat cracks, glove mitt pops, crowd cheers, and stadium organ riffs without external audio assets.

---

## How to Run

The game is built with **zero-build native browser ES Modules** (`import` / `export` with `.js` extensions). No bundlers, Node build steps, or package installations are required to run the game in a browser.

1. Start any local static HTTP server in the repository root:
   ```bash
   python3 -m http.server 8000
   ```
2. Open your browser and navigate to:
   ```text
   http://localhost:8000/index.html
   ```

---

## Controls & Shortcuts

When viewing the **1987 Split-Screen & Full-Field Play** tab:

| Key / Control | Action |
| :--- | :--- |
| `Space` | **Throw Pitch** (executes pitch delivery / advances play) |
| `E` | **Ask Earl!** (opens Earl Weaver tactical strategy advice modal) |
| `R` | **Instant Replay** (replays the preceding play frame-by-frame) |
| Dugout Selectors | Set Offensive Call (`Swing Away`, `Run & Hit`, `Hit & Run`, `Steal`, etc.) and Defensive Call (`Standard`, `Infield In`, `Guard Lines`, `Pitch Around`, `Pitch Out`, etc.) |
| Substitution Controls | Execute pinch-hitters or summon bullpen relievers |
| Headless Sim Buttons | `Sim PA`, `Sim ½ Inning`, or `Sim Game` for instant simulations |
| Header Toggles | `1987 CRT` scanlines on/off, `SFX` retro audio on/off, `New Game` |

---

## Statistical Validation

To verify the statistical engine against 162-game season benchmarks (~96,000 pitches and ~9,600 3D trajectories):

```bash
# Run headless simulation benchmark (defaults to 162 games if omitted)
python3 validate_stats_cli.py 162
```

The validator benchmarks batting average (`BA`), on-base average (`OBA`), slugging average (`SA`), doubles, triples, home runs, walk rates (`BB%`), and strikeout rates (`SO%`) against historical team distributions. You can also run the validation suite directly inside the browser under the **Stats Lab** navigation tab.

---

## Project Structure

```text
EWBB/
├── index.html                 # Main application & Commissioner's Disk interface
├── ARCHITECTURE.md            # Technical architecture, module status, and coordinate systems
├── AGENTS.md                  # Collaboration guide for AI coding agents
├── validate_stats_cli.py      # CLI runner for the 162-game statistical validation suite
├── research/                  # Historical research archive
│   ├── README.md              # Research documentation & developer interview transcripts
│   ├── visual_styles.html     # Visual comparison of 1987 vs. 1991 vs. Style C
│   ├── articles/              # Transcripts from CGW #36 (1987) and SABR (2024)
│   └── images/                # 54 historical Amiga, DOS, and EWB II screenshots
└── src/
    ├── data/
    │   ├── ballparks.js       # 10-point fence distances, 9-segment wall heights, turf/grass
    │   ├── managers.js        # 19-parameter manager profiles (Weaver, Herzog, etc.)
    │   ├── rosters.js         # L/R platoon splits, player ratings, active teams
    │   └── teams/             # Generated historical team datasets
    ├── engine/
    │   ├── statsMatrix.js     # Stage 1: Platoon matchup resolution & 3D launch vector generator
    │   ├── batBallContact.js  # Shapes launch vectors from pitch and swing; adds spin/contact data
    │   ├── physicsEngine.js   # Stage 2: 3D ball flight, aerodynamics, wall collisions, fielding
    │   ├── earlAI.js          # "Ask Earl" advisory logic & automated manager decisions
    │   ├── gameState.js       # Rules state machine, box scores, substitutions, headless runner
    │   └── statsValidator.js  # 162-game statistical validation suite
    └── ui/
        ├── app.js             # UI controller, event handlers, Commissioner's Disk editor UI
        ├── fieldRenderer1987.js # HiDPI Canvas renderer (split-screen, full-field, sprites, replay)
        ├── pitcherStyles.js   # Per-pitcher delivery styles and keyframes
        ├── batterStyles.js    # Per-batter stances and swing phases
        ├── baseballSprite.js  # Pixel baseball with rotating 3D seams
        ├── fireworks.js       # Home run fireworks overlay
        └── soundEngine.js     # Web Audio API retro synthesizer
```

---

## Research & Historical Credits

- **Original Game Design:** Don Daglow & Eddie Dombrower
- **Baseball Strategy & AI Heuristics:** Earl Weaver (Hall of Fame Manager, Baltimore Orioles)
- **Original Programming & Art (Amiga 1987):** Eddie Dombrower
- **Original Sound & Music (Amiga/DOS):** Teri Mason
- **Original Publisher:** Electronic Arts (1987)
- **Historical Sources:**
  - *Computer Gaming World* Issue #36 (April 1987): Developer interviews with Earl Weaver, Eddie Dombrower, Don Daglow, and Teri Mason; review by Johnny Wilson.
  - Society for American Baseball Research (SABR) Baseball Games Project: 2024 interview with Eddie Dombrower by Derek Bain.

---

## Development Note

This repository is developed collaboratively by human direction and multiple autonomous AI coding agents (**Antigravity**, **Claude Code**, and **OpenAI Codex CLI**), adhering to strict architectural and visual fidelity standards to honor the pioneering 1987 simulation.
