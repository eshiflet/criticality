// Mission 5: Chernobyl Unit 4, the night of 25–26 April 1986. Real people are never given
// invented lines: the deputy chief engineer and the shift foreman appear only by role, and what
// they say is limited to what the record shows was ordered.

import { RBMKModel } from '../models/rbmk.js';
import { buildRBMK } from '../ui/panels/rbmk.js';
import { grade } from '../game/runner.js';

const DCE = { name: 'Deputy Chief Engineer', role: 'directing the test', tag: 'DC', color: '#d98a8a' };
const SF = { name: 'Shift Foreman', role: 'Unit 4', tag: 'SF', color: '#c6b37a' };
const GRID = { name: 'Kyiv grid dispatcher', role: 'telephone', tag: '☎', color: '#9aa6b2' };

export const rbmk = {
  id: 'rbmk', theme: 'rbmk', accent: '#d64a3a', reactorName: 'Chernobyl 4 (RBMK-1000)',
  title: 'The Test', place: 'Chernobyl Unit 4 · Pripyat, Ukrainian SSR', date: '25–26 April 1986',
  teaser: 'A turbine test postponed all day. A tired night shift. A reactor that gets more reactive as it boils, and a stop button that, for its first few seconds, does the opposite.',
  clockStart: 23 * 3600 + 10 * 60,
  speeds: [1, 2, 5, 10, 30, 60],
  maxStep: 0.2,
  people: { dce: DCE, sf: SF, grid: GRID },
  makeModel: () => { const m = new RBMKModel(); m.ctl.eccs = false; return m; },
  makePanel: buildRBMK,
  briefing: [
    { who: 'okafor', text: 'I almost didn\'t build this room. I built it because the lesson is too important to leave in a textbook. Thirty-one people died in the weeks after this night, most of them firemen and plant workers; hundreds of thousands were moved from their homes.' },
    { who: 'okafor', text: 'The RBMK is a graphite-moderated reactor cooled by boiling water in 1,661 pressure tubes. Unlike every Western power reactor, at low power and with few rods in, it has a <b>positive void coefficient</b>: more steam in the core means <i>more</i> reactivity, so more power, so more steam.' },
    { who: 'okafor', text: 'Its rods are 211 absorbers that enter from the top at 0.4 m/s; a full stroke takes about 18 seconds. Below each absorber hangs a <b>graphite displacer</b>. A rod parked at the top has water beneath it. Press <b>AZ-5</b> (the emergency button) and for the first few seconds the graphite pushes that water out of the bottom of the core, which <i>adds</i> reactivity there before the absorber arrives. Nobody on shift that night had been told how much that mattered.' },
    { who: 'okafor', text: 'The <b>operating reactivity margin</b> (ORM) is how many rods\' worth of absorber are in the core. Regulations required at least 15 (below that, shut down); the more rods are fully out, the worse the displacer effect. The ORM was not on a meter: the SKALA computer printed it, minutes late.' },
    { who: 'okafor', text: 'The test: cut steam to turbine 8 and see if its spinning-down generator can power the cooling pumps until the diesels start. The programme said to do it at 700–1,000 MW. It had been postponed all day because Kyiv needed the power. Xenon has been building for hours. You are the senior reactor control engineer. It\'s 23:10.' },
  ],
  controlsHelp: '<b>Manual rods (RR):</b> hold the lever OUT/IN (about one rod-equivalent every four seconds). <b>Automatic regulator:</b> MAN, LAR (local), AR (global) hold the power setpoint with the automatic rods. <b>SKALA printout:</b> the only way to read the ORM, and it takes three minutes. <b>АЗ-5:</b> lift the guard. <b>Speed:</b> up to 60× for the long power reduction.',
  opening: 'Kyiv\'s dispatcher has released the unit. You hold 1,600 MW on the regulator. The test programme is on the desk.',
  objectives: [
    { id: 'reduce', text: 'Reduce power to the test level, 700–1,000 MW, on the regulator', check: (m) => m.MW >= 700 && m.MW <= 1000 && m.t > 600 },
    { id: 'orm', text: 'Keep the operating reactivity margin at 15 rods or more', optional: true, check: (m, g) => g.flags.safeEnd && g.flags.minOrm >= 15 },
    { id: 'safe', text: 'End the night with the reactor shut down and intact', check: (m, g) => !!g.flags.safeEnd },
  ],
  onTick(m, g) {
    const f = g.flags;
    f.minOrm = Math.min(f.minOrm ?? 99, m.orm);
    if (m.MW < 500 && m.t > 1200 && !m.az5) f.lowPower = true;
    if (m.az5 !== null && !f.az5At) { f.az5At = g.t; f.az5Orm = m.orm; }
    if (m.az5 !== null && g.t - f.az5At > 30 && m.MW < 50 && !m.destroyed) f.safeEnd = true;
    if (f.testStarted && !f.testDone && g.t - f.testStarted > 45 && !m.destroyed) { f.testDone = true; g.say('sf', 'Rundown test complete: TG-8 carried the pumps.'); }
  },
  script: [
    { at: 20, do: (m, g) => g.say('dce', 'Reduce power for the test. Get on with it.') },
    { at: 90, do: (m, g) => g.say('okafor', 'Turn the setpoint knob down steadily; the automatic regulator follows with its rods. Watch the xenon alarm later: the lower you go, the faster it builds.') },
    { at: 4680, do: (m, g) => {
      g.slow(1); m.ctl.autoMode = 'AR'; m.ctl.setMW = Math.min(m.ctl.setMW, 30);
      g.say('sf', 'Switching the automatic regulator from local to global… the setpoint didn\'t carry over! Power is falling!');
      g.say('okafor', '00:28. In the transfer between regulators, the power fell to about 30 MW. Can you catch it? Setpoint back up, fast, or the xenon will take it.');
    } },
    { when: (m, g) => m.t > 4720 && m.MW < 150 && !g.flags.decided, do: async (m, g) => {
      g.flags.decided = true; g.slow(1);
      g.say('okafor', 'Power has collapsed. The xenon is now winning: to get back to even a few hundred MW, you\'ll have to pull rods out. The programme says the test is at 700 MW or above. The regulations say: if the ORM falls below 15, shut down.');
      g.say('dce', 'Raise the power. We do the test tonight.');
      const ch = await g.choose('The deputy chief engineer orders you to raise power and carry on. What do you do?', [
        ['raise', 'Raise power to about 200 MW, as ordered'],
        ['refuse', 'Refuse: this is outside the programme. Shut the reactor down.'],
      ]);
      if (ch === 'refuse') { g.flags.refused = true; g.say('okafor', 'Some of the people in that room did argue. It\'s on record. Now do it properly: press AZ-5 while the margin is still high, or drive the manual rods in.'); }
      else { g.flags.raised = true; m.ctl.setMW = 200; g.say('okafor', 'Then pull rods. Watch the ORM printouts.'); }
    } },
    { when: (m, g) => g.flags.raised && m.MW > 150 && m.t > 6600, do: (m, g) => { g.say('sf', 'Starting the two standby pumps: the programme has all eight on for the test.'); m.ctl.mcp = m.ctl.mcp.map(() => true); m.ctl.feed = 1.6; } },
    { when: (m, g) => g.flags.raised && m.t > 7700, do: async (m, g) => {
      g.slow(1);
      g.say('log', 'SKALA printout: operating reactivity margin ' + m.orm.toFixed(0) + ' rods.', m.orm < 15 ? 'bad' : '');
      m.ormPrinted = m.orm; g.flags.printedAt = g.clock;
      g.say('dce', 'Begin the test. Close the TG-8 stop valves.');
      const ch = await g.choose(`01:22:30. The margin is ${m.orm.toFixed(0)} rods. The order is to start the test. What do you do?`, [
        ['test', 'Start the test (block the turbine trip signal so it can be repeated)'],
        ['az5', 'Press AZ-5 now'],
        ['rods', 'Refuse, and drive the manual rods in slowly first'],
      ]);
      if (ch === 'test') { m.ctl.tripBlocked = true; m.startTest(); g.flags.testStarted = g.t; g.say('okafor', '01:23:04. The stop valves shut. Four of the eight pumps start to slow with the turbine. Less water through the core. More steam.'); }
      else if (ch === 'az5') { m.pressAZ5('az5'); g.say('okafor', 'You pressed AZ-5. Watch the first three seconds.'); }
      else { g.flags.manualSave = true; m.ctl.autoMode = 'MAN'; g.say('okafor', 'Hold the RR lever IN. Bring the margin up above 30 before you let the emergency rods move.'); }
    } },
    { when: (m, g) => !g.flags.raised && !g.flags.refused && m.t > 7700 && m.MW >= 650 && m.az5 === null, do: (m, g) => {
      g.slow(1);
      g.say('dce', 'Begin the test.');
      g.say('okafor', `You kept it inside the programme: ${m.MW.toFixed(0)} MW. Get a SKALA printout before you trust the margin. If it\'s 15 rods or more, you may start the test: block the turbine trip signal (so the reactor isn\'t scrammed by it), lift the guard on the TG-8 button and press it. When the rundown is done, shut the reactor down with AZ-5.`);
    } },
    { when: (m, g) => g.flags.testDone && m.az5 === null && !m.destroyed, do: (m, g) => g.say('okafor', 'Test done. Shut the reactor down: AZ-5.') },
    { when: (m, g) => g.flags.testStarted && g.t - g.flags.testStarted > 36 && m.az5 === null && !m.destroyed && m.MW < 2000 && m.orm < 15, do: (m, g) => { g.say('sf', 'Power is rising. Press AZ-5!'); } },
    { when: (m) => m.destroyed, do: (m, g) => { g.say('log', '01:23:44. Power off the scale. The rods have stopped. Two explosions.', 'bad'); } },
  ],
  fail(m, g) {
    if (m.destroyed) return 'At 01:23:44 the power reached perhaps a hundred times nominal in a few seconds. Fuel shattered, the pressure tubes burst, and steam lifted the 2,000-tonne upper plate off the reactor. A second explosion followed. The graphite burned for ten days.';
    return null;
  },
  win(m, g) {
    if (m.destroyed) return false;
    return !!g.flags.safeEnd; // rods in and power down, intact
  },
  score(m, g, r) {
    const f = g.flags, notes = [];
    if (r.failed) { notes.push(`Lowest margin: ${f.minOrm.toFixed(0)} rods. AZ-5 was pressed with ${f.az5Orm?.toFixed(0) ?? '—'} rods in.`); return { score: 0, grade: 'F', headline: 'Unit 4', notes }; }
    let s = 60;
    if (f.minOrm >= 15) { s += 20; notes.push(`Margin never below 15 rods (lowest ${f.minOrm.toFixed(0)}). +20`); } else notes.push(`Margin fell to ${f.minOrm.toFixed(0)} rods: below the legal minimum. +0`);
    if (f.refused) { s += 15; notes.push('Refused to carry on outside the programme. +15'); }
    if (f.testDone && f.minOrm >= 15) { s += 10; notes.push('Ran the test inside the programme and shut down. +10'); }
    if (f.manualSave) { s += 5; notes.push('Recovered the margin with the manual rods before scramming. +5'); }
    if (!f.lowPower) { s += 5; notes.push('Never let the power collapse. +5'); }
    return { score: Math.min(100, s), grade: grade(s), headline: 'The reactor survives the night', notes };
  },
  epilogue: `<p>At 00:28 on 26 April, during a transfer between regulators, the power of Unit 4 fell to about 30 MW. With xenon building, the operators could only bring it back to about 200 MW by withdrawing most of the rods; extra pumps were started for the test, and the margin fell to roughly 6–8 rods. At 01:23:04 the stop valves of turbine 8 were closed. As the pumps slowed, steam built up in the core and the power began to rise. At 01:23:40 AZ-5 was pressed. In the first seconds the displacers added reactivity at the bottom of the core. The power surged; the rods jammed part-way; at 01:23:44 and a few seconds later, two explosions destroyed the reactor.</p>
  <p>Two plant workers died that night. Twenty-eight firemen and operators died of acute radiation syndrome within months. Pripyat's 49,000 people were evacuated the next afternoon; about 350,000 people were eventually resettled. The IAEA's INSAG-7 (1992) revised the early Soviet account that blamed the operators alone: the reactor's design — the positive void coefficient and the rods' positive scram effect — and the absence of a safety culture that let either be known on shift, were at the heart of it. All remaining RBMKs were modified: more absorber, faster emergency rods, and redesigned displacers.</p>`,
};
