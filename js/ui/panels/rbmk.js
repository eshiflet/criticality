// Chernobyl Unit 4's control room (block control room 4), as the photographs show RBMK rooms:
// off-white panels, the round field of rod-position dials (one "selsyn" per rod), the channel
// cartogram, black keys, red digits, and the AZ-5 button. The operating reactivity margin was
// not on a meter: SKALA, the plant computer, printed it, minutes old.

import { h, gauge, edgewise, digital, button, lever, knob, selector, annunciators, section, toggle, stripChart } from '../widgets.js';
import * as audio from '../audio.js';
import { rbmkMimic } from '../mimics.js';

export function buildRBMK(root, m, g) {
  const c = m.ctl, S = m.spec;
  const ann = annunciators([
    ['az5', 'АЗ-5\nAZ-5', 'trip'], ['orm', 'ORM BELOW\n15 RODS', 'alarm'], ['lowPower', 'POWER BELOW\n700 MW', 'alarm'], ['period', 'PERIOD\nSHORT', 'alarm'],
    ['cavitation', 'MCP\nCAVITATION', 'alarm'], ['drumLow', 'DRUM SEP\nLEVEL LOW', 'alarm'], ['eccs', 'ECCS\nDISCONNECTED', 'alarm'], ['tg8', 'TG-8 STOP\nVALVES SHUT', 'status'],
    ['blk', 'TG TRIP\nBLOCKED', 'alarm'], ['ar', 'AUTO REG\nIN SERVICE', 'status'], ['eight', 'ALL 8 MCPs\nRUNNING', 'status'], ['xenon', 'XENON\nPOISONING', 'alarm'],
  ], { cols: 6, onHorn: (on) => audio.horn(on, 'klaxon') });
  // The rod field and the cartogram.
  const field = h('canvas', { width: 560, height: 560, class: 'rbmk-field', style: { width: '280px', height: '280px' } });
  const carto = h('canvas', { width: 440, height: 440, class: 'rbmk-carto', style: { width: '220px', height: '220px' } });
  // Power and period.
  const mw = digital({ label: 'Thermal power (ion chambers)', style: 'led', width: 6, unit: 'MW' });
  const pwr = gauge({ label: 'Reactor power', unit: '% Nom', min: 0, max: 120, ticks: [0, 20, 40, 60, 80, 100, 120], size: 132, zones: [{ from: 100, to: 120, color: '#c33' }] });
  const per = digital({ label: 'Period', style: 'led', width: 5, unit: 's' });
  const orm = digital({ label: 'ORM (SKALA printout)', style: 'led', width: 5, unit: 'rods' });
  const ormAge = h('div', { class: 'note-card small' }, '');
  const print = button({ label: 'Request SKALA printout', color: 'white', onPress: () => { if (!g.flags.printing) { g.flags.printing = g.t; g.say('log', 'SKALA: calculating… (the printout takes a few minutes)'); } } });
  const chart = stripChart({ label: 'Power recorder', pens: [{ name: 'MW', color: '#b81d1d', min: 0, max: 3500 }, { name: 'MW (×10)', color: '#1c4fbe', min: 0, max: 350 }], window: 1800, width: 300, height: 120 });
  // Rods.
  const rr = lever({ label: 'Manual rods (RR)', up: 'OUT', down: 'IN', onChange: (v) => { c.rrCmd = v; } });
  const rrIn = digital({ label: 'RR rods in (equiv.)', style: 'led', width: 5 });
  const mode = selector({ label: 'Automatic regulator', positions: [['MAN', 'MAN'], ['LAR', 'LAR'], ['AR', 'AR']], value: c.autoMode, onChange: (v) => { c.autoMode = v; } });
  const setp = knob({ label: 'Power setpoint', min: 0, max: 3200, step: 50, value: c.setMW, fmt: (v) => `${v} MW`, onChange: (v) => { c.setMW = v; } });
  const az5 = button({ label: 'АЗ-5', color: 'red', big: true, guarded: true, title: 'AZ-5: emergency protection, all rods in', onPress: () => { m.pressAZ5('az5'); audio.thunk(); } });
  // Coolant and steam.
  const mcps = Array.from({ length: 8 }, (_, i) => toggle({ label: `MCP ${i < 4 ? 'L' : 'R'}${(i % 4) + 1}`, off: 'OFF', on: 'ON', value: c.mcp[i], onChange: (v) => { c.mcp[i] = v; } }));
  const flow = gauge({ label: 'Core flow', unit: '% nom', min: 0, max: 150, ticks: [0, 50, 100, 150], size: 112 });
  const voids = gauge({ label: 'Steam content', unit: '% void', min: 0, max: 60, ticks: [0, 20, 40, 60], size: 112 });
  const drumL = edgewise({ label: 'Drum sep. level', unit: 'cm', min: -120, max: 60, ticks: [-120, -80, -40, 0, 40] });
  const drumP = edgewise({ label: 'Drum sep. pressure', unit: 'kgf/cm²', min: 50, max: 90, ticks: [50, 60, 70, 80, 90], digits: 1 });
  const feed = knob({ label: 'Feedwater', min: 50, max: 200, step: 5, value: 100, fmt: (v) => `${v}%`, onChange: (v) => { c.feed = v / 100; } });
  // The test.
  const tg8 = button({ label: 'TG-8: close stop valves (start test)', color: 'amber', guarded: true, onPress: () => { if (c.tg8) { m.startTest(); g.flags.testStarted = g.t; } } });
  const block = toggle({ label: 'TG trip signal → AZ-5', off: 'BLOCK', on: 'ARMED', value: !c.tripBlocked, onChange: (v) => { c.tripBlocked = !v; } });
  const eccs = toggle({ label: 'ECCS', off: 'DISC', on: 'READY', value: c.eccs, onChange: (v) => { c.eccs = v; } });

  const mim = rbmkMimic(m);
  root.append(
    mim.el,
    h('div', { class: 'row' }, section('Annunciators', ann.el)),
    h('div', { class: 'row' },
      section('Rod position indicators · 211 rods', field),
      section('Core cartogram · 1,661 channels', carto),
      section('Reactor power', pwr.el, h('div', { class: 'sub-col' }, mw.el, per.el, orm.el, ormAge, print.el), chart.el)),
    h('div', { class: 'row' },
      section('Control and protection system (СУЗ)', rr.el, rrIn.el, mode.el, setp.el, az5.el),
      section('Programme: TG-8 rundown test', block.el, eccs.el, tg8.el)),
    h('div', { class: 'row' },
      section('Main circulation pumps', ...mcps.map((t) => t.el), flow.el, voids.el),
      section('Drum separators & feedwater', drumL.el, drumP.el, feed.el)));

  // Rod field layout: 211 rods on a 21×21 grid inside a circle, by type.
  const rods = [];
  for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) if (Math.hypot(i, j) <= 10.3 && (i + j) % 2 === 0) rods.push([i, j]);
  rods.length = Math.min(rods.length, 211);
  const types = rods.map((_, k) => (k % 9 === 0 ? 'AZ' : k % 9 === 4 ? 'USP' : k % 17 === 3 ? 'AR' : 'RR'));
  const fctx = field.getContext('2d'), cctx = carto.getContext('2d');
  function drawField() {
    fctx.fillStyle = '#e9ece9'; fctx.fillRect(0, 0, 560, 560);
    fctx.strokeStyle = '#9aa1a6'; fctx.lineWidth = 2; fctx.beginPath(); fctx.arc(280, 280, 270, 0, 7); fctx.stroke();
    const rrFrac = clamp(m.rr / S.rods.RR, 0, 1);
    rods.forEach(([i, j], k) => {
      const x = 280 + i * 25.5, y = 280 + j * 25.5, t = types[k];
      // Insertion depth of this rod (0 top, 1 fully in), spread so the field looks like a real pattern.
      let ins = t === 'AZ' ? m.az : t === 'USP' ? m.usp : t === 'AR' ? m.ar : clamp(rrFrac * 1.4 - ((k * 37) % 11) / 22, 0, 1);
      if (m.az5 !== null && t === 'RR') ins = Math.max(ins, clamp((m.az5 * S.rodSpeed) / S.rodTravel, 0, 1) * (m.jammed ? 0.35 : 1));
      fctx.fillStyle = t === 'AZ' ? '#f6d6d2' : t === 'USP' ? '#f6efc8' : t === 'AR' ? '#d6efd6' : '#ffffff';
      fctx.strokeStyle = '#333'; fctx.lineWidth = 1.5;
      fctx.beginPath(); fctx.arc(x, y, 11, 0, 7); fctx.fill(); fctx.stroke();
      const a = -Math.PI / 2 + ins * 1.8 * Math.PI;
      fctx.strokeStyle = '#111'; fctx.lineWidth = 2.5; fctx.beginPath(); fctx.moveTo(x, y); fctx.lineTo(x + 9 * Math.cos(a), y + 9 * Math.sin(a)); fctx.stroke();
    });
  }
  function drawCarto() {
    cctx.fillStyle = '#20262b'; cctx.fillRect(0, 0, 440, 440);
    const p = m.frac, bottom = m.az5 !== null && m.az5 < 6 ? 1 : 0;
    for (let i = -24; i <= 24; i++) for (let j = -24; j <= 24; j++) {
      const r = Math.hypot(i, j); if (r > 24.2) continue;
      const shape = Math.cos((r / 26) * Math.PI / 2) * (1 + 0.15 * Math.sin(i * 1.7 + j * 0.9));
      const lvl = clamp(Math.log10(1 + 30 * p * shape * (1 + bottom * 0.5)) / 1.6, 0, 1);
      cctx.fillStyle = `hsl(${40 - 40 * lvl}, 90%, ${10 + 55 * lvl}%)`;
      cctx.fillRect(220 + i * 9 - 4, 220 + j * 9 - 4, 8, 8);
    }
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  let frameN = 0;
  return {
    update(dtReal, paused) {
      mim.update(paused);
      const f = g.flags;
      if (f.printing && g.t - f.printing > 180) { f.printing = null; m.ormPrinted = m.orm; m.ormAge = 0; f.printedAt = g.clock; g.say('log', `SKALA printout: operating reactivity margin <b>${m.orm.toFixed(0)} rods</b>.`, m.orm < S.ormLimit ? 'bad' : ''); }
      const active = new Set(m.alarms);
      if (m.az5 !== null) active.add('az5');
      if (!c.tg8) active.add('tg8');
      if (c.tripBlocked) active.add('blk');
      if (c.autoMode !== 'MAN') active.add('ar');
      if (c.mcp.every(Boolean)) active.add('eight');
      if (m.xe.X > 1.35) active.add('xenon');
      ann.update(active);
      mw.set(m.MW > 99999 ? 'OVER' : m.MW.toFixed(0), m.MW > 3500);
      pwr.set(Math.min(120, (m.MW / S.MWt) * 100), `${((m.MW / S.MWt) * 100).toFixed(1)}%`);
      per.set(Number.isFinite(m.periodS) && m.periodS < 9999 ? m.periodS.toFixed(0) : '∞', m.periodS < 60);
      orm.set(m.ormPrinted.toFixed(0), m.ormPrinted < S.ormLimit);
      ormAge.textContent = f.printedAt ? `printed ${new Date(f.printedAt * 1000).toISOString().slice(11, 16)}` : 'printed 23:05';
      chart.push(m.t, [Math.min(m.MW, 3500), Math.min(m.MW, 350)]);
      chart.draw(m.t);
      rrIn.set(m.rr.toFixed(1));
      flow.set(m.flow * 100); voids.set(m.void);
      drumL.set(m.drumLevel); drumP.set(m.drumP);
      mcps.forEach((t, i) => t.set(c.mcp[i]));
      setp.set(c.setMW);
      mode.set(c.autoMode);
      block.set(!c.tripBlocked); eccs.set(c.eccs);
      if (frameN++ % 3 === 0) { drawField(); drawCarto(); }
    },
    destroy() { audio.horn(false); },
  };
}
