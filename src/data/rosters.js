/**
 * @fileoverview Authentic Earl Weaver Baseball (1987) Player & Team Roster Schemas.
 *
 * Recreates the exact statistical splits and 1–10 physical/skill ratings from
 * Don Daglow and Eddie Dombrower's 1987 EWB 1.0 & Commissioner's Disk "Edit Teams"
 * schema (ref: research/images/ewb2_08.jpg):
 *
 * 1. Stage 1 — Statistical Matchup Matrix (`src/engine/statsMatrix.js`):
 *    Uses each batter's Left/Right platoon split (`splits.L` vs LHP, `splits.R` vs RHP,
 *    and `splits.T` total) against the opposing pitcher's Left/Right platoon split,
 *    modulated by pitcher `control`, `speed`, and `fatigue` (1–10) and batter
 *    `power`, `hitAndRun`, `bunt`, and `fbPct` (Fly Ball %).
 *
 * 2. Stage 2 — 3D Virtual Ballfield Physics (`src/engine/physicsEngine.js`):
 *    Once the ball is put in play, statistical tables yield to real-world physics
 *    (feet and seconds). Fielders intercept balls at speeds (`24–31 ft/s`) derived
 *    from `range` (RNGE 1–10) and `runs` (RUNS 1–10), and throw to bases at
 *    velocities (`110–148 ft/s`) derived from `arm` (ARM 1–10). Baserunners advance
 *    and steal bases using their physical `runs` rating in feet per second.
 */

/**
 * @typedef {Object} BatterSplitLine
 * @property {number} BA - Batting Average (e.g. .304)
 * @property {number} HR - Home Runs
 * @property {number} RBI - Runs Batted In
 * @property {number} BB - Base on Balls (Walks)
 * @property {number} SO - Strikeouts
 * @property {number} AB - At-Bats
 * @property {number} H - Hits
 * @property {number} d2B - Doubles (2B)
 * @property {number} d3B - Triples (3B)
 * @property {number} SB - Stolen Bases
 * @property {number} CS - Caught Stealing
 * @property {number} OBA - On-Base Average / OBP (Earl Weaver's favorite metric!)
 * @property {number} SA - Slugging Average / SLG
 */

/**
 * @typedef {Object} BatterRatings
 * @property {number} power - (1–10) Raw exit velocity & home run carry potential
 * @property {number} hitAndRun - (1–10) Contact ability when executing Hit & Run / Run & Hit
 * @property {number} bunt - (1–10) Sacrifice and base-hit bunting proficiency
 * @property {number} fbPct - (1–100) Fly-ball tendency percentage (shapes launch angle distribution)
 * @property {number} runs - (1–10) Baserunning speed (maps to ~24.0–31.0 ft/sec in physics engine)
 * @property {number} range - (1–10) Defensive reaction and first-step range at primary position
 * @property {number} arm - (1–10) Throwing arm strength (maps to ~110–148 ft/sec throw velocity)
 * @property {number} durability - (1–10) Resistance to fatigue and injury over a season
 */

/**
 * @typedef {Object} BatterPlayer
 * @property {string} id - Unique player ID
 * @property {string} name - Player display name
 * @property {'C'|'1B'|'2B'|'3B'|'SS'|'LF'|'CF'|'RF'|'DH'} pos - Primary defensive position
 * @property {string} [pos2] - Secondary defensive position (for Weaver platoons & double-switches)
 * @property {'L'|'R'|'S'} bats - Batting handedness (Left, Right, Switch)
 * @property {'L'|'R'} throws - Throwing handedness
 * @property {boolean} isStarter - True for the 9 starting lineup slots, false for the 4 bench reserves
 * @property {{ T: BatterSplitLine, L: BatterSplitLine, R: BatterSplitLine }} splits - Total, vs LHP, and vs RHP splits
 * @property {BatterRatings} ratings - 1–10 EWB physical & skill ratings
 */

/**
 * @typedef {Object} PitcherRatings
 * @property {number} speed - (1–10) Fastball velocity rating (maps to ~84–98 mph)
 * @property {number} control - (1–10) Command rating (reduces walk probability and pitch scatter)
 * @property {number} fatigue - (1–10) Stamina rating (governs pitch count effectiveness decay)
 * @property {number} bunt - (1–10) Pitcher sacrifice bunting skill
 * @property {number} fielding - (1–10) Fielding range & pickoff move agility off the mound
 */

/**
 * @typedef {Object} PitcherPlayer
 * @property {string} id - Unique pitcher ID
 * @property {string} name - Pitcher display name
 * @property {'SP'|'RP'|'CL'} role - Starting Pitcher, Relief Pitcher, or Closer
 * @property {'L'|'R'} throws - Pitching handedness
 * @property {{ T: Object, L: Object, R: Object }} splits - Total season stats and L/R opponent batting splits
 * @property {PitcherRatings} ratings - 1–10 EWB pitching & fielding ratings
 * @property {string[]} pitches - Repertoire of pitches available in the duel view
 */

