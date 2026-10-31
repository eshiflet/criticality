// Headless checks that each plant model still tells its historical story.
// Run: node tests/run.mjs   (exit code 1 if anything fails)

import { CP1Model } from '../js/models/cp1.js';
import { SequoyahModel } from '../js/models/sequoyah.js';
import { SubModel } from '../js/models/sub.js';
import { BWRModel } from '../js/models/bwr.js';
import { TMIModel } from '../js/models/tmi.js';
import { RBMKModel } from '../js/models/rbmk.js';
import { AP1000Model, AP, PT } from '../js/models/ap1000.js';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); if (!ok) failed++; };
const run = (m, sec, dt, f) => { for (let i = 0; i < sec / dt; i++) { f?.(m); m.step(dt); } };

// CP-1: critical near 12 ft, and a pull to 13 ft reaches half a watt in a few minutes.
{
  const m = new CP1Model();
  m.ctl.zipOut = true; m.ctl.safetyUp = true; m.ctl.tripW = 1e9;
  run(m, 120, 0.5);
  check('CP-1 critical position', Math.abs(m.criticalFt - 12) < 0.3, `${m.criticalFt.toFixed(2)} ft`);
  m.ctl.control = 13; let t = 0;
  while (m.P < 0.5 && t < 3600) { run(m, 5, 0.5); t += 5; }
  check('CP-1 13 ft → ½ W in 3–15 min', t > 180 && t < 900, `${(t / 60).toFixed(1)} min`);
}

// Sequoyah: a careful startup and loading reaches full power on program without a trip.
{
  const m = new SequoyahModel({ boron: 1180 }), P = m.plant, c = P.ctl;
  const blocks = () => { if (P.P6) c.srBlock = true; if (P.P10) c.prBlock = true; };
  run(m, 3600, 0.5, () => { blocks(); c.lever = m.frac < 0.02 && P.sur < 0.5 ? 1 : 0; });
  P.latchTurbine(); c.loadSet = 100; c.loadRate = 5;
  run(m, 1800, 0.5, () => { blocks(); if (P.C5) { c.lever = 0; c.rodMode = 'auto'; } else c.lever = P.Tavg < P.Tref - 1.5 ? 1 : 0; c.makeup = m.ctlSteps > m.maxSteps - 60 ? 'dilute' : 'off'; c.gpm = 150; });
  check('Sequoyah reaches full power', m.frac > 0.97 && !P.trip.latched, `${(m.frac * 100).toFixed(1)}%`);
  check('Sequoyah Tavg on program', Math.abs(P.Tavg - P.Tref) < 2.5, `${P.Tavg.toFixed(1)} vs ${P.Tref.toFixed(1)} °F`);
  P.tripTurbine(true); run(m, 600, 0.5);
  check('Sequoyah turbine trip above P-9 trips the reactor', P.trip.latched && P.trip.firstOut === 'turbine');
}

// Naval PWR: power follows the throttles; after a scram the plant can be recovered.
{
  const m = new SubModel({ power: 0.15 });
  m.ctl.ahead = 0.11; run(m, 300, 0.25);
  for (let i = 0; i < 120; i++) { m.ctl.ahead = Math.min(0.95, 0.11 + i * 0.008); m.step(1); }
  run(m, 60, 0.25);
  check('Sub: power follows the throttle to ~flank', m.frac > 0.85 && !m.scrammed, `${(m.frac * 100).toFixed(0)}%`);
  check('Sub: Tavg holds near 500 °F without rods', Math.abs(m.Tavg - 500) < 15, `${m.Tavg.toFixed(1)} °F`);
  m.scram('test'); m.ctl.ahead = 0; m.ctl.epm = true; run(m, 30, 0.25); m.resetScram();
  run(m, 600, 0.2, () => { m.ctl.rodCmd = !m.scrammed && m.sur < 0.5 && m.frac < 0.06 ? 1 : 0; });
  check('Sub: fast recovery startup', !m.scrammed && m.frac > 0.02, `${(m.frac * 100).toFixed(1)}%, battery ${m.battery.toFixed(0)}%`);
}

