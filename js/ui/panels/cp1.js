// CP-1's instruments, 2 December 1942: a BF₃ counter with a scaler and loudspeaker, an
// ionization chamber read on a galvanometer and on a Brown pen recorder (range switched by hand),
// the control rod Weil pulled by hand, the motor-driven automatic safety rod, the ZIP rod on its
// rope, and the cadmium-solution buckets. Plus Fermi's notebook: 1/M against rod position.

import { h, gauge, digital, lamp, button, lever, knob, stripChart, section, toggle } from '../widgets.js';
import * as audio from '../audio.js';

export function buildCP1(root, m, g) {
  const c = m.ctl;
  // Counters.
  const scaler = digital({ label: 'BF₃ scaler · counts', style: 'nixie', width: 8 });
  const rate = gauge({ label: 'Count rate', unit: 'counts/s', min: 1, max: 1e5, log: true, size: 140 });
  const galvo = gauge({ label: 'Ion chamber (galvanometer)', unit: '% of range', min: 0, max: 100, size: 140, sweep: 100, ticks: [0, 25, 50, 75, 100] });
  const watts = digital({ label: 'Pile power (Fermi’s estimate)', style: 'nixie', width: 9, unit: 'W' });
  const dose = digital({ label: 'Balcony dose rate', style: 'nixie', width: 7, unit: 'mrem/h' });
  const recorder = stripChart({ label: 'Brown pen recorder · ion chamber', pens: [{ name: 'pen', color: '#1c3fae', min: 0, max: 1.05 }], window: 900, width: 360, height: 150 });
  const rangeLbl = (r) => `${(0.01 * 10 ** r).toPrecision(1)} W`;
  const range = knob({ label: 'Recorder range (full scale)', min: 0, max: 5, step: 1, value: c.range, fmt: rangeLbl, onChange: (v) => { c.range = v; } });
  // Rods.
  const ctlPos = digital({ label: 'Control rod · ft out', style: 'nixie', width: 5 });
  const ctlLever = lever({ label: 'Control rod (Weil)', up: 'PULL', down: 'PUSH', onChange: (v) => { held = v; } });
  let held = 0;
  const step = (d) => { c.control = Math.max(0, Math.min(m.spec.rodLength, Math.round((c.control + d) * 2) / 2)); };
  const ctlBtns = h('div', { class: 'cp1-steps' },
    h('button', { class: 'pb small', onclick: () => step(-0.5) }, '− 6 in'), h('button', { class: 'pb small', onclick: () => step(0.5) }, '+ 6 in'));
  const tape = h('div', { class: 'tape' }, h('div', { class: 'tape-in' }), ...Array.from({ length: 15 }, (_, i) => h('span', { style: { left: `${(i / 14) * 100}%` } }, i)));
  const safLamp = lamp({ label: 'Solenoid holding', color: 'green' });
  const safPos = digital({ label: 'Safety rod · % out', style: 'nixie', width: 4 });
  const safUp = toggle({ label: 'Safety rod motor', off: 'DOWN', on: 'UP', value: c.safetyUp, onChange: (v) => { c.safetyUp = v; } });
  const trip = knob({ label: 'Safety rod trip setting', min: 0.01, max: 100, step: 0.01, value: c.tripW, fmt: (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} W`, onChange: (v) => { c.tripW = v; } });
  trip.el.querySelector('svg').addEventListener('wheel', () => {}, { passive: true });
  const tripCoarse = h('div', { class: 'cp1-steps' }, ...[0.05, 0.5, 2, 10].map((w) => h('button', { class: 'pb small', onclick: () => { c.tripW = w; trip.set(w); } }, `${w} W`)));
  const reset = button({ label: 'Re-latch', color: 'white', onPress: () => { if (m.tripped) { m.resetSafety(); g.say('log', 'Safety rod solenoid re-latched. Wind it back up with the motor.'); } } });
  const zipPos = digital({ label: 'ZIP rod · % out', style: 'nixie', width: 4 });
  const zipPull = button({ label: 'Pull ZIP out & tie off', color: 'white', onPress: () => { if (!c.zipOut && !m.zipCut) { c.zipOut = true; g.say('log', 'ZIP rod pulled out against its weight and the rope tied to the balcony rail.'); } } });
  const axe = button({ label: 'Cut the rope (axe)', color: 'red', big: true, guarded: true, onPress: () => { if (c.zipOut) { m.zipCut = true; m.dropZip(); audio.thunk(); } } });
  const flood = button({ label: 'Liquid control: pour cadmium', color: 'red', guarded: true, onPress: () => { if (!c.cadmium) { c.cadmium = true; audio.noise(0.3, 2); g.flags.flooded = true; } } });
  // Fermi's notebook: 1/M against rod position.
  const nb = h('canvas', { width: 520, height: 300, style: { width: '260px', height: '150px' } });
  const pts = (g.flags.points ??= []);
  const record = button({ label: 'Record reading', color: 'white', onPress: () => {
    const settled = Math.abs(m.period) > 600 || m.period < 0;
    const x = +m.controlFt.toFixed(2), y = Math.min(1.2, m.refP ? m.refP / m.P : m.inverseM);
    if (!settled) { g.say('okafor', 'The counters are still climbing. Fermi waited for them to level off before he wrote a number down. Give it a minute.'); return; }
    if (m.rho() > 0) { g.say('okafor', 'It isn\'t levelling off. It never will: you\'re past critical. Nothing to record.'); return; }
    pts.push([x, y]); g.say('log', `Recorded: rod at ${x.toFixed(1)} ft, ${Math.round(m.cps)} counts/s, 1/M = ${y.toFixed(3)}.`);
  } });
  const predict = h('div', { class: 'note-card' }, 'Need two readings to extrapolate.');
  const flash = h('div', { class: 'cp1-flash' });

  root.append(
    h('div', { class: 'row' },
      section('Neutron counters', scaler.el, rate.el, galvo.el),
      section('Recorder', recorder.el, range.el),
      section('Readouts', watts.el, dose.el)),
    h('div', { class: 'row' },
      section('Control rod (hand)', h('div', { class: 'cp1-col' }, ctlPos.el, tape, ctlBtns), ctlLever.el),
      section('Automatic safety rod', safLamp.el, safPos.el, safUp.el, trip.el, h('div', { class: 'cp1-col' }, tripCoarse, reset.el)),
      section('ZIP rod & emergency', zipPos.el, zipPull.el, axe.el, flood.el)),
    h('div', { class: 'row' },
      section('Fermi’s notebook · 1/M against rod position', nb, h('div', { class: 'cp1-col' }, record.el, predict)), flash));

  let lastCounts = m.counts;
  const ctx = nb.getContext('2d');
  function drawNotebook() {
    const W = nb.width, H = nb.height;
    ctx.fillStyle = '#f4ecd2'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(40,80,160,0.25)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 14; i++) { const x = 40 + ((W - 60) * i) / 14; ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, H - 30); ctx.stroke(); }
    for (let j = 0; j <= 5; j++) { const y = 10 + ((H - 40) * j) / 5; ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 20, y); ctx.stroke(); }
    ctx.fillStyle = '#2a2a6a'; ctx.font = '20px IBM Plex Mono';
    for (let i = 0; i <= 14; i += 2) ctx.fillText(i, 34 + ((W - 60) * i) / 14, H - 8);
    ctx.fillText('1/M', 2, 22);
    const X = (ft) => 40 + ((W - 60) * ft) / 14, Y = (v) => H - 30 - (H - 40) * Math.min(1, v / 1.2);
    ctx.fillStyle = '#16204f';
    pts.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(X(x), Y(y), 6, 0, 7); ctx.fill(); });
    if (pts.length >= 2) {
      const [a, b] = pts.slice(-2);
      const slope = (b[1] - a[1]) / (b[0] - a[0]);
      if (slope < 0) {
        const xc = b[0] - b[1] / slope;
        g.flags.predicted = xc;
        ctx.strokeStyle = '#b8231a'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(X(xc), Y(0)); ctx.stroke(); ctx.setLineDash([]);
        predict.textContent = `Extrapolates to critical at ${xc.toFixed(1)} ft.`;
      }
    }
  }

  return {
    update(dtReal, paused) {
      if (held && !paused) c.control = Math.max(0, Math.min(m.spec.rodLength, c.control + held * dtReal * 0.5));
      const n = m.counts - lastCounts; lastCounts = m.counts;
      if (!paused && g.speed <= 2) audio.clicks(n, dtReal);
      scaler.set(String(Math.floor(m.counts)).padStart(8, '0'));
      rate.set(m.cps, `${Math.round(m.cps)}/s`);
      galvo.set(Math.min(105, 100 * m.pen), `${(100 * m.pen).toFixed(0)}%`);
      recorder.push(m.t, [m.pen]);
      recorder.draw(m.t);
      watts.set(m.P < 0.01 ? m.P.toExponential(1) : m.P.toFixed(m.P < 10 ? 2 : 0), m.P > 50);
      dose.set(m.doseRate.toFixed(m.doseRate < 10 ? 2 : 0), m.doseRate > 20);
      ctlPos.set(m.controlFt.toFixed(2));
      tape.firstChild.style.width = `${(m.controlFt / 14) * 100}%`;
      safLamp.set(m.safetyLatched);
      safPos.set((100 * m.rod.safety).toFixed(0));
      zipPos.set((100 * m.rod.zip).toFixed(0));
      safUp.set(c.safetyUp);
      flash.textContent = m.tripped ? 'SAFETY ROD DROPPED' : '';
      drawNotebook();
    },
  };
}
