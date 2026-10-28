/** Playback sound regressions. Run with: node bin/check_sounds.mjs */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { soundEngine } from '../src/ui/soundEngine.js';

const engine = new soundEngine.constructor();
const events = [];
for (const name of ['playBatCrack', 'playMittPop', 'playUmpireCall', 'playGroundBounce',
  'playFootstep', 'playWallCarom', 'playCrowdRoar', 'playOrganCharge']) {
  engine[name] = (...args) => events.push([name, ...args]);
}
engine.playPitchResult({ outcome: 'CALLED_STRIKE' }, { count: { strikes: 0 } });
engine.playPitchResult({ outcome: 'SWINGING_STRIKE' }, { count: { strikes: 2 } });
engine.playPitchResult({ outcome: 'IN_PLAY', launchVector: { exitVelocityMph: 105 } }, { count: { strikes: 0 } });
assert.deepEqual(events, [['playMittPop'], ['playUmpireCall', 'strike'],
  ['playMittPop'], ['playUmpireCall', 'out'], ['playBatCrack', 1]]);
engine.playPitchResult({ outcome: 'FOUL' }, { count: { strikes: 2 }, offensePlay: 'SACRIFICE_BUNT' });
assert.deepEqual(events.at(-1), ['playUmpireCall', 'out']);

const newState = () => ({ previous: null, nextStep: 0, outs: new Set(), celebrated: false });
const result = { outcome: 'DOUBLE_PLAY', runnerPlan: {
  batter: { out: true, outTime: 1.8 }, runners: [{ out: true, outTime: 1.1 }]
} };
for (let replay = 0; replay < 2; replay++) {
  events.length = 0;
  const state = newState();
  for (const t of [0, 0.1, 0.25, 0.4, 1.1, 1.3, 1.8, 2]) {
    const frame = { t, ball: { bounceCount: t >= 0.25 ? 1 : 0, vz: t < 0.25 ? -25 : 10 },
      runners: [{ isMoving: t < 1, isSliding: t >= 0.4 }], wallHitFlash: t >= 1.1 && t <= 1.3 };
    engine.playFieldFrame(frame, result, state);
    engine.playFieldFrame(frame, result, state); // 120 Hz screen repeats a 60 Hz tape frame
  }
  const count = (name) => events.filter(([event]) => event === name).length;
  assert.equal(count('playGroundBounce'), 1);
  assert.equal(count('playWallCarom'), 1);
  assert.equal(count('playUmpireCall'), 2);
  assert.equal(count('playFootstep'), 2); // held and sliding runners are silent
}
// A sac fly's throw home may say SAFE, but the catch still records an out.
events.length = 0;
engine.playFieldFrame({ t: 2, umpireCall: { call: 'SAFE' } }, {
  outcome: 'SAC_FLY', runnerPlan: { batter: { out: true, outTime: 1.5 }, runners: [] }
}, newState());
assert.deepEqual(events, [['playUmpireCall', 'out']]);

// Exercise the actual synthesis methods with an AudioContext test double.
const connections = [];
let starts = 0;
const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
const node = () => ({ gain: param(), frequency: param(), Q: param(),
  connect(target) { connections.push(target); }, start() { starts++; }, stop() {} });
const context = { state: 'running', sampleRate: 22050, currentTime: 0, destination: {},
  createGain: node, createOscillator: node, createBiquadFilter: node, createBufferSource: node,
  createBuffer: (_, size) => ({ getChannelData: () => new Float32Array(size) }) };
const synth = new soundEngine.constructor();
synth.ctx = context;
synth.output = node();
synth.playBatCrack();
synth.playGroundBounce();
synth.playFootstep();
assert.equal(starts, 6);
assert(!connections.includes(context.destination), 'All effects must route through master mute');
synth.calls.out = Promise.resolve({});
await synth.playUmpireCall('out');
assert.equal(starts, 7);
assert.equal(synth.toggle(), false);
assert.equal(synth.output.gain.value, 0);
synth.playBatCrack();
synth.playGroundBounce();
synth.playFootstep();
await synth.playUmpireCall('out');
assert.equal(starts, 7, 'Muted effects must not start');
assert.equal(synth.toggle(), true);
assert.equal(synth.output.gain.value, 1);
for (const call of ['strike', 'out']) {
  const wav = await readFile(new URL(`../src/ui/audio/umpire-${call}.wav`, import.meta.url));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert(wav.length > 10000);
}
console.log('PASS: pitch/contact cues, bounces, running/sliding, double plays, sac flies, replay, mute, and bundled WAVs');
