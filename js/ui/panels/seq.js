// Sequoyah Unit 1: a Westinghouse four-loop main control board in sage green, with cream
// edgewise meters, red LED readouts, the rod control lever and bank step counters.

import { h, gauge, edgewise, digital, lamp, button, lever, knob, selector, annunciators, section, toggle } from '../widgets.js';
import * as audio from '../audio.js';
import { TRIPS } from '../../models/sequoyah.js';

export function buildSeq(root, m, g) {
  const P = m.plant, c = P.ctl;
  const ann = annunciators([
    ['rx', 'REACTOR\nTRIP', 'trip'], ['turb', 'TURBINE\nTRIP', 'trip'], ['sr', 'SR HIGH\nFLUX', 'alarm'], ['ir', 'IR HIGH\nFLUX', 'alarm'], ['prLow', 'PR HI FLUX\nLOW SP', 'alarm'], ['prHigh', 'PR HI FLUX\nHIGH SP', 'alarm'],
    ['prRate', 'PR HIGH\nPOS RATE', 'alarm'], ['otdt', 'OVERTEMP\nΔT', 'alarm'], ['pzrHigh', 'PZR PRESS\nHIGH', 'alarm'], ['pzrLow', 'PZR PRESS\nLOW', 'alarm'], ['flow', 'RCS LOOP\nFLOW LOW', 'alarm'], ['tavg', 'TAVG–TREF\nDEVIATION', 'alarm'],
    ['P6', 'P-6\nIR ABOVE', 'status'], ['P10', 'P-10\nNIS ABOVE', 'status'], ['P7', 'P-7\nAT POWER', 'status'], ['C5', 'C-5\nTURB ≥15%', 'status'], ['auto', 'RODS IN\nAUTO', 'status'], ['dil', 'BORON\nDILUTION', 'status'],
  ], { cols: 6, onHorn: (on) => audio.horn(on) });
  const firstOut = h('div', { class: 'firstout' }, '');
  // Nuclear instruments.
  const sr = gauge({ label: 'Source range', unit: 'cps', min: 1, max: 1e6, log: true, size: 120 });
  const ir = gauge({ label: 'Intermediate range', unit: 'amps', min: 1e-11, max: 1e-3, log: true, size: 120 });
  const pr = gauge({ label: 'Power range', unit: '%', min: 0, max: 120, ticks: [0, 20, 40, 60, 80, 100, 120], size: 120, zones: [{ from: 109, to: 120, color: '#c33' }] });
  const sur = gauge({ label: 'Startup rate', unit: 'DPM', min: -1, max: 5, ticks: [-1, 0, 1, 2, 3, 4, 5], size: 110, digits: 2 });
  const srBlk = button({ label: 'SR trip block', color: 'white', onPress: () => { if (P.P6 || c.srBlock) c.srBlock = !c.srBlock; } });
  const prBlk = button({ label: 'IR / PR low block', color: 'white', onPress: () => { if (P.P10 || c.prBlock) c.prBlock = !c.prBlock; } });
  // Rods.
  const rodLever = lever({ label: 'Rod motion', up: 'OUT', down: 'IN', onChange: (v) => { c.lever = v; } });
  const rodMode = selector({ label: 'Rod control', positions: [['man', 'MAN'], ['auto', 'AUTO']], value: c.rodMode, onChange: (v) => { c.rodMode = v; } });
  const banks = ['SA', 'SB', 'SC', 'SD', 'A', 'B', 'C', 'D'].map((b) => digital({ label: `Bank ${b}`, style: 'led', width: 3 }));
  // RCS.
  const tavg = edgewise({ label: 'T avg', unit: '°F', min: 540, max: 600, ticks: [540, 555, 570, 585, 600], digits: 1 });
  const thot = edgewise({ label: 'T hot', unit: '°F', min: 540, max: 640, ticks: [540, 565, 590, 615, 640] });
  const tcold = edgewise({ label: 'T cold', unit: '°F', min: 520, max: 580, ticks: [520, 535, 550, 565, 580] });
  const ppzr = edgewise({ label: 'PZR pressure', unit: 'psig', min: 1700, max: 2500, ticks: [1700, 1900, 2100, 2300, 2500] });
  const lpzr = edgewise({ label: 'PZR level', unit: '%', min: 0, max: 100, ticks: [0, 25, 50, 75, 100] });
  const pumps = ['1', '2', '3', '4'].map((n, i) => toggle({ label: `RCP ${n}`, off: 'STOP', on: 'RUN', value: c.pumps[i], onChange: (v) => { c.pumps[i] = v; } }));
  // Boron.
  const makeup = selector({ label: 'Makeup mode', positions: [['borate', 'BORATE'], ['off', 'AUTO'], ['dilute', 'DILUTE']], value: c.makeup, onChange: (v) => { c.makeup = v; } });
  const gpm = knob({ label: 'Makeup flow', min: 10, max: 150, step: 5, value: c.gpm, fmt: (v) => `${v} gpm`, onChange: (v) => { c.gpm = v; } });
  const boron = digital({ label: 'RCS boron', style: 'led', width: 5, unit: 'ppm' });
  // Steam and turbine.
  const steam = gauge({ label: 'Steam header', unit: 'psig', min: 0, max: 1300, ticks: [0, 300, 600, 900, 1200], size: 110 });
  const sgl = edgewise({ label: 'SG level (NR)', unit: '%', min: 0, max: 100, ticks: [0, 25, 50, 75, 100] });
  const latch = button({ label: 'Turbine latch', color: 'white', onPress: () => { const e = P.latchTurbine(); if (e) g.say('log', e); } });
  const ttrip = button({ label: 'Turbine trip', color: 'red', guarded: true, onPress: () => { P.tripTurbine(true); audio.thunk(); } });
  const loadSet = knob({ label: 'Load setpoint', min: 0, max: 100, step: 1, value: c.loadSet, fmt: (v) => `${v}%`, onChange: (v) => { c.loadSet = v; } });
  const loadRate = knob({ label: 'Load rate', min: 1, max: 10, step: 1, value: c.loadRate, fmt: (v) => `${v}%/min`, onChange: (v) => { c.loadRate = v; } });
  const mwe = digital({ label: 'Generator', style: 'led', width: 5, unit: 'MWe' });
  const gen = lamp({ label: 'Generator breaker', color: 'red' });
  const rtrip = button({ label: 'Reactor trip', color: 'red', big: true, guarded: true, onPress: () => { P.tripReactor('manual'); audio.thunk(); } });
  const reset = button({ label: 'Trip reset', color: 'white', onPress: () => { const e = P.resetTrip(); if (e) g.say('log', e); } });

  root.append(
    h('div', { class: 'row' }, section('Annunciators', ann.el, firstOut)),
    h('div', { class: 'row' },
      section('Nuclear instrumentation', sr.el, ir.el, pr.el, sur.el, h('div', { class: 'sub-col' }, srBlk.el, prBlk.el)),
      section('Rod control', rodLever.el, rodMode.el, h('div', { class: 'bank-grid' }, ...banks.map((b) => b.el)))),
    h('div', { class: 'row' },
      section('Reactor coolant system', tavg.el, thot.el, tcold.el, ppzr.el, lpzr.el, ...pumps.map((p) => p.el)),
      section('Chemical & volume control', makeup.el, gpm.el, boron.el)),
    h('div', { class: 'row' },
      section('Steam & turbine-generator', steam.el, sgl.el, latch.el, ttrip.el, loadSet.el, loadRate.el, mwe.el, gen.el),
      section('Reactor protection', rtrip.el, reset.el)));

  return {
    update() {
      const active = new Set(P.signals);
      if (P.trip.latched) active.add('rx');
      if (!c.latched) active.add('turb');
      if (P.P6) active.add('P6'); if (P.P10) active.add('P10'); if (P.P7) active.add('P7'); if (P.C5) active.add('C5');
      if (c.rodMode === 'auto') active.add('auto');
      if (c.makeup === 'dilute') active.add('dil');
      if (P.hot && Math.abs(P.Tavg - P.Tref) > 3 && P.load > 0.05) active.add('tavg');
      ann.update(active);
      firstOut.textContent = P.trip.latched ? `FIRST OUT: ${(TRIPS[P.trip.firstOut] ?? P.trip.firstOut).toUpperCase()}` : '';
      sr.set(Math.max(1, P.srCps), P.srCps ? `${P.srCps.toExponential(1)}` : 'OFF');
      ir.set(P.irAmps, P.irAmps.toExponential(1));
      pr.set(m.frac * 100, `${(m.frac * 100).toFixed(1)}%`);
      sur.set(P.sur, P.sur.toFixed(2));
      srBlk.set(c.srBlock); prBlk.set(c.prBlock);
      m.bankSteps.forEach((s, i) => banks[i].set(String(Math.round(s)).padStart(3, '0')));
      tavg.set(P.Tavg); tavg.setpoint(P.Tref);
      thot.set(P.Thot); tcold.set(P.Tcold); ppzr.set(P.Ppzr); lpzr.set(P.pzrLevel); lpzr.setpoint(P.pzrLevelProgram);
      boron.set(P.boron.toFixed(0));
      steam.set(P.steamPsig); sgl.set(P.sgLevel);
      mwe.set(P.MWe.toFixed(0)); gen.set(c.latched && P.load > 0.005);
      pumps.forEach((t, i) => t.set(c.pumps[i]));
      rodMode.set(c.rodMode); makeup.set(c.makeup); loadSet.set(c.loadSet);
    },
    destroy() { audio.horn(false); },
  };
}
