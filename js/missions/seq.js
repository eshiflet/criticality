// Mission 6: certification at Sequoyah Unit 1 (TVA), a Westinghouse four-loop PWR running today.

import { SequoyahModel } from '../models/sequoyah.js';
import { buildSeq } from '../ui/panels/seq.js';
import { grade } from '../game/runner.js';

const EXAM = { name: 'NRC examiner', role: 'operating test', tag: 'EX', color: '#c8d6a6' };
const SM = { name: 'Shift Manager', role: 'Sequoyah', tag: 'SM', color: '#a7b8a2' };

export const seq = {
  id: 'seq', theme: 'seq', accent: '#a7c49a', reactorName: 'Sequoyah 1 (Westinghouse PWR)',
  title: 'Certification', place: 'Sequoyah Unit 1 · Soddy-Daisy, Tennessee (TVA)', date: 'Today',
  teaser: 'The last room in the Archive is a plant that runs today. Start it up from hot standby, put it on the grid, take it to full power — and then the examiner pulls the turbine out from under you.',
  clockStart: 6 * 3600,
  speeds: [1, 2, 5, 10, 30, 60],
  maxStep: 0.5,
  people: { exam: EXAM, sm: SM },
  makeModel: () => new SequoyahModel({ boron: 1180 }),
  makePanel: buildSeq,
  briefing: [
    { who: 'okafor', text: 'Sequoyah: two Westinghouse four-loop pressurized water reactors on Chickamauga Lake, near Chattanooga, running since 1981. Everything you\'ve seen tonight — Fermi\'s patience, the bells, the fire, the stuck valve, the margin — is written into how this plant is run.' },
    { who: 'okafor', text: 'The plant is at <b>hot standby</b>: 557 °F, 2,235 psig, all four coolant pumps running, shutdown banks out, control banks in, boron at 1,180 ppm. You\'ll pull control banks A through D (they overlap: each starts when the one before is 100 steps from the top) until the reactor is critical. Keep the startup rate under 1 DPM.' },
    { who: 'okafor', text: 'The protection system has interlocks you must work with. At <b>P-6</b> (intermediate range on scale) block the source-range trip or it trips you at 10⁵ cps. At the <b>point of adding heat</b> the core warms the coolant and power levels off by itself. Latch the turbine, raise the load; at <b>P-10</b> (10%) block the low-power trips; at <b>C-5</b> (turbine above 15%) put the rods in <b>AUTO</b>. Dilute boron to keep the rods in their band as you load up.' },
    { who: 'okafor', text: 'And then the examiner will do something to you. At Sequoyah, a turbine trip above 50% power trips the reactor. Your job afterwards is to take the plant to a stable hot standby: T<sub>avg</sub> on no-load, pressure and levels on program.' },
  ],
  controlsHelp: '<b>Rods:</b> hold the rod motion lever OUT (48 steps/min) — or focus it and hold ↑. <b>Blocks:</b> SR block works only with P-6 lit; IR/PR block only with P-10. <b>Turbine:</b> latch needs ~600 psig steam; the load setpoint ramps at the load rate. <b>Speed:</b> 30–60× is fine for loading.',
  opening: '06:00. The examiner is behind you with a clipboard. Hot standby, all systems normal. Begin when ready.',
  objectives: [
    { id: 'crit', text: 'Reach criticality (keep the startup rate under 1 DPM)', check: (m, g) => !!g.flags.critSeen },
    { id: 'p6', text: 'Block the source-range trip at P-6', check: (m) => m.plant.ctl.srBlock },
    { id: 'poah', text: 'Find the point of adding heat and level off (1–5%)', check: (m) => m.plant.hot && m.frac > 0.01 && m.frac < 0.05 && Math.abs(m.plant.sur) < 0.05 && m.plant.Tavg > 558 },
    { id: 'latch', text: 'Latch the turbine and put the generator on the grid', check: (m) => m.plant.ctl.latched && m.plant.load > 0.02 },
    { id: 'auto', text: 'Rods to AUTO at C-5', check: (m) => m.plant.C5 && m.plant.ctl.rodMode === 'auto' },
    { id: 'full', text: 'Full power: 98% or more, T<sub>avg</sub> on program', check: (m) => m.frac > 0.98 && Math.abs(m.plant.Tavg - m.plant.Tref) < 2 },
    { id: 'stable', text: 'After the trip: stable hot standby (T<sub>avg</sub> 552–562 °F, PZR 2,185–2,285 psig) for 5 minutes', hidden: true, showIf: (m, g) => g.flags.examTrip, check: (m, g) => (g.flags.stableT ?? 0) >= 300 },
  ],
  onTick(m, g, dt) {
    const f = g.flags, P = m.plant;
    if (!f.critSeen && m.frac > 1e-7 && P.sur > 0.05 && m.k.rho > 0) f.critSeen = true;
    if (m.frac < 0.01) f.maxSur = Math.max(f.maxSur ?? 0, P.sur);
    if (P.trip.latched && !f.examTrip) f.unplannedTrips = (f.unplannedTrips ?? 0) + (f.lastTrip !== P.trip.firstOut ? 1 : 0);
    f.lastTrip = P.trip.latched ? P.trip.firstOut : null;
    if (f.examTrip && P.Tavg > 552 && P.Tavg < 562 && P.Ppzr > 2185 && P.Ppzr < 2285) f.stableT = (f.stableT ?? 0) + dt; else if (f.examTrip) f.stableT = 0;
  },
  script: [
    { at: 15, do: (m, g) => g.say('exam', 'Applicant, commence a reactor startup per the general operating instruction. I\'ll be watching your startup rate.') },
    { when: (m) => m.plant.P6, do: (m, g) => g.say('sm', 'P-6 is lit.') },
    { when: (m) => m.plant.C5, do: (m, g) => g.say('exam', 'C-5 is lit. What do you do with rod control?') },
    { when: (m, g) => g.done.has('full'), do: (m, g) => { g.slow(2); g.say('exam', 'Nice. Hold it there a minute.'); } },
    { when: (m, g) => g.done.has('full') && g.t > (g.flags.fullAt ??= g.t) + 90, do: (m, g) => { g.slow(1); g.flags.examTrip = true; m.plant.tripTurbine(true); g.say('exam', '<i>(The examiner reaches over and trips the turbine.)</i> Your plant.'); g.say('okafor', 'Reactor tripped on turbine trip above P-9, as designed. Verify the trip, then stabilise: steam dumps should be holding no-load temperature. Watch pressurizer pressure and level as the coolant shrinks.'); } },
  ],
  fail(m, g) {
    if ((g.flags.unplannedTrips ?? 0) >= 3) return 'Three unplanned reactor trips. The examiner closes the clipboard. Come back next cycle.';
    return null;
  },
  win: (m, g) => g.done.has('stable'),
  score(m, g, r) {
    if (r.failed) return { score: 30, notes: [] };
    const f = g.flags, notes = [];
    let s = 60;
    const ms = f.maxSur ?? 0;
    if (ms <= 1) { s += 15; notes.push(`Startup rate peaked at ${ms.toFixed(2)} DPM. +15`); } else notes.push(`Startup rate reached ${ms.toFixed(2)} DPM (limit 1). +0`);
    const ut = f.unplannedTrips ?? 0;
    if (!ut) { s += 15; notes.push('No unplanned trips. +15'); } else notes.push(`${ut} unplanned trip(s). +0`);
    s += 10; notes.push('Recovered to stable hot standby after the turbine trip. +10');
    return { score: Math.min(100, s), grade: grade(s), headline: 'Licensed', notes };
  },
  epilogue: `<p>Sequoyah Units 1 and 2 have run since 1981 and 1982 and are licensed to operate into the 2040s. Their operators train in a full-scope simulator that is a switch-for-switch copy of this control room, and every few years they sit an NRC operating test much like this one.</p>
  <p>Almost everything in that test traces back to the other rooms in the Archive: the startup-rate limits and 1/M plots to Fermi; protection that no single relay can defeat to the drills at sea; fire barriers and separated safety trains to Browns Ferry; subcooling meters, symptom-based procedures and simulator training itself to Three Mile Island; and a culture where anyone may stop a test they think is unsafe, to Chernobyl.</p>
  <p>That's the Archive. Thank you for sitting in every chair.</p>`,
};
