// Mission 1: Chicago Pile-1, 2 December 1942.

import { CP1Model } from '../models/cp1.js';
import { buildCP1 } from '../ui/panels/cp1.js';
import { grade } from '../game/runner.js';

const FERMI = { name: 'E. Fermi (as recorded)', role: 'Experiment leader', tag: 'EF', color: '#e8b44a' };

export const cp1 = {
  id: 'cp1', theme: 'cp1', accent: '#e8b44a', reactorName: 'Chicago Pile-1',
  title: 'First Light', place: 'Chicago Pile-1 · squash court, Stagg Field', date: '2 December 1942',
  teaser: 'Forty-nine people on a balcony, a pile of graphite and uranium, and a man with an axe. Make the world’s first chain reaction — and stop it.',
  clockStart: 9 * 3600 + 45 * 60,
  speeds: [1, 2, 5, 10, 30],
  people: { fermi: FERMI },
  makeModel: () => new CP1Model(),
  makePanel: buildCP1,
  briefing: [
    { who: 'okafor', text: 'Under the west stands of Stagg Field there\'s a squash court, and in it a flattened ball of graphite bricks 25 feet across. Embedded in it: six tons of uranium metal and forty of uranium oxide. Nobody has ever made a chain reaction. Today, Enrico Fermi intends to.' },
    { who: 'okafor', text: 'You\'re George Weil, the young physicist on the floor. Your hand is on the last cadmium control rod. Every neutron that cadmium soaks up is one that doesn\'t split a uranium atom. Pull it out a little and more neutrons survive. Pull it out enough and each generation is a little bigger than the last. That\'s critical.' },
    { who: 'okafor', text: 'There\'s no cooling, no shielding, and no second try. There are three rods: yours, an <b>automatic safety rod</b> held up by a solenoid that drops it when the ion chamber passes a setting, and the <b>ZIP</b>: a rod hauled out against a weight and tied off with a rope. Norman Hilberry is standing by the rope with an axe. Above the pile, three young men called the "suicide squad" hold buckets of cadmium solution.' },
    { who: 'okafor', text: 'Fermi\'s method was patient: pull the rod a step, wait for the counters to level off, write the count rate down, plot 1/M (the source counts divided by the count rate) against rod position, and extend the line. Where it hits zero is where the pile goes critical. Then do the next step. He never let it surprise him.' },
    { who: 'okafor', text: 'Fermi\'s limit was 200 watts: past that the people on the balcony get a real dose. He planned to run at about half a watt for a few minutes, then drop the ZIP.' },
  ],
  controlsHelp: '<b>Control rod:</b> hold the lever up to pull (½ ft/s), or use ±6 in. <b>Counters:</b> clicks are real; the scaler and rate meter count them. <b>Recorder:</b> switch the range as the pen nears the top. <b>Notebook:</b> when the counts have levelled off, press <i>Record reading</i>. <b>Time:</b> speed up while waiting for the counters to settle (they take minutes near critical).',
  opening: 'Morning, Weil. It\'s cold in here: they never heat the stands. The pile has its rods in. Start by pulling the <b>ZIP</b> out and tying it off, then wind the <b>safety rod</b> up.',
  objectives: [
    { id: 'zip', text: 'Pull the ZIP rod out and tie it off', check: (m) => m.rod.zip > 0.99 },
    { id: 'safety', text: 'Raise the automatic safety rod', check: (m) => m.rod.safety > 0.99 },
    { id: 'steps', text: 'Approach critical in steps: record at least <b>four</b> settled readings in the notebook', check: (m, g) => (g.flags.points?.length ?? 0) >= 4 },
    { id: 'predict', text: 'Predict the critical position to within half a foot from your 1/M plot', optional: true, check: (m, g) => g.flags.critical && Math.abs((g.flags.predicted ?? 99) - g.flags.criticalFt) <= 0.5 },
    { id: 'critical', text: 'Make the pile critical: a chain reaction that grows without help', check: (m, g) => !!g.flags.critical },
    { id: 'hold', text: 'Run near ½ W (0.3–1 W) for 4½ minutes', check: (m, g) => (g.flags.holdT ?? 0) >= 270 },
    { id: 'zipdrop', text: 'Shut it down: cut the ZIP rope', check: (m, g) => g.done.has('hold') && m.zipCut && m.rho() < -0.003 },
  ],
  onTick(m, g, dt) {
    const f = g.flags;
    // Fermi's reference: the source counts with the ZIP and safety rods out and the control rod in.
    if (!m.refP && m.rod.zip > 0.99 && m.rod.safety > 0.99 && m.rod.control < 0.01 && Math.abs(m.period) > 900) m.refP = m.P;
    if (!f.critical && m.rho() > 0 && m.period > 0 && m.period < 1200 && m.P > 0.02) { f.critical = true; f.criticalFt = m.criticalFt; f.criticalAt = g.clock; }
    if (f.critical && m.P >= 0.3 && m.P <= 1 && !m.zipCut) f.holdT = (f.holdT ?? 0) + dt;
    if (m.P > 2) f.over2 = true;
  },
  script: [
    { when: (m) => m.rod.zip > 0.99 && m.rod.safety > 0.99, do: (m, g) => { g.say('fermi', 'Pull the control rod out to seven feet. Then we wait for the counters.'); } },
    { when: (m) => m.controlFt >= 6.9, do: (m, g) => { g.say('okafor', 'Watch the scaler and the rate meter: they climb, then flatten. When they\'re flat, record a reading. It takes a few minutes; the time controls are top right.'); } },
    { when: (m, g) => (g.flags.points?.length ?? 0) >= 1, do: (m, g) => { g.say('fermi', 'Good. The next step is to eight feet. Then nine, ten, eleven. Each time, let it settle and write it down. The line will tell us where.'); } },
    { when: (m, g) => (g.flags.points?.length ?? 0) >= 2, do: (m, g) => { g.say('okafor', 'Look at your notebook: two points make a line, and the dashed red line shows where it hits zero. Fermi re-did that sum with his slide rule after every step. It moved a little each time. It always does.'); } },
    { when: (m) => m.tripped === 'auto' && m.P < 5, do: (m, g) => { g.slow(1); g.say('okafor', 'Bang. That was the automatic safety rod: the ion chamber passed its trip setting. It happened to Fermi too, at 11:30, because the setting was too low for where they were going. He said he was hungry and called lunch.'); g.say('okafor', 'Raise the <b>trip setting</b> (say 2 W, well above the ½ W you\'ll run at), press <b>Re-latch</b>, and wind the rod back up.'); } },
    { when: (m, g) => g.flags.critical, do: (m, g) => { g.slow(2); g.say('fermi', 'The trace will climb and continue to climb. It will not level off.'); g.say('okafor', `That's it. The pile is critical: the count rate isn't levelling, it's doubling. Watch the period. Let it climb to about half a watt, then push the rod back in a little to hold it there. Switch the recorder range as the pen tops out.`); } },
    { when: (m, g) => (g.flags.holdT ?? 0) >= 270, do: (m, g) => { g.slow(1); g.say('fermi', 'Zip in.'); g.say('okafor', 'Four and a half minutes at half a watt. Lift the guard and cut the rope.'); } },
    { when: (m) => m.P > 20, do: (m, g) => { g.slow(1); g.say('okafor', 'Twenty watts and climbing. The balcony is starting to get a dose. Push the rod in, or drop the ZIP.', 'warn'); } },
  ],
  fail(m, g) {
    if (m.P > m.spec.limitW) return 'The pile ran past 200 W. In 1942 there was no shield: everyone on the balcony took a dose, and the experiment would have been stopped by the people who ran the stadium.';
    if (g.flags.flooded && !g.done.has('hold')) return 'The suicide squad poured the cadmium. The reaction stopped, and the pile is soaked: weeks of cleaning before anyone tries again.';
    return null;
  },
  win: (m, g) => g.done.has('zipdrop'),
  score(m, g, r) {
    if (r.failed) return { score: 20, notes: [] };
    const f = g.flags, notes = [];
    let s = 60;
    if (g.done.has('predict')) { s += 12; notes.push(`Your 1/M plot predicted ${f.predicted.toFixed(1)} ft; it went critical at ${f.criticalFt.toFixed(1)} ft. +12`); } else notes.push('Prediction: off by more than half a foot (or not enough readings). +0');
    if (!f.over2) { s += 12; notes.push('Never above 2 W: a calm, Fermi-like run. +12'); } else notes.push(`Peak power ${m.maxW.toFixed(1)} W. Fermi stopped at about half a watt. +0`);
    const pts = f.points?.length ?? 0;
    if (pts >= 6) { s += 8; notes.push(`${pts} readings: patient. +8`); }
    if (m.dose < 0.5) { s += 8; notes.push(`Balcony dose ${m.dose.toFixed(2)} mrem. +8`); } else notes.push(`Balcony dose ${m.dose.toFixed(1)} mrem.`);
    if (m.tripped === 'auto' || g.flags.tripSeen) notes.push('The safety rod tripped at least once, as it did in 1942.');
    return { score: Math.min(100, s), grade: grade(s), headline: 'The Italian navigator has landed', notes };
  },
  epilogue: `<p>On 2 December 1942 the pile went critical at about 3:25 in the afternoon, with Weil's rod roughly 13 feet out (the real pile's numbers differ a little from ours). Fermi let it run for about four and a half minutes at half a watt, then ordered the ZIP rod in. Eugene Wigner had brought a bottle of Chianti; the people present signed its straw wrapper.</p>
  <p>Arthur Compton phoned James Conant at Harvard with a pre-arranged message: "The Italian navigator has landed in the New World." Asked how the natives were, he answered: "Very friendly."</p>
  <p>CP-1 was taken apart in 1943 and rebuilt at the Argonne forest site as CP-2. Within three years its descendants at Hanford were making plutonium by the kilogram.</p>`,
};
