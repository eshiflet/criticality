// Maneuvering room of a (fictional) 1960s attack submarine: the reactor plant control panel, the
// engine-order telegraph and shaft indicators, and the throttleman's steam plant panel.

import { h, gauge, edgewise, digital, lamp, button, lever, knob, selector, annunciators, section, toggle, bar } from '../widgets.js';
import * as audio from '../audio.js';
import { BELLS } from '../../models/sub.js';

export function buildSub(root, m, g) {
  const c = m.ctl;
  const ann = annunciators([
    ['scram', 'REACTOR\nSCRAM', 'trip'], ['pwrHi', 'POWER\nHIGH', 'alarm'], ['surHi', 'STARTUP\nRATE HIGH', 'alarm'], ['thotHi', 'T HOT\nHIGH', 'alarm'],
    ['flowLow', 'FLOW LOW\nSLOW SPEED', 'alarm'], ['steamLow', 'MAIN STEAM\nPRESS LOW', 'alarm'], ['battLow', 'BATTERY\nLOW', 'alarm'], ['epm', 'EPM\nRUNNING', 'status'],
    ['quiet', 'RIG FOR\nQUIET', 'status'], ['bell', 'BELL NOT\nANSWERED', 'alarm'], ['sstg', 'SSTG\nOFF LINE', 'alarm'], ['crit', 'REACTOR\nCRITICAL', 'status'],
  ], { cols: 6, onHorn: (on) => audio.horn(on) });
  // Reactor plant control panel.
  const pwr = gauge({ label: 'Reactor power', unit: '%', min: 0, max: 125, ticks: [0, 25, 50, 75, 100, 125], size: 132, zones: [{ from: 100, to: 125, color: '#c33' }] });
  const sur = gauge({ label: 'Startup rate', unit: 'DPM', min: -1, max: 5, ticks: [-1, 0, 1, 2, 3, 4, 5], size: 118, digits: 2, zones: [{ from: 1, to: 4, color: '#d9a400' }, { from: 4, to: 5, color: '#c33' }] });
  const range = digital({ label: 'Source / intermediate range', style: 'vfd', width: 8, unit: '%' });
  const tavg = edgewise({ label: 'T avg', unit: '°F', min: 400, max: 560, ticks: [400, 440, 480, 520, 560], digits: 1 });
  const thot = edgewise({ label: 'T hot', unit: '°F', min: 400, max: 560, ticks: [400, 440, 480, 520, 560], digits: 1, zones: [{ from: 535, to: 560, color: '#c33' }] });
  const tcold = edgewise({ label: 'T cold', unit: '°F', min: 400, max: 560, ticks: [400, 440, 480, 520, 560], digits: 1 });
  tavg.setpoint(m.spec.Tref);
  const rodPos = digital({ label: 'Shim rods · in. withdrawn', style: 'vfd', width: 5 });
  const shim = lever({ label: 'Shim switch', up: 'OUT', down: 'IN', onChange: (v) => { c.rodCmd = v; } });
  const pumps = selector({ label: 'Main coolant pumps', positions: [['slow', 'SLOW'], ['fast', 'FAST']], value: c.pumpsFast ? 'fast' : 'slow', onChange: (v) => { c.pumpsFast = v === 'fast'; } });
  const scram = button({ label: 'SCRAM', color: 'red', big: true, guarded: true, onPress: () => { m.scram('Manual scram'); } });
  const reset = button({ label: 'Scram reset', color: 'white', onPress: () => { if (m.resetScram()) g.say('log', 'Scram reset. Rods latched at the bottom: ready to withdraw.'); else if (m.scrammed) g.say('log', 'Reset refused: rods still driving in.'); } });
  // Telegraph and shaft.
  const eot = h('div', { class: 'eot' });
  const eotFace = h('div', { class: 'eot-face' }, ...BELLS.map(([name], i) => h('div', { class: 'eot-seg', style: { transform: `rotate(${-90 + (180 * i) / (BELLS.length - 1)}deg)` } }, h('span', {}, name.replace('AHEAD ', 'AH ').replace('BACK ', 'BK ')))));
  const eotPtr = h('div', { class: 'eot-ptr' }), eotAns = h('div', { class: 'eot-ptr ans' });
  eot.append(eotFace, eotAns, eotPtr, h('div', { class: 'eot-hub' }));
  const answer = button({ label: 'Answer bell', color: 'amber', onPress: () => { if (g.flags.bellPending) { g.flags.bellPending = false; g.flags.answered = c.bell; audio.bell(); g.say('log', `Answered: ${m.bellName}.`); } } });
  const rpm = gauge({ label: 'Shaft (ordered ▼)', unit: '% RPM', min: -70, max: 100, ticks: [-60, -30, 0, 30, 60, 100], size: 132 });
  const kts = digital({ label: 'Speed', style: 'vfd', width: 5, unit: 'kts' });
  // Steam plant / throttle board.
  const ahead = knob({ label: 'Ahead throttle', min: 0, max: 100, step: 1, value: Math.round(c.ahead * 100), fmt: (v) => `${v}%`, onChange: (v) => { c.ahead = v / 100; if (v) { c.astern = 0; astern.set(0); } } });
  const astern = knob({ label: 'Astern throttle', min: 0, max: 100, step: 1, value: Math.round(c.astern * 100), fmt: (v) => `${v}%`, onChange: (v) => { c.astern = v / 100; if (v) { c.ahead = 0; ahead.set(0); } } });
  const steam = gauge({ label: 'Main steam', unit: 'psig', min: 0, max: 1000, ticks: [0, 200, 400, 600, 800, 1000], size: 118 });
  const epm = toggle({ label: 'Emergency propulsion motor', off: 'OFF', on: 'ON', value: c.epm, onChange: (v) => { c.epm = v; } });
  const sstg = lamp({ label: 'SSTGs on line', color: 'red' });
  const batt = bar({ label: 'Battery', min: 0, max: 100, unit: '%', color: '#ffb340' });
  const noise = bar({ label: 'Self-noise', min: 0, max: 1.2, digits: 2, color: '#e05a3a' });
  const red = toggle({ label: 'Rig for red', off: 'WHITE', on: 'RED', value: false, lamps: false, onChange: (v) => root.classList.toggle('rig-red', v) });

  root.append(
    h('div', { class: 'row' }, section('Annunciators', ann.el)),
    h('div', { class: 'row' },
      section('Reactor plant control panel', pwr.el, sur.el, h('div', { class: 'sub-col' }, range.el, rodPos.el), tavg.el, thot.el, tcold.el, shim.el, pumps.el, h('div', { class: 'sub-col' }, scram.el, reset.el))),
    h('div', { class: 'row' },
      section('Engine order telegraph', eot, answer.el, rpm.el, kts.el),
      section('Throttles & steam plant', ahead.el, astern.el, steam.el, h('div', { class: 'sub-col' }, sstg.el, epm.el, batt.el, noise.el, red.el))));

  const angle = (i) => -90 + (180 * i) / (BELLS.length - 1);
  return {
    update() {
      const active = new Set(m.alarms);
      if (m.scrammed) active.add('scram');
      if (c.epm) active.add('epm');
      if (g.flags.quiet) active.add('quiet');
      if (g.flags.bellPending) active.add('bell');
      if (m.sstgLost) active.add('sstg');
      if (!m.scrammed && m.k.n > 1e-4 && m.k.rho > -0.001) active.add('crit');
      ann.update(active);
      pwr.set(m.frac * 100, `${(m.frac * 100).toFixed(1)}%`);
      sur.set(m.sur, `${m.sur.toFixed(2)}`);
      range.set(m.frac < 0.01 ? m.frac.toExponential(1).replace('e', 'E') : (m.frac * 100).toFixed(2));
      tavg.set(m.Tavg); thot.set(m.Thot); tcold.set(m.Tcold);
      rodPos.set(m.rodIn.toFixed(1));
      eotPtr.style.transform = `rotate(${angle(c.bell)}deg)`;
      eotAns.style.transform = `rotate(${angle(g.flags.answered ?? c.bell)}deg)`;
      rpm.set(m.rpm * 100, `${(m.rpm * 100).toFixed(0)}%`);
      rpm.setpoint(m.orderedRpm * 100);
      kts.set(m.speed.toFixed(1));
      steam.set(m.steamPsig);
      sstg.set(c.sstg && !m.sstgLost);
      batt.set(m.battery);
      noise.set(m.noise);
      epm.set(c.epm);
      pumps.set(c.pumpsFast ? 'fast' : 'slow');
    },
    destroy() { audio.horn(false); },
  };
}
