/**
 * Retro Sound Synthesizer (Teri Mason 1987 Amiga EWB Tribute)
 * Uses Web Audio API to synthesize:
 * - Bat crack (wooden transient + resonant body)
 * - Catcher's mitt pop (low-pass thump)
 * - Crowd roar / groan (bandpass filtered pink/white noise swell)
 * - Ballpark organ fanfare ("Charge!" / Home Run rally)
 * - Bundled umpire speech, ground bounces, and runner footsteps synchronized to playback
 * - Wall bang (metallic/wood thud when ball hits the Green Monster)
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.output = null;
    this.calls = {};
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.output = this.ctx.createGain();
        this.output.gain.value = this.enabled ? 1 : 0;
        this.output.connect(this.ctx.destination);
        // Bundled phonetic speech works offline, without installed browser voices.
        for (const call of ['strike', 'out']) {
          this.calls[call] = fetch(new URL(`./audio/umpire-${call}.wav`, import.meta.url))
            .then((res) => {
              if (!res.ok) throw new Error(`Umpire audio: ${res.status}`);
              return res.arrayBuffer();
            })
            .then((data) => this.ctx.decodeAudioData(data))
            .catch((err) => { console.warn('Could not load umpire call', err); return null; });
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    this.init();
    if (this.output) this.output.gain.value = this.enabled ? 1 : 0;
    return this.enabled;
  }

  async playUmpireCall(call) {
    if (!this.enabled) return;
    this.init();
    const buffer = await this.calls[call];
    if (!buffer || !this.enabled || !this.ctx) return;
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = 0.8;
    source.connect(gain);
    gain.connect(this.output);
    source.start();
  }

  /** Called at the visible bat contact or catcher's reception, never by a wall-clock timer. */
  playPitchResult(pitch, prePitchState) {
    const contact = pitch.outcome === 'IN_PLAY' || pitch.outcome === 'FOUL';
    if (contact) this.playBatCrack(pitch.outcome === 'FOUL' ? 0.5 : (pitch.launchVector?.exitVelocityMph || 90) / 105);
    else if (['BALL', 'CALLED_STRIKE', 'SWINGING_STRIKE', 'WILD_PITCH'].includes(pitch.outcome)) this.playMittPop();

    if (['CALLED_STRIKE', 'SWINGING_STRIKE'].includes(pitch.outcome)) {
      this.playUmpireCall(prePitchState.count.strikes === 2 ? 'out' : 'strike');
    } else if (pitch.outcome === 'FOUL' && prePitchState.count.strikes === 2 &&
        ['SACRIFICE_BUNT', 'BUNT_FOR_HIT', 'SQUEEZE_BUNT'].includes(prePitchState.offensePlay)) {
      this.playUmpireCall('out');
    }
  }

  /** Per-play state belongs to the renderer so replays restart every sound cue. */
  playFieldFrame(frame, result, state) {
    const previous = state.previous;
    if (previous === frame) return;
    const ball = frame.ball;
    if (ball?.bounceCount > (previous?.ball?.bounceCount || 0)) {
      this.playGroundBounce(Math.min(1, Math.abs(previous?.ball?.vz || ball.vz || 10) / 45));
    }
    // The flash spans several frames; only its leading edge makes a bang.
    if (frame.wallHitFlash && !previous?.wallHitFlash) this.playWallCarom();

    const moving = (frame.runners || []).filter((r) => r.isMoving && !r.isSliding);
    if (moving.length && frame.t >= state.nextStep) {
      this.playFootstep(Math.min(3, moving.length));
      state.nextStep = frame.t + 0.21;
    }

    const plan = result.runnerPlan;
    if (plan) {
      [plan.batter, ...plan.runners].forEach((runner, index) => {
        if (runner.out && frame.t >= (runner.outTime ?? runner.endTime) && !state.outs.has(index)) {
          state.outs.add(index);
          this.playUmpireCall('out');
        }
      });
    } else if (frame.umpireCall?.call === 'OUT' && previous?.umpireCall?.call !== 'OUT') {
      this.playUmpireCall('out');
    }
    // Celebrate a home run once it clears the fence, or a hit once it is fielded.
    const homeRun = result.outcome === 'HOME_RUN';
    const celebrate = homeRun
      ? Math.hypot(ball?.x || 0, ball?.y || 0) >= (result.wallInfo?.distanceFt || Infinity)
      : ['SINGLE', 'DOUBLE', 'TRIPLE'].includes(result.outcome) && Object.values(frame.fielders || {}).some((f) => f.hasBall);
    if (celebrate && !state.celebrated) {
      state.celebrated = true;
      this.playCrowdRoar(homeRun ? 2.2 : 1.4, homeRun ? 0.35 : 0.22);
      if (homeRun) this.playOrganCharge();
    }
    state.previous = frame;
  }

  /** Short leather-on-earth thud plus dirt grit, distinct from the sharper wood crack. */
  playGroundBounce(strength = 0.6) {
    this.playImpact(180, 0.065, 0.10 + 0.16 * strength, 850);
  }

  playFootstep(runners = 1) {
    this.playImpact(95, 0.045, 0.045 + runners * 0.018, 1800);
  }

  playImpact(frequency, duration, volume, cutoff) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * duration), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-6 * i / data.length);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    source.start(now);
    const body = this.ctx.createOscillator();
    body.frequency.setValueAtTime(frequency, now);
    body.frequency.exponentialRampToValueAtTime(45, now + duration);
    body.connect(gain);
    body.start(now);
    body.stop(now + duration);
  }

  playPitchWhoosh() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.16);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.output);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playMittPop() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.09);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.output);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** Short square-wave "pop" for each firework burst. */
  playFireworkPop() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.18);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.output);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playBatCrack(powerRatio = 0.8) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // 1. Sharp ash-wood transient noise burst
    const bufferSize = this.ctx.sampleRate * 0.06;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.18));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(700 + powerRatio * 250, now);
    filter.Q.setValueAtTime(0.7, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.45 * Math.max(0.5, powerRatio), now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    noise.start(now);

    // 2. Wood knock resonance
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.055);
    oscGain.gain.setValueAtTime(0.3, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(oscGain);
    oscGain.connect(this.output);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playWallCarom() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    // Tin/wood hollow Green Monster bang
    osc.type = 'square';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.18);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.output);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  playCrowdRoar(duration = 1.6, intensity = 0.25) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.950 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2) * 0.35;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(750, now);
    filter.Q.setValueAtTime(0.9, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(intensity, now + duration * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.005, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    source.start(now);
  }

  playOrganCharge() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    // Classic ballpark organ "da-da-da-DA-da-DA!"
    const notes = [
      { f: 261.63, d: 0.11, t: 0.00 }, // C4
      { f: 329.63, d: 0.11, t: 0.12 }, // E4
      { f: 392.00, d: 0.11, t: 0.24 }, // G4
      { f: 523.25, d: 0.22, t: 0.36 }, // C5
      { f: 392.00, d: 0.12, t: 0.60 }, // G4
      { f: 523.25, d: 0.42, t: 0.74 }  // C5
    ];

    const now = this.ctx.currentTime;
    for (const n of notes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.f, now + n.t);

      gain.gain.setValueAtTime(0.08, now + n.t);
      gain.gain.exponentialRampToValueAtTime(0.005, now + n.t + n.d);

      osc.connect(gain);
      gain.connect(this.output);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d + 0.01);
    }
  }
}

export const soundEngine = new SoundEngine();
