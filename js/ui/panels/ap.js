// Vogtle 3: an AP1000 main control room. No benchboards: operators sit at workstations of flat
// screens with soft controls, under the wall panel information system (WPIS), a big overview
// display. Drawn here as dark screens with cyan graphics.

import { h, gauge, edgewise, digital, lamp, button, lever, knob, selector, annunciators, section, toggle, bar } from '../widgets.js';
import * as audio from '../audio.js';
import { apMimic } from '../mimics.js';
import { TRIPS, AP, PT } from '../../models/ap1000.js';

export function buildAP(root, m, g) {
  const P = m.plant, c = P.ctl;
  const ann = annunciators([
    ['rx', 'REACTOR\nTRIP', 'trip'], ['turb', 'TURBINE\nTRIP', 'trip'], ['sr', 'SR HIGH\nFLUX', 'alarm'], ['prRate', 'PR HIGH\nPOS RATE', 'alarm'], ['ptHi', 'P/T LIMIT\nEXCEEDED', 'alarm'], ['ptLo', 'SUBCOOLING\nLOW', 'alarm'],
    ['rate', 'HEATUP RATE\n>100 °F/h', 'alarm'], ['rnsLift', 'RNS RELIEF\nLIFTED', 'alarm'], ['sgLow', 'SG LEVEL\nLOW', 'alarm'], ['sgHigh', 'SG LEVEL\nHIGH', 'alarm'], ['fw', 'FW REG VALVE\nDEVIATION', 'alarm'], ['prhr', 'PRHR\nACTUATED', 'trip'],
    ['P6', 'P-6\nIR ABOVE', 'status'], ['P10', 'P-10\nNIS ABOVE', 'status'], ['C5', 'C-5\nTURB ≥15%', 'status'], ['auto', 'RODS IN\nAUTO', 'status'], ['dil', 'BORON\nDILUTION', 'status'], ['rns', 'RNS IN\nSERVICE', 'status'],
  ], { cols: 6, onHorn: (on) => audio.horn(on) });
  const firstOut = h('div', { class: 'firstout' }, '');
  const mim = apMimic(m);

  // Nuclear instruments and the reactivity computer.
  const sr = gauge({ label: 'Source range', unit: 'cps', min: 1, max: 1e6, log: true, size: 112 });
  const ir = gauge({ label: 'Intermediate range', unit: 'amps', min: 1e-11, max: 1e-3, log: true, size: 112 });
  const pr = gauge({ label: 'Power range', unit: '%', min: 0, max: 120, ticks: [0, 20, 40, 60, 80, 100, 120], size: 112 });
  const sur = gauge({ label: 'Startup rate', unit: 'DPM', min: -1, max: 5, ticks: [-1, 0, 1, 2, 3, 4, 5], size: 104, digits: 2 });
  const rc = digital({ label: 'Reactivity computer', style: 'vfd', width: 6, unit: 'pcm' });
  const itcOut = h('div', { class: 'note-card small' }, `ITC: predicted ${AP.predictedITC.toFixed(1)} pcm/°F · not measured`);
  const mark = button({ label: 'ITC: mark', color: 'white', title: 'Mark reactivity and Tavg; mark again after moving Tavg 3 °F or more', onPress: () => markITC() });
  const srBlk = button({ label: 'SR trip block', color: 'white', onPress: () => { if (P.P6 || c.srBlock) c.srBlock = !c.srBlock; } });
  const prBlk = button({ label: 'IR / PR low block', color: 'white', onPress: () => { if (P.P10 || c.prBlock) c.prBlock = !c.prBlock; } });
  // Rods.
  const rodLever = lever({ label: 'M banks', up: 'OUT', down: 'IN', onChange: (v) => { c.lever = v; } });
  const rodMode = selector({ label: 'Rod control', positions: [['man', 'MAN'], ['auto', 'AUTO']], value: c.rodMode, onChange: (v) => { c.rodMode = v; } });
  const sdSw = toggle({ label: 'Shutdown banks', off: 'INSERT', on: 'WITHDRAW', value: m.sdDemand, onChange: (v) => { m.sdDemand = v; } });
  const banks = ['SD1', 'SD2', 'SD3', 'SD4', 'MA', 'MB', 'MC', 'MD', 'AO'].map((b) => digital({ label: b, style: 'vfd', width: 3 }));
  // RCS.
  const tavg = edgewise({ label: 'T avg', unit: '°F', min: 100, max: 600, ticks: [100, 200, 300, 400, 500, 600], digits: 1 });
  const ppzr = edgewise({ label: 'PZR pressure', unit: 'psig', min: 0, max: 2500, ticks: [0, 500, 1000, 1500, 2000, 2500] });
  const lpzr = edgewise({ label: 'PZR level', unit: '%', min: 0, max: 100, ticks: [0, 25, 50, 75, 100] });
  const rate = digital({ label: 'Heat-up rate', style: 'vfd', width: 5, unit: '°F/h' });
  const pset = knob({ label: 'PZR pressure set', min: 300, max: 2235, step: 25, value: c.pzrSet, fmt: (v) => `${v} psig`, onChange: (v) => { c.pzrSet = v; } });
  const pumps = ['1A', '1B', '2A', '2B'].map((n, i) => toggle({ label: `RCP ${n}`, off: 'STOP', on: 'RUN', value: c.pumps[i], onChange: (v) => { const e = P.setPump(i, v); if (e) { g.say('log', e); pumps[i].set(c.pumps[i]); } } }));
  const rns = toggle({ label: 'RNS (normal RHR)', off: 'ISOL', on: 'IN SVC', value: c.rns, onChange: (v) => { const e = P.setRns(v); if (e) { g.say('log', e); rns.set(c.rns); } } });
  const pt = h('canvas', { width: 480, height: 300, style: { width: '240px', height: '150px' }, class: 'ap-plot' });
  // Boron.
  const makeup = selector({ label: 'Makeup mode', positions: [['borate', 'BORATE'], ['off', 'AUTO'], ['dilute', 'DILUTE']], value: c.makeup, onChange: (v) => { c.makeup = v; } });
  const gpm = knob({ label: 'Makeup flow', min: 10, max: 150, step: 5, value: c.gpm, fmt: (v) => `${v} gpm`, onChange: (v) => { c.gpm = v; } });
  const boron = digital({ label: 'RCS boron', style: 'vfd', width: 5, unit: 'ppm' });
  const inv = h('canvas', { width: 480, height: 300, style: { width: '240px', height: '150px' }, class: 'ap-plot' });
  const pts = (g.flags.invM ??= []);
  const record = button({ label: 'Record 1/M', color: 'white', onPress: () => {
    if (P.srCps <= 0) return;
    g.flags.cps0 ??= P.srCps;
    pts.push([P.boron, g.flags.cps0 / P.srCps]);
    g.say('log', `1/M recorded: ${P.boron.toFixed(0)} ppm, ${P.srCps.toFixed(1)} cps, 1/M = ${(g.flags.cps0 / P.srCps).toFixed(3)}.`);
  } });
  const predict = h('div', { class: 'note-card small' }, `Predicted critical boron: ${AP.predictedCB} ppm (MD at 150 steps)`);
  // Steam, feedwater, turbine.
  const steam = gauge({ label: 'Steam header', unit: 'psig', min: 0, max: 1300, ticks: [0, 300, 600, 900, 1200], size: 104 });
  const dump = knob({ label: 'Steam dump set', min: 900, max: 1150, step: 5, value: c.dumpSet, fmt: (v) => `${v} psig`, onChange: (v) => { c.dumpSet = v; } });
  const sgl = edgewise({ label: 'SG level (NR)', unit: '%', min: 0, max: 100, ticks: [0, 25, 50, 75, 100], zones: [{ from: 0, to: 20, color: '#c33' }, { from: 80, to: 100, color: '#c33' }] });
  sgl.setpoint(50);
  const fFlow = bar({ label: 'Feed flow', min: 0, max: 100, unit: '%' });
  const sFlow = bar({ label: 'Steam flow', min: 0, max: 100, unit: '%' });
  const fwMode = selector({ label: 'FW reg valve', positions: [['man', 'MAN'], ['auto', 'AUTO']], value: c.fwMode, onChange: (v) => { if (v === 'man') { c.fwDemand = Math.round(100 * P.feedFrac); fwDem.set(c.fwDemand); } c.fwMode = v; } });
  const fwDem = knob({ label: 'FW demand (MAN)', min: 0, max: 100, step: 1, value: c.fwDemand, fmt: (v) => `${v}%`, onChange: (v) => { c.fwDemand = v; } });
  const latch = button({ label: 'Turbine latch', color: 'white', onPress: () => { const e = P.latchTurbine(); if (e) g.say('log', e); } });
  const ttrip = button({ label: 'Turbine trip', color: 'red', guarded: true, onPress: () => { P.tripTurbine(true); audio.thunk(); } });
  const loadSet = knob({ label: 'Load setpoint', min: 0, max: 100, step: 1, value: c.loadSet, fmt: (v) => `${v}%`, onChange: (v) => { c.loadSet = v; } });
  const loadRate = knob({ label: 'Load rate', min: 1, max: 10, step: 1, value: c.loadRate, fmt: (v) => `${v}%/min`, onChange: (v) => { c.loadRate = v; } });
  const mwe = digital({ label: 'Generator', style: 'vfd', width: 5, unit: 'MWe' });
  // Passive safety and protection.
  const prhrL = lamp({ label: 'PRHR outlet valves open', color: 'red' });
  const prhrIso = toggle({ label: 'PRHR', off: 'ARMED', on: 'ISOLATED', value: c.prhrIsolate, onChange: (v) => { c.prhrIsolate = v; if (v) g.flags.prhrIsolated = true; } });
  const irwst = digital({ label: 'IRWST', style: 'vfd', width: 4, unit: '°F' });
  const sufw = lamp({ label: 'Startup FW pump', color: 'red' });
  const rtrip = button({ label: 'Reactor trip', color: 'red', big: true, guarded: true, onPress: () => { P.tripReactor('manual'); audio.thunk(); } });
  const reset = button({ label: 'Trip reset', color: 'white', onPress: () => { const e = P.resetTrip(); if (e) g.say('log', e); } });

  root.append(
    mim.el,
    h('div', { class: 'row' }, section('Alarm tiles', ann.el, firstOut)),
    h('div', { class: 'row' },
      section('Reactor coolant system · heat-up', tavg.el, ppzr.el, lpzr.el, h('div', { class: 'sub-col' }, rate.el, pset.el), rns.el, ...pumps.map((p) => p.el)),
      section('Pressure–temperature limits', pt)),
    h('div', { class: 'row' },
      section('Nuclear instrumentation', sr.el, ir.el, pr.el, sur.el, h('div', { class: 'sub-col' }, rc.el, mark.el, itcOut), h('div', { class: 'sub-col' }, srBlk.el, prBlk.el)),
      section('Rod control · mechanical shim', rodLever.el, rodMode.el, sdSw.el, h('div', { class: 'bank-grid ap-banks' }, ...banks.map((b) => b.el)))),
    h('div', { class: 'row' },
      section('Boron · chemical & volume control', makeup.el, gpm.el, boron.el),
      section('Inverse count rate · 1/M against boron', inv, h('div', { class: 'sub-col' }, record.el, predict))),
    h('div', { class: 'row' },
      section('Steam, feedwater & turbine-generator', steam.el, dump.el, sgl.el, h('div', { class: 'sub-col' }, fFlow.el, sFlow.el), fwMode.el, fwDem.el, latch.el, ttrip.el, loadSet.el, loadRate.el, mwe.el),
      section('Passive safety · protection', prhrL.el, prhrIso.el, irwst.el, sufw.el, rtrip.el, reset.el)));

  function markITC() {
    const f = g.flags;
    if (!f.itcMark) { f.itcMark = { rho: m.k.rho, T: P.Tavg, steps: m.ctlSteps, B: P.boron }; g.say('log', `Reactivity computer marked: ${(m.k.rho * 1e5).toFixed(1)} pcm at ${P.Tavg.toFixed(1)} °F. Now move T<sub>avg</sub> with the steam dumps and mark again.`); return; }
    const a = f.itcMark, dT = P.Tavg - a.T;
    if (Math.abs(m.ctlSteps - a.steps) > 0.5 || Math.abs(P.boron - a.B) > 0.5) { f.itcMark = null; g.say('okafor', 'The rods or the boron moved between your marks, so the measurement mixes their worth into the temperature effect. Start again: mark, change only temperature, mark.'); return; }
    if (Math.abs(dT) < 3) { g.say('okafor', `Only ${Math.abs(dT).toFixed(1)} °F so far. You want at least 3 °F of swing for a clean number.`); return; }
    const itc = ((m.k.rho - a.rho) * 1e5) / dT;
    f.itc = itc; f.itcMark = null;
    itcOut.textContent = `ITC measured ${itc >= 0 ? '+' : ''}${itc.toFixed(2)} pcm/°F (predicted ${AP.predictedITC.toFixed(1)})`;
    g.say('log', `ITC measurement: Δρ ${((m.k.rho - a.rho) * 1e5).toFixed(1)} pcm over ${dT.toFixed(1)} °F → <b>${itc >= 0 ? '+' : ''}${itc.toFixed(2)} pcm/°F</b>.`);
  }

  const ctxPT = pt.getContext('2d'), ctxInv = inv.getContext('2d');
  const trail = [];
  function plotPT() {
    const W = pt.width, Hh = pt.height, X = (T) => 40 + ((W - 50) * (T - 100)) / 500, Y = (p) => Hh - 26 - ((Hh - 36) * p) / 2500;
    ctxPT.fillStyle = '#071019'; ctxPT.fillRect(0, 0, W, Hh);
    ctxPT.strokeStyle = 'rgba(111,183,224,0.15)'; ctxPT.lineWidth = 1;
    for (let T = 100; T <= 600; T += 100) { ctxPT.beginPath(); ctxPT.moveTo(X(T), 10); ctxPT.lineTo(X(T), Hh - 26); ctxPT.stroke(); }
    for (let p = 0; p <= 2500; p += 500) { ctxPT.beginPath(); ctxPT.moveTo(40, Y(p)); ctxPT.lineTo(W - 10, Y(p)); ctxPT.stroke(); }
    ctxPT.fillStyle = 'rgba(47,224,106,0.12)'; ctxPT.beginPath();
    for (let T = 100; T <= 600; T += 5) ctxPT.lineTo(X(T), Y(PT.max(T)));
    for (let T = 600; T >= 100; T -= 5) ctxPT.lineTo(X(T), Y(PT.min(T)));
    ctxPT.fill();
    ctxPT.lineWidth = 2;
    [[PT.max, '#ff5a3c'], [PT.min, '#ffb21e']].forEach(([f, col]) => { ctxPT.strokeStyle = col; ctxPT.beginPath(); for (let T = 100; T <= 600; T += 5) ctxPT.lineTo(X(T), Y(f(T))); ctxPT.stroke(); });
    ctxPT.strokeStyle = '#6fd0ff'; ctxPT.beginPath(); trail.forEach(([T, p]) => ctxPT.lineTo(X(T), Y(p))); ctxPT.stroke();
    ctxPT.fillStyle = '#ffffff'; ctxPT.beginPath(); ctxPT.arc(X(P.Tavg), Y(P.Ppzr), 6, 0, 7); ctxPT.fill();
    ctxPT.fillStyle = '#a8d8f0'; ctxPT.font = '18px IBM Plex Mono';
    for (let T = 100; T <= 600; T += 100) ctxPT.fillText(T, X(T) - 16, Hh - 6);
    ctxPT.fillText('psig', 2, 18); ctxPT.fillText('°F', W - 34, Hh - 30);
  }
  function plotInv() {
    const W = inv.width, Hh = inv.height, B0 = 1760, B1 = 1420, X = (b) => 40 + ((W - 50) * (B0 - b)) / (B0 - B1), Y = (v) => Hh - 26 - (Hh - 36) * Math.min(1.1, v);
    ctxInv.fillStyle = '#071019'; ctxInv.fillRect(0, 0, W, Hh);
    ctxInv.strokeStyle = 'rgba(111,183,224,0.15)'; ctxInv.lineWidth = 1;
    for (let b = 1750; b >= 1450; b -= 50) { ctxInv.beginPath(); ctxInv.moveTo(X(b), 10); ctxInv.lineTo(X(b), Hh - 26); ctxInv.stroke(); }
    ctxInv.fillStyle = '#a8d8f0'; ctxInv.font = '18px IBM Plex Mono';
    for (let b = 1750; b >= 1450; b -= 100) ctxInv.fillText(b, X(b) - 20, Hh - 6);
    ctxInv.fillText('1/M', 2, 18);
    ctxInv.strokeStyle = '#ffb21e'; ctxInv.setLineDash([6, 6]); ctxInv.beginPath(); ctxInv.moveTo(X(AP.predictedCB), 10); ctxInv.lineTo(X(AP.predictedCB), Hh - 26); ctxInv.stroke(); ctxInv.setLineDash([]);
    ctxInv.fillStyle = '#6fd0ff';
    pts.forEach(([b, v]) => { ctxInv.beginPath(); ctxInv.arc(X(b), Y(v), 6, 0, 7); ctxInv.fill(); });
    if (pts.length >= 2) {
      const [a, b] = pts.slice(-2), slope = (b[1] - a[1]) / (b[0] - a[0]);
      if (slope > 0 && b[0] !== a[0]) {
        const bc = b[0] - b[1] / slope;
        g.flags.predictedCB = bc;
        ctxInv.strokeStyle = '#ff5a3c'; ctxInv.setLineDash([8, 6]); ctxInv.lineWidth = 2;
        ctxInv.beginPath(); ctxInv.moveTo(X(a[0]), Y(a[1])); ctxInv.lineTo(X(bc), Y(0)); ctxInv.stroke(); ctxInv.setLineDash([]);
        predict.textContent = `Predicted ${AP.predictedCB} ppm · your 1/M extrapolates to ${bc.toFixed(0)} ppm`;
      }
    }
  }

  let lastTrail = -1e9;
  return {
    update(dtReal, paused) {
      mim.update(paused);
      const active = new Set(P.signals);
      if (P.trip.latched) active.add('rx');
      if (!c.latched && P.load === 0 && g.flags.everLatched) active.add('turb');
      if (P.Ppzr > PT.max(P.Tavg) + 5) active.add('ptHi');
      if (P.Ppzr < PT.min(P.Tavg) - 5 && c.pumps.some(Boolean)) active.add('ptLo');
      if (P.heatupRate > 100) active.add('rate');
      if (P.rnsLift) active.add('rnsLift');
      if (P.sgInv < 30) active.add('sgLow');
      if (P.sgInv > 70) active.add('sgHigh');
      if (P.fwFault && c.fwMode === 'auto' && Math.abs(P.sgInv - 50) > 8) active.add('fw');
      if (P.prhr) active.add('prhr');
      if (P.P6) active.add('P6'); if (P.P10) active.add('P10'); if (P.C5) active.add('C5');
      if (c.rodMode === 'auto') active.add('auto');
      if (c.makeup === 'dilute') active.add('dil');
      if (c.rns) active.add('rns');
      ann.update(active);
      firstOut.textContent = P.trip.latched ? `FIRST OUT: ${String(TRIPS[P.trip.firstOut] ?? P.trip.firstOut ?? "").toUpperCase()}` : '';
      sr.set(Math.max(1, P.srCps), P.srCps ? P.srCps.toExponential(1) : 'OFF');
      ir.set(P.irAmps, P.irAmps.toExponential(1));
      pr.set(m.frac * 100, `${(m.frac * 100).toFixed(1)}%`);
      sur.set(P.sur, P.sur.toFixed(2));
      rc.set((m.k.rho * 1e5).toFixed(1));
      srBlk.set(c.srBlock); prBlk.set(c.prBlock);
      m.bankSteps.forEach((s, i) => banks[i].set(String(Math.round(s)).padStart(3, '0')));
      tavg.set(P.Tavg); ppzr.set(P.Ppzr); ppzr.setpoint(c.pzrSet); lpzr.set(P.pzrLevel); lpzr.setpoint(P.pzrLevelProgram);
      rate.set(P.heatupRate.toFixed(0), P.heatupRate > 100);
      pset.set(c.pzrSet);
      pumps.forEach((t, i) => t.set(c.pumps[i])); rns.set(c.rns); sdSw.set(m.sdDemand);
      boron.set(P.boron.toFixed(0));
      steam.set(P.steamPsig); sgl.set(P.sgInv);
      fFlow.set(100 * P.feedFrac); sFlow.set(100 * P.steamFrac);
      fwMode.set(c.fwMode); fwDem.set(c.fwDemand);
      mwe.set(P.MWe.toFixed(0));
      rodMode.set(c.rodMode); makeup.set(c.makeup); loadSet.set(c.loadSet); loadRate.set(c.loadRate); gpm.set(c.gpm); dump.set(c.dumpSet);
      prhrL.set(P.prhr && !c.prhrIsolate); prhrIso.set(c.prhrIsolate); irwst.set(P.Tirwst.toFixed(0)); sufw.set(P.sufwOn);
      if (m.t - lastTrail > 120) { trail.push([P.Tavg, P.Ppzr]); lastTrail = m.t; if (trail.length > 400) trail.shift(); }
      plotPT(); plotInv();
    },
    destroy() { audio.horn(false); },
  };
}
