import { TMIModel } from '../../js/models/tmi.js';
const hist = process.argv[2] !== 'save';
const m = new TMIModel();
const show = (l) => console.log(l.padEnd(12), 'min', (m.t/60).toFixed(1).padStart(6), 'P', m.P.toFixed(0).padStart(5), 'pzr', m.pzrLevel.toFixed(0).padStart(4), 'T', m.T.toFixed(0), 'Thot', m.Thot.toFixed(0), 'sub', m.subcooling.toFixed(0), 'M%', (100*m.M/m.Mnom).toFixed(0), 'void', m.voidLoop.toFixed(2), 'sg', m.sgLevel.map(x=>x.toFixed(0)).join('/'), 'hpi', (m.q.wHpi*1000).toFixed(0), 'porv', (m.q.wPorv*1000).toFixed(0), 'rcdt', m.rcdtP.toFixed(0), 'tail', m.tailpipe.toFixed(0), 'clad', m.Tclad.toFixed(0), 'dmg', (m.damage*100).toFixed(1), m.why ?? '');
show('start');
m.ctl.mainFeed = false;
let stuck = false;
const run = (sec, f) => { for (let i = 0; i < sec * 5; i++) { f?.(); m.step(0.2); if (!stuck && m.porvSolenoid) stuck = m.porvStuck = true; } };
run(15); show('15 s');
run(105); show('2 min');
if (hist) { run(150); m.ctl.hpiValve = 0.12; m.ctl.hpi = [true, false, false]; show('4.5 min thr'); run(210); m.ctl.efwBlock = [true, true]; show('8 min EFW'); 
  run(66*60); m.ctl.rcp = [true, false, true, false]; show('74 min'); run(26*60); m.ctl.rcp = [false,false,false,false]; show('100 min');
  for (let k = 0; k < 7; k++) { run(6*60); show(`${106+6*k} min`); }
  m.ctl.blockValve = false; show('142 block'); run(30*60); show('172 min'); }
else { run(360); m.ctl.efwBlock = [true, true]; m.ctl.blockValve = false; show('8 min fix'); for (let k=0;k<6;k++){ run(600); show(`${18+10*k} min`);} }
