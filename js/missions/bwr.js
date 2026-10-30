// Mission 3: the Browns Ferry fire, 22 March 1975.

import { BWRModel } from '../models/bwr.js';
import { buildBWR } from '../ui/panels/bwr.js';
import { grade } from '../game/runner.js';

const SE = { name: 'Shift Engineer', role: 'Browns Ferry', tag: 'SE', color: '#9fd39b' };
const FIRE = { name: 'Fire watch', role: 'Cable spreading room', tag: '🔥', color: '#ff9a5a' };

const lose = (g, text) => g.say('log', `<b>Lost:</b> ${text}`, 'bad');

export const bwr = {
  id: 'bwr', theme: 'bwr', accent: '#9fd39b', reactorName: 'Browns Ferry 1 (GE BWR/4)',
  title: 'Candle', place: 'Browns Ferry Unit 1 · Athens, Alabama (TVA)', date: '22 March 1975',
  teaser: 'The largest reactor in the world. Two electricians, a candle, and a wall of cables underneath your control room. Keep the core covered as the systems die one by one.',
  clockStart: 12 * 3600 + 20 * 60,
  speeds: [1, 2, 5, 10, 30],
  people: { se: SE, fire: FIRE },
  makeModel: () => new BWRModel({ power: 1.0 }),
  makePanel: buildBWR,
  briefing: [
    { who: 'okafor', text: 'Browns Ferry Unit 1: a General Electric boiling water reactor, 3,293 megawatts of heat, the biggest in the world when TVA built it. In a BWR the water boils in the core and the steam goes straight to the turbine. Two things matter most: the <b>reactor water level</b>, which must stay above the top of the fuel, and the <b>pressure</b>, which decides which pumps can put water in.' },
    { who: 'okafor', text: 'High-pressure systems (feedwater, <b>HPCI</b>, <b>RCIC</b>, the CRD pumps) can push water into the vessel at 1,000 psig. The low-pressure ones (core spray, LPCI, and the condensate booster pumps) can\'t: the vessel has to be <b>depressurized</b> first, by opening the safety/relief valves (SRVs) and blowing steam into the suppression pool.' },
    { who: 'okafor', text: 'Under your control room is the cable spreading room: thousands of cables to every pump, valve and instrument. Where they pass through the wall into the reactor building, the penetrations are being sealed with polyurethane foam. To check for air leaks, the electricians hold up a candle and watch the flame.' },
    { who: 'okafor', text: 'I won\'t tell you what happens next. I\'ll tell you what the operators had at the end: a few relief valves, the condensate booster pump, the control rod drive pumps, and their own judgement. That was enough. Make it enough.' },
  ],
  controlsHelp: '<b>Scram:</b> lift a guard and press; or turn the mode switch to SHUT DN. <b>Levels:</b> narrow range is normal operation; the <i>fuel zone</i> meter has the top of active fuel (−162 in) marked red. <b>SRVs:</b> each toggle opens one valve; each passes ~800,000 lb/h of steam at full pressure. <b>Booster pump:</b> can inject below ~450 psig, and well below 350. <b>Dead controls</b> are greyed out: their cables have burned.',
  opening: 'Unit 1 at 100%, 1,098 megawatts electric. Units 1 and 2 share this control room. Quiet Saturday.',
  objectives: [
    { id: 'scram', text: 'When the plant starts to go wrong, scram the reactor', hidden: true, showIf: (m, g) => g.flags.fire, check: (m, g) => g.flags.fire && m.scrammed },
    { id: 'depress', text: 'Depressurize below 350 psig with the relief valves', hidden: true, showIf: (m, g) => g.flags.hpLost, check: (m, g) => g.flags.hpLost && m.P < 350 },
    { id: 'cbp', text: 'Inject with the condensate booster pump', hidden: true, showIf: (m, g) => g.flags.hpLost, check: (m) => m.q.wCbp > 0.1 },
    { id: 'covered', text: 'Keep the core covered until the fire is out (16:00)', check: (m, g) => g.clock >= 16 * 3600 && m.Lc > m.spec.TAF },
    { id: 'margin', text: 'Never let the level fall within 4 feet of the fuel', optional: true, check: (m, g) => g.clock >= 16 * 3600 && (g.flags.minLc ?? 99) > m.spec.TAF + 48 },
  ],
  onTick(m, g, dt) {
    const f = g.flags;
    f.minLc = Math.min(f.minLc ?? 99, m.Lc);
    f.maxPool = Math.max(f.maxPool ?? 0, m.pool);
    if (m.Lc > 100) f.flooded = true;
    if (m.scrammed && !f.scramT) f.scramT = g.t;
    if (m.Lc < m.spec.TAF) f.uncoveredT = (f.uncoveredT ?? 0) + dt;
  },
  script: [
    { at: 40, do: (m, g) => g.say('okafor', 'Below you, an electrician holds a candle to a cable penetration. The draught pulls the flame into the foam. It catches.') },
    { at: 110, do: (m, g) => { g.flags.fire = true; g.root.querySelector('.panel')?.classList.add('smoke'); g.slow(2); g.say('fire', 'Fire! Fire in the cable spreading room at the Unit 1 penetration! We\'re fighting it with CO₂ extinguishers, it keeps flaring up.'); } },
    { at: 300, do: (m, g) => { g.slow(1); m.ctl.cs = ['on', 'on']; g.say('se', 'What the — core spray and RHR pumps just started by themselves. Nobody touched them.'); g.say('okafor', 'Burning cables short together. Pumps start, valves move, lamps glow and fade. Nothing on the board can be trusted completely now.'); } },
    { at: 330, do: (m, g) => { m.ctl.cs = ['auto', 'auto']; m.avail.cs[0] = false; m.avail.lpci[0] = false; lose(g, 'core spray A, LPCI A'); } },
    { at: 420, do: (m, g) => { m.avail.recirc[1] = false; m.ctl.recirc[1] = false; lose(g, 'recirculation pump B — power falling'); g.say('se', 'Recirc pump B is gone. Power\'s dropping and the board\'s lit up like Christmas. <b>Scram the reactor.</b>'); } },
    { at: 600, do: (m, g) => { if (!m.scrammed) { m.scram('manual'); g.say('se', 'I\'ve scrammed it. Next time don\'t make me ask twice.', 'warn'); g.flags.lateScram = true; } } },
    { when: (m, g) => m.scrammed && g.t > (g.flags.scramT ?? 1e9) + 30 && !g.flags.isolated, do: (m, g) => { g.flags.isolated = true; m.msivClosed = true; m.ctl.msiv = false; m.avail.msivCtl = false; m.avail.feed = false; lose(g, 'MSIV control — the main steam isolation valves have shut. No steam to the feed pump turbines: feedwater is gone.'); g.say('okafor', 'The vessel is isolated. Decay heat boils the water off; the relief valves will lift to hold pressure. HPCI and RCIC are your high-pressure makeup — for now.'); } },
    { when: (m, g) => g.flags.isolated && g.t > (g.flags.scramT ?? 1e9) + 180, do: (m, g) => { m.avail.hpci = false; lose(g, 'HPCI'); } },
    { when: (m, g) => g.flags.isolated && g.t > (g.flags.scramT ?? 1e9) + 300, do: (m, g) => { m.avail.rcic = false; m.avail.cs[1] = false; m.avail.lpci[1] = false; m.avail.recirc[0] = false; m.ctl.recirc[0] = false; for (let i = 4; i < 13; i++) m.avail.srv[i] = false; g.flags.hpLost = true; lose(g, 'RCIC, core spray B, LPCI B, recirc pump A, relief valves 5–13'); g.slow(1); g.say('okafor', 'That\'s every high-pressure system. What\'s left: relief valves 1–4, the CRD pumps, and the <b>condensate booster pump</b> — which can only push water in once pressure is below about 350 psig. Open relief valves to blow the pressure down. Line up the booster pump. Watch the level: blowing down drops it.'); } },
    { when: (m, g) => g.flags.hpLost && g.t > (g.flags.scramT ?? 1e9) + 2400, do: (m, g) => { g.flags.srvLost = true; m.avail.srv = m.avail.srv.map(() => false); m.ctl.srv = m.ctl.srv.map(() => false); lose(g, 'relief valve control — all of them'); g.say('okafor', 'At 1:20 that afternoon, the operators lost the relief valves too, for almost an hour. If you got the pressure down in time, the booster pump keeps feeding. If you didn\'t…'); } },
    { when: (m, g) => g.flags.srvLost && g.t > (g.flags.scramT ?? 1e9) + 2400 + 3300, do: (m, g) => { for (let i = 0; i < 4; i++) m.avail.srv[i] = true; g.say('se', 'Relief valve control is back — four of them.'); } },
    { at: 3 * 3600 + 20 * 60, do: (m, g) => g.say('fire', 'Fire\'s finally out — the fire service put water on it. Seven and a half hours.') },
  ],
  fail(m, g) {
    if (m.damage > 0.02) return 'The fuel uncovered long enough for the cladding to fail. Browns Ferry 1 would have been the first core damage accident in an American power reactor — four years before Three Mile Island.';
    return null;
  },
  win: (m, g) => g.done.has('covered'),
  score(m, g, r) {
    if (r.failed) return { score: 20, notes: [] };
    const f = g.flags, notes = [];
    let s = 55;
    const margin = (f.minLc ?? 0) - m.spec.TAF;
    if (margin > 48) { s += 15; notes.push(`Lowest level: ${margin.toFixed(0)} in above the top of the fuel. +15`); } else notes.push(`Lowest level: ${margin.toFixed(0)} in above the top of the fuel. +0`);
    if (!f.lateScram) { s += 10; notes.push('Scrammed when the shift engineer asked. +10'); }
    if (g.done.has('depress')) { s += 10; notes.push('Depressurized for the low-pressure makeup. +10'); }
    if ((f.maxPool ?? 0) < 160) { s += 5; notes.push(`Suppression pool peaked at ${f.maxPool.toFixed(0)} °F. +5`); } else notes.push(`Suppression pool reached ${f.maxPool.toFixed(0)} °F: hot. +0`);
    if (!f.flooded) { s += 5; notes.push('Never flooded water up into the steam lines. +5'); } else notes.push('Level went above the steam lines at one point. +0');
    return { score: Math.min(100, s), grade: grade(s), headline: 'The core stayed covered', notes };
  },
  epilogue: `<p>At about 12:20 on 22 March 1975, an electrician checking for air leaks with a candle set the polyurethane foam sealing a cable penetration on fire. CO₂ and dry chemical extinguishers kept failing to put it out; the fire burned for about seven and a half hours, through some 1,600 cables, many of them for Unit 1's safety systems.</p>
  <p>In the control room, pumps started and stopped on their own and indications failed. Unit 1 was scrammed; its emergency core cooling systems were lost. The operators depressurized the reactor with the four relief valves they still controlled and kept the core covered with the condensate booster pump and the control rod drive pumps — systems never intended for the job. At one point the level dropped to within a few feet of the fuel. Relief valve control was lost from about 1:20 to 2:15 pm.</p>
  <p>Nobody was hurt and no radiation was released. The fire led directly to the NRC's fire-protection rule (10 CFR 50, Appendix R): separation of redundant safety trains, fire barriers, and safe-shutdown analyses. Unit 1 was repaired and restarted in 1976.</p>`,
};
