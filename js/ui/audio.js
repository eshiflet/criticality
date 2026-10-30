// Synthesised sound: counter clicks, the annunciator horn, the scram thunk, buzzers. Nothing is
// loaded; everything is made with WebAudio, and nothing plays until the player has interacted.

let ctx = null, master = null, hornNode = null;
export const sound = { enabled: true };

function ac() {
  if (!sound.enabled) return null;
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** A Geiger / BF₃ counter click. */
export function click(vol = 0.25) {
  const a = ac(); if (!a) return;
  const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = 'square'; o.frequency.setValueAtTime(2400 + Math.random() * 800, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.015);
}

/** Clicks for n counts spread over dt seconds (capped: above ~60/s it becomes a roar). */
export function clicks(n, dt) {
  const a = ac(); if (!a || n <= 0) return;
  const k = Math.min(n, 40);
  for (let i = 0; i < k; i++) setTimeout(() => click(0.18), Math.random() * dt * 1000);
}

/** Annunciator horn: on until acknowledged. */
export function horn(on, kind = 'horn') {
  const a = ac();
  if (!on) { if (hornNode) { hornNode.stop(); hornNode = null; } return; }
  if (!a || hornNode) return;
  const o1 = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
  o1.type = 'sawtooth'; o2.type = 'square';
  o1.frequency.value = kind === 'klaxon' ? 440 : 520; o2.frequency.value = kind === 'klaxon' ? 554 : 780;
  g.gain.value = 0.06;
  lfo.frequency.value = kind === 'klaxon' ? 1.5 : 2.2; lg.gain.value = 0.05; lfo.connect(lg).connect(g.gain);
  o1.connect(g); o2.connect(g); g.connect(master);
  o1.start(); o2.start(); lfo.start();
  hornNode = { stop() { [o1, o2, lfo].forEach((o) => o.stop()); g.disconnect(); } };
}

/** The deep thud of rods dropping / breakers opening. */
export function thunk() {
  const a = ac(); if (!a) return;
  const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.5);
  g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.75);
  noise(0.25, 0.4);
}

/** A burst of noise (steam, a rumble). */
export function noise(vol = 0.2, dur = 1) {
  const a = ac(); if (!a) return;
  const n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 600; s.buffer = b; g.gain.value = vol;
  s.connect(f).connect(g).connect(master); s.start();
}

/** Short beep (telegraph, UI). */
export function beep(freq = 880, dur = 0.12, vol = 0.15) {
  const a = ac(); if (!a) return;
  const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}

/** The telegraph bell: two dings. */
export function bell() { beep(1320, 0.25, 0.2); setTimeout(() => beep(1320, 0.3, 0.2), 180); }
