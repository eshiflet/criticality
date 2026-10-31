// Browns Ferry Unit 1, 1975: a GE BWR/4 benchboard in pale green-gray. Reactor and recirculation,
// vessel pressure and level, main steam and relief valves, feedwater and the emergency core
// cooling systems. Systems the fire has destroyed go dark.

import { h, gauge, edgewise, digital, lamp, button, knob, selector, annunciators, section, toggle } from '../widgets.js';
import * as audio from '../audio.js';
import { bwrMimic } from '../mimics.js';

const gpm = (klbs) => (klbs * 1000 * 60) / 8.3;

export function buildBWR(root, m, g) {
  const c = m.ctl, A = m.avail, S = m.spec;
  const ann = annunciators([
    ['scram', 'REACTOR\nSCRAM', 'trip'], ['trip:l3', 'RPV LEVEL\nLOW (L3)', 'alarm'], ['trip:pHigh', 'RPV PRESS\nHIGH', 'alarm'], ['trip:msiv', 'MSIV\nCLOSURE', 'alarm'],
    ['lvlLo', 'RPV LEVEL\nLOW', 'alarm'], ['lvlHi', 'RPV LEVEL\nHIGH', 'alarm'], ['srvOpen', 'RELIEF VALVE\nOPEN', 'alarm'], ['poolHi', 'SUPP POOL\nTEMP HIGH', 'alarm'],
    ['cladHi', 'FUEL ZONE\nLEVEL LOW', 'trip'], ['flooding', 'RPV LEVEL\nABOVE L8', 'alarm'], ['fire', 'FIRE\nPROTECTION', 'trip'], ['eccs', 'ECCS\nTROUBLE', 'alarm'],
  ], { cols: 6, onHorn: (on) => audio.horn(on) });
  // Reactor.
  const aprm = gauge({ label: 'APRM power', unit: '%', min: 0, max: 125, ticks: [0, 25, 50, 75, 100, 125], size: 132, zones: [{ from: 118, to: 125, color: '#c33' }] });
  const mode = selector({ label: 'Mode switch', positions: [['shutdown', 'SHUT DN'], ['refuel', 'REFUEL'], ['startup', 'STARTUP'], ['run', 'RUN']], value: c.mode, onChange: (v) => { c.mode = v; } });
  const scramA = button({ label: 'Manual scram A', color: 'red', guarded: true, onPress: () => { m.scram('manual'); audio.thunk(); } });
  const scramB = button({ label: 'Manual scram B', color: 'red', guarded: true, onPress: () => { m.scram('manual'); audio.thunk(); } });
  const reset = button({ label: 'Scram reset', color: 'white', onPress: () => { if (!m.resetScram()) g.say('log', 'Scram reset blocked: a scram signal is still in (mode switch, level, pressure or MSIVs).'); } });
  const core = h('canvas', { width: 300, height: 300, style: { width: '150px', height: '150px' }, class: 'coremap' });
  // Recirculation.
  const flow = gauge({ label: 'Core flow', unit: '%', min: 0, max: 110, ticks: [0, 20, 40, 60, 80, 100], size: 118 });
  const recA = knob({ label: 'Recirc A speed', min: 20, max: 100, step: 5, value: c.recircSpeed[0] * 100, fmt: (v) => `${v}%`, onChange: (v) => { c.recircSpeed[0] = v / 100; } });
  const recB = knob({ label: 'Recirc B speed', min: 20, max: 100, step: 5, value: c.recircSpeed[1] * 100, fmt: (v) => `${v}%`, onChange: (v) => { c.recircSpeed[1] = v / 100; } });
  const pumpA = toggle({ label: 'Recirc pump A', off: 'TRIP', on: 'RUN', value: c.recirc[0], onChange: (v) => { c.recirc[0] = v; } });
  const pumpB = toggle({ label: 'Recirc pump B', off: 'TRIP', on: 'RUN', value: c.recirc[1], onChange: (v) => { c.recirc[1] = v; } });
  // Vessel.
  const press = gauge({ label: 'Reactor pressure', unit: 'psig', min: 0, max: 1200, ticks: [0, 200, 400, 600, 800, 1000, 1200], size: 132, zones: [{ from: 1055, to: 1200, color: '#c33' }] });
  const nr = edgewise({ label: 'Level · narrow', unit: 'in', min: 0, max: 60, ticks: [0, 15, 30, 45, 60] });
  const wr = edgewise({ label: 'Level · wide', unit: 'in', min: -150, max: 60, ticks: [-150, -100, -50, 0, 50] });
  const fz = edgewise({ label: 'Level · fuel zone', unit: 'in', min: -350, max: -100, ticks: [-350, -300, -250, -200, -150, -100], zones: [{ from: -350, to: S.TAF, color: '#c33' }] });
  nr.setpoint(S.Lnorm);
  const pool = gauge({ label: 'Suppression pool', unit: '°F', min: 50, max: 250, ticks: [50, 100, 150, 200, 250], size: 112, zones: [{ from: 110, to: 250, color: '#d9a400' }] });
  // Steam.
  const msiv = toggle({ label: 'MSIVs', off: 'CLOSE', on: 'OPEN', value: c.msiv, onChange: (v) => { if (!m.setMsiv(v)) { g.say('log', 'MSIV control switch: no response (control power lost).'); msiv.set(!v); } } });
  const load = knob({ label: 'Load set', min: 0, max: 100, step: 1, value: Math.round(c.loadSet * 100), fmt: (v) => `${v}%`, onChange: (v) => { c.loadSet = v / 100; } });
  const mwe = digital({ label: 'Generator', style: 'led', width: 5, unit: 'MWe' });
  const srvs = Array.from({ length: S.srvs }, (_, i) => {
    const t = toggle({ label: `SRV ${i + 1}`, off: 'CLS', on: 'OPN', value: false, onChange: (v) => { if (!A.srv[i]) { g.say('log', `SRV ${i + 1}: no response.`); t.set(false); return; } c.srv[i] = v; } });
    return t;
  });
  // Feed and ECCS.
  const fwAuto = selector({ label: 'Feedwater control', positions: [['man', 'MAN'], ['auto', 'AUTO']], value: c.feedAuto ? 'auto' : 'man', onChange: (v) => { c.feedAuto = v === 'auto'; } });
  const fwMan = knob({ label: 'Feed demand (man)', min: 0, max: 120, step: 5, value: 100, fmt: (v) => `${v}%`, onChange: (v) => { c.feedManual = v / 100; } });
  const lvlSet = knob({ label: 'Level setpoint', min: 10, max: 50, step: 1, value: c.levelSet, fmt: (v) => `${v} in`, onChange: (v) => { c.levelSet = v; } });
  const fwFlow = digital({ label: 'Feed flow', style: 'led', width: 6, unit: 'gpm' });
  const sel = (label, get, set) => selector({ label, positions: [['off', 'OFF'], ['auto', 'AUTO'], ['on', 'ON']], value: get(), onChange: set });
  const hpci = sel('HPCI', () => c.hpci, (v) => { c.hpci = v; });
  const rcic = sel('RCIC', () => c.rcic, (v) => { c.rcic = v; });
  const csA = sel('Core spray A', () => c.cs[0], (v) => { c.cs[0] = v; });
  const csB = sel('Core spray B', () => c.cs[1], (v) => { c.cs[1] = v; });
  const lpA = sel('LPCI A', () => c.lpci[0], (v) => { c.lpci[0] = v; });
  const lpB = sel('LPCI B', () => c.lpci[1], (v) => { c.lpci[1] = v; });
  const cbp = toggle({ label: 'Condensate booster → RPV', off: 'OFF', on: 'INJ', value: c.cbp, onChange: (v) => { c.cbp = v; } });
  const crd = toggle({ label: 'CRD pumps', off: 'STOP', on: 'RUN', value: c.crd, onChange: (v) => { c.crd = v; } });
  const ads = toggle({ label: 'ADS inhibit', off: 'NORM', on: 'INHIB', value: c.adsInhibit, onChange: (v) => { c.adsInhibit = v; } });
  const rhr = toggle({ label: 'RHR pool cooling', off: 'OFF', on: 'ON', value: c.rhrCooling, onChange: (v) => { c.rhrCooling = v; } });
  const inj = digital({ label: 'Injection to RPV', style: 'led', width: 6, unit: 'gpm' });
  const out = digital({ label: 'Steam out of RPV', style: 'led', width: 6, unit: 'klb/h' });
  const eccsLamps = { hpci: lamp({ label: 'HPCI flow', color: 'red', small: true }), rcic: lamp({ label: 'RCIC flow', color: 'red', small: true }), cs: lamp({ label: 'CS flow', color: 'red', small: true }), lpci: lamp({ label: 'LPCI flow', color: 'red', small: true }), cbp: lamp({ label: 'Booster flow', color: 'red', small: true }) };

  const deadable = [['hpci', hpci.el], ['rcic', rcic.el], ['cs0', csA.el], ['cs1', csB.el], ['lp0', lpA.el], ['lp1', lpB.el], ['msivCtl', msiv.el], ['rec0', pumpA.el], ['rec1', pumpB.el], ['feed', fwAuto.el], ...srvs.map((t, i) => [`srv${i}`, t.el])];

  const mim = bwrMimic(m);
  root.append(
    mim.el,
    h('div', { class: 'row' }, section('Annunciators', ann.el)),
    h('div', { class: 'row' },
      section('Reactor', aprm.el, core, h('div', { class: 'sub-col' }, mode.el, h('div', { class: 'cp1-steps' }, scramA.el, scramB.el), reset.el)),
      section('Recirculation', flow.el, h('div', { class: 'sub-col' }, pumpA.el, pumpB.el), recA.el, recB.el)),
    h('div', { class: 'row' },
      section('Reactor vessel', press.el, nr.el, wr.el, fz.el, pool.el),
      section('Main steam & turbine', msiv.el, load.el, mwe.el, out.el)),
    h('div', { class: 'row' }, section('Safety / relief valves (to the suppression pool)', h('div', { class: 'srv-row' }, ...srvs.map((t) => t.el)))),
    h('div', { class: 'row' },
      section('Feedwater', fwAuto.el, fwMan.el, lvlSet.el, fwFlow.el),
      section('Emergency core cooling & makeup', hpci.el, rcic.el, csA.el, csB.el, lpA.el, lpB.el, cbp.el, crd.el, ads.el, rhr.el, h('div', { class: 'sub-col' }, ...Object.values(eccsLamps).map((l) => l.el)), inj.el)));

  const ctx = core.getContext('2d');
  const pos = [];
  for (let i = -7; i <= 7; i++) for (let j = -7; j <= 7; j++) if (Math.hypot(i, j) <= 7.4) pos.push([i, j, (Math.abs(i * 3 + j * 7) % S.rodGroups)]);
  function drawCore() {
    ctx.fillStyle = '#1b1f1c'; ctx.fillRect(0, 0, 300, 300);
    pos.forEach(([i, j, gi]) => {
      const w = m.rodGroups[gi];
      ctx.fillStyle = w < 0.02 ? '#2fe06a' : w > 0.98 ? '#ff3b30' : '#ffffff';
      ctx.globalAlpha = w < 0.02 || w > 0.98 ? 1 : 0.5 + 0.5 * w;
      ctx.fillRect(150 + i * 19 - 7, 150 + j * 19 - 7, 14, 14);
    });
    ctx.globalAlpha = 1;
  }

  return {
    update(dtReal, paused) {
      mim.update(paused);
      const active = new Set(m.alarms);
      if (m.scrammed) active.add('scram');
      if (g.flags.fire) active.add('fire');
      if (!A.hpci || !A.rcic || !A.cs[0] || !A.lpci[0]) active.add('eccs');
      ann.update(active);
      aprm.set(m.frac * 100, `${(m.frac * 100).toFixed(1)}%`);
      flow.set(m.flowFrac * 100);
      press.set(m.P);
      const L = m.levelInd;
      nr.set(L, L.toFixed(1)); wr.set(L, L.toFixed(0)); fz.set(m.Lc, m.Lc.toFixed(0));
      pool.set(m.pool);
      mwe.set((m.turbFlow / S.Wfull * S.MWe).toFixed(0));
      out.set((m.q.wOut * 3600).toFixed(0));
      fwFlow.set(gpm(m.q.wFeed ?? 0).toFixed(0));
      inj.set(gpm(m.q.wIn ?? 0).toFixed(0));
      eccsLamps.hpci.set(m.q.wHpi > 0); eccsLamps.rcic.set(m.q.wRcic > 0); eccsLamps.cs.set(m.q.wCs > 0); eccsLamps.lpci.set(m.q.wLpci > 0); eccsLamps.cbp.set(m.q.wCbp > 0);
      srvs.forEach((t, i) => t.set(c.srv[i], m.srvState?.[i] ? 'red' : 'green'));
      msiv.set(c.msiv && !m.msivClosed, c.msiv && !m.msivClosed ? 'red' : 'green');
      pumpA.set(c.recirc[0] && A.recirc[0]); pumpB.set(c.recirc[1] && A.recirc[1]);
      const dead = { hpci: !A.hpci, rcic: !A.rcic, cs0: !A.cs[0], cs1: !A.cs[1], lp0: !A.lpci[0], lp1: !A.lpci[1], msivCtl: !A.msivCtl, rec0: !A.recirc[0], rec1: !A.recirc[1], feed: !A.feed };
      A.srv.forEach((ok, i) => { dead[`srv${i}`] = !ok; });
      deadable.forEach(([k, el]) => el.classList.toggle('dead', !!dead[k]));
      drawCore();
    },
    destroy() { audio.horn(false); },
  };
}
