// From HZP critical: ITC, power ascension, feedwater fault (manual vs auto → trip → PRHR).
import { AP1000Model, AP } from '../../js/models/ap1000.js';
const setup = () => {
  const m = new AP1000Model({ offset: 35 }), P = m.plant, c = P.ctl;
  P.Tavg = P.Tf = P.Ts = 557; P.Ppzr = 2235; c.pzrSet = 2235; c.rns = false; c.pumps = [true,true,true,true]; P.flow = [1,1,1,1]; P.pzrLev = 25;
  m.shutdown = [269,269,269,269]; m.sdDemand = true; m.ctlSteps = AP.dilutionSteps; P.boron = m.actualCB - 3;
  return m;
};
const run = (m, sec, f) => { for (let t=0;t<sec;t+=0.5){ f?.(); m.step(0.5);} };
const log = (m, s) => { const P=m.plant; console.log(`${(m.t/60).toFixed(1)}m ${s} | frac ${m.frac.toExponential(2)} Tavg ${P.Tavg.toFixed(1)} rho ${(m.k.rho*1e5).toFixed(1)} sur ${P.sur.toFixed(2)} sg ${P.sgInv.toFixed(1)} feed ${P.feedFrac.toFixed(3)} stm ${P.steamFrac.toFixed(3)} trip ${P.trip.firstOut} prhr ${P.prhr} Tirw ${P.Tirwst.toFixed(0)} P ${P.Ppzr.toFixed(0)} pzrL ${P.pzrLevel.toFixed(0)} MWe ${P.MWe.toFixed(0)} B ${P.boron.toFixed(0)} MD ${m.banks[3].toFixed(0)}`); };
for (const mode of ['man','auto']) {
  const m = setup(), P = m.plant, c = P.ctl;
  run(m, 600, () => { if (P.P6) c.srBlock = true; }); log(m, 'crit');
  // ITC: mark, lower dump set 30 psig
  const r0 = m.k.rho, T0 = P.Tavg; c.dumpSet = 1060; run(m, 240); log(m, 'dump 1060'); console.log('ITC', ((m.k.rho - r0)*1e5/(P.Tavg - T0)).toFixed(2));
  c.dumpSet = 1092;
  // to POAH: withdraw a bit
  run(m, 1800, () => { if (P.P6) c.srBlock = true; if (P.P10) c.prBlock = true; c.lever = m.frac < 0.03 && P.sur < 0.5 ? 1 : 0; }); log(m, 'poah');
  console.log(P.latchTurbine()); c.loadSet = 26; c.loadRate = 3;
  run(m, 900, () => { if (P.P10) c.prBlock = true; if (P.C5) { c.lever = 0; c.rodMode = 'auto'; } else c.lever = P.Tavg < P.Tref - 1.5 ? 1 : 0; c.makeup = m.banks[3] > 175 ? 'dilute' : 'off'; c.gpm = 40; }); log(m, 'loaded');
  run(m, 600, () => { c.makeup = m.banks[3] > 175 ? 'dilute' : 'off'; }); c.makeup='off'; log(m, 'settled'); P.startFwFault();
  for (let k=0;k<(mode==="man"?4:30);k++) { run(m, 30, () => { if (mode==='man' && m.t > 0 && k>=2) { if (c.fwMode!=='man') { c.fwMode='man'; c.fwDemand=Math.round(100*P.steamFrac);} c.fwDemand = Math.round(100*(P.steamFrac + 0.01*(50-P.sgInv))); } }); log(m, `fault ${mode}`); }
  if (P.trip.latched) { P.sufwFailed = true; for (let k=0;k<16;k++){ run(m, 300); log(m, "post-trip"); } }
}
