import fs from 'fs';
import path from 'path';
import { TEAMS } from '../src/data/rosters.js';

let md = `# Earl Weaver Baseball (1987) — Ingested Teams & Player Rosters

This document provides the complete roster list and statistical summary of all teams ingested into the game, matching the original 1987 *Earl Weaver Baseball* (EWB 1.0) release and its core game disks.

## Overview of Ingested Teams

| # | Team Key | Team Name | Abbrev | Era / Scope | Batters | Pitchers | Default Park | Default Manager | Split Source |
| :-: | :--- | :--- | :---: | :--- | :-: | :-: | :--- | :--- | :--- |
`;

const teamKeys = Object.keys(TEAMS);
let index = 1;

for (const key of teamKeys) {
  const team = TEAMS[key];
  let era = 'Historical';
  if (key === 'baltimore') era = '1979/1983 Weaver Dynasty';
  else if (key === 'boston') era = '1986 AL Champions';
  else if (key === 'california') era = '1982 AL West Champions';
  else if (key === 'atlanta') era = '1982 NL West Champions';
  else if (key.startsWith('al_') || key.startsWith('nl_')) {
    const parts = key.split('_');
    const league = parts[0].toUpperCase();
    const span = parts.slice(1).join('-');
    era = `${league} 19${span.replace('-', '–19')}`;
  }
  const park = team.defaultParkId || 'memorial';
  const mgr = team.defaultManagerId || 'weaver';
  const numBatters = team.lineup ? team.lineup.length : 0;
  const numPitchers = team.pitchers ? team.pitchers.length : 0;
  const splitSrc = key.startsWith('al_') || key.startsWith('nl_') || key === 'california' || key === 'atlanta' ? 'Retrosheet / Baseball-Ref' : 'EWB 1.0 Benchmark';

  md += `| ${index++} | \`${key}\` | **${team.city} ${team.name}** | \`${team.abbrev}\` | ${era} | ${numBatters} | ${numPitchers} | \`${park}\` | \`${mgr}\` | ${splitSrc} |\n`;
}

md += `\n---\n\n`;

for (const key of teamKeys) {
  const team = TEAMS[key];
  let teamTitle = `${team.city} ${team.name}`;
  if (team.city === 'AL' || team.city === 'NL') {
    teamTitle = `${team.city} ${team.name} All-Stars`;
  }
  md += `## ${teamTitle} (\`${key}\`)\n\n`;
  md += `- **Abbreviation:** \`${team.abbrev}\`\n`;
  md += `- **Primary / Secondary Colors:** \`${team.primaryColor}\` / \`${team.secondaryColor}\`\n`;
  md += `- **Default Ballpark:** \`${team.defaultParkId}\`\n`;
  md += `- **Default Manager:** \`${team.defaultManagerId}\`\n\n`;

  md += `### Starting Lineup (9 Batters)\n\n`;
  md += `| Order | Player | Pos | B/T | Season | BA | OBA | SA | HR | RBI | BB | SO | Speed | Pwr | Rng | Arm | Splits |\n`;
  md += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

  const starters = team.lineup.slice(0, 9);
  starters.forEach((p, idx) => {
    const t = p.splits?.T || {};
    const r = p.ratings || {};
    const s = p.source?.season || (p.year || (team.id === 'boston' ? '1986' : team.id === 'baltimore' ? '1979/83' : '—'));
    const ba = t.BA !== undefined ? t.BA.toFixed(3) : '—';
    const oba = t.OBA !== undefined ? t.OBA.toFixed(3) : '—';
    const sa = t.SA !== undefined ? t.SA.toFixed(3) : '—';
    let splitDesc = p.source?.splits || 'Platoon';
    if (p.source?.splitCoverage && p.source.splitCoverage < 1.0) {
      splitDesc += ` (${Math.round(p.source.splitCoverage * 100)}%)`;
    }
    md += `| ${idx + 1} | **${p.name}** | \`${p.pos}\` | ${p.bats}/${p.throws} | ${s} | ${ba} | ${oba} | ${sa} | ${t.HR ?? 0} | ${t.RBI ?? 0} | ${t.BB ?? 0} | ${t.SO ?? 0} | ${r.runs ?? '—'} | ${r.power ?? '—'} | ${r.range ?? '—'} | ${r.arm ?? '—'} | ${splitDesc} |\n`;
  });

  md += `\n### Bench Reserves (4 Batters)\n\n`;
  md += `| Player | Pos | B/T | Season | BA | OBA | SA | HR | RBI | BB | SO | Speed | Pwr | Rng | Arm | Splits |\n`;
  md += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

  const bench = team.lineup.slice(9);
  bench.forEach((p) => {
    const t = p.splits?.T || {};
    const r = p.ratings || {};
    const s = p.source?.season || (p.year || (team.id === 'boston' ? '1986' : team.id === 'baltimore' ? '1979/83' : '—'));
    const ba = t.BA !== undefined ? t.BA.toFixed(3) : '—';
    const oba = t.OBA !== undefined ? t.OBA.toFixed(3) : '—';
    const sa = t.SA !== undefined ? t.SA.toFixed(3) : '—';
    let splitDesc = p.source?.splits || 'Platoon';
    if (p.source?.splitCoverage && p.source.splitCoverage < 1.0) {
      splitDesc += ` (${Math.round(p.source.splitCoverage * 100)}%)`;
    }
    md += `| **${p.name}** | \`${p.pos}\` | ${p.bats}/${p.throws} | ${s} | ${ba} | ${oba} | ${sa} | ${t.HR ?? 0} | ${t.RBI ?? 0} | ${t.BB ?? 0} | ${t.SO ?? 0} | ${r.runs ?? '—'} | ${r.power ?? '—'} | ${r.range ?? '—'} | ${r.arm ?? '—'} | ${splitDesc} |\n`;
  });

  md += `\n### Pitching Staff (${team.pitchers.length} Pitchers)\n\n`;
  md += `| Role | Pitcher | Thr | Season | W-L | ERA | IP | SV | SO | BB | Spd | Ctl | Fat | Repertoire |\n`;
  md += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

  team.pitchers.forEach((p) => {
    const t = p.splits?.T || {};
    const r = p.ratings || {};
    const s = p.source?.season || (p.year || (team.id === 'boston' ? '1986' : team.id === 'baltimore' ? '1979/83' : '—'));
    const era = t.ERA !== undefined ? t.ERA.toFixed(2) : '—';
    const ip = t.IP !== undefined ? t.IP.toFixed(1) : '—';
    const wl = (t.W !== undefined && t.L !== undefined) ? `${t.W}-${t.L}` : '—';
    const pitches = (p.pitches || []).join(', ');
    md += `| \`${p.role}\` | **${p.name}** | ${p.throws} | ${s} | ${wl} | ${era} | ${ip} | ${t.SV ?? 0} | ${t.SO ?? 0} | ${t.BB ?? 0} | ${r.speed ?? '—'} | ${r.control ?? '—'} | ${r.fatigue ?? '—'} | ${pitches} |\n`;
  });

  md += `\n---\n\n`;
}

fs.writeFileSync('INGESTED_ROSTERS.md', md.trim() + '\n');
console.log('Successfully wrote refined INGESTED_ROSTERS.md');