export const TEAMS = {
  baltimore: {
    id: 'baltimore',
    city: 'Baltimore',
    name: 'Orioles',
    abbrev: 'BAL',
    primaryColor: '#f58220',
    secondaryColor: '#1c232d',
    defaultParkId: 'memorial',
    defaultManagerId: 'weaver',

    /**
     * 9 Starting Lineup Batters + 4 Classic "Oriole Way" Platoon Bench Batters (13 total)
     * Combining Earl Weaver's legendary Baltimore Orioles champions.
     */
    lineup: [
      // --- 9 STARTING BATTERS ---
      {
        id: 'bal_bumbry',
        name: 'Al Bumbry',
        pos: 'LF',
        pos2: 'CF',
        bats: 'L',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.318, HR: 9, RBI: 53, BB: 78, SO: 67, AB: 645, H: 205, d2B: 29, d3B: 12, SB: 44, CS: 13, OBA: 0.398, SA: 0.442 },
          L: { BA: 0.278, HR: 1, RBI: 12, BB: 16, SO: 24, AB: 144, H: 40, d2B: 6, d3B: 2, SB: 9, CS: 4, OBA: 0.350, SA: 0.368 },
          R: { BA: 0.329, HR: 8, RBI: 41, BB: 62, SO: 43, AB: 501, H: 165, d2B: 23, d3B: 10, SB: 35, CS: 9, OBA: 0.404, SA: 0.463 }
        },
        ratings: { power: 4, hitAndRun: 9, bunt: 9, fbPct: 34, runs: 9, range: 8, arm: 6, durability: 8 }
      },
      {
        id: 'bal_ripken',
        name: 'Cal Ripken Jr.',
        pos: 'SS',
        pos2: '3B',
        bats: 'R',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.318, HR: 27, RBI: 102, BB: 58, SO: 97, AB: 663, H: 211, d2B: 47, d3B: 2, SB: 2, CS: 2, OBA: 0.371, SA: 0.517 },
          L: { BA: 0.335, HR: 10, RBI: 34, BB: 22, SO: 25, AB: 185, H: 62, d2B: 15, d3B: 1, SB: 1, CS: 0, OBA: 0.406, SA: 0.589 },
          R: { BA: 0.312, HR: 17, RBI: 68, BB: 36, SO: 72, AB: 478, H: 149, d2B: 32, d3B: 1, SB: 1, CS: 2, OBA: 0.358, SA: 0.490 }
        },
        ratings: { power: 8, hitAndRun: 8, bunt: 5, fbPct: 48, runs: 5, range: 9, arm: 9, durability: 10 }
      },
      {
        id: 'bal_frobinson',
        name: 'Frank Robinson',
        pos: 'RF',
        pos2: '1B',
        bats: 'R',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.308, HR: 32, RBI: 100, BB: 88, SO: 62, AB: 539, H: 166, d2B: 27, d3B: 5, SB: 8, CS: 3, OBA: 0.415, SA: 0.555 },
          L: { BA: 0.326, HR: 12, RBI: 35, BB: 33, SO: 17, AB: 172, H: 56, d2B: 10, d3B: 2, SB: 3, CS: 1, OBA: 0.437, SA: 0.616 },
          R: { BA: 0.300, HR: 20, RBI: 65, BB: 55, SO: 45, AB: 367, H: 110, d2B: 17, d3B: 3, SB: 5, CS: 2, OBA: 0.398, SA: 0.526 }
        },
        ratings: { power: 9, hitAndRun: 8, bunt: 4, fbPct: 54, runs: 7, range: 8, arm: 8, durability: 8 }
      },
      {
        id: 'bal_murray',
        name: 'Eddie Murray',
        pos: '1B',
        pos2: 'DH',
        bats: 'S',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.306, HR: 33, RBI: 116, BB: 91, SO: 90, AB: 582, H: 178, d2B: 31, d3B: 3, SB: 5, CS: 1, OBA: 0.399, SA: 0.538 },
          L: { BA: 0.312, HR: 11, RBI: 39, BB: 29, SO: 28, AB: 186, H: 58, d2B: 10, d3B: 1, SB: 2, CS: 0, OBA: 0.402, SA: 0.554 },
          R: { BA: 0.303, HR: 22, RBI: 77, BB: 62, SO: 62, AB: 396, H: 120, d2B: 21, d3B: 2, SB: 3, CS: 1, OBA: 0.397, SA: 0.530 }
        },
        ratings: { power: 9, hitAndRun: 8, bunt: 3, fbPct: 52, runs: 5, range: 9, arm: 8, durability: 10 }
      },
      {
        id: 'bal_powell',
        name: 'Boog Powell',
        pos: 'DH',
        pos2: '1B',
        bats: 'L',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.297, HR: 35, RBI: 114, BB: 104, SO: 92, AB: 526, H: 156, d2B: 28, d3B: 0, SB: 1, CS: 1, OBA: 0.412, SA: 0.549 },
          L: { BA: 0.258, HR: 6, RBI: 24, BB: 22, SO: 31, AB: 132, H: 34, d2B: 6, d3B: 0, SB: 0, CS: 0, OBA: 0.364, SA: 0.439 },
          R: { BA: 0.310, HR: 29, RBI: 90, BB: 82, SO: 61, AB: 394, H: 122, d2B: 22, d3B: 0, SB: 1, CS: 1, OBA: 0.428, SA: 0.586 }
        },
        ratings: { power: 9, hitAndRun: 5, bunt: 2, fbPct: 58, runs: 3, range: 6, arm: 6, durability: 8 }
      },
      {
        id: 'bal_singleton',
        name: 'Ken Singleton',
        pos: 'CF',
        pos2: 'RF',
        bats: 'S',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.295, HR: 29, RBI: 105, BB: 109, SO: 106, AB: 560, H: 165, d2B: 29, d3B: 1, SB: 3, CS: 2, OBA: 0.410, SA: 0.505 },
          L: { BA: 0.298, HR: 9, RBI: 33, BB: 34, SO: 31, AB: 178, H: 53, d2B: 9, d3B: 0, SB: 1, CS: 1, OBA: 0.411, SA: 0.500 },
          R: { BA: 0.293, HR: 20, RBI: 72, BB: 75, SO: 75, AB: 382, H: 112, d2B: 20, d3B: 1, SB: 2, CS: 1, OBA: 0.409, SA: 0.508 }
        },
        ratings: { power: 8, hitAndRun: 7, bunt: 4, fbPct: 49, runs: 4, range: 6, arm: 7, durability: 9 }
      },
      {
        id: 'bal_brobinson',
        name: 'Brooks Robinson',
        pos: '3B',
        pos2: '2B',
        bats: 'R',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.276, HR: 18, RBI: 94, BB: 53, SO: 53, AB: 608, H: 168, d2B: 31, d3B: 2, SB: 2, CS: 1, OBA: 0.336, SA: 0.423 },
          L: { BA: 0.291, HR: 7, RBI: 32, BB: 21, SO: 14, AB: 179, H: 52, d2B: 11, d3B: 1, SB: 1, CS: 0, OBA: 0.365, SA: 0.480 },
          R: { BA: 0.270, HR: 11, RBI: 62, BB: 32, SO: 39, AB: 429, H: 116, d2B: 20, d3B: 1, SB: 1, CS: 1, OBA: 0.321, SA: 0.399 }
        },
        ratings: { power: 6, hitAndRun: 9, bunt: 8, fbPct: 44, runs: 4, range: 10, arm: 9, durability: 9 }
      },
      {
        id: 'bal_blair',
        name: 'Paul Blair',
        pos: '2B',
        pos2: 'CF',
        bats: 'R',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.285, HR: 26, RBI: 90, BB: 51, SO: 92, AB: 625, H: 178, d2B: 32, d3B: 5, SB: 24, CS: 8, OBA: 0.340, SA: 0.477 },
          L: { BA: 0.304, HR: 10, RBI: 31, BB: 19, SO: 27, AB: 191, H: 58, d2B: 11, d3B: 2, SB: 9, CS: 2, OBA: 0.367, SA: 0.539 },
          R: { BA: 0.276, HR: 16, RBI: 59, BB: 32, SO: 65, AB: 434, H: 120, d2B: 21, d3B: 3, SB: 15, CS: 6, OBA: 0.326, SA: 0.449 }
        },
        ratings: { power: 7, hitAndRun: 7, bunt: 8, fbPct: 46, runs: 8, range: 10, arm: 9, durability: 8 }
      },
      {
        id: 'bal_dempsey',
        name: 'Rick Dempsey',
        pos: 'C',
        pos2: 'C',
        bats: 'R',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.256, HR: 9, RBI: 40, BB: 50, SO: 54, AB: 360, H: 92, d2B: 26, d3B: 3, SB: 3, CS: 2, OBA: 0.346, SA: 0.419 },
          L: { BA: 0.281, HR: 5, RBI: 19, BB: 24, SO: 18, AB: 135, H: 38, d2B: 12, d3B: 1, SB: 2, CS: 1, OBA: 0.390, SA: 0.496 },
          R: { BA: 0.240, HR: 4, RBI: 21, BB: 26, SO: 36, AB: 225, H: 54, d2B: 14, d3B: 2, SB: 1, CS: 1, OBA: 0.319, SA: 0.373 }
        },
        ratings: { power: 4, hitAndRun: 6, bunt: 6, fbPct: 41, runs: 4, range: 8, arm: 9, durability: 8 }
      },

      // --- 4 BENCH BATTERS (WEAVER PLATOON WEAPONS & DEFENSIVE SPECIALISTS) ---
      {
        id: 'bal_lowenstein',
        name: 'John Lowenstein',
        pos: 'LF',
        pos2: 'RF',
        bats: 'L',
        throws: 'R',
        isStarter: false,
        splits: {
          T: { BA: 0.320, HR: 24, RBI: 66, BB: 54, SO: 58, AB: 322, H: 103, d2B: 15, d3B: 2, SB: 7, CS: 3, OBA: 0.414, SA: 0.602 },
          L: { BA: 0.214, HR: 1, RBI: 4, BB: 4, SO: 9, AB: 28, H: 6, d2B: 1, d3B: 0, SB: 0, CS: 0, OBA: 0.313, SA: 0.357 },
          R: { BA: 0.330, HR: 23, RBI: 62, BB: 50, SO: 49, AB: 294, H: 97, d2B: 14, d3B: 2, SB: 7, CS: 3, OBA: 0.427, SA: 0.626 }
        },
        ratings: { power: 8, hitAndRun: 7, bunt: 5, fbPct: 56, runs: 6, range: 6, arm: 6, durability: 6 }
      },
      {
        id: 'bal_dwyer',
        name: 'Jim Dwyer',
        pos: 'RF',
        pos2: 'LF',
        bats: 'L',
        throws: 'L',
        isStarter: false,
        splits: {
          T: { BA: 0.286, HR: 8, RBI: 38, BB: 37, SO: 29, AB: 196, H: 56, d2B: 17, d3B: 1, SB: 1, CS: 1, OBA: 0.399, SA: 0.505 },
          L: { BA: 0.200, HR: 0, RBI: 2, BB: 3, SO: 5, AB: 15, H: 3, d2B: 1, d3B: 0, SB: 0, CS: 0, OBA: 0.333, SA: 0.267 },
          R: { BA: 0.293, HR: 8, RBI: 36, BB: 34, SO: 24, AB: 181, H: 53, d2B: 16, d3B: 1, SB: 1, CS: 1, OBA: 0.405, SA: 0.525 }
        },
        ratings: { power: 6, hitAndRun: 7, bunt: 5, fbPct: 48, runs: 5, range: 6, arm: 6, durability: 6 }
      },
      {
        id: 'bal_crowley',
        name: 'Terry Crowley',
        pos: 'DH',
        pos2: '1B',
        bats: 'L',
        throws: 'L',
        isStarter: false,
        splits: {
          T: { BA: 0.283, HR: 11, RBI: 45, BB: 35, SO: 30, AB: 233, H: 66, d2B: 12, d3B: 0, SB: 1, CS: 0, OBA: 0.377, SA: 0.476 },
          L: { BA: 0.211, HR: 0, RBI: 2, BB: 2, SO: 5, AB: 19, H: 4, d2B: 1, d3B: 0, SB: 0, CS: 0, OBA: 0.286, SA: 0.263 },
          R: { BA: 0.290, HR: 11, RBI: 43, BB: 33, SO: 25, AB: 214, H: 62, d2B: 11, d3B: 0, SB: 1, CS: 0, OBA: 0.385, SA: 0.495 }
        },
        ratings: { power: 7, hitAndRun: 8, bunt: 3, fbPct: 50, runs: 3, range: 4, arm: 5, durability: 5 }
      },
      {
        id: 'bal_belanger',
        name: 'Mark Belanger',
        pos: 'SS',
        pos2: '2B',
        bats: 'R',
        throws: 'R',
        isStarter: false,
        splits: {
          T: { BA: 0.270, HR: 1, RBI: 40, BB: 54, SO: 64, AB: 522, H: 141, d2B: 14, d3B: 5, SB: 27, CS: 7, OBA: 0.338, SA: 0.322 },
          L: { BA: 0.282, HR: 1, RBI: 14, BB: 20, SO: 18, AB: 156, H: 44, d2B: 5, d3B: 2, SB: 9, CS: 2, OBA: 0.364, SA: 0.359 },
          R: { BA: 0.265, HR: 0, RBI: 26, BB: 34, SO: 46, AB: 366, H: 97, d2B: 9, d3B: 3, SB: 18, CS: 5, OBA: 0.327, SA: 0.306 }
        },
        ratings: { power: 1, hitAndRun: 8, bunt: 10, fbPct: 26, runs: 8, range: 10, arm: 9, durability: 8 }
      }
    ],

    /**
     * 5 Orioles Pitchers (4 20-Game Winner Starters + Bullpen Ace Tippy Martinez / Don Stanhouse)
     */
    pitchers: [
      {
        id: 'bal_palmer',
        name: 'Jim Palmer',
        role: 'SP',
        throws: 'R',
        splits: {
          T: { W: 23, L: 11, ERA: 2.09, IP: 323.0, H: 253, BB: 80, SO: 193, HR: 15, SV: 0 },
          L: { BA: 0.214, HR: 8, BB: 44, SO: 92, OBA: 0.275, SA: 0.312 },
          R: { BA: 0.209, HR: 7, BB: 36, SO: 101, OBA: 0.261, SA: 0.298 }
        },
        ratings: { speed: 9, control: 9, fatigue: 10, bunt: 6, fielding: 9 },
        pitches: ['4-Seam Fastball', 'High Curveball', 'Slider', 'Changeup']
      },
      {
        id: 'bal_flanagan',
        name: 'Mike Flanagan',
        role: 'SP',
        throws: 'L',
        splits: {
          T: { W: 23, L: 9, ERA: 3.08, IP: 265.2, H: 245, BB: 70, SO: 190, HR: 20, SV: 0 },
          L: { BA: 0.218, HR: 3, BB: 16, SO: 54, OBA: 0.268, SA: 0.310 },
          R: { BA: 0.249, HR: 17, BB: 54, SO: 136, OBA: 0.308, SA: 0.388 }
        },
        ratings: { speed: 7, control: 8, fatigue: 9, bunt: 5, fielding: 8 },
        pitches: ['4-Seam Fastball', 'Slow Curveball', 'Changeup', 'Slider']
      },
      {
        id: 'bal_cuellar',
        name: 'Mike Cuellar',
        role: 'SP',
        throws: 'L',
        splits: {
          T: { W: 23, L: 11, ERA: 2.38, IP: 290.2, H: 213, BB: 78, SO: 182, HR: 18, SV: 0 },
          L: { BA: 0.194, HR: 3, BB: 18, SO: 51, OBA: 0.250, SA: 0.285 },
          R: { BA: 0.205, HR: 15, BB: 60, SO: 131, OBA: 0.266, SA: 0.335 }
        },
        ratings: { speed: 6, control: 8, fatigue: 10, bunt: 8, fielding: 8 },
        pitches: ['Screwball', 'Curveball', '4-Seam Fastball', 'Changeup']
      },
      {
        id: 'bal_mcnally',
        name: 'Dave McNally',
        role: 'SP',
        throws: 'L',
        splits: {
          T: { W: 22, L: 10, ERA: 1.95, IP: 273.0, H: 175, BB: 55, SO: 202, HR: 15, SV: 0 },
          L: { BA: 0.178, HR: 2, BB: 13, SO: 58, OBA: 0.228, SA: 0.258 },
          R: { BA: 0.184, HR: 13, BB: 42, SO: 144, OBA: 0.238, SA: 0.304 }
        },
        ratings: { speed: 8, control: 9, fatigue: 9, bunt: 6, fielding: 7 },
        pitches: ['4-Seam Fastball', 'Sharp Curveball', 'Slider', 'Changeup']
      },
      {
        id: 'bal_martinez',
        name: 'Tippy Martinez',
        role: 'CL',
        throws: 'L',
        splits: {
          T: { W: 9, L: 3, ERA: 2.35, IP: 103.1, H: 76, BB: 37, SO: 81, HR: 6, SV: 21 },
          L: { BA: 0.189, HR: 1, BB: 11, SO: 29, OBA: 0.255, SA: 0.262 },
          R: { BA: 0.214, HR: 5, BB: 26, SO: 52, OBA: 0.289, SA: 0.328 }
        },
        ratings: { speed: 7, control: 8, fatigue: 5, bunt: 4, fielding: 9 },
        pitches: ['Wicked Curveball', '4-Seam Fastball', 'Slider', 'Changeup']
      }
    ]
  },

  boston: {
    id: 'boston',
    city: 'Boston',
    name: 'Red Sox',
    abbrev: 'BOS',
    primaryColor: '#bd3039',
    secondaryColor: '#0c2340',
    defaultParkId: 'fenway',
    defaultManagerId: 'mcnamara',

    /**
     * 9 Starting Lineup Batters + 4 Classic Fenway Bench Batters (13 total)
     */
    lineup: [
      // --- 9 STARTING BATTERS ---
      {
        id: 'bos_boggs',
        name: 'Wade Boggs',
        pos: '3B',
        pos2: '1B',
        bats: 'L',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.357, HR: 8, RBI: 71, BB: 105, SO: 44, AB: 580, H: 207, d2B: 47, d3B: 2, SB: 0, CS: 4, OBA: 0.453, SA: 0.486 },
          L: { BA: 0.329, HR: 2, RBI: 21, BB: 28, SO: 18, AB: 173, H: 57, d2B: 13, d3B: 0, SB: 0, CS: 1, OBA: 0.423, SA: 0.439 },
          R: { BA: 0.369, HR: 6, RBI: 50, BB: 77, SO: 26, AB: 407, H: 150, d2B: 34, d3B: 2, SB: 0, CS: 3, OBA: 0.466, SA: 0.506 }
        },
        ratings: { power: 4, hitAndRun: 10, bunt: 7, fbPct: 32, runs: 5, range: 8, arm: 7, durability: 9 }
      },
      {
        id: 'bos_barrett',
        name: 'Marty Barrett',
        pos: '2B',
        pos2: 'SS',
        bats: 'R',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.286, HR: 4, RBI: 60, BB: 65, SO: 31, AB: 625, H: 179, d2B: 39, d3B: 4, SB: 15, CS: 4, OBA: 0.353, SA: 0.381 },
          L: { BA: 0.301, HR: 2, RBI: 22, BB: 23, SO: 9, AB: 186, H: 56, d2B: 13, d3B: 1, SB: 5, CS: 1, OBA: 0.378, SA: 0.414 },
          R: { BA: 0.280, HR: 2, RBI: 38, BB: 42, SO: 22, AB: 439, H: 123, d2B: 26, d3B: 3, SB: 10, CS: 3, OBA: 0.343, SA: 0.367 }
        },
        ratings: { power: 2, hitAndRun: 10, bunt: 9, fbPct: 30, runs: 7, range: 8, arm: 6, durability: 9 }
      },
      {
        id: 'bos_yastrzemski',
        name: 'Carl Yastrzemski',
        pos: '1B',
        pos2: 'LF',
        bats: 'L',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.301, HR: 28, RBI: 102, BB: 95, SO: 67, AB: 566, H: 170, d2B: 32, d3B: 4, SB: 11, CS: 4, OBA: 0.405, SA: 0.521 },
          L: { BA: 0.284, HR: 8, RBI: 31, BB: 26, SO: 24, AB: 169, H: 48, d2B: 9, d3B: 1, SB: 3, CS: 1, OBA: 0.379, SA: 0.491 },
          R: { BA: 0.307, HR: 20, RBI: 71, BB: 69, SO: 43, AB: 397, H: 122, d2B: 23, d3B: 3, SB: 8, CS: 3, OBA: 0.416, SA: 0.534 }
        },
        ratings: { power: 8, hitAndRun: 9, bunt: 6, fbPct: 51, runs: 6, range: 9, arm: 9, durability: 9 }
      },
      {
        id: 'bos_rice',
        name: 'Jim Rice',
        pos: 'LF',
        pos2: 'DH',
        bats: 'R',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.315, HR: 39, RBI: 130, BB: 58, SO: 123, AB: 645, H: 203, d2B: 29, d3B: 11, SB: 8, CS: 3, OBA: 0.370, SA: 0.575 },
          L: { BA: 0.337, HR: 14, RBI: 44, BB: 22, SO: 34, AB: 196, H: 66, d2B: 11, d3B: 4, SB: 3, CS: 1, OBA: 0.404, SA: 0.648 },
          R: { BA: 0.305, HR: 25, RBI: 86, BB: 36, SO: 89, AB: 449, H: 137, d2B: 18, d3B: 7, SB: 5, CS: 2, OBA: 0.356, SA: 0.543 }
        },
        ratings: { power: 10, hitAndRun: 6, bunt: 2, fbPct: 55, runs: 6, range: 7, arm: 8, durability: 10 }
      },
      {
        id: 'bos_lynn',
        name: 'Fred Lynn',
        pos: 'CF',
        pos2: 'RF',
        bats: 'L',
        throws: 'L',
        isStarter: true,
        splits: {
          T: { BA: 0.333, HR: 39, RBI: 122, BB: 82, SO: 79, AB: 531, H: 177, d2B: 42, d3B: 1, SB: 2, CS: 4, OBA: 0.423, SA: 0.637 },
          L: { BA: 0.296, HR: 9, RBI: 32, BB: 21, SO: 27, AB: 152, H: 45, d2B: 11, d3B: 0, SB: 1, CS: 1, OBA: 0.382, SA: 0.546 },
          R: { BA: 0.348, HR: 30, RBI: 90, BB: 61, SO: 52, AB: 379, H: 132, d2B: 31, d3B: 1, SB: 1, CS: 3, OBA: 0.439, SA: 0.673 }
        },
        ratings: { power: 9, hitAndRun: 8, bunt: 4, fbPct: 54, runs: 7, range: 9, arm: 8, durability: 7 }
      },
      {
        id: 'bos_evans',
        name: 'Dwight Evans',
        pos: 'RF',
        pos2: '1B',
        bats: 'R',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.285, HR: 32, RBI: 108, BB: 97, SO: 115, AB: 578, H: 165, d2B: 37, d3B: 4, SB: 4, CS: 2, OBA: 0.391, SA: 0.529 },
          L: { BA: 0.305, HR: 12, RBI: 38, BB: 36, SO: 32, AB: 177, H: 54, d2B: 13, d3B: 2, SB: 2, CS: 1, OBA: 0.423, SA: 0.605 },
          R: { BA: 0.277, HR: 20, RBI: 70, BB: 61, SO: 83, AB: 401, H: 111, d2B: 24, d3B: 2, SB: 2, CS: 1, OBA: 0.376, SA: 0.496 }
        },
        ratings: { power: 8, hitAndRun: 6, bunt: 4, fbPct: 56, runs: 6, range: 9, arm: 10, durability: 9 }
      },
      {
        id: 'bos_fisk',
        name: 'Carlton Fisk',
        pos: 'C',
        pos2: 'DH',
        bats: 'R',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.289, HR: 26, RBI: 102, BB: 65, SO: 85, AB: 536, H: 155, d2B: 31, d3B: 5, SB: 7, CS: 4, OBA: 0.369, SA: 0.511 },
          L: { BA: 0.308, HR: 10, RBI: 35, BB: 24, SO: 25, AB: 169, H: 52, d2B: 11, d3B: 2, SB: 3, CS: 1, OBA: 0.394, SA: 0.574 },
          R: { BA: 0.281, HR: 16, RBI: 67, BB: 41, SO: 60, AB: 367, H: 103, d2B: 20, d3B: 3, SB: 4, CS: 3, OBA: 0.357, SA: 0.482 }
        },
        ratings: { power: 8, hitAndRun: 6, bunt: 4, fbPct: 52, runs: 5, range: 9, arm: 9, durability: 8 }
      },
      {
        id: 'bos_gedman',
        name: 'Rich Gedman',
        pos: 'DH',
        pos2: 'C',
        bats: 'L',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.278, HR: 18, RBI: 72, BB: 44, SO: 76, AB: 478, H: 133, d2B: 30, d3B: 3, SB: 1, CS: 1, OBA: 0.342, SA: 0.467 },
          L: { BA: 0.231, HR: 2, RBI: 11, BB: 8, SO: 22, AB: 91, H: 21, d2B: 4, d3B: 0, SB: 0, CS: 0, OBA: 0.293, SA: 0.341 },
          R: { BA: 0.289, HR: 16, RBI: 61, BB: 36, SO: 54, AB: 387, H: 112, d2B: 26, d3B: 3, SB: 1, CS: 1, OBA: 0.353, SA: 0.496 }
        },
        ratings: { power: 7, hitAndRun: 6, bunt: 3, fbPct: 49, runs: 3, range: 7, arm: 8, durability: 7 }
      },
      {
        id: 'bos_owen',
        name: 'Spike Owen',
        pos: 'SS',
        pos2: '2B',
        bats: 'S',
        throws: 'R',
        isStarter: true,
        splits: {
          T: { BA: 0.246, HR: 3, RBI: 45, BB: 51, SO: 51, AB: 528, H: 130, d2B: 21, d3B: 7, SB: 8, CS: 4, OBA: 0.313, SA: 0.330 },
          L: { BA: 0.259, HR: 1, RBI: 16, BB: 16, SO: 16, AB: 162, H: 42, d2B: 7, d3B: 2, SB: 3, CS: 1, OBA: 0.326, SA: 0.346 },
          R: { BA: 0.240, HR: 2, RBI: 29, BB: 35, SO: 35, AB: 366, H: 88, d2B: 14, d3B: 5, SB: 5, CS: 3, OBA: 0.307, SA: 0.322 }
        },
        ratings: { power: 2, hitAndRun: 8, bunt: 9, fbPct: 35, runs: 7, range: 8, arm: 8, durability: 8 }
      },

      // --- 4 BENCH BATTERS ---
      {
        id: 'bos_baylor',
        name: 'Don Baylor',
        pos: 'DH',
        pos2: '1B',
        bats: 'R',
        throws: 'R',
        isStarter: false,
        splits: {
          T: { BA: 0.268, HR: 31, RBI: 94, BB: 62, SO: 95, AB: 585, H: 157, d2B: 28, d3B: 1, SB: 12, CS: 5, OBA: 0.366, SA: 0.479 },
          L: { BA: 0.289, HR: 12, RBI: 36, BB: 24, SO: 27, AB: 187, H: 54, d2B: 11, d3B: 0, SB: 5, CS: 2, OBA: 0.395, SA: 0.540 },
          R: { BA: 0.259, HR: 19, RBI: 58, BB: 38, SO: 68, AB: 398, H: 103, d2B: 17, d3B: 1, SB: 7, CS: 3, OBA: 0.351, SA: 0.450 }
        },
        ratings: { power: 8, hitAndRun: 6, bunt: 2, fbPct: 52, runs: 6, range: 4, arm: 5, durability: 9 }
      },
      {
        id: 'bos_buckner',
        name: 'Bill Buckner',
        pos: '1B',
        pos2: 'LF',
        bats: 'L',
        throws: 'L',
        isStarter: false,
        splits: {
          T: { BA: 0.299, HR: 18, RBI: 102, BB: 36, SO: 26, AB: 629, H: 188, d2B: 39, d3B: 2, SB: 6, CS: 2, OBA: 0.338, SA: 0.453 },
          L: { BA: 0.282, HR: 4, RBI: 29, BB: 9, SO: 11, AB: 188, H: 53, d2B: 11, d3B: 0, SB: 1, CS: 1, OBA: 0.315, SA: 0.404 },
          R: { BA: 0.306, HR: 14, RBI: 73, BB: 27, SO: 15, AB: 441, H: 135, d2B: 28, d3B: 2, SB: 5, CS: 1, OBA: 0.348, SA: 0.474 }
        },
        ratings: { power: 6, hitAndRun: 10, bunt: 7, fbPct: 36, runs: 3, range: 5, arm: 6, durability: 8 }
      },
      {
        id: 'bos_henderson',
        name: 'Dave Henderson',
        pos: 'CF',
        pos2: 'RF',
        bats: 'R',
        throws: 'R',
        isStarter: false,
        splits: {
          T: { BA: 0.276, HR: 20, RBI: 72, BB: 46, SO: 98, AB: 456, H: 126, d2B: 28, d3B: 2, SB: 6, CS: 3, OBA: 0.344, SA: 0.478 },
          L: { BA: 0.296, HR: 9, RBI: 29, BB: 18, SO: 28, AB: 152, H: 45, d2B: 10, d3B: 1, SB: 2, CS: 1, OBA: 0.371, SA: 0.553 },
          R: { BA: 0.266, HR: 11, RBI: 43, BB: 28, SO: 70, AB: 304, H: 81, d2B: 18, d3B: 1, SB: 4, CS: 2, OBA: 0.330, SA: 0.441 }
        },
        ratings: { power: 7, hitAndRun: 6, bunt: 5, fbPct: 50, runs: 7, range: 8, arm: 8, durability: 7 }
      },
      {
        id: 'bos_armas',
        name: 'Tony Armas',
        pos: 'RF',
        pos2: 'CF',
        bats: 'R',
        throws: 'R',
        isStarter: false,
        splits: {
          T: { BA: 0.268, HR: 43, RBI: 123, BB: 32, SO: 156, AB: 639, H: 171, d2B: 29, d3B: 5, SB: 1, CS: 1, OBA: 0.304, SA: 0.531 },
          L: { BA: 0.286, HR: 16, RBI: 44, BB: 13, SO: 46, AB: 196, H: 56, d2B: 10, d3B: 2, SB: 1, CS: 0, OBA: 0.330, SA: 0.602 },
          R: { BA: 0.260, HR: 27, RBI: 79, BB: 19, SO: 110, AB: 443, H: 115, d2B: 19, d3B: 3, SB: 0, CS: 1, OBA: 0.292, SA: 0.499 }
        },
        ratings: { power: 10, hitAndRun: 3, bunt: 1, fbPct: 58, runs: 5, range: 8, arm: 9, durability: 7 }
      }
    ],

    /**
     * 5 Red Sox Pitchers (Clemens, Hurst, Boyd, Tiant, Closer Bob Stanley)
     */
    pitchers: [
      {
        id: 'bos_clemens',
        name: 'Roger Clemens',
        role: 'SP',
        throws: 'R',
        splits: {
          T: { W: 24, L: 4, ERA: 2.48, IP: 254.0, H: 179, BB: 67, SO: 238, HR: 21, SV: 0 },
          L: { BA: 0.198, HR: 11, BB: 36, SO: 114, OBA: 0.262, SA: 0.318 },
          R: { BA: 0.193, HR: 10, BB: 31, SO: 124, OBA: 0.251, SA: 0.302 }
        },
        ratings: { speed: 10, control: 9, fatigue: 10, bunt: 4, fielding: 7 },
        pitches: ['Blazing 4-Seam Fastball', 'Power Curveball', 'Hard Slider', 'Split-Finger']
      },
      {
        id: 'bos_hurst',
        name: 'Bruce Hurst',
        role: 'SP',
        throws: 'L',
        splits: {
          T: { W: 18, L: 8, ERA: 2.99, IP: 221.1, H: 204, BB: 61, SO: 192, HR: 18, SV: 0 },
          L: { BA: 0.212, HR: 3, BB: 14, SO: 58, OBA: 0.261, SA: 0.305 },
          R: { BA: 0.251, HR: 15, BB: 47, SO: 134, OBA: 0.306, SA: 0.391 }
        },
        ratings: { speed: 7, control: 8, fatigue: 9, bunt: 5, fielding: 8 },
        pitches: ['4-Seam Fastball', 'Forkball / Changeup', 'Overhand Curveball', 'Slider']
      },
      {
        id: 'bos_tiant',
        name: 'Luis Tiant',
        role: 'SP',
        throws: 'R',
        splits: {
          T: { W: 22, L: 13, ERA: 2.92, IP: 311.1, H: 262, BB: 82, SO: 206, HR: 22, SV: 0 },
          L: { BA: 0.232, HR: 12, BB: 45, SO: 98, OBA: 0.294, SA: 0.352 },
          R: { BA: 0.221, HR: 10, BB: 37, SO: 108, OBA: 0.278, SA: 0.331 }
        },
        ratings: { speed: 7, control: 8, fatigue: 10, bunt: 6, fielding: 8 },
        pitches: ['4-Seam Fastball', 'Hesitation Curveball', 'Slider', 'Palmball Change']
      },
      {
        id: 'bos_boyd',
        name: 'Oil Can Boyd',
        role: 'SP',
        throws: 'R',
        splits: {
          T: { W: 16, L: 10, ERA: 3.70, IP: 243.1, H: 244, BB: 53, SO: 154, HR: 24, SV: 0 },
          L: { BA: 0.266, HR: 13, BB: 29, SO: 71, OBA: 0.318, SA: 0.422 },
          R: { BA: 0.248, HR: 11, BB: 24, SO: 83, OBA: 0.295, SA: 0.388 }
        },
        ratings: { speed: 8, control: 8, fatigue: 8, bunt: 4, fielding: 7 },
        pitches: ['4-Seam Fastball', 'Slider', 'Curveball', 'Changeup']
      },
      {
        id: 'bos_stanley',
        name: 'Bob Stanley',
        role: 'CL',
        throws: 'R',
        splits: {
          T: { W: 12, L: 7, ERA: 2.60, IP: 168.1, H: 156, BB: 42, SO: 97, HR: 9, SV: 24 },
          L: { BA: 0.249, HR: 5, BB: 23, SO: 44, OBA: 0.305, SA: 0.358 },
          R: { BA: 0.238, HR: 4, BB: 19, SO: 53, OBA: 0.289, SA: 0.336 }
        },
        ratings: { speed: 7, control: 8, fatigue: 7, bunt: 5, fielding: 8 },
        pitches: ['Heavy Sinker', 'Palmball', 'Slider', '4-Seam Fastball']
      }
    ]
  }
};