// Browns Ferry: with every high-pressure system lost, relief valves + booster pump keep the core covered.
{
  const m = new BWRModel();
  run(m, 120, 0.5);
  check('BWR steady at full power', Math.abs(m.frac - 1) < 0.05 && Math.abs(m.level - 33) < 3, `${(m.frac * 100).toFixed(0)}%, ${m.level.toFixed(0)} in`);
  Object.assign(m.avail, { hpci: false, rcic: false, cs: [false, false], lpci: [false, false], feed: false });
  m.scram('manual'); m.setMsiv(false); run(m, 600, 0.5);
  let minLc = 99;
  run(m, 7200, 0.5, () => { m.ctl.cbp = m.Lc < 40; const open = m.P > 150; m.ctl.srv = m.ctl.srv.map((x, i) => i < 4 && open); minLc = Math.min(minLc, m.Lc); });
  check('BWR fire: core stays covered', minLc > m.spec.TAF && m.damage === 0, `lowest ${minLc.toFixed(0)} in (TAF ${m.spec.TAF})`);
}

// TMI-2: the historical actions melt about half the core; closing the block valve early saves it.
{
  const replay = (early) => {
    const m = new TMIModel(); let opened = false;
    const step = (sec) => run(m, sec, 0.25, () => { if (m.t > 7) m.ctl.mainFeed = false; if (m.porvSolenoid) opened = true; if (opened && !m.porvStuck && !m.porvSolenoid) m.porvStuck = true; });
    if (early) { step(600); m.ctl.blockValve = false; m.ctl.efwBlock = [true, true]; step(3000); return m; }
    step(270); m.ctl.hpi = [true, false, false]; m.ctl.hpiValve = 0.12; step(210); m.ctl.efwBlock = [true, true];
    step(66 * 60); m.ctl.rcp = [true, false, true, false]; step(26 * 60); m.ctl.rcp = [false, false, false, false]; step(42 * 60); m.ctl.blockValve = false; step(30 * 60);
    return m;
  };
  const hist = replay(false), good = replay(true);
  check('TMI: historical path → partial meltdown', hist.damage > 0.3, `${(hist.damage * 100).toFixed(0)}% damaged`);
  check('TMI: block valve at 10 min → no damage', good.damage === 0 && good.subcooling > 20, `subcooling ${good.subcooling.toFixed(0)} °F`);
}

// Chernobyl 4: the historical night destroys the reactor; the programme's limits keep it intact.
{
  const op = (m) => { m.ctl.rrCmd = (m.MW < m.ctl.setMW * 0.97 && m.sur < 0.2) ? 1 : (m.MW > m.ctl.setMW * 1.03 && m.sur > -0.2) ? -1 : 0; };
  const go = (m, sec, f) => { for (let i = 0; i < sec * 5 && !m.destroyed; i++) { f?.(m); m.step(0.2); } };
  const hist = new RBMKModel();
  for (let k = 0; k < 11; k++) { hist.ctl.setMW = 1600 - (900 * (k + 1)) / 11; go(hist, 300, op); }
  go(hist, 23 * 60, op); hist.ctl.autoMode = 'AR'; hist.ctl.setMW = 30; go(hist, 300, op);
  hist.ctl.setMW = 200; go(hist, 27 * 60, op); hist.ctl.mcp = hist.ctl.mcp.map(() => true); hist.ctl.feed = 1.6; go(hist, 18 * 60, op); hist.ctl.feed = 0.9; go(hist, 304, op);
  const orm = hist.orm;
  hist.ctl.tripBlocked = true; hist.startTest(); go(hist, 36); hist.pressAZ5(); go(hist, 20);
  check('RBMK: historical night → destroyed', hist.destroyed, `ORM at test ${orm.toFixed(1)}, peak ${hist.peakMW.toFixed(0)} MW`);
  const safe = new RBMKModel();
  for (let k = 0; k < 11; k++) { safe.ctl.setMW = 1600 - (800 * (k + 1)) / 11; go(safe, 300, op); }
  go(safe, 1200, op); safe.ctl.tripBlocked = true; safe.startTest(); go(safe, 45, op); safe.pressAZ5(); go(safe, 40);
  check('RBMK: test at 800 MW with margin → intact', !safe.destroyed && safe.MW < 50, `peak ${safe.peakMW.toFixed(0)} MW`);
}


