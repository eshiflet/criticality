import { RBMKModel } from '../../js/models/rbmk.js';
const path = process.argv[2] || 'hist';
const m = new RBMKModel();
const clock = () => { const t = 23 * 3600 + 10 * 60 + m.t; const hh = Math.floor(t / 3600) % 24, mm = Math.floor(t / 60) % 60, ss = Math.floor(t % 60); return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; };
const show = (l) => console.log(clock(), l.padEnd(14), 'MW', m.MW.toFixed(0).padStart(6), 'ORM', m.orm.toFixed(1).padStart(5), 'xe', m.xe.X.toFixed(2), 'void', m.void.toFixed(1), 'flow', m.flow.toFixed(2), 'rho/β', (m.rho()/m.spec.beta).toFixed(3), 'fuel', m.Tfuel.toFixed(0), m.destroyed ? 'DESTROYED' : '', m.az5 !== null ? 'AZ5 ' + (m.why) : '', [...m.alarms].join(' '));
// Operator: move RR rods to hold a power target (the automatics trim).
const hold = (mw, sec, extra) => { for (let i = 0; i < sec * 5; i++) { extra?.(); const e = m.MW - mw; m.ctl.rrCmd = (m.MW < m.ctl.setMW * 0.97 && m.sur < 0.2) ? 1 : (m.MW > m.ctl.setMW * 1.03 && m.sur > -0.2) ? -1 : 0; m.step(0.2); if (m.destroyed) return; } };
show('start');
if (path === 'hist') {
  m.ctl.setMW = 1600;
  for (let k = 0; k < 11; k++) { m.ctl.setMW = 1600 - (900 * (k + 1)) / 11; hold(m.ctl.setMW, 300); } show('00:05 720 MW');
  hold(720, 23 * 60); m.ctl.autoMode = 'AR'; m.ctl.setMW = 30; hold(30, 300); show('00:33 collapse');
  m.ctl.setMW = 200; for (let i = 0; i < 27 * 60 && !m.destroyed; i++) hold(200, 1); show('01:00 200 MW');
  m.ctl.mcp = [true, true, true, true, true, true, true, true]; m.ctl.feed = 1.6; hold(200, 18 * 60); show('01:18 8 pumps'); m.ctl.feed = 0.9; hold(200, 5 * 60 + 4); show('01:23:04');
  m.ctl.tripBlocked = true; m.startTest(); m.ctl.autoMode = 'AR';
  for (let i = 0; i < 36 * 5; i++) { m.step(0.2); } show('01:23:40');
  m.pressAZ5(); for (let i = 0; i < 100; i++) { m.step(0.1); if (i % 10 === 9) show('AZ5 +' + ((i + 1) / 10).toFixed(0) + 's'); if (m.destroyed) break; }
  show('end peak ' + m.peakMW.toFixed(0));
} else {
  for (let k = 0; k < 11; k++) { m.ctl.setMW = 1600 - (800 * (k + 1)) / 11; hold(m.ctl.setMW, 300); } show('800 MW');
  hold(800, 40 * 60); show('wait');
  m.startTest(); m.ctl.tripBlocked = true; for (let i = 0; i < 40 * 5; i++) m.step(0.2); show('test 40s');
  m.pressAZ5(); for (let i = 0; i < 30; i++) { m.step(1); if (i % 5 === 4) show('AZ5 +' + (i + 1) + 's'); } show('end peak ' + m.peakMW.toFixed(0));
}