/**
 * Returns a player's surname for scoreboard/canvas labels, skipping generational suffixes
 * ('Cal Ripken Jr.' -> 'Ripken', not 'Jr.').
 *
 * @param {string} name - Full player or manager name
 * @returns {string} Surname
 */
export function getLastName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  while (parts.length > 1 && /^(jr|sr|ii|iii|iv)\.?$/i.test(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1];
}

/**
 * Deep-clones a team roster by ID ('baltimore' | 'boston') so in-game substitutions,
 * pinch-hitting, pitch counts, and Commissioner's Disk edits never mutate the base schema.
 *
 * Also populates convenience arrays (`starters`, `bench`) derived from `lineup`
 * while preserving the complete 13-player `lineup` array (indices 0..8 = starting 9,
 * indices 9..12 = 4 bench batters).
 *
 * @param {string} teamId - Team identifier ('baltimore' | 'boston')
 * @returns {Object} Deep clone of the team roster
 */
export function cloneTeamRoster(teamId) {
  const baseTeam = TEAMS[teamId] || TEAMS.baltimore;
  const cloned = JSON.parse(JSON.stringify(baseTeam));

  // Ensure convenience references for both 9-man active batting order and 4-man bench
  cloned.starters = cloned.lineup.slice(0, 9);
  cloned.bench = cloned.lineup.slice(9);
  // Per batting-order slot: the starter followed by any pinch-hitters, in order of entry
  cloned.slotHistory = cloned.starters.map((p) => [p]);

  return cloned;
}
