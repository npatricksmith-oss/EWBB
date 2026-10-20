// Plays headless games between every pair of built historical teams (and vs. the Orioles)
// to catch roster data that crashes the engine. Usage: node bin/smoke_teams.mjs [gamesPerPair]
import { TEAMS } from '../src/data/rosters.js';
import { HISTORICAL_TEAMS } from '../src/data/teams/index.js';
import { EWBGameState } from '../src/engine/gameState.js';

const gamesPerPair = Number(process.argv[2] || 2);
const ids = [...Object.keys(HISTORICAL_TEAMS), 'baltimore'];
let games = 0;
let runs = 0;
for (const away of ids) {
  for (const home of ids) {
    if (away === home) continue;
    for (let g = 0; g < gamesPerPair; g++) {
      const game = new EWBGameState({
        awayTeamId: away,
        homeTeamId: home,
        parkId: g % 2 ? 'fenway' : 'memorial',
        awayManagerId: TEAMS[away].defaultManagerId,
        homeManagerId: TEAMS[home].defaultManagerId
      });
      game.simulateHeadless({ mode: 'FULL_GAME', maxPitches: 650 });
      if (!Number.isFinite(game.awayScore) || !Number.isFinite(game.homeScore)) {
        throw new Error(`${away} at ${home}: non-numeric score`);
      }
      games += 1;
      runs += game.awayScore + game.homeScore;
    }
  }
}
console.log(`${games} games, ${(runs / games / 2).toFixed(2)} runs per team-game, teams: ${ids.join(', ')}`);
