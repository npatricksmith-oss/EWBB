/**
 * Earl Weaver Baseball (1987 EWB 1.0) — Main Retro-Pro Hybrid UI Controller & Commissioner's Disk
 *
 * Connects:
 * - EWBGameState (`src/engine/gameState.js`)
 * - Stage 1 Statistical Matchup Matrix (`src/engine/statsMatrix.js`)
 * - Stage 2 3D Ballfield Physics (`src/engine/physicsEngine.js`)
 * - "Ask Earl" Tactical AI (`src/engine/earlAI.js`)
 * - 1987 Split-Screen & Full-Field Canvas Renderer (`src/ui/fieldRenderer1987.js`)
 * - Web Audio API Synthesizer (`src/ui/soundEngine.js`)
 * - Commissioner's Disk Live Editors (Ballparks, 19-Slider Managers, Team L/R Splits)
 */

import { BALLPARKS, getWallAtAngle } from '../data/ballparks.js';
import { MANAGERS } from '../data/managers.js';
import { TEAMS, getLastName } from '../data/rosters.js';
import { getEffectivePlatoonMatchup } from '../engine/statsMatrix.js';
import { askEarlAdvisor } from '../engine/earlAI.js';
import { EWBGameState } from '../engine/gameState.js';
import { runStatisticalValidation } from '../engine/statsValidator.js';
import { FieldRenderer1987 } from './fieldRenderer1987.js';
import { HomeRunFireworks } from './fireworks.js';
import { soundEngine } from './soundEngine.js';

// Play-by-play lands after the field animation ends: first entry after this delay, then one per stagger step
const NARRATION_DELAY_MS = 750;
const NARRATION_STAGGER_MS = 420;
// Pitch delivery runs before the ball is in play; the field tape starts after it
const PITCH_DELIVERY_MS = 720;
const FIELD_FPS = 60;
const HOME_RUN_FIREWORKS_DELAY_MS = 1000;

class EWBAppController {
  constructor() {
    this.gameState = new EWBGameState({
      awayTeamId: 'boston',
      homeTeamId: 'baltimore',
      parkId: 'fenway',
      awayManagerId: 'mcnamara',
      homeManagerId: 'weaver'
    });

    this.canvas = document.getElementById('ewbCanvas');
    this.renderer = new FieldRenderer1987(this.canvas);
    this.fireworks = new HomeRunFireworks(this.canvas, { onBurst: () => soundEngine.playFireworkPop() });
    // Play-by-play entries logged by a pitch but not yet narrated, and the queue that reveals them in order
    this.hiddenLogEntries = new Set();
    this.narrationQueue = [];
    this.narrationTimer = null;
    this.isAnimating = false;
    this.lastPhysicsTelemetry = null;
    this.activeEditorParkId = 'fenway';
    this.activeEditorManagerId = 'weaver';
    this.activeEditorTeamId = 'baltimore';
    this.activeEditorPlayerIdx = 0;

    this.populateTeamSelectors();
    this.bindEvents();
    this.initCommissionerEditors();
    this.refreshAllUI();
  }

  /** Fills the Away/Home pickers with every team in `TEAMS`, labeled with its default manager. */
  populateTeamSelectors() {
    for (const [selectId, selectedId] of [['selectAwayTeam', 'boston'], ['selectHomeTeam', 'baltimore']]) {
      const select = document.getElementById(selectId);
      if (!select) continue;
      select.innerHTML = Object.values(TEAMS)
        .map((t) => {
          const mgr = MANAGERS[t.defaultManagerId] || MANAGERS.weaver;
          return `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${t.city} ${t.name} (${getLastName(mgr.name)})</option>`;
        })
        .join('');
    }
  }

