import { SequoyahModel } from '../js/models/sequoyah.js';
const m = new SequoyahModel({ boron: 1180 });
const P = m.plant;
console.log('start rho', (m.rho()*1e5).toFixed(0), 'pcm  SR', P.srCps?.toFixed?.(1), 'frac', m.frac.toExponential(2));
// find critical demand
for (let d = 0; d <= m.maxSteps; d += 20) { m.ctlSteps = d; if (m.rho() > 0) { console.log('critical near demand', d, 'banks', m.banks.map(Math.round)); break; } }
m.ctlSteps = 0;
let t = 0; const blocks = () => { if (P.P6) P.ctl.srBlock = true; if (P.P10) P.ctl.prBlock = true; };
while (t < 3600) { blocks(); P.ctl.lever = m.frac < 0.02 && P.sur < 0.5 ? 1 : 0; const w = m.step(0.5); t += 0.5; if (w) { console.log('TRIP', w, t); break; } }
console.log('t', t, 'frac', (m.frac*100).toFixed(2), '% banks', m.banks.map(Math.round), 'Tavg', P.Tavg.toFixed(1), 'SUR', P.sur.toFixed(2));
P.latchTurbine(); P.ctl.loadSet = 100; P.ctl.loadRate = 5;
while (t < 3600 + 1800) { blocks(); if (P.C5) { P.ctl.lever = 0; P.ctl.rodMode = 'auto'; } else P.ctl.lever = P.Tavg < P.Tref - 1.5 ? 1 : 0; P.ctl.makeup = m.ctlSteps > m.maxSteps - 60 ? 'dilute' : 'off'; P.ctl.gpm = 150; const w = m.step(0.5); t += 0.5; if (w) { console.log('TRIP', w, t); break; } }
console.log('t', t, 'frac', (m.frac*100).toFixed(1), '% load', (P.load*100).toFixed(0), 'Tavg', P.Tavg.toFixed(1), 'Tref', P.Tref.toFixed(1), 'B', P.boron.toFixed(0), 'banks', m.banks.map(Math.round), 'MWe', P.MWe.toFixed(0));
