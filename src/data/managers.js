/**
 * @fileoverview Authentic Earl Weaver Baseball (1987) Manager Schema & Historical Managers.
 *
 * In Don Daglow and Eddie Dombrower's 1987 Earl Weaver Baseball (and the
 * Commissioner's Disk "Edit Managers" screen, ref: research/images/ewb2_06.jpg),
 * every computer manager and the "Ask Earl" tactical advisor is driven by a
 * 19-parameter strategy profile.
 *
 * Key EWB Tactical Distinction — "Run & Hit" vs. "Hit & Run":
 * During his 1986 design sessions with Daglow and Dombrower, Earl Weaver insisted
 * that EWB distinguish between the traditional Hit & Run (where the batter MUST
 * swing at any pitch to protect the runner, often resulting in weak contact or
 * chasing a pitchout) and the Oriole Way "Run & Hit" (where the runner breaks on
 * a favorable count like 2-0 or 2-1, and the batter only swings if the pitch is in
 * his wheelhouse—turning a ball into a walk/stolen base or a strike into a crushed
 * gap drive).
 */

/**
 * @typedef {Object} ManagerProfile
 * @property {string} id - Unique identifier ('weaver', 'herzog', 'anderson', 'mcnamara')
 * @property {string} name - Full display name of the manager
 * @property {string} team - Historical franchise association
 * @property {string} bio - Historical summary of the manager's tactical philosophy
 * @property {string} quote - Signature quote displayed in the "Ask Earl" / Manager modal
 * @property {string[]} quotes - Situation-specific tactical quotes for in-game advice
 *
 * --- 19 Authentic EWB Manager Strategy Parameters ---
 * @property {boolean} platoonLineups - Whether the manager aggressively platoons L/R batters against opposite-handed starters
 * @property {number} steal2nd - (1-10) Frequency of straight steal attempts of 2nd base
 * @property {number} steal3rd - (1-10) Frequency of steal attempts of 3rd base
 * @property {number} doubleSteal - (1-10) Frequency of 1st-and-3rd or 1st-and-2nd double steals
 * @property {number} sacBunt - (1-10) Willingness to give up an out with a sacrifice bunt (Weaver = 1!)
 * @property {number} buntForHit - (1-10) Frequency of speedsters bunting for a base hit
 * @property {number} squeezeBunt - (1-10) Frequency of safety/suicide squeeze plays with runner on 3rd
 * @property {number} hitAndRun - (1-10) Traditional Hit & Run (batter must swing to protect runner)
 * @property {number} runAndHit - (1-10) Earl Weaver's signature Run & Hit (runner goes on count, batter swings only at strikes)
 * @property {number} pitchOut - (1-10) Frequency of calling a pitchout against base-stealing threats
 * @property {number} pitchAround - (1-10) Willingness to nibble at the corners against dangerous sluggers
 * @property {number} intentionalWalk - (1-10) Frequency of issuing an intentional base on balls (IBB) with 1st base open
 * @property {number} chargeBunt - (1-10) Aggressiveness bringing corner infielders in on expected bunt situations
 * @property {number} guardLines - (1-10) Frequency of shifting 1B/3B to guard the foul lines in late innings with a lead
 * @property {number} infieldIn - (1-10) Willingness to bring the entire infield in with a runner on 3rd and < 2 outs
 * @property {number} runAggressively - (1-10) Baserunner aggressiveness taking extra bases (1st-to-3rd, 2nd-to-home)
 * @property {number} pinchHitInning - (1-9) Earliest inning the manager will lift a position player for a platoon pinch-hitter
 * @property {number} relievePitcherAfter - Target pitch-count threshold before looking to the bullpen
 * @property {'BA'|'SA'|'OBA'|'HR'} chooseHitterBy - Primary statistical metric used to construct lineups and select pinch-hitters
 * @property {'ERA'|'W'|'SO'} choosePitcherBy - Primary statistical metric used to rank starting and relief pitchers
 */

/**
 * Dictionary of historical managers recreated from Earl Weaver Baseball (1987).
 * @type {Record<string, ManagerProfile>}
 */
