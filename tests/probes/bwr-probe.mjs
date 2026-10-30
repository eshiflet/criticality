import { BWRModel } from '../../js/models/bwr.js';
const m = new BWRModel();
const show = (l) => console.log(l.padEnd(14), 't', m.t.toFixed(0).padStart(5), 'P%', (m.frac*100).toFixed(1).padStart(6), 'core', (m.q.core*100).toFixed(1), 'psig', m.P.toFixed(0), 'lvl', m.level.toFixed(1), 'Lc', m.Lc.toFixed(0), 'flow', (m.flowFrac*100).toFixed(0), 'void', m.alpha.toFixed(2), 'srv', m.q.srvOpen, 'pool', m.pool.toFixed(0), 'clad', m.Tclad.toFixed(0), 'dmg', m.damage.toFixed(3), m.why ?? '', [...m.alarms].join(' '));
for (let i = 0; i < 120; i++) m.step(1); show('steady');
m.ctl.recircSpeed = [0.5, 0.5]; for (let i = 0; i < 120; i++) m.step(1); show('flow 50%');
m.ctl.recircSpeed = [1, 1]; for (let i = 0; i < 120; i++) m.step(1); show('flow back');
// Fire: lose HPCI, RCIC, CS, LPCI, feed; scram; MSIVs close.
Object.assign(m.avail, { hpci: false, rcic: false, cs: [false, false], lpci: [false, false], feed: false });
m.scram('manual'); m.setMsiv(false);
for (let i = 0; i < 60; i++) m.step(1); show('isolated 1m');
for (let i = 0; i < 600; i++) m.step(1); show('isolated 11m');
m.ctl.srv = m.ctl.srv.map((x, i) => i < 4); m.ctl.cbp = true;
for (let k = 0; k < 6; k++) { for (let i = 0; i < 300; i++) m.step(1); show(`blowdown ${5*(k+1)}m`); }
m.ctl.srv = m.ctl.srv.map((x, i) => i < 1);
for (let i = 0; i < 1200; i++) m.step(1); show('hold');