// AP1000 (Vogtle 3): a cold heat-up inside the P–T limits; first criticality above the predicted
// boron; a positive temperature coefficient at zero power; the hunting feedwater valve trips the
// plant in AUTO but not in MANUAL; after a trip with no feedwater, passive RHR cools it.
{
  const m = new AP1000Model({ offset: 35 }), P = m.plant, c = P.ctl;
  for (let i = 0; i < 4; i++) P.setPump(i, true);
  run(m, 600, 0.5); c.rns = false;
  let ptOk = true, maxRate = 0;
  while (P.Tavg < 556 && m.t < 12 * 3600) run(m, 60, 0.5, () => { c.pzrSet = Math.min(2235, Math.max(c.pzrSet, Math.ceil((PT.min(P.Tavg) + 150) / 25) * 25)); if (P.Ppzr > PT.max(P.Tavg) + 5 || P.Ppzr < PT.min(P.Tavg) - 5) ptOk = false; if (m.t > 1800) maxRate = Math.max(maxRate, P.heatupRate); });
  c.pzrSet = 2235; run(m, 1200, 0.5);
  check('AP1000 heat-up to hot standby inside P–T limits, ≤100 °F/h', ptOk && P.Tavg > 555 && maxRate <= 100, `${P.Tavg.toFixed(0)} °F, ${P.Ppzr.toFixed(0)} psig, peak ${maxRate.toFixed(0)} °F/h, ${(m.t / 3600).toFixed(1)} h`);
  m.sdDemand = true; run(m, 1500, 0.5);
  while (m.ctlSteps < AP.dilutionSteps) { c.lever = 1; m.step(0.5); } c.lever = 0;
  c.makeup = 'dilute'; c.gpm = 150;
  while (m.k.rho < 0 && m.t < 30 * 3600) { if (m.k.rho > -0.004) c.gpm = 15; run(m, 10, 0.5, () => { if (P.P6) c.srBlock = true; }); }
  c.makeup = 'off';
  const blk = () => { if (P.P6) c.srBlock = true; if (P.P10) c.prBlock = true; };
  check('AP1000 critical above the predicted boron', P.boron > AP.predictedCB + 10, `${P.boron.toFixed(0)} ppm vs ${AP.predictedCB}`);
  run(m, 300, 0.5, blk);
  const r0 = m.k.rho, T0 = P.Tavg; c.dumpSet = 1060; run(m, 300, 0.5, blk);
  const itc = ((m.k.rho - r0) * 1e5) / (P.Tavg - T0);
  check('AP1000 ITC positive at zero power', itc > 0 && itc < 3, `${itc.toFixed(2)} pcm/°F`);
  c.dumpSet = 1092;
  run(m, 1800, 0.5, () => { blk(); c.lever = m.frac < 0.03 && P.sur < 0.5 ? 1 : 0; });
  P.latchTurbine(); c.loadSet = 26; c.loadRate = 3;
  run(m, 1500, 0.5, () => { if (P.P10) c.prBlock = true; if (P.C5) { c.lever = 0; c.rodMode = 'auto'; } else c.lever = P.Tavg < P.Tref - 1.5 ? 1 : 0; c.makeup = m.banks[3] > 175 ? 'dilute' : 'off'; c.gpm = 40; });
  c.makeup = 'off';
  check('AP1000 steady at 25% on auto rods', Math.abs(m.frac - 0.26) < 0.03 && !P.trip.latched, `${(m.frac * 100).toFixed(1)}%, Tavg ${P.Tavg.toFixed(1)} vs ${P.Tref.toFixed(1)}`);
  // Manual: the operator matches feed to steam.
  const sg = { min: 100, max: 0 };
  P.startFwFault(); c.fwMode = 'man';
  run(m, 600, 0.5, () => { c.fwDemand = Math.round(100 * (P.steamFrac + 0.01 * (50 - P.sgInv))); sg.min = Math.min(sg.min, P.sgInv); sg.max = Math.max(sg.max, P.sgInv); });
  check('AP1000 hunting FW valve: manual control holds SG level', !P.trip.latched && sg.min > 35 && sg.max < 65, `${sg.min.toFixed(0)}–${sg.max.toFixed(0)}%`);
  // Back to AUTO: it trips the plant.
  c.fwMode = 'auto'; P.fwValve += 0.1; let tTrip = null;
  run(m, 900, 0.5, () => { if (P.trip.latched && tTrip === null) tTrip = m.t; });
  check('AP1000 hunting FW valve in AUTO trips the reactor', P.trip.latched && (P.trip.firstOut === 'sgHigh' || P.trip.firstOut === 'sgLow'), `${P.trip.firstOut}`);
  P.sufwFailed = true;
  let t530 = null; const t0 = m.t;
  run(m, 3 * 3600, 0.5, () => { if (t530 === null && P.prhr && P.Tavg < 530) t530 = m.t; });
  check('AP1000 passive RHR cools the plant below 530 °F', t530 !== null && P.Ppzr < 2485, `${t530 ? ((t530 - t0) / 60).toFixed(0) : '—'} min after the trip, IRWST ${P.Tirwst.toFixed(0)} °F`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