export const MANAGERS = {
  weaver: {
    id: 'weaver',
    name: 'Earl Weaver',
    team: 'Baltimore Orioles',
    bio: 'The Hall of Fame mastermind of "The Oriole Way" (1,480–1,060, .583 WPCT). Armed with laminated 3x5 index cards tracking every batter-pitcher platoon matchup, Weaver despised giving away outs with sacrifice bunts or low-percentage steals, preaching instead deep starting pitching, airtight defense, high on-base percentage, the "Run & Hit" on ahead counts, and the three-run homer.',
    quote: 'Pitching, defense, and the three-run homer! On offense, your most precious commodities are your 27 outs—never give one away with a sacrifice bunt. Put the Run & Hit on when you’re ahead in the count so the hitter only swings at a strike!',
    quotes: [
      'Pitching, defense, and the three-run homer—that’s what wins pennants.',
      'If you play for one run, that’s all you’ll get. Don’t bunt—play for the big inning!',
      'Why Hit & Run and force your hitter to swing at a ball in the dirt? Use the Run & Hit on 2-0 or 2-1 so he only swings if it’s in his wheelhouse!',
      'Nobody ever lost a game because of a walk that didn’t score, but walks followed by a blast will kill you every time.',
      'Check the platoon cards! A lefty bench bat with a .380 OBA against right-handers beats an tired starter every day of the week.'
    ],
    // 19 EWB Strategy Parameters
    platoonLineups: true,
    steal2nd: 3,
    steal3rd: 2,
    doubleSteal: 2,
    sacBunt: 1,
    buntForHit: 3,
    squeezeBunt: 1,
    hitAndRun: 3,
    runAndHit: 9,
    pitchOut: 4,
    pitchAround: 7,
    intentionalWalk: 6,
    chargeBunt: 8,
    guardLines: 8,
    infieldIn: 4,
    runAggressively: 5,
    pinchHitInning: 6,
    relievePitcherAfter: 120,
    chooseHitterBy: 'OBA',
    choosePitcherBy: 'ERA'
  },

  herzog: {
    id: 'herzog',
    name: 'Whitey Herzog',
    team: 'St. Louis Cardinals',
    bio: 'The architect of "Whiteyball" in Kansas City and St. Louis. Built for spacious artificial-turf stadiums, Herzog weaponized elite team speed, relentless stolen bases, drag bunts, high-contact Hit & Run execution, and rangy outfield defense to manufacture runs without waiting for home runs.',
    quote: 'Speed never goes into a slump! Put pressure on the defense every single pitch—steal second, steal third, drop down a drag bunt, and take the extra base before the outfielder even picks up the ball.',
    quotes: [
      'Speed never goes into a slump! Get on first and rattle the pitcher’s concentration.',
      'With a runner in motion on the Hit & Run, those infield holes open up like a four-lane highway.',
      'Take first-to-third on every single to right field. Make them throw a strike to nail you!'
    ],
    // 19 EWB Strategy Parameters
    platoonLineups: true,
    steal2nd: 10,
    steal3rd: 8,
    doubleSteal: 8,
    sacBunt: 6,
    buntForHit: 9,
    squeezeBunt: 7,
    hitAndRun: 9,
    runAndHit: 7,
    pitchOut: 7,
    pitchAround: 5,
    intentionalWalk: 5,
    chargeBunt: 9,
    guardLines: 9,
    infieldIn: 7,
    runAggressively: 10,
    pinchHitInning: 6,
    relievePitcherAfter: 105,
    chooseHitterBy: 'BA',
    choosePitcherBy: 'ERA'
  },

  anderson: {
    id: 'anderson',
    name: 'Sparky Anderson',
    team: 'Detroit Tigers / Cincinnati Reds',
    bio: 'The first manager to win World Series titles in both leagues ("The Big Red Machine" in Cincinnati and the 1984 wire-to-wire Detroit Tigers). Nicknamed "Captain Hook" for his famously quick trigger pulling starting pitchers at the first sign of fatigue in favor of specialized bullpen stoppers.',
    quote: 'They call me Captain Hook for a reason! When my starter hits 90 pitches or starts leaving fastballs up in the zone, the bullpen door swings open—I don’t wait until the lead is gone.',
    quotes: [
      'My starters don’t have to like me in the seventh inning—they’ll love me when we’re shaking hands after a win.',
      'Balanced lineups with power and speed win 100 games, but a fresh arm in the bullpen saves them.'
    ],
    // 19 EWB Strategy Parameters
    platoonLineups: true,
    steal2nd: 6,
    steal3rd: 5,
    doubleSteal: 5,
    sacBunt: 4,
    buntForHit: 5,
    squeezeBunt: 3,
    hitAndRun: 6,
    runAndHit: 7,
    pitchOut: 5,
    pitchAround: 6,
    intentionalWalk: 6,
    chargeBunt: 7,
    guardLines: 7,
    infieldIn: 5,
    runAggressively: 7,
    pinchHitInning: 6,
    relievePitcherAfter: 92,
    chooseHitterBy: 'SA',
    choosePitcherBy: 'ERA'
  },

  mcnamara: {
    id: 'mcnamara',
    name: 'John McNamara',
    team: 'Boston Red Sox',
    bio: 'Veteran skipper of the 1986 AL Champion Boston Red Sox. A traditionalist who favored set everyday lineups built around Fenway Park’s Green Monster, fundamental one-run manufacturing via the sacrifice bunt in tight late-inning games, and riding workhorse starters like Roger Clemens and Bruce Hurst deep into the night.',
    quote: 'At Fenway Park, you trust your everyday hitters to pepper the Green Monster, move runners into scoring position with a textbook sacrifice bunt, and let your ace finish what he started.',
    quotes: [
      'In a tight game from the seventh inning on, move the runner over to second with a sacrifice bunt and let Boggs or Evans drive him in.',
      'When your ace still has pop on his fastball in the eighth, you leave him out there on the mound.'
    ],
    // 19 EWB Strategy Parameters
    platoonLineups: false,
    steal2nd: 2,
    steal3rd: 1,
    doubleSteal: 2,
    sacBunt: 6,
    buntForHit: 3,
    squeezeBunt: 3,
    hitAndRun: 5,
    runAndHit: 4,
    pitchOut: 4,
    pitchAround: 5,
    intentionalWalk: 6,
    chargeBunt: 6,
    guardLines: 5,
    infieldIn: 6,
    runAggressively: 4,
    pinchHitInning: 8,
    relievePitcherAfter: 118,
    chooseHitterBy: 'BA',
    choosePitcherBy: 'W'
  }
};

/**
 * Retrieves a manager profile by ID, falling back to Earl Weaver ('weaver') if not found.
 * Returns a shallow clone so runtime Commissioner's Disk edits can safely mutate sliders.
 *
 * @param {string} id - Manager identifier ('weaver' | 'herzog' | 'anderson' | 'mcnamara')
 * @returns {ManagerProfile}
 */
export function getManager(id) {
  const manager = MANAGERS[id] || MANAGERS.weaver;
  return {
    ...manager,
    quotes: Array.isArray(manager.quotes) ? [...manager.quotes] : [manager.quote]
  };
}
