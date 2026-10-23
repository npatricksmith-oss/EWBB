# AGENTS.md / CLAUDE.md — Earl Weaver Baseball (EWBB) Multi-Agent Guide

Welcome to the **Earl Weaver Baseball (1987 EWB 1.0)** recreation project in `/var/home/natex/Projects/EWBB`.
This repository is developed collaboratively by multiple AI coding agents (**Antigravity**, **Claude Code (`claude`)**, and **OpenAI Codex CLI (`codex`)**).

---

## 1. Golden Rules for All Agents

1. **Read First:** Always inspect [`ARCHITECTURE.md`](file:///var/home/natex/Projects/EWBB/ARCHITECTURE.md) and [`research/README.md`](file:///var/home/natex/Projects/EWBB/research/README.md) before modifying simulation logic or UI views.
2. **Strict Visual Rule — 1987 EWB 1.0 View Only (NO 1991 Broadcast View):**
   - The user explicitly chose **Style C (Modern Retro-Pro Hybrid)** using **strictly the 1987 EWB 1.0 split-screen & full-field isometric view** (NOT the 1991 EWB II behind-the-shoulder broadcast camera).
   - **Pre-pitch & Pitch Delivery:** Split-screen canvas — Left 2/3 shows the isometric baseball diamond, outfield wall distances/heights, fielders, and baserunners; Right 1/3 shows the behind-home-plate Pitcher vs. Batter duel.
   - **Ball in Play:** Opens to the full-canvas 1987 isometric ballpark view tracking the ball at altitude `z` alongside its ground shadow at `(x, y, 0)`, wall caroms (e.g., Fenway's 37-ft Green Monster), fielder interception, and throws.
   - **Surrounding UI:** High-DPI Retro-Pro dashboard panels (scoreboard, L/R platoon splits, "Ask Earl" strategy advisor, Instant Replay controls, Headless Sim controls, and Commissioner's Disk editors).
3. **Zero-Build Native Browser ES Modules:**
   - All source files in `src/` use standard ES Module syntax (`import { ... } from './path.js'`) with explicit `.js` extensions so `index.html` runs natively via any static HTTP server (`python3 -m http.server`) without requiring a bundler step.
4. **Stay Strictly Inside `/var/home/natex/Projects/EWBB`:**
   - Never read, write, or execute commands referencing paths outside `/var/home/natex/Projects/EWBB`.
5. **Document Everything:**
   - Update [`ARCHITECTURE.md`](file:///var/home/natex/Projects/EWBB/ARCHITECTURE.md) whenever adding or updating modules, exports, or data structures.
6. **Use Low-Cost Workhorse Models for Terminal Agents (`claude` & `codex`):**
   - Whenever delegating tasks to **Claude Code (`claude`)** or **OpenAI Codex CLI (`codex`)** in the terminal, always specify low-cost, high-efficiency workhorse models (e.g. `claude -p --model haiku` or `claude -p --model sonnet`, and `codex exec -m gpt-5.1-codex-mini` or `o4-mini`) rather than heavyweight frontier reasoning tiers.
7. **Work Inside the `ewbb` Toolbox & Agent Sandboxes:**
   - Run agents from inside the Fedora `ewbb` toolbox (`toolbox enter ewbb`), which provides `python3`, `node`, `git`, `bubblewrap`, and `socat`. Install new dev tools there with `sudo dnf install`, never on the host.
   - Shell commands run inside each agent's OS sandbox: writes are limited to this project and temp dirs, and shell commands have **no network access** (use your built-in web search/fetch tools for research). Commands that need the network or files outside the project will fail; report what you need instead of working around it.
   - Run the stats validator with `python3 validate_stats_cli.py [numGames]`. When `node` is available it imports `src/engine/statsValidator.js` directly (works in the sandbox); otherwise it falls back to headless Flatpak Chrome.
   - Commit work to git in small, descriptive commits so changes can be reviewed and reverted.

---

## 2. Directory Structure

```text
/var/home/natex/Projects/EWBB/
├── ARCHITECTURE.md            # Technical architecture, coordinate math, module status
├── AGENTS.md                  # Multi-agent collaboration guide (shared with Codex/Claude)
├── CLAUDE.md                  # Claude Code context pointer
├── index.html                 # Main playable game & Commissioner's Disk application
├── research/
│   ├── README.md              # Full 1987/1991 EWB historical research & schemas
│   ├── visual_styles.html     # Visual comparison reference page
│   ├── articles/              # Extracted 1987 CGW & 2024 SABR developer interviews
│   └── images/                # 54 original Amiga, IBM PC, and EWB II screenshots
└── src/
    ├── data/
    │   ├── ballparks.js       # 10-point fence distances, 9-segment wall heights, wind/surface
    │   ├── managers.js        # 19-parameter manager profiles (Weaver, Herzog, Anderson, McNamara)
    │   ├── managers80s.js     # Generated profiles for the 1980s franchise managers
    │   ├── rosters.js         # T/L/R platoon splits & 1-10 ratings (Orioles, Red Sox)
    │   └── teams/             # Generated team modules (era all-stars, 1982 clubs, 1980s franchises)
    ├── engine/
    │   ├── statsMatrix.js     # Stage 1: Platoon matchup matrix & 3D launch vector generator
    │   ├── physicsEngine.js   # Stage 2: 3D ball flight, wind, turf/grass bounce, wall caroms, fielding
    │   ├── earlAI.js          # "Ask Earl" advisor & AI manager decision engine
    │   └── gameState.js       # Full baseball rules state machine, box score, & headless sim runner
    └── ui/
        ├── fieldRenderer1987.js # 1987 EWB 1.0 Split-Screen & Full-Field Canvas renderer + Instant Replay
        ├── soundEngine.js       # Web Audio API retro synthesizer (bat crack, mitt, organ, crowd)
        └── app.js               # Main UI controller, Ask Earl modal, Commissioner's Disk editors
```
