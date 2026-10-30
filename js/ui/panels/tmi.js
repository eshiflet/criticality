// TMI-2's control room as it was on 28 March 1979: charcoal B&W boards, light square meters,
// orange switch handles, a maintenance tag hanging over one of the emergency feedwater valve
// lamps, the PORV lamp that shows only the solenoid, and the PORV tailpipe temperature on a
// back panel you have to walk around to. No subcooling meter: those came after.

import { h, gauge, edgewise, digital, lamp, button, knob, selector, annunciators, section, toggle, stripChart } from '../widgets.js';
import * as audio from '../audio.js';
import { psat, PSIA } from '../../engine/physics.js';

const gpm = (klbs) => (klbs * 1000 * 60) / 8.3;

export function buildTMI(root, m, g) {
  const c = m.ctl, S = m.spec;
  const ann = annunciators([
    ['rx', 'REACTOR\nTRIP', 'trip'], ['turb', 'TURBINE\nTRIP', 'trip'], ['fw', 'MAIN FW\nPUMPS TRIP', 'trip'], ['esas', 'ESAS\nHPI ACTUATED', 'trip'],
    ['pHi', 'RC PRESS\nHIGH', 'alarm'], ['pLo', 'RC PRESS\nLOW', 'alarm'], ['pzrHi', 'PZR LEVEL\nHIGH', 'alarm'], ['pzrLo', 'PZR LEVEL\nLOW', 'alarm'],
    ['porv', 'PZR RELIEF\nSOLENOID', 'alarm'], ['rcdt', 'RC DRAIN TK\nPRESS HIGH', 'alarm'], ['sgLo', 'OTSG LEVEL\nLOW', 'alarm'], ['efw', 'EFW PUMPS\nRUNNING', 'status'],
    ['rcpVib', 'RCP\nVIBRATION', 'alarm'], ['contP', 'REACTOR BLDG\nPRESS HIGH', 'alarm'], ['sump', 'RB SUMP\nLEVEL HIGH', 'alarm'], ['rad', 'RADIATION\nMONITOR', 'alarm'],
    ['incore', 'INCORE T/C\nHIGH', 'alarm'], ['tailpipe', 'RELIEF LINE\nTEMP HIGH', 'alarm'], ['letdown', 'LETDOWN\nISOLATED', 'alarm'], ['icsx', 'ICS\nTRACKING', 'alarm'],
    ['hpiFlow', 'HPI FLOW\nHIGH', 'alarm'], ['mu', 'MAKEUP TANK\nLEVEL LOW', 'alarm'], ['blk', 'RC-V2 BLOCK\nVALVE SHUT', 'status'], ['sat', 'CONDENSATE\nPOLISHER', 'alarm'],
  ], { cols: 8, onHorn: (on) => audio.horn(on) });
  // Primary.
  const pr = gauge({ label: 'RC pressure', unit: 'psig', min: 0, max: 2500, ticks: [0, 500, 1000, 1500, 2000, 2500], size: 140, zones: [{ from: 2255, to: 2500, color: '#c33' }] });
  const thA = edgewise({ label: 'T hot A (WR)', unit: '°F', min: 520, max: 620, ticks: [520, 540, 560, 580, 600, 620], digits: 0 });
  const thB = edgewise({ label: 'T hot B (WR)', unit: '°F', min: 520, max: 620, ticks: [520, 540, 560, 580, 600, 620], digits: 0 });
  const tc = edgewise({ label: 'T cold', unit: '°F', min: 520, max: 620, ticks: [520, 540, 560, 580, 600, 620], digits: 0 });
  const pzr = edgewise({ label: 'PZR level', unit: 'in', min: 0, max: 400, ticks: [0, 100, 200, 300, 400], zones: [{ from: 340, to: 400, color: '#c33' }] });
  pzr.setpoint(S.pzrLevelSet);
  const porvLamp = lamp({ label: 'PORV (RC-RV2)', color: 'red' });
  const porvSel = selector({ label: 'PORV control', positions: [['close', 'CLOSE'], ['auto', 'AUTO'], ['open', 'OPEN']], value: 'auto', onChange: (v) => { c.porvSwitch = v; } });
  const block = toggle({ label: 'PORV block valve RC-V2', off: 'CLOSE', on: 'OPEN', value: c.blockValve, onChange: (v) => { c.blockValve = v; if (!v) g.flags.blockClosedAt ??= g.t; audio.thunk(); } });
  const heaters = toggle({ label: 'PZR heaters', off: 'OFF', on: 'ON', value: c.heaters, onChange: (v) => { c.heaters = v; } });
  const rcps = ['1A', '1B', '2A', '2B'].map((n, i) => toggle({ label: `RCP ${n}`, off: 'STOP', on: 'RUN', value: c.rcp[i], onChange: (v) => { c.rcp[i] = v; } }));
  const amps = gauge({ label: 'RCP motor amps', unit: 'A', min: 0, max: 1200, ticks: [0, 300, 600, 900, 1200], size: 112 });
  // Makeup / HPI.
  const mu = ['A', 'B', 'C'].map((n, i) => toggle({ label: `MU-P1${n}`, off: 'STOP', on: 'RUN', value: c.hpi[i], onChange: (v) => { c.hpi[i] = v; } }));
  const hpiV = knob({ label: 'HPI valves MU-V16', min: 0, max: 100, step: 2, value: Math.round(c.hpiValve * 100), fmt: (v) => `${v}%`, onChange: (v) => { c.hpiValve = v / 100; } });
  const letdown = toggle({ label: 'Letdown', off: 'ISOL', on: 'OPEN', value: c.letdown, onChange: (v) => { c.letdown = v; } });
  const hpiFlow = digital({ label: 'Makeup / HPI flow', style: 'led', width: 5, unit: 'gpm' });
  // Secondary.
  const sgA = edgewise({ label: 'OTSG A level (SU)', unit: 'in', min: 0, max: 250, ticks: [0, 50, 100, 150, 200, 250] });
  const sgB = edgewise({ label: 'OTSG B level (SU)', unit: 'in', min: 0, max: 250, ticks: [0, 50, 100, 150, 200, 250] });
  const stm = gauge({ label: 'Steam header', unit: 'psig', min: 0, max: 1200, ticks: [0, 300, 600, 900, 1200], size: 112 });
  const efwP = toggle({ label: 'EFW pumps', off: 'STOP', on: 'RUN', value: false, onChange: (v) => { c.efwPumps = [v, v, v]; } });
  const efA = toggle({ label: 'EF-V12A', off: 'CLOSE', on: 'OPEN', value: c.efwBlock[0], onChange: (v) => { c.efwBlock[0] = v; } });
  const efB = toggle({ label: 'EF-V12B', off: 'CLOSE', on: 'OPEN', value: c.efwBlock[1], onChange: (v) => { c.efwBlock[1] = v; } });
  efA.el.append(h('div', { class: 'mtag', title: 'A yellow maintenance tag hanging from the switch above' }, 'DANGER · DO NOT OPERATE'));
  const fwLamp = lamp({ label: 'Main feed pumps', color: 'red' });
  // Reactor building.
  const rcdtP = gauge({ label: 'RC drain tank', unit: 'psig', min: 0, max: 250, ticks: [0, 50, 100, 150, 200, 250], size: 112, zones: [{ from: 192, to: 250, color: '#c33' }] });
  const rbP = digital({ label: 'Reactor bldg', style: 'led', width: 4, unit: 'psig' });
  const sump = digital({ label: 'RB sump', style: 'led', width: 5, unit: 'gal' });
  const rad = digital({ label: 'Area radiation', style: 'led', width: 5, unit: 'R/h' });
  const src = digital({ label: 'Source range', style: 'led', width: 6, unit: 'cps' });
  // Back panel: tailpipe temperature recorder and the incore thermocouple printout.
  const tail = stripChart({ label: 'PORV / safety valve tailpipe temperatures', pens: [{ name: 'RC-RV2 (PORV)', color: '#c01d1d', min: 100, max: 320 }, { name: 'code safeties', color: '#1c4fbe', min: 100, max: 320 }], window: 3600, width: 320, height: 130 });
  const incore = h('pre', { class: 'printer' }, '');
  const back = h('details', { class: 'backpanel' }, h('summary', {}, 'Walk around to the back panels (recorders, computer printout)'), h('div', { class: 'row' }, section('Back panel recorder', tail.el), section('Plant computer · incore thermocouples', incore)));
  const steam = h('details', { class: 'backpanel' }, h('summary', {}, 'Steam tables (the printed card on the desk)'), h('pre', { class: 'printer', html: steamCard() }));

  root.append(
    h('div', { class: 'row' }, section('Annunciators', ann.el)),
    h('div', { class: 'row' },
      section('Reactor coolant system', pr.el, thA.el, thB.el, tc.el, pzr.el, h('div', { class: 'sub-col' }, porvLamp.el, porvSel.el), block.el, heaters.el),
      section('Reactor coolant pumps', ...rcps.map((t) => t.el), amps.el)),
    h('div', { class: 'row' },
      section('Makeup & high-pressure injection', ...mu.map((t) => t.el), hpiV.el, letdown.el, hpiFlow.el),
      section('Feedwater & OTSGs', fwLamp.el, sgA.el, sgB.el, stm.el, efwP.el, efA.el, efB.el)),
    h('div', { class: 'row' }, section('Reactor building', rcdtP.el, rbP.el, sump.el, rad.el, src.el)),
    back, steam);

  let printT = 0;
  return {
    update(dtReal) {
      const active = new Set(m.alarms);
      if (m.scrammed) active.add('rx');
      if (!c.turbine) active.add('turb');
      if (!c.mainFeed) { active.add('fw'); active.add('sat'); }
      if (m.esas) { active.add('esas'); if (m.q.wHpi > 0.05) active.add('hpiFlow'); }
      if (c.efwPumps.some(Boolean)) active.add('efw');
      if (!c.letdown) active.add('letdown');
      if (!c.blockValve) active.add('blk');
      if (m.sump > 10) active.add('sump');
      if (!c.mainFeed && m.t < 600) active.add('icsx');
      if (m.M / m.Mnom < 0.9) active.add('mu');
      ann.update(active);
      pr.set(m.P);
      const th = m.ThotInd;
      thA.set(th, m.Thot > 620 ? '620+' : th.toFixed(0)); thB.set(th, m.Thot > 620 ? '620+' : th.toFixed(0)); tc.set(Math.min(620, Math.max(520, m.Tcold)), m.Tcold.toFixed(0));
      pzr.set(m.pzrLevel, m.pzrLevel.toFixed(0));
      porvLamp.set(m.porvSolenoid);
      const vib = m.rcpVib;
      amps.set(c.rcp.some(Boolean) ? 800 * (1 - 0.4 * vib) + (Math.random() - 0.5) * 300 * vib : 0);
      hpiFlow.set(gpm(m.q.wHpi ?? 0).toFixed(0));
      sgA.set(m.sgLevel[0]); sgB.set(m.sgLevel[1]);
      stm.set(psat(m.Ts) - PSIA);
      fwLamp.set(c.mainFeed);
      efwP.set(c.efwPumps.some(Boolean));
      rcdtP.set(m.rcdtP);
      rbP.set(m.contP.toFixed(1));
      sump.set((m.sump * 100).toFixed(0));
      rad.set(m.radiation < 10 ? m.radiation.toFixed(1) : m.radiation.toFixed(0), m.radiation > 20);
      // Source range: neutrons leak out more through a voided core (TMI's operators saw it rise).
      src.set((0.5 + 5 * m.frac * 1e6 + 40 * m.voidLoop + 200 * m.damage).toFixed(1));
      rcps.forEach((t, i) => t.set(c.rcp[i]));
      mu.forEach((t, i) => t.set(c.hpi[i]));
      hpiV.set(Math.round(c.hpiValve * 100));
      block.set(c.blockValve);
      tail.push(m.t, [m.tailpipe, 160]);
      if (back.open) tail.draw(m.t);
      printT += dtReal;
      if (printT > 1 && back.open) {
        printT = 0;
        const tcs = [0.92, 0.97, 1.0, 1.04, 0.98].map((k) => m.Tclad * k + (Math.random() - 0.5) * 6);
        incore.textContent = tcs.map((t, i) => `TC ${String(7 + i * 3).padStart(2, '0')}  ${t > 700 ? '?????' : t.toFixed(0).padStart(5)} F`).join('\n');
      }
    },
    destroy() { audio.horn(false); },
  };
}

function steamCard() {
  const rows = [[300, 67], [400, 247], [450, 423], [500, 681], [520, 813], [540, 963], [550, 1045], [560, 1133], [570, 1227], [580, 1326], [590, 1430], [600, 1543], [620, 1787], [640, 2060], [650, 2209]];
  return 'SATURATED STEAM          T (°F)   P (psig)\n' + rows.map(([t, p]) => `                         ${String(t).padStart(5)}   ${String(Math.round(p - 14.7)).padStart(6)}`).join('\n') + '\n\nSubcooling = T(sat at RC pressure) − T(hot)';
}
