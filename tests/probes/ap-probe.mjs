import { AP1000Model, AP, PT } from '../../js/models/ap1000.js';
const m = new AP1000Model({ offset: 35 }), P = m.plant, c = P.ctl;
const log = (s) => console.log(`${(m.t/3600).toFixed(2)}h ${s} | Tavg ${P.Tavg.toFixed(1)} P ${P.Ppzr.toFixed(0)} [${PT.min(P.Tavg).toFixed(0)}-${PT.max(P.Tavg).toFixed(0)}] rate ${P.heatupRate.toFixed(0)} B ${P.boron.toFixed(0)} rho ${(m.rho()*1e5).toFixed(0)}pcm frac ${m.frac.toExponential(2)} cps ${P.srCps.toFixed(1)} stm ${P.steamPsig.toFixed(0)} sg ${P.sgInv.toFixed(0)} pzrL ${P.pzrLevel.toFixed(0)}`);
log('start');
for (let i=0;i<4;i++) P.setPump(i,true);
const run = (sec, f) => { for (let t=0;t<sec;t+=0.5){ f?.(); m.step(0.5);} };
run(600); log('pumps on, RNS in');
c.rns = false;
let hr=0;
while (P.Tavg < 556 && m.t < 8*3600) { run(600, () => { c.pzrSet = Math.min(2235, Math.max(P.ptMin + 120, c.pzrSet)); if (P.Tavg>400) c.pzrSet = Math.min(2235, Math.max(c.pzrSet, P.ptMin+200)); }); log('heatup'); }
c.pzrSet = 2235; run(1800); log('hsb');
m.sdDemand = true; run(1500); log('SD out ' + m.shutdown.map(Math.round));
// M banks to dilution position
while (m.ctlSteps < AP.dilutionSteps) { c.lever = 1; m.step(0.5); } c.lever = 0; log('M banks at ' + m.rodLabel);
c.makeup='dilute'; c.gpm=150;
const cps0 = P.srCps;
while (m.rho() < -0.0003 && m.t < 20*3600) { run(300); log(`dilute 1/M ${(cps0/P.srCps).toFixed(3)}`); }
c.gpm = 20; while (m.rho()<0.0005) run(30); c.makeup='off'; log('critical? sur ' + P.sur.toFixed(2));
run(300); log('after 5 min sur ' + P.sur.toFixed(2));
console.log('mtc', P.mtc.toFixed(2), 'ITC', (P.mtc + P.doppler).toFixed(2));
