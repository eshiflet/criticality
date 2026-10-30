// Mission 4: Three Mile Island Unit 2, 28 March 1979.

import { TMIModel } from '../models/tmi.js';
import { buildTMI } from '../ui/panels/tmi.js';
import { grade } from '../game/runner.js';

const SS = { name: 'Shift Supervisor', role: 'Unit 2', tag: 'SS', color: '#ffb35c' };
const U1 = { name: 'Supervisor from Unit 1', role: 'just arrived', tag: 'U1', color: '#9fd0ff' };

export const tmi = {
  id: 'tmi', theme: 'tmi', accent: '#ff9a3c', reactorName: 'Three Mile Island 2 (B&W PWR)',
  title: 'Stuck Open', place: 'Three Mile Island Unit 2 · Middletown, Pennsylvania', date: '28 March 1979',
  teaser: '4 a.m. A feedwater trip, a relief valve that opens as designed — and doesn’t close. The light says it did. Everything you were trained to fear is the opposite of what is happening.',
  clockStart: 4 * 3600 + 0 * 60 + 30,
  speeds: [1, 2, 5, 10, 30],
  maxStep: 0.25,
  people: { ss: SS, u1: U1 },
  makeModel: () => new TMIModel({ power: 0.97 }),
  makePanel: buildTMI,
  briefing: [
    { who: 'okafor', text: 'TMI-2 is a Babcock & Wilcox pressurized water reactor, three months into commercial operation. Its steam generators are <b>once-through</b>: they hold very little water, so when feedwater stops they boil dry in a minute or two, and the reactor coolant heats up fast.' },
    { who: 'okafor', text: 'On top of the <b>pressurizer</b> is a pilot-operated relief valve, the <b>PORV</b>. It opens at 2,255 psig and should close at 2,205. Its panel lamp shows whether the <i>solenoid</i> is energized, not where the valve actually is. Downstream it discharges to the reactor coolant drain tank. There\'s a temperature sensor on its tailpipe; the recorder is on a back panel.' },
    { who: 'okafor', text: 'You were trained that the pressurizer level is how you know how much water is in the system, and that the worst thing you can do is let the pressurizer "go solid", filled with water with no steam bubble. That training is about to be exactly backwards. When the coolant boils in the loops, steam bubbles push water <i>up</i> into the pressurizer. The level rises while the system empties.' },
    { who: 'okafor', text: 'There is no subcooling meter on this board (they were added after this night). There is a steam table on the desk. If the RC pressure is at the saturation pressure for the hot-leg temperature, the coolant is boiling. Trust the physics over the habit.' },
  ],
  controlsHelp: '<b>PORV block valve RC-V2:</b> the motor-operated valve upstream of the PORV — closing it stops any flow through the PORV. <b>HPI:</b> MU-P1 pumps and the injection valve knob. <b>Back panels:</b> click to walk around (tailpipe temperatures, incore thermocouples). <b>Steam tables:</b> the card on the desk. <b>Speed:</b> up to 30× for the long middle; the dangerous decisions come at you whatever the speed.',
  opening: '04:00. Unit 2 at 97%. The night shift is trying to clear a blockage in a condensate polisher, using air and water. Coffee\'s on.',
  objectives: [
    { id: 'block', text: 'Find the leak and stop it', check: (m, g) => g.flags.stuck && !m.ctl.blockValve },
    { id: 'efw', text: 'Get emergency feedwater to the steam generators', optional: true, check: (m) => m.ctl.efwBlock[0] || m.ctl.efwBlock[1] },
    { id: 'subcooled', text: 'Restore subcooling: RC pressure well above saturation (≥ 30 °F margin) with the leak stopped', check: (m) => !m.ctl.blockValve && m.subcooling > 30 },
    { id: 'core', text: 'No fuel damage', check: (m, g) => g.done.has('subcooled') && m.damage === 0 && g.t > 1800, quiet: true },
  ],
  onTick(m, g) {
    const f = g.flags;
    if (!f.started && m.t > 7) { f.started = true; m.ctl.mainFeed = false; }
    if (!f.stuck && m.porvSolenoid) f.opened = true;
    if (f.opened && !f.stuck && !m.porvSolenoid) { f.stuck = true; m.porvStuck = true; }
    f.minM = Math.min(f.minM ?? 1, m.M / m.Mnom);
    if (!f.subT && g.done.has('subcooled')) f.subT = g.t;
  },
  script: [
    { at: 8, do: (m, g) => { g.slow(1); g.say('log', 'Condensate pumps tripped → main feedwater pumps tripped → turbine tripped.', 'bad'); } },
    { when: (m) => m.scrammed, do: (m, g) => { g.say('ss', 'Reactor tripped on high pressure. EFW pumps are running. Check everything.'); g.say('okafor', 'That was eight seconds. The PORV lifted at 2,255 to relieve pressure. Its lamp just went out: the solenoid has de-energized. The valve is supposed to have closed. Has it?'); } },
    { when: (m) => m.esas, do: (m, g) => { g.slow(1); g.say('ss', 'ESAS actuated on low RC pressure — HPI is injecting. That\'s a lot of water.'); } },
    { when: (m, g) => m.esas && m.pzrLevel > 330, do: async (m, g) => {
      g.slow(1);
      g.say('ss', 'Pressurizer level is still climbing — 330 inches and going up. We\'re going to take it solid! <b>Throttle back HPI and get letdown up.</b>');
      const ch = await g.choose('The pressurizer is nearly full. The shift supervisor wants HPI throttled back. What do you do?', [
        ['throttle', 'Throttle HPI back to one pump, a trickle (as trained)'],
        ['keep', 'Keep HPI running: pressure is falling, the level is lying'],
      ]);
      if (ch === 'throttle') { m.ctl.hpi = [true, false, false]; m.ctl.hpiValve = 0.12; m.ctl.letdown = true; g.flags.throttled = true; g.say('okafor', 'That\'s what the crew did, at 4:05, and every instinct in the room agreed. Now look at the pressure, the hot legs, and your steam table.'); }
      else { g.flags.keptHpi = true; g.say('okafor', 'Good instinct. If the pressurizer fills, the PORV and safeties will pass water. That\'s a mess; it isn\'t a meltdown.'); }
    } },
    { at: 8 * 60, do: (m, g) => { if (!m.ctl.efwBlock[0] && !m.ctl.efwBlock[1]) { g.say('ss', 'Why are the OTSGs dry? EFW pumps are running…'); g.say('okafor', 'Look at the EF-V12 switches. There\'s a maintenance tag hanging in front of one of the lamps.'); } } },
    { when: (m, g) => m.saturated && m.t > 300, do: (m, g) => g.say('okafor', 'Check your steam table against RC pressure and the hot legs. Something has changed.') },
    { when: (m, g) => m.rupture, do: (m, g) => { g.say('log', 'RC drain tank rupture disk has blown. Reactor building pressure and sump level rising.', 'bad'); } },
    { when: (m) => m.rcpVib > 0.5 && m.ctl.rcp.some(Boolean) && m.t > 3000, do: async (m, g) => {
      g.slow(1);
      g.say('ss', 'The reactor coolant pumps are vibrating badly and the amps are swinging. We\'ll wreck the seals. <b>Shut them down.</b>');
      const ch = await g.choose('The RCPs are cavitating in a steam-water mixture. Stop them?', [['stop', 'Stop the pumps (as the crew did, at 5:14 and 5:41)'], ['run', 'Keep them running: they\'re the only thing moving water through the core']]);
      if (ch === 'stop') { m.ctl.rcp = [false, false, false, false]; g.flags.pumpsStopped = true; g.say('okafor', 'Without the pumps, the steam and water separate. The water sinks; the steam rises to the top of the core.'); }
      else { g.flags.keptPumps = true; g.say('okafor', 'Pumping a froth through the core is ugly. It also keeps the fuel wet.'); }
    } },
    { at: 2 * 3600 + 18 * 60, do: (m, g) => { if (m.ctl.blockValve) { g.say('u1', 'What\'s the PORV tailpipe temperature reading? … <b>Close the block valve.</b>'); g.say('okafor', 'At 6:22 a fresh pair of eyes asked the question. Shut RC-V2.'); } } },
    { when: (m) => m.damage > 0.01, do: (m, g) => { g.say('log', 'Incore thermocouples off scale. Radiation alarms throughout the auxiliary building.', 'bad'); } },
  ],
  fail(m, g) {
    if (m.damage > 0.6) return 'More than half the core has melted. TMI-2\'s real outcome was close to this: about half the core melted, and some 19 tons of it slumped to the bottom of the vessel.';
    if (g.clock > 7 * 3600 + 30 * 60 && !g.done.has('subcooled')) return 'By 7:30 the plant still wasn\'t under control.';
    return null;
  },
  win: (m, g) => g.done.has('subcooled') && g.t > (g.flags.subT ?? 1e9) + 600,
  score(m, g, r) {
    const f = g.flags, notes = [];
    const dmg = m.damage * 100;
    let s;
    if (r.failed) { s = Math.max(5, 40 - dmg / 2); notes.push(`Core damage: ${dmg.toFixed(0)}%.`); return { score: s, notes }; }
    s = 50;
    const bt = f.blockClosedAt ?? g.t;
    const mins = bt / 60;
    const pts = Math.max(0, 25 - Math.max(0, mins - 10) / 4); s += pts; notes.push(`Leak stopped ${mins.toFixed(0)} min after the trip (the crew took 142). +${pts.toFixed(0)}`);
    if (dmg === 0) { s += 15; notes.push('No fuel damage. +15'); } else { notes.push(`Core damage: ${dmg.toFixed(0)}%. +0`); s -= dmg / 3; }
    if (g.done.has('efw')) { s += 5; notes.push('Opened the EF-V12 valves. +5'); }
    if (f.keptHpi) { s += 5; notes.push('Kept HPI running against the training. +5'); }
    notes.push(`Lowest coolant inventory: ${(f.minM * 100).toFixed(0)}% of normal.`);
    return { score: Math.max(0, Math.min(100, s)), grade: grade(s), headline: dmg === 0 ? 'The core stayed whole' : 'Partial meltdown', notes };
  },
  epilogue: `<p>At 4:00:37 a.m. on 28 March 1979, the feedwater pumps tripped. The PORV opened as designed eight seconds later and the reactor tripped — then the PORV stuck open, while its panel lamp said it had closed. The emergency feedwater block valves had been left shut after maintenance; a tag hung over one indicator. The operators found them at about eight minutes.</p>
  <p>Trained to keep the pressurizer from going solid, the crew throttled high-pressure injection as the pressurizer level rose — rising because the coolant was boiling in the loops. About 32,000 gallons left through the PORV in the first 100 minutes. At 5:14 and 5:41 the reactor coolant pumps, vibrating in the steam-water mixture, were shut off. The core uncovered. At 6:22 a supervisor arriving from Unit 1 had the block valve closed — two hours and 22 minutes after the valve stuck.</p>
  <p>About half the core melted. Almost all of the radioactivity stayed inside the containment building, and studies have found no measurable health effects on the public, but a hydrogen bubble, a contested evacuation advisory and days of confusion changed American nuclear power. The Kemeny Commission found the problem was "people-related": training, control-room design and procedures. Subcooling meters, symptom-based emergency procedures, the Institute of Nuclear Power Operations and full-scope plant simulators — the ancestors of this Archive — all came out of that night.</p>`,
};