  bindEvents() {
    // Top Matchup & New Game Controls
    const newGameBtn = document.getElementById('btnNewGame');
    if (newGameBtn) {
      newGameBtn.addEventListener('click', () => this.startNewGameFromSelectors());
    }

    const parkSelect = document.getElementById('selectPark');
    if (parkSelect) {
      parkSelect.addEventListener('change', (e) => {
        const parkId = e.target.value;
        if (BALLPARKS[parkId]) {
          this.gameState.park = JSON.parse(JSON.stringify(BALLPARKS[parkId]));
          this.gameState.logPlay(
            `🏟️ Venue switched to ${this.gameState.park.name} (${this.gameState.park.surface}, Left Pole ${this.gameState.park.fenceDistances[0]} ft / ${this.gameState.park.fenceHeights[0]} ft wall).`,
            'INFO'
          );
          this.refreshAllUI();
        }
      });
    }

    const btnSound = document.getElementById('btnToggleSound');
    if (btnSound) {
      btnSound.addEventListener('click', () => {
        const on = soundEngine.toggle();
        btnSound.textContent = on ? '🔊 SFX: ON' : '🔇 SFX: OFF';
        btnSound.classList.toggle('active-toggle', on);
      });
    }

    const btnCrt = document.getElementById('btnToggleCRT');
    if (btnCrt) {
      btnCrt.addEventListener('click', () => {
        const wrap = document.getElementById('canvasViewportWrap');
        if (wrap) {
          const active = wrap.classList.toggle('crt-scanlines');
          btnCrt.textContent = active ? '📺 1987 CRT: ON' : '📺 1987 CRT: OFF';
          btnCrt.classList.toggle('active-toggle', active);
        }
      });
    }

    // Navigation Tabs (Play / Box Score / Commissioner's Disk Editors / 1987 Archive)
    document.querySelectorAll('[data-tab-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-tab-target');
        document.querySelectorAll('[data-tab-target]').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.ewb-tab-section').forEach((sec) => sec.classList.remove('active'));
        btn.classList.add('active');
        const targetEl = document.getElementById(targetId);
        if (targetEl) targetEl.classList.add('active');
        this.refreshAllUI();
      });
    });

    // Offensive & Defensive Strategy Selectors
    const offSelect = document.getElementById('selectOffensePlay');
    if (offSelect) {
      offSelect.addEventListener('change', (e) => {
        this.gameState.offensePlay = e.target.value;
        this.renderer.render(this.gameState);
        this.updateEarlBannerPreview();
      });
    }

    const defSelect = document.getElementById('selectDefensePlay');
    if (defSelect) {
      defSelect.addEventListener('change', (e) => {
        this.gameState.defensePlay = e.target.value;
        this.renderer.render(this.gameState);
        this.updateEarlBannerPreview();
      });
    }

    // Core Gameplay Buttons
    const btnPitch = document.getElementById('btnThrowPitch');
    if (btnPitch) {
      btnPitch.addEventListener('click', () => this.handleThrowPitch());
    }

    const btnAskEarl = document.getElementById('btnAskEarl');
    if (btnAskEarl) {
      btnAskEarl.addEventListener('click', () => this.openAskEarlModal());
    }

    const btnReplay = document.getElementById('btnInstantReplay');
    if (btnReplay) {
      btnReplay.addEventListener('click', () => this.handleInstantReplay());
    }

    const btnSimAtBat = document.getElementById('btnSimAtBat');
    if (btnSimAtBat) {
      btnSimAtBat.addEventListener('click', () => this.handleHeadlessSim('AT_BAT'));
    }

    const btnSimInning = document.getElementById('btnSimHalfInning');
    if (btnSimInning) {
      btnSimInning.addEventListener('click', () => this.handleHeadlessSim('HALF_INNING'));
    }

    const btnSimGame = document.getElementById('btnSimFullGame');
    if (btnSimGame) {
      btnSimGame.addEventListener('click', () => this.handleHeadlessSim('FULL_GAME'));
    }

    // Substitutions (Pinch-Hitter & Bullpen Reliever)
    const btnPinchHit = document.getElementById('btnExecutePinchHit');
    if (btnPinchHit) {
      btnPinchHit.addEventListener('click', () => {
        const benchSel = document.getElementById('selectPinchHitter');
        if (!benchSel || benchSel.value === '') return;
        const side = this.gameState.battingSide;
        const starterIdx = this.gameState.lineupIndex[side] % 9;
        const benchIdx = Number(benchSel.value);
        if (this.gameState.pinchHit(side, starterIdx, benchIdx)) {
          this.refreshAllUI();
        }
      });
    }

    const btnChangePitcher = document.getElementById('btnExecutePitcherChange');
    if (btnChangePitcher) {
      btnChangePitcher.addEventListener('click', () => {
        const relSel = document.getElementById('selectReliever');
        if (!relSel || relSel.value === '') return;
        const side = this.gameState.fieldingSide;
        const pIdx = Number(relSel.value);
        this.gameState.changePitcher(side, pIdx);
        this.refreshAllUI();
      });
    }

    // Ask Earl Modal Controls
    const btnCloseEarl = document.getElementById('btnCloseEarlModal');
    if (btnCloseEarl) {
      btnCloseEarl.addEventListener('click', () => {
        document.getElementById('askEarlModal')?.classList.remove('open');
      });
    }

    const btnApplyEarl = document.getElementById('btnApplyEarlAdvice');
    if (btnApplyEarl) {
      btnApplyEarl.addEventListener('click', () => {
        const advice = askEarlAdvisor(this.gameState);
        this.gameState.offensePlay = advice.suggestedOffensePlay || 'NORMAL';
        this.gameState.defensePlay = advice.suggestedDefensePlay || 'NORMAL';
        if (offSelect) offSelect.value = this.gameState.offensePlay;
        if (defSelect) defSelect.value = this.gameState.defensePlay;
        document.getElementById('askEarlModal')?.classList.remove('open');
        this.refreshAllUI();
      });
    }

    // Keyboard shortcuts (Space = Pitch, E = Ask Earl, R = Instant Replay) scoped to active Play tab
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      const playTab = document.getElementById('tab-play');
      if (!playTab || !playTab.classList.contains('active')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.handleThrowPitch();
      } else if (e.key === 'e' || e.key === 'E') {
        this.openAskEarlModal();
      } else if (e.key === 'r' || e.key === 'R') {
        this.handleInstantReplay();
      }
    });
  }

  startNewGameFromSelectors() {
    if (this.isAnimating) return;
    const awayTeamId = document.getElementById('selectAwayTeam')?.value || 'boston';
    const homeTeamId = document.getElementById('selectHomeTeam')?.value || 'baltimore';
    const parkId = document.getElementById('selectPark')?.value || 'fenway';
    const awayManagerId = TEAMS[awayTeamId]?.defaultManagerId || 'weaver';
    const homeManagerId = TEAMS[homeTeamId]?.defaultManagerId || 'weaver';

    this.flushNarration();
    this.gameState.resetGame({
      awayTeamId,
      homeTeamId,
      parkId,
      awayManagerId,
      homeManagerId
    });
    this.lastPhysicsTelemetry = null;
    this.renderer.mode = 'SPLIT_SCREEN';
    this.renderer.lastPlayRecord = null;
    soundEngine.playOrganCharge();
    this.refreshAllUI();
  }

  handleThrowPitch() {
    if (this.isAnimating) return;
    if (this.gameState.isGameOver) {
      this.startNewGameFromSelectors();
      return;
    }

    const offSelect = document.getElementById('selectOffensePlay');
    const defSelect = document.getElementById('selectDefensePlay');
    const offensePlay = offSelect ? offSelect.value : this.gameState.offensePlay;
    const defensePlay = defSelect ? defSelect.value : this.gameState.defensePlay;

    this.isAnimating = true;
    this.updateActionButtonsState();

    // Entries this pitch logs; hidden until the field animation finishes
    let pitchLogEntries = [];

    try {
      const logBeforePitch = new Set(this.gameState.playLog);
      const prePitchRenderState = {
        park: this.gameState.park,
        inning: this.gameState.inning,
        half: this.gameState.half,
        outs: this.gameState.outs,
        count: { ...this.gameState.count },
        totals: JSON.parse(JSON.stringify(this.gameState.totals)),
        homeTeam: this.gameState.homeTeam,
        awayTeam: this.gameState.awayTeam,
        bases: [...this.gameState.bases],
        defensePlay,
        offensePlay,
        currentBatter: this.gameState.currentBatter,
        currentPitcher: this.gameState.currentPitcher,
        battingTeam: this.gameState.battingTeam,
        fieldingTeam: this.gameState.fieldingTeam
      };

      soundEngine.playPitchWhoosh();
      const { pitchStep, physicsResult } = this.gameState.stepPitch({
        offensePlay,
        defensePlay,
        useAIManagers: false
      });

      if (physicsResult) {
        this.lastPhysicsTelemetry = physicsResult;
      }

      // stepPitch logs newest-first; hide them now and reveal oldest-first after the play lands on the field
      pitchLogEntries = this.gameState.playLog.filter((entry) => !logBeforePitch.has(entry)).reverse();
      pitchLogEntries.forEach((entry) => this.hiddenLogEntries.add(entry));

      if (physicsResult?.outcome === 'HOME_RUN') {
        this.scheduleHomeRunFireworks(physicsResult);
      }

      // Trigger authentic sound effects at plate arrival (~640ms into 720ms 5-stage windup)
      setTimeout(() => {
        if (pitchStep.outcome === 'IN_PLAY') {
          const pwr = (pitchStep.launchVector?.exitVelocityMph || 90) / 105;
          soundEngine.playBatCrack(pwr);
          if (physicsResult?.hitWall) {
            setTimeout(() => soundEngine.playWallCarom(), 650);
          }
          if (physicsResult?.outcome === 'HOME_RUN') {
            setTimeout(() => {
              soundEngine.playCrowdRoar(2.2, 0.35);
              soundEngine.playOrganCharge();
            }, 450);
          } else if (['SINGLE', 'DOUBLE', 'TRIPLE'].includes(physicsResult?.outcome)) {
            setTimeout(() => soundEngine.playCrowdRoar(1.4, 0.22), 400);
          }
        } else if (pitchStep.outcome === 'FOUL') {
          soundEngine.playBatCrack(0.5);
        } else {
          soundEngine.playMittPop();
        }
      }, 640);

      this.renderer.animatePlay(pitchStep, physicsResult, prePitchRenderState, () => {
        this.isAnimating = false;
        this.renderer.render(this.gameState);
        if (offSelect) offSelect.value = this.gameState.offensePlay;
        if (defSelect) defSelect.value = this.gameState.defensePlay;
        this.refreshAllUI();
        this.queueNarration(pitchLogEntries);
      });
    } catch (err) {
      console.error('Pitch execution error:', err);
      this.isAnimating = false;
      this.refreshAllUI();
      this.queueNarration(pitchLogEntries);
    }
  }

  /**
   * Reveals play-by-play entries after the field animation, one at a time.
   * Entries queue in order, so back-to-back pitches narrate in sequence.
   */
  queueNarration(entries) {
    if (!entries.length) return;
    this.narrationQueue.push(...entries);
    if (!this.narrationTimer) {
      this.narrationTimer = setTimeout(() => this.revealNextNarrationEntry(), NARRATION_DELAY_MS);
    }
  }

  revealNextNarrationEntry() {
    this.narrationTimer = null;
    const entry = this.narrationQueue.shift();
    if (!entry) return;
    this.hiddenLogEntries.delete(entry);
    this.renderPlayLog();
    if (this.narrationQueue.length) {
      this.narrationTimer = setTimeout(() => this.revealNextNarrationEntry(), NARRATION_STAGGER_MS);
    }
  }

  /** Reveals all queued narration at once. Headless sims and new games must not wait on it. */
  flushNarration() {
    clearTimeout(this.narrationTimer);
    this.narrationTimer = null;
    this.narrationQueue.forEach((entry) => this.hiddenLogEntries.delete(entry));
    this.narrationQueue = [];
  }

  /**
   * Starts the fireworks ~1 s after the ball clears the fence on the field tape.
   * The tape starts after pitch delivery and plays at 60 fps.
   */
  scheduleHomeRunFireworks(physicsResult) {
    const fenceFt = physicsResult.wallInfo?.distanceFt;
    const frames = physicsResult.frames || [];
    const clearIdx = fenceFt
      ? frames.findIndex((f) => f.ball && Math.hypot(f.ball.x, f.ball.y) >= fenceFt)
      : -1;
    const clearMs = PITCH_DELIVERY_MS + ((clearIdx >= 0 ? clearIdx : frames.length) / FIELD_FPS) * 1000;
    setTimeout(() => this.fireworks.play(), clearMs + HOME_RUN_FIREWORKS_DELAY_MS);
  }

  handleInstantReplay() {
    if (this.isAnimating || !this.renderer.lastPlayRecord) return;
    this.isAnimating = true;
    this.updateActionButtonsState();
    this.renderer.triggerInstantReplay(this.gameState, () => {
      this.isAnimating = false;
      this.refreshAllUI();
    });
  }

  handleHeadlessSim(mode) {
    if (this.isAnimating) return;
    if (this.gameState.isGameOver) {
      this.startNewGameFromSelectors();
      return;
    }
    const maxPitches = mode === 'FULL_GAME' ? 900 : mode === 'HALF_INNING' ? 120 : 20;
    this.flushNarration();
    const res = this.gameState.simulateHeadless({ mode, maxPitches });
    this.gameState.logPlay(
      `⚡ Headless Sim (${mode.replace('_', ' ')}): Simulated ${res.pitchesSimulated} pitches in ${res.elapsedMs} ms!`,
      'INFO'
    );
    soundEngine.playMittPop();
    this.refreshAllUI();
  }

  updateActionButtonsState() {
    const btnPitch = document.getElementById('btnThrowPitch');
    const btnReplay = document.getElementById('btnInstantReplay');
    if (btnPitch) {
      btnPitch.disabled = this.isAnimating;
      btnPitch.textContent = this.gameState.isGameOver
        ? '⚾ NEW BALLGAME'
        : this.isAnimating
        ? '⚾ PLAY IN PROGRESS...'
        : '⚾ THROW PITCH (SPACE)';
    }
    if (btnReplay) {
      btnReplay.disabled = this.isAnimating || !this.renderer.lastPlayRecord;
    }
  }

  refreshAllUI() {
    this.updateActionButtonsState();
    this.renderScoreboard();
    this.renderMatchupIndexCard();
    this.renderSubstitutionsBar();
    this.renderPhysicsTelemetry();
    this.renderPlayLog();
    this.updateEarlBannerPreview();
    this.renderBoxScoreTab();
    this.renderer.render(this.gameState);
  }

  renderScoreboard() {
    const gs = this.gameState;
    const maxInnings = Math.max(9, gs.lineScore.away.length, gs.lineScore.home.length);
    const headerRow = document.getElementById('sbInningHeaders');
    const awayRow = document.getElementById('sbAwayRow');
    const homeRow = document.getElementById('sbHomeRow');

    if (headerRow && awayRow && homeRow) {
      let hHtml = '<th class="team-col">CLUB (MGR)</th>';
      let aHtml = `<td class="team-col"><span class="team-dot" style="background:${gs.awayTeam.primaryColor}"></span>${gs.awayTeam.abbrev} <small style="color:var(--muted)">(${getLastName(gs.awayManager.name)})</small></td>`;
      let bHtml = `<td class="team-col"><span class="team-dot" style="background:${gs.homeTeam.primaryColor}"></span>${gs.homeTeam.abbrev} <small style="color:var(--muted)">(${getLastName(gs.homeManager.name)})</small></td>`;

      for (let i = 0; i < maxInnings; i++) {
        const isCurrent = !gs.isGameOver && gs.inning === i + 1;
        hHtml += `<th class="${isCurrent ? 'cur-inn' : ''}">${i + 1}</th>`;
        const aVal = gs.lineScore.away[i] ?? '';
        const hVal =
          i + 1 > gs.inning || (i + 1 === gs.inning && gs.half === 'TOP' && gs.lineScore.home[i] === 0)
            ? '·'
            : (gs.lineScore.home[i] ?? '');
        aHtml += `<td class="${isCurrent && gs.half === 'TOP' ? 'cur-cell' : ''}">${i + 1 <= gs.inning ? aVal : '·'}</td>`;
        bHtml += `<td class="${isCurrent && gs.half === 'BOTTOM' ? 'cur-cell' : ''}">${hVal}</td>`;
      }

      hHtml += '<th class="tot-col">R</th><th class="tot-col">H</th><th class="tot-col">E</th>';
      aHtml += `<td class="tot-col score-r">${gs.totals.away.R}</td><td class="tot-col">${gs.totals.away.H}</td><td class="tot-col">${gs.totals.away.E}</td>`;
      bHtml += `<td class="tot-col score-r">${gs.totals.home.R}</td><td class="tot-col">${gs.totals.home.H}</td><td class="tot-col">${gs.totals.home.E}</td>`;

      headerRow.innerHTML = hHtml;
      awayRow.innerHTML = aHtml;
      homeRow.innerHTML = bHtml;
    }

    // Status pills (Inning, Count, Outs, Bases)
    const innText = gs.isGameOver
      ? 'FINAL'
      : `${gs.half === 'TOP' ? '▲ TOP' : '▼ BOT'} ${gs.inning}`;
    const elInn = document.getElementById('hudInning');
    const elCount = document.getElementById('hudCount');
    const elOuts = document.getElementById('hudOuts');
    const elBaseNames = document.getElementById('hudBasesText');

    if (elInn) elInn.textContent = innText;
    if (elCount) elCount.textContent = `${gs.count.balls} - ${gs.count.strikes}`;
    if (elOuts) {
      elOuts.innerHTML = [0, 1, 2]
        .map((i) => `<span class="out-dot ${i < gs.outs ? 'on' : ''}"></span>`)
        .join('');
    }

    // Update SVG/CSS Base Diamond indicators
    ['base1B', 'base2B', 'base3B'].forEach((id, idx) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle('occupied', Boolean(gs.bases[idx]));
      }
    });

    if (elBaseNames) {
      const occ = [];
      if (gs.bases[0]) occ.push(`1B: ${getLastName(gs.bases[0].name)} (${gs.bases[0].ratings.runs})`);
      if (gs.bases[1]) occ.push(`2B: ${getLastName(gs.bases[1].name)} (${gs.bases[1].ratings.runs})`);
      if (gs.bases[2]) occ.push(`3B: ${getLastName(gs.bases[2].name)} (${gs.bases[2].ratings.runs})`);
      elBaseNames.textContent = occ.length ? occ.join(' | ') : 'BASES EMPTY';
    }
  }

  /**
   * Renders Earl Weaver's famous 3x5 L/R Platoon Matchup Index Card
   */
  renderMatchupIndexCard() {
    const gs = this.gameState;
    const batter = gs.currentBatter;
    const pitcher = gs.currentPitcher;
    if (!batter || !pitcher) return;

    const matchup = getEffectivePlatoonMatchup(batter, pitcher, pitcher.pitchCount || 0);
    const fmt = (v) => (Number(v) || 0).toFixed(3).replace(/^0/, '');

    const cardEl = document.getElementById('weaverIndexCard');
    if (!cardEl) return;

    const bTotal = batter.splits.T;
    const bVsL = batter.splits.L;
    const bVsR = batter.splits.R;
    const activeSplitKey = matchup.pitcherHand === 'L' ? 'L' : 'R';

    cardEl.innerHTML = `
      <div class="index-card-header">
        <div>
          <span class="card-tag">EARL'S 3x5 MATCHUP CARD</span>
          <h4>${batter.name} <small>(${batter.pos} · Bats ${batter.bats})</small></h4>
        </div>
        <span class="platoon-badge ${matchup.isPlatoonAdvantage ? 'adv' : 'same'}">
          ${matchup.effectiveBatterHand}HB vs ${matchup.pitcherHand}HP
          ${matchup.isPlatoonAdvantage ? '★ PLATOON EDGE' : 'SAME-SIDE'}
        </span>
      </div>

      <table class="splits-mini-table">
        <thead>
          <tr>
            <th>SPLIT</th>
            <th>BA</th>
            <th>OBA</th>
            <th>SA</th>
            <th>HR</th>
            <th>BB</th>
            <th>SO</th>
          </tr>
        </thead>
        <tbody>
          <tr class="${activeSplitKey === 'L' ? 'active-split-row' : ''}">
            <td>vs LHP ${activeSplitKey === 'L' ? '◀' : ''}</td>
            <td>${fmt(bVsL.BA)}</td>
            <td class="hi-oba">${fmt(bVsL.OBA)}</td>
            <td>${fmt(bVsL.SA)}</td>
            <td>${bVsL.HR}</td>
            <td>${bVsL.BB}</td>
            <td>${bVsL.SO}</td>
          </tr>
          <tr class="${activeSplitKey === 'R' ? 'active-split-row' : ''}">
            <td>vs RHP ${activeSplitKey === 'R' ? '◀' : ''}</td>
            <td>${fmt(bVsR.BA)}</td>
            <td class="hi-oba">${fmt(bVsR.OBA)}</td>
            <td>${fmt(bVsR.SA)}</td>
            <td>${bVsR.HR}</td>
            <td>${bVsR.BB}</td>
            <td>${bVsR.SO}</td>
          </tr>
          <tr class="total-split-row">
            <td>TOTAL</td>
            <td>${fmt(bTotal.BA)}</td>
            <td>${fmt(bTotal.OBA)}</td>
            <td>${fmt(bTotal.SA)}</td>
            <td>${bTotal.HR}</td>
            <td>${bTotal.BB}</td>
            <td>${bTotal.SO}</td>
          </tr>
        </tbody>
      </table>

      <div class="ratings-strip">
        <span>PWR <b>${batter.ratings.power}</b></span>
        <span>H&R <b>${batter.ratings.hitAndRun}</b></span>
        <span>BUNT <b>${batter.ratings.bunt}</b></span>
        <span>RUNS <b>${batter.ratings.runs}</b></span>
        <span>RNGE <b>${batter.ratings.range}</b></span>
        <span>ARM <b>${batter.ratings.arm}</b></span>
      </div>

      <div class="pitcher-card-strip">
        <div class="pitcher-card-top">
          <strong>🎯 PITCHING: ${pitcher.name} (${pitcher.throws}HP · ${pitcher.role})</strong>
          <span class="pitch-count-pill ${matchup.isPitcherTired ? 'tired' : ''}">
            ${pitcher.pitchCount || 0} / ${matchup.fatigueThreshold} Pitches ${matchup.isPitcherTired ? '⚠️ TIRED' : ''}
          </span>
        </div>
        <div class="ratings-strip">
          <span>ERA <b>${pitcher.splits.T.ERA.toFixed(2)}</b></span>
          <span>SPD <b>${pitcher.ratings.speed}</b></span>
          <span>CTRL <b>${pitcher.ratings.control}</b></span>
          <span>FATIGUE <b>${pitcher.ratings.fatigue}</b></span>
          <span>PROJ OBA <b>${fmt(matchup.combinedObp)}</b></span>
          <span>PROJ SLG <b>${fmt(matchup.combinedSlg)}</b></span>
        </div>
      </div>
    `;
  }

  renderSubstitutionsBar() {
    const gs = this.gameState;
    const bTeam = gs.battingTeam;
    const fTeam = gs.fieldingTeam;

    const benchSel = document.getElementById('selectPinchHitter');
    if (benchSel && bTeam.bench) {
      benchSel.innerHTML = bTeam.bench
        .map(
          (p, idx) =>
            `<option value="${idx}">${p.name} (${p.bats}HB · ${p.pos} · vsR ${p.splits.R.OBA.toFixed(3).replace(/^0/, '')} OBA / ${p.splits.T.HR} HR)</option>`
        )
        .join('');
    }

    const relSel = document.getElementById('selectReliever');
    if (relSel && fTeam.pitchers) {
      const curIdx = gs.activePitcherIndex[gs.fieldingSide] || 0;
      relSel.innerHTML = fTeam.pitchers
        .map(
          (p, idx) =>
            `<option value="${idx}" ${idx === curIdx ? 'selected' : ''}>${p.name} (${p.throws}HP · ${p.role} · ${p.splits.T.ERA.toFixed(2)} ERA · ${p.pitchCount || 0}P)</option>`
        )
        .join('');
    }
  }

  renderPhysicsTelemetry() {
    const el = document.getElementById('physicsTelemetryBox');
    if (!el) return;

    const park = this.gameState.park;
    if (!this.lastPhysicsTelemetry) {
      const lfWall = getWallAtAngle(park, -45);
      const cfWall = getWallAtAngle(park, 0);
      const rfWall = getWallAtAngle(park, 45);
      el.innerHTML = `
        <div class="phys-grid">
          <div><span class="lbl">STAGE 2 ENGINE</span><strong>3D Grav/Drag + Park Override</strong></div>
          <div><span class="lbl">LF POLE</span><strong>${lfWall.distanceFt} ft (${lfWall.heightFt} ft H)</strong></div>
          <div><span class="lbl">CENTER</span><strong>${cfWall.distanceFt} ft (${cfWall.heightFt} ft H)</strong></div>
          <div><span class="lbl">RF POLE</span><strong>${rfWall.distanceFt} ft (${rfWall.heightFt} ft H)</strong></div>
        </div>
      `;
      return;
    }

    const p = this.lastPhysicsTelemetry;
    const lv = p.launchVector || {};
    el.innerHTML = `
      <div class="phys-grid">
        <div><span class="lbl">EXIT VEL / LAUNCH</span><strong>${lv.exitVelocityMph || 90} mph @ ${lv.launchAngleDeg || 15}°</strong></div>
        <div><span class="lbl">SPRAY ANGLE</span><strong>${lv.sprayAngleDeg || 0}° (${lv.contactType || 'HIT'})</strong></div>
        <div><span class="lbl">3D FLIGHT DIST / ALT</span><strong>${p.distanceFt} ft (Peak Z: ${p.maxAltitudeFt} ft)</strong></div>
        <div><span class="lbl">WALL AT ANGLE</span><strong>${p.wallInfo?.distanceFt || 330} ft / ${p.wallInfo?.heightFt || 10} ft ${p.hitWall ? '💥 CAROM!' : ''}</strong></div>
      </div>
    `;
  }

  renderPlayLog() {
    const listEl = document.getElementById('playByPlayList');
    if (!listEl) return;
    listEl.innerHTML = this.gameState.playLog
      .filter((item) => !this.hiddenLogEntries.has(item))
      .slice(0, 35)
      .map(
        (item) => `
        <div class="log-entry log-${(item.type || 'PLAY').toLowerCase()}">
          <span class="log-meta">${item.half === 'TOP' ? '▲' : '▼'}${item.inning}</span>
          <span class="log-text">${item.text}</span>
        </div>
      `
      )
      .join('');
  }

  updateEarlBannerPreview() {
    const advice = askEarlAdvisor(this.gameState);
    const barEl = document.getElementById('earlLiveTicker');
    if (barEl) {
      barEl.innerHTML = `<strong>🧢 EARL SAYS:</strong> <span class="gold-hl">${advice.headline}</span> — ${advice.recommendation}`;
    }
  }

  openAskEarlModal() {
    const advice = askEarlAdvisor(this.gameState);
    const modal = document.getElementById('askEarlModal');
    const body = document.getElementById('askEarlModalBody');
    if (!modal || !body) return;

    const ms = advice.matchupSummary;
    const fmt = (v) => (Number(v) || 0).toFixed(3).replace(/^0/, '');

    body.innerHTML = `
      <div class="earl-headline-banner">${advice.headline}</div>
      <p class="earl-rec"><strong>Recommended Call:</strong> ${advice.recommendation}</p>
      <p class="earl-reasoning">${advice.reasoning}</p>
      <div class="earl-telemetry-chips">
        <span>Platoon: <b>${ms.batterHand}HB vs ${ms.pitcherHand}HP</b></span>
        <span>Proj AVG/OBA/SLG: <b>${fmt(ms.projectedAvg)} / ${fmt(ms.projectedObp)} / ${fmt(ms.projectedSlg)}</b></span>
        <span>Pitch Count: <b>${ms.pitcherPitchCount} / ${ms.fatigueThreshold}</b></span>
        <span>Pull Fence: <b>${ms.pullWallDistanceFt} ft (${ms.pullWallHeightFt} ft tall)</b></span>
      </div>
      <blockquote class="earl-quote-box">${advice.earlQuote}</blockquote>
    `;
    modal.classList.add('open');
  }

  /**
   * Renders the full Box Score & Lineup Cards tab (1987 Amiga post-game / in-game style)
   */
  renderBoxScoreTab() {
    const container = document.getElementById('boxScoreContainer');
    if (!container) return;

    const gs = this.gameState;
    const buildTeamBox = (team) => {
      // Each batting slot lists its starter, then any pinch-hitters (indented) so lifted players keep their line
      const slots = team.slotHistory || (team.starters || team.lineup.slice(0, 9)).map((p) => [p]);
      const rows = slots
        .flatMap((slot, idx) => slot.map((b, subIdx) => ({ b, idx, subIdx })))
        .map(({ b, idx, subIdx }) => {
          const st = b.gameStats || { AB: 0, R: 0, H: 0, d2B: 0, d3B: 0, HR: 0, RBI: 0, BB: 0, SO: 0, SB: 0 };
          return `
            <tr>
              <td>${subIdx === 0 ? idx + 1 : ''}</td>
              <td>${subIdx === 0 ? '' : '&nbsp;&nbsp;↳ <small>PH</small> '}<strong>${b.name}</strong> <small>(${b.bats})</small></td>
              <td>${b.pos}</td>
              <td>${st.AB}</td>
              <td>${st.R}</td>
              <td>${st.H}</td>
              <td>${st.d2B}</td>
              <td>${st.HR}</td>
              <td>${st.RBI}</td>
              <td>${st.BB}</td>
              <td>${st.SO}</td>
              <td>${st.SB}</td>
              <td>${b.splits.T.OBA.toFixed(3).replace(/^0/, '')}</td>
            </tr>
          `;
        })
        .join('');

      const pRows = team.pitchers
        .map((p) => {
          const pst = p.gameStats || { IP_OUTS: 0, H: 0, R: 0, ER: 0, BB: 0, SO: 0, HR: 0 };
          const ipFull = Math.floor(pst.IP_OUTS / 3);
          const ipRem = pst.IP_OUTS % 3;
          return `
            <tr>
              <td><strong>${p.name}</strong> (${p.throws}HP · ${p.role})</td>
              <td>${ipFull}.${ipRem}</td>
              <td>${pst.H}</td>
              <td>${pst.R}</td>
              <td>${pst.ER}</td>
              <td>${pst.BB}</td>
              <td>${pst.SO}</td>
              <td>${pst.HR}</td>
              <td>${p.pitchCount || 0}</td>
              <td>${p.splits.T.ERA.toFixed(2)}</td>
            </tr>
          `;
        })
        .join('');

      return `
        <div class="box-card">
          <h3>${team.city} ${team.name} — Batting & Pitching Box Score</h3>
          <table class="ewb-data-table">
            <thead>
              <tr><th>#</th><th>BATTER</th><th>POS</th><th>AB</th><th>R</th><th>H</th><th>2B</th><th>HR</th><th>RBI</th><th>BB</th><th>SO</th><th>SB</th><th>SEASON OBA</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <h4 style="margin:14px 0 6px;color:#f5b942;">Pitching Staff</h4>
          <table class="ewb-data-table">
            <thead>
              <tr><th>PITCHER</th><th>IP</th><th>H</th><th>R</th><th>ER</th><th>BB</th><th>SO</th><th>HR</th><th>PITCHES</th><th>SEASON ERA</th></tr>
            </thead>
            <tbody>${pRows}</tbody>
          </table>
        </div>
      `;
    };

    container.innerHTML = `<div class="box-grid-2col">${buildTeamBox(gs.awayTeam)}${buildTeamBox(gs.homeTeam)}</div>`;
  }

  /**
   * Initializes the 3 Commissioner's Disk Editors:
   * 1. Edit Parks (10 Fence Distances, 9 Fence Heights, Surface, Wind)
   * 2. Edit Managers (19 EWB Strategy Sliders)
   * 3. Edit Teams / Players (T/L/R Platoon Splits & 1–10 Ratings)
   */
  initCommissionerEditors() {
    this.renderParkEditor();
    this.renderManagerEditor();
    this.renderTeamEditor();
    this.renderStatsLab();
  }

  renderParkEditor() {
    const container = document.getElementById('parkEditorContainer');
    if (!container) return;

    const park = BALLPARKS[this.activeEditorParkId] || BALLPARKS.fenway;
    const distLabels = [
      'Left Pole (-45°)', 'Left 2 (-35°)', 'L-C 1 (-25°)', 'L-C 2 (-15°)', 'Center 1 (-5°)',
      'Center 2 (+5°)', 'R-C 1 (+15°)', 'R-C 2 (+25°)', 'Right 2 (+35°)', 'Right Pole (+45°)'
    ];
    const heightLabels = [
      'Left 1 (Line)', 'Left 2', 'Left 3 (Alley)',
      'Center 1', 'Center 2 (CF)', 'Center 3',
      'Right 1 (Alley)', 'Right 2', 'Right 3 (Line)'
    ];

    container.innerHTML = `
      <div class="comm-header-row">
        <div>
          <h3>🏟️ Commissioner's Disk — Edit Ballparks (10 Distances & 9 Wall Heights)</h3>
          <p class="muted-note">Matches the 1987/1988 Commissioner's Disk Park Editor (<code>research/images/ewb2_07.jpg</code>). Changes immediately alter Stage 2 3D home run & wall carom physics!</p>
        </div>
        <div class="comm-controls">
          <label>Select Park:
            <select id="commParkSelect" class="ewb-select">
              ${Object.values(BALLPARKS)
                .map((p) => `<option value="${p.id}" ${p.id === park.id ? 'selected' : ''}>${p.name} (${p.city})</option>`)
                .join('')}
            </select>
          </label>
          <button id="btnApplyParkToActiveGame" class="ewb-btn gold">Apply to Active Game</button>
        </div>
      </div>

      <div class="comm-meta-bar">
        <label>Surface:
          <select id="commParkSurface" class="ewb-select">
            <option value="Grass" ${park.surface === 'Grass' ? 'selected' : ''}>Natural Grass (Restitution 0.40)</option>
            <option value="Artificial Turf" ${park.surface === 'Artificial Turf' ? 'selected' : ''}>Artificial Turf (Fast Bounce 0.64)</option>
          </select>
        </label>
        <label>Environment:
          <select id="commParkEnv" class="ewb-select">
            <option value="Outdoor" ${park.environment === 'Outdoor' ? 'selected' : ''}>Outdoor</option>
            <option value="Indoor" ${park.environment === 'Indoor' ? 'selected' : ''}>Indoor Dome (No Wind)</option>
          </select>
        </label>
        <label>Wind Direction:
          <select id="commParkWindDir" class="ewb-select">
            ${['Left to Right', 'In from Center', 'Out to Center', 'Out to Left', 'Out to Right', 'None']
              .map((d) => `<option value="${d}" ${park.prevailingWind === d ? 'selected' : ''}>${d}</option>`)
              .join('')}
          </select>
        </label>
        <label>Avg Wind (MPH):
          <input type="number" id="commParkWindMph" class="ewb-input-num" min="0" max="28" value="${park.avgWindMph}" />
        </label>
      </div>

      <div class="park-editor-grid">
        <div class="box-card">
          <h4>10 Outfield Fence Distances (250 ft – 450 ft)</h4>
          <div class="sliders-list">
            ${park.fenceDistances
              .map(
                (d, i) => `
              <div class="slider-row">
                <span>${distLabels[i]}</span>
                <input type="range" min="270" max="445" value="${d}" data-dist-idx="${i}" class="park-dist-slider" />
                <strong id="distVal_${i}">${d} ft</strong>
              </div>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="box-card">
          <h4>9 Outfield Fence Heights (3 ft – 45 ft, e.g. 37-ft Green Monster)</h4>
          <div class="sliders-list">
            ${park.fenceHeights
              .map(
                (h, i) => `
              <div class="slider-row">
                <span>${heightLabels[i]}</span>
                <input type="range" min="3" max="45" value="${h}" data-height-idx="${i}" class="park-height-slider" />
                <strong id="heightVal_${i}">${h} ft</strong>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    document.getElementById('commParkSelect')?.addEventListener('change', (e) => {
      this.activeEditorParkId = e.target.value;
      this.renderParkEditor();
    });

    container.querySelectorAll('.park-dist-slider').forEach((sl) => {
      sl.addEventListener('input', (e) => {
        const idx = Number(e.target.getAttribute('data-dist-idx'));
        const val = Number(e.target.value);
        park.fenceDistances[idx] = val;
        const lbl = document.getElementById(`distVal_${idx}`);
        if (lbl) lbl.textContent = `${val} ft`;
      });
    });

    container.querySelectorAll('.park-height-slider').forEach((sl) => {
      sl.addEventListener('input', (e) => {
        const idx = Number(e.target.getAttribute('data-height-idx'));
        const val = Number(e.target.value);
        park.fenceHeights[idx] = val;
        const lbl = document.getElementById(`heightVal_${idx}`);
        if (lbl) lbl.textContent = `${val} ft`;
      });
    });

    document.getElementById('commParkSurface')?.addEventListener('change', (e) => {
      park.surface = e.target.value;
    });
    document.getElementById('commParkEnv')?.addEventListener('change', (e) => {
      park.environment = e.target.value;
    });
    document.getElementById('commParkWindDir')?.addEventListener('change', (e) => {
      park.prevailingWind = e.target.value;
    });
    document.getElementById('commParkWindMph')?.addEventListener('input', (e) => {
      park.avgWindMph = Number(e.target.value) || 0;
    });

    document.getElementById('btnApplyParkToActiveGame')?.addEventListener('click', () => {
      this.gameState.park = JSON.parse(JSON.stringify(park));
      const parkSel = document.getElementById('selectPark');
      if (parkSel) parkSel.value = park.id;
      this.gameState.logPlay(
        `🛠️ Commissioner's Disk applied custom dimensions for ${park.name} (LF Pole: ${park.fenceDistances[0]} ft / ${park.fenceHeights[0]} ft high).`,
        'INFO'
      );
      this.refreshAllUI();
    });
  }

  renderManagerEditor() {
    const container = document.getElementById('managerEditorContainer');
    if (!container) return;

    const mgr = MANAGERS[this.activeEditorManagerId] || MANAGERS.weaver;
    const sliderKeys = [
      ['steal2nd', 'Steal 2nd Base (1–10)'],
      ['steal3rd', 'Steal 3rd Base (1–10)'],
      ['doubleSteal', 'Double Steal (1–10)'],
      ['sacBunt', 'Sacrifice Bunt (Weaver = 1!)'],
      ['buntForHit', 'Bunt for Base Hit (1–10)'],
      ['squeezeBunt', 'Squeeze Bunt (1–10)'],
      ['hitAndRun', 'Traditional Hit & Run (1–10)'],
      ['runAndHit', "Earl's Run & Hit (1–10)"],
      ['pitchOut', 'Pitch Out Frequency (1–10)'],
      ['pitchAround', 'Pitch Around Slugger (1–10)'],
      ['intentionalWalk', 'Intentional Walk (1–10)'],
      ['chargeBunt', 'Charge the Bunt (1–10)'],
      ['guardLines', 'Guard the Foul Lines (1–10)'],
      ['infieldIn', 'Bring Infield In (1–10)'],
      ['runAggressively', 'Baserunning Aggression (1–10)'],
      ['pinchHitInning', 'Earliest Pinch-Hit Inning (1–9)'],
      ['relievePitcherAfter', 'Bullpen Hook Pitch Threshold (70–140)']
    ];

    container.innerHTML = `
      <div class="comm-header-row">
        <div>
          <h3>🧠 Commissioner's Disk — Edit Managers (19 EWB Strategy Parameters)</h3>
          <p class="muted-note">Matches the original "Edit Managers" screen (<code>research/images/ewb2_06.jpg</code>). Notice Earl Weaver's Sacrifice Bunt = 1 and Run & Hit = 9!</p>
        </div>
        <div class="comm-controls">
          <label>Manager Profile:
            <select id="commMgrSelect" class="ewb-select">
              ${Object.values(MANAGERS)
                .map((m) => `<option value="${m.id}" ${m.id === mgr.id ? 'selected' : ''}>${m.name} (${m.team})</option>`)
                .join('')}
            </select>
          </label>
        </div>
      </div>

      <div class="box-card" style="margin-bottom:16px;">
        <p style="margin:0 0 8px;"><strong>${mgr.name} (${mgr.team}):</strong> ${mgr.bio}</p>
        <blockquote class="earl-quote-box" style="margin:0;">"${mgr.quote}"</blockquote>
      </div>

      <div class="box-card">
        <div class="park-editor-grid">
          ${sliderKeys
            .map(([key, label]) => {
              const min = key === 'relievePitcherAfter' ? 70 : 1;
              const max = key === 'relievePitcherAfter' ? 145 : key === 'pinchHitInning' ? 9 : 10;
              return `
                <div class="slider-row">
                  <span>${label}</span>
                  <input type="range" min="${min}" max="${max}" value="${mgr[key]}" data-mgr-key="${key}" class="mgr-param-slider" />
                  <strong id="mgrVal_${key}">${mgr[key]}</strong>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;

    document.getElementById('commMgrSelect')?.addEventListener('change', (e) => {
      this.activeEditorManagerId = e.target.value;
      this.renderManagerEditor();
    });

    container.querySelectorAll('.mgr-param-slider').forEach((sl) => {
      sl.addEventListener('input', (e) => {
        const key = e.target.getAttribute('data-mgr-key');
        const val = Number(e.target.value);
        mgr[key] = val;
        const lbl = document.getElementById(`mgrVal_${key}`);
        if (lbl) lbl.textContent = String(val);
        // Sync if active in game
        if (this.gameState.awayManager.id === mgr.id) this.gameState.awayManager[key] = val;
        if (this.gameState.homeManager.id === mgr.id) this.gameState.homeManager[key] = val;
      });
    });
  }

  renderTeamEditor() {
    const container = document.getElementById('teamEditorContainer');
    if (!container) return;

    const baseTeam = TEAMS[this.activeEditorTeamId] || TEAMS.baltimore;
    const player = baseTeam.lineup[this.activeEditorPlayerIdx] || baseTeam.lineup[0];

    container.innerHTML = `
      <div class="comm-header-row">
        <div>
          <h3>📇 Commissioner's Disk — Edit Teams, L/R Splits & 1–10 Ratings</h3>
          <p class="muted-note">Matches the "Edit Teams" screen (<code>research/images/ewb2_08.jpg</code>). Stage 1 uses the L/R splits; Stage 2 uses RUNS, RNGE, and ARM in feet/sec!</p>
        </div>
        <div class="comm-controls">
          <label>Team:
            <select id="commTeamSelect" class="ewb-select">
              ${Object.values(TEAMS).map((t) => `<option value="${t.id}" ${this.activeEditorTeamId === t.id ? 'selected' : ''}>${t.city} ${t.name}</option>`).join('')}
            </select>
          </label>
          <label>Player:
            <select id="commPlayerSelect" class="ewb-select">
              ${baseTeam.lineup
                .map(
                  (p, i) =>
                    `<option value="${i}" ${i === this.activeEditorPlayerIdx ? 'selected' : ''}>${p.name} (${p.pos} · Bats ${p.bats})</option>`
                )
                .join('')}
            </select>
          </label>
        </div>
      </div>

      <div class="park-editor-grid">
        <div class="box-card">
          <h4>Historical Platoon Splits (${player.name})</h4>
          <table class="ewb-data-table">
            <thead>
              <tr><th>SPLIT</th><th>BA</th><th>OBA</th><th>SA (SLG)</th><th>HR</th><th>BB</th><th>SO</th></tr>
            </thead>
            <tbody>
              ${['T', 'L', 'R']
                .map(
                  (spKey) => `
                <tr>
                  <td><strong>${spKey === 'T' ? 'TOTAL' : spKey === 'L' ? 'vs LHP' : 'vs RHP'}</strong></td>
                  <td><input type="number" step="0.001" min="0.100" max="0.500" class="ewb-input-num split-edit" data-sp="${spKey}" data-field="BA" value="${player.splits[spKey].BA}" /></td>
                  <td><input type="number" step="0.001" min="0.150" max="0.600" class="ewb-input-num split-edit" data-sp="${spKey}" data-field="OBA" value="${player.splits[spKey].OBA}" /></td>
                  <td><input type="number" step="0.001" min="0.200" max="0.900" class="ewb-input-num split-edit" data-sp="${spKey}" data-field="SA" value="${player.splits[spKey].SA}" /></td>
                  <td><input type="number" step="1" min="0" max="75" class="ewb-input-num split-edit" data-sp="${spKey}" data-field="HR" value="${player.splits[spKey].HR}" /></td>
                  <td><input type="number" step="1" min="0" max="200" class="ewb-input-num split-edit" data-sp="${spKey}" data-field="BB" value="${player.splits[spKey].BB}" /></td>
                  <td><input type="number" step="1" min="0" max="250" class="ewb-input-num split-edit" data-sp="${spKey}" data-field="SO" value="${player.splits[spKey].SO}" /></td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>

        <div class="box-card">
          <h4>1–10 EWB Physical & Skill Ratings (${player.name})</h4>
          <div class="sliders-list">
            ${[
              ['power', 'POWER (Exit Velocity & Carry, 1–10)'],
              ['hitAndRun', 'H&R (Contact & Hit/Run Execution, 1–10)'],
              ['bunt', 'BUNT (Sacrifice & Drag Bunt Skill, 1–10)'],
              ['runs', 'RUNS (Sprint Speed: 23–29 ft/sec, 1–10)'],
              ['range', 'RNGE (Fielding Reaction & Reach, 1–10)'],
              ['arm', 'ARM (Throw Velocity: 112–150 ft/sec, 1–10)'],
              ['durability', 'DURABILITY (1–10)']
            ]
              .map(
                ([rKey, rLabel]) => `
              <div class="slider-row">
                <span>${rLabel}</span>
                <input type="range" min="1" max="10" value="${player.ratings[rKey]}" data-rating-key="${rKey}" class="player-rating-slider" />
                <strong id="pRating_${rKey}">${player.ratings[rKey]}</strong>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    document.getElementById('commTeamSelect')?.addEventListener('change', (e) => {
      this.activeEditorTeamId = e.target.value;
      this.activeEditorPlayerIdx = 0;
      this.renderTeamEditor();
    });

    document.getElementById('commPlayerSelect')?.addEventListener('change', (e) => {
      this.activeEditorPlayerIdx = Number(e.target.value) || 0;
      this.renderTeamEditor();
    });

    container.querySelectorAll('.split-edit').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const sp = e.target.getAttribute('data-sp');
        const field = e.target.getAttribute('data-field');
        const val = Number(e.target.value);
        if (!Number.isNaN(val)) {
          player.splits[sp][field] = val;
          // Also sync active game player if present
          const activeTeam =
            this.gameState.awayTeam.id === baseTeam.id ? this.gameState.awayTeam : this.gameState.homeTeam;
          const matchP = activeTeam.lineup.find((x) => x.id === player.id);
          if (matchP) matchP.splits[sp][field] = val;
          this.refreshAllUI();
        }
      });
    });

    container.querySelectorAll('.player-rating-slider').forEach((sl) => {
      sl.addEventListener('input', (e) => {
        const rKey = e.target.getAttribute('data-rating-key');
        const val = Number(e.target.value);
        player.ratings[rKey] = val;
        const lbl = document.getElementById(`pRating_${rKey}`);
        if (lbl) lbl.textContent = String(val);
        const activeTeam =
          this.gameState.awayTeam.id === baseTeam.id ? this.gameState.awayTeam : this.gameState.homeTeam;
        const matchP = activeTeam.lineup.find((x) => x.id === player.id);
        if (matchP) matchP.ratings[rKey] = val;
        this.refreshAllUI();
      });
    });
  }

  renderStatsLab(report = null) {
    const container = document.getElementById('statsLabContainer');
    if (!container) return;

    const renderTeamSummaryCard = (title, color, t) => `
      <div class="box-card" style="border-top:3px solid ${color};">
        <h4>${title} (${t.W}-${t.L}, ${t.runsPerGame} R/G)</h4>
        <table class="ewb-data-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>BA</th>
              <th>OBA</th>
              <th>SA</th>
              <th>BB%</th>
              <th>SO%</th>
              <th>2B / 162</th>
              <th>HR / 162</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>SIMULATED (${t.G}G)</strong></td>
              <td><strong>${t.sim.BA.toFixed(3)}</strong></td>
              <td><strong>${t.sim.OBA.toFixed(3)}</strong></td>
              <td><strong>${t.sim.SA.toFixed(3)}</strong></td>
              <td>${t.sim.BBPct.toFixed(1)}%</td>
              <td>${t.sim.SOPct.toFixed(1)}%</td>
              <td>${t.sim.d2BPer162}</td>
              <td><strong>${t.sim.HRPer162}</strong></td>
            </tr>
            <tr>
              <td>HISTORICAL TARGET</td>
              <td>${t.actual.BA.toFixed(3)}</td>
              <td>${t.actual.OBA.toFixed(3)}</td>
              <td>${t.actual.SA.toFixed(3)}</td>
              <td>${t.actual.BBPct.toFixed(1)}%</td>
              <td>${t.actual.SOPct.toFixed(1)}%</td>
              <td>${t.actual.d2BPer162}</td>
              <td>${t.actual.HRPer162}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = `
      <div class="comm-header-row">
        <div>
          <h3>📊 Statistical Engine Validation Lab (Stage 1 Platoon Matrix + Stage 2 3D Ballfield Physics)</h3>
          <p class="muted-note">
            Simulates full 9-inning seasons between the <strong>Baltimore Orioles</strong> and <strong>Boston Red Sox</strong>
            (alternating Fenway Park &amp; Memorial Stadium and rotating all 4 starting pitchers) and compares simulated
            BA / OBA / SA / 2B / HR / BB% / SO% against the historical game data in <code>src/data/rosters.js</code>.
          </p>
        </div>
        <div class="comm-controls">
          <button id="btnRunStats40" class="ewb-btn">⚡ Run 40 Games (~1s)</button>
          <button id="btnRunStats80" class="ewb-btn">⏩ Run 80 Games (~2s)</button>
          <button id="btnRunStats162" class="ewb-btn gold">🚀 Run Full 162-Game Season (~4s)</button>
        </div>
      </div>

      ${
        report
          ? `
        <div class="box-grid-2col" style="margin-bottom:16px;">
          ${renderTeamSummaryCard('Baltimore Orioles', '#f58220', report.teams.baltimore)}
          ${renderTeamSummaryCard('Boston Red Sox', '#bd3039', report.teams.boston)}
        </div>

        <div class="box-card">
          <h4>Player-by-Player Simulated vs. Historical Platoon-Weighted Benchmark (${report.numGames} Games — ${report.elapsedMs} ms)</h4>
          <div style="overflow-x:auto;">
            <table class="ewb-data-table">
              <thead>
                <tr>
                  <th style="text-align:left;">Player</th>
                  <th>Tm</th>
                  <th>Bats</th>
                  <th>AB</th>
                  <th>SIM BA / OBA / SA</th>
                  <th>HIST BA / OBA / SA</th>
                  <th>Diff (BA / OBA / SA)</th>
                  <th>SIM 2B / 3B / HR (per 600 AB)</th>
                  <th>HIST 2B / HR (per 600 AB)</th>
                </tr>
              </thead>
              <tbody>
                ${report.players
                  .map((p) => {
                    const fmtDiff = (d) => `${d >= 0 ? '+' : ''}${d.toFixed(3)}`;
                    return `
                    <tr>
                      <td style="text-align:left;"><strong>${p.name}</strong> <span style="color:var(--muted);">(${p.pos})</span></td>
                      <td>${p.teamId === 'baltimore' ? 'BAL' : 'BOS'}</td>
                      <td>${p.bats}</td>
                      <td>${p.AB}</td>
                      <td><strong>${p.sim.BA.toFixed(3)} / ${p.sim.OBA.toFixed(3)} / ${p.sim.SA.toFixed(3)}</strong></td>
                      <td>${p.actual.BA.toFixed(3)} / ${p.actual.OBA.toFixed(3)} / ${p.actual.SA.toFixed(3)}</td>
                      <td style="color:${Math.abs(p.diff.BA) <= 0.025 ? '#4ade80' : 'var(--gold)'};">
                        ${fmtDiff(p.diff.BA)} / ${fmtDiff(p.diff.OBA)} / ${fmtDiff(p.diff.SA)}
                      </td>
                      <td>${p.sim.d2B600} / ${p.sim.d3B600} / <strong>${p.sim.HR600}</strong></td>
                      <td>${p.actual.d2B600} / <strong>${p.actual.HR600}</strong></td>
                    </tr>
                  `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `
          : `
        <div class="box-card" style="text-align:center;padding:32px;">
          <p style="font-size:14px;color:var(--muted);margin-bottom:14px;">
            Click <strong>Run Full 162-Game Season</strong> (or 40 / 80 Games) above to execute ~96,000 pitches and ~9,600 3D ball-in-play physics trajectories and compare every player's simulated output against historical data.
          </p>
        </div>
      `
      }
    `;

    const bindRun = (btnId, nGames) => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.addEventListener('click', () => {
        btn.textContent = `⏳ Simulating ${nGames} Games...`;
        btn.disabled = true;
        setTimeout(() => {
          const res = runStatisticalValidation(nGames);
          this.renderStatsLab(res);
        }, 20);
      });
    };

    bindRun('btnRunStats40', 40);
    bindRun('btnRunStats80', 80);
    bindRun('btnRunStats162', 162);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.ewbApp = new EWBAppController();
});
