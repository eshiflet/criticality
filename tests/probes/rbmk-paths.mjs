import { RBMKModel } from '../../js/models/rbmk.js';
const op = (m) => { m.ctl.rrCmd = (m.MW < m.ctl.setMW * 0.97 && m.sur < 0.2) ? 1 : (m.MW > m.ctl.setMW * 1.03 && m.sur > -0.2) ? -1 : 0; };
const run = (m, sec, f) => { for (let i = 0; i < sec * 5 && !m.destroyed; i++) { f?.(m); m.step(0.2); } };
const toCollapse = () => { const m = new RBMKModel(); for (let k = 0; k < 11; k++) { m.ctl.setMW = 1600 - (900 * (k + 1)) / 11; run(m, 300, op); } run(m, 23 * 60, op); m.ctl.autoMode = 'AR'; m.ctl.setMW = 30; run(m, 300, op); return m; };
const res = (name, m) => console.log(name.padEnd(34), 'destroyed', m.destroyed, 'peak', m.peakMW.toFixed(0), 'ORM', m.orm.toFixed(1), 'MW', m.MW.toFixed(1));
// A: refuse right after the collapse: AZ-5.
{ const m = toCollapse(); m.pressAZ5(); run(m, 40); res('A collapse → AZ-5', m); }
// B: follow orders to ORM ~8 at 200 MW, then insert RR manually (no AZ-5), then AZ-5 once ORM > 20.
{ const m = toCollapse(); m.ctl.setMW = 200; run(m, 27 * 60, op); m.ctl.mcp = m.ctl.mcp.map(() => true); m.ctl.feed = 1.6; run(m, 18 * 60, op); m.ctl.feed = 0.9; run(m, 5 * 60, op);
  const o = m.orm; m.ctl.autoMode = 'MAN'; m.ctl.rrCmd = -1; run(m, 80); m.ctl.rrCmd = 0; const o2 = m.orm; m.pressAZ5(); run(m, 40); res(`B ORM ${o.toFixed(1)}→${o2.toFixed(1)} manual, then AZ-5`, m); }
// C: same but AZ-5 straight away at ORM ~8 before the test.
{ const m = toCollapse(); m.ctl.setMW = 200; run(m, 27 * 60, op); m.ctl.mcp = m.ctl.mcp.map(() => true); m.ctl.feed = 1.6; run(m, 18 * 60, op); m.ctl.feed = 0.9; run(m, 5 * 60, op); m.pressAZ5(); run(m, 40); res('C AZ-5 at ORM~8 before test', m); }
// D: test at 700+ with ORM >= 15 (no collapse).
{ const m = new RBMKModel(); for (let k = 0; k < 11; k++) { m.ctl.setMW = 1600 - (850 * (k + 1)) / 11; run(m, 300, op); } run(m, 1200, op); m.ctl.tripBlocked = true; m.startTest(); run(m, 45, op); m.pressAZ5(); run(m, 40); res('D test at 750 MW, then AZ-5', m); }
