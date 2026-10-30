// Mission 2: a fictional attack submarine on a 1963 patrol. The plant is generic and the boat and
// events are invented; the procedures (answering bells, rigging for quiet, a fast recovery
// startup on the battery after a scram) are the kind every nuclear submarine crew drills.

import { SubModel, BELLS } from '../models/sub.js';
import { buildSub } from '../ui/panels/sub.js';
import { grade } from '../game/runner.js';

const OOD = { name: 'Conn (Officer of the Deck)', role: 'USS Nightjar', tag: 'OD', color: '#9fb8ff' };
const EOOW = { name: 'Engineering Officer of the Watch', role: 'Maneuvering', tag: 'EO', color: '#ffd27f' };
const bell = (name) => BELLS.findIndex((b) => b[0] === name);

function order(m, g, name, text) {
  m.ctl.bell = bell(name);
  g.flags.bellPending = true;
  g.flags.orderT = g.t;
  g.flags.matched = false;
  g.flags.orders = (g.flags.orders ?? 0) + 1;
  g.say('ood', text ?? `Maneuvering, conn: ${name.toLowerCase().replace('ahead', 'all ahead').replace('back', 'all back')}.`);
}

export const sub = {
  id: 'sub', theme: 'sub', accent: '#7fb0d8', reactorName: 'Naval PWR (fictional SSN)',
  title: 'Silent Running', place: 'USS Nightjar (SSN, fictional) · maneuvering room', date: 'Somewhere north, 1963',
  teaser: 'A small reactor in a steel tube 400 feet down. Answer the bells, keep her quiet, and when the reactor scrams in the middle of an evasion, get it back before the battery runs out.',
  clockStart: 2 * 3600 + 10 * 60,
  speeds: [1, 2, 5],
  maxStep: 0.25,
  people: { ood: OOD, eoow: EOOW },
  makeModel: () => { const m = new SubModel({ power: 0.15 }); m.ctl.ahead = 0.11; m.ctl.bell = bell('AHEAD 1/3'); return m; },
  makePanel: buildSub,
  briefing: [
    { who: 'okafor', text: 'This room is the one exception in the Archive: the boat is invented. The real plants are still classified, so this one is built from what\'s public. The physics is real, and so are the habits it teaches.' },
    { who: 'okafor', text: 'A naval reactor is small and has a strongly negative temperature coefficient. You don\'t steer it with the rods. When the throttleman opens the throttles, the steam generators take more heat, the coolant cools, and the colder water adds reactivity: power rises to meet the demand by itself. The rods only set the average temperature. Keep T<sub>avg</sub> near 500 °F.' },
    { who: 'okafor', text: 'The <b>engine-order telegraph</b> is how the conn talks to you. When it rings, <b>answer the bell</b> (so they know you heard), then open or close the throttles until the shaft matches the order (the red pointer on the shaft gauge). Open them steadily: yanking a throttle at low power drives a fast startup rate.' },
    { who: 'okafor', text: '<b>Rig for quiet</b> means the main coolant pumps go to <b>slow speed</b>, and the noise stays down. Slow pumps move half the water, so power must stay under about 50%: above 60% in slow speed the reactor scrams on low flow. Shift to fast <i>before</i> you answer a big bell.' },
    { who: 'okafor', text: 'If the reactor scrams, the steam is gone in a minute. You\'ll answer bells on the <b>emergency propulsion motor</b>, running on the battery, while you do a <b>fast recovery startup</b>: reset the scram, pull rods to criticality keeping the startup rate under 1 DPM, heat back up, and put steam back on the main engines. The battery won\'t last long.' },
  ],
  controlsHelp: '<b>Telegraph:</b> red pointer = ordered; blue = answered. Press <i>Answer bell</i>, then match the shaft gauge\'s red pointer with the throttle wheels (drag or scroll). <b>Shim switch:</b> hold OUT/IN (or focus it and use ↑/↓). <b>Pumps:</b> click the left or right side of the selector. <b>Scram:</b> lift the guard first.',
  opening: 'Steady at all ahead one-third, 400 feet. The reactor\'s at about 15%. Settle in.',
  objectives: [
    { id: 'bells', text: 'Answer every bell and match the shaft to it', check: (m, g) => (g.flags.bellsMade ?? 0) >= 3 },
    { id: 'quiet', text: 'Rig for quiet: main coolant pumps to slow within a minute', hidden: true, showIf: (m, g) => g.flags.quiet || g.flags.quietDone, check: (m, g) => g.flags.quietDone },
    { id: 'evade', text: 'Answer ahead flank without scramming on low flow', hidden: true, showIf: (m, g) => g.flags.flank, check: (m, g) => g.flags.flankMade },
    { id: 'epm', text: 'After the scram: answer bells on the EPM', hidden: true, showIf: (m, g) => g.flags.scrammedAt, check: (m, g) => !!g.flags.scrammedAt && m.ctl.epm && m.rpm > 0.1 },
    { id: 'recover', text: 'Fast recovery startup: reactor critical with the startup rate under 1 DPM', hidden: true, showIf: (m, g) => g.flags.scrammedAt, check: (m, g) => g.flags.scrammedAt && !m.scrammed && m.frac > 0.02 },
    { id: 'mains', text: 'Back on the main engines at all ahead standard, battery above 20%', hidden: true, showIf: (m, g) => g.flags.scrammedAt, check: (m, g) => g.flags.final && !m.scrammed && !m.ctl.epm && Math.abs(m.rpm - m.orderedRpm) < 0.08 && m.battery > 20 },
  ],
  onTick(m, g, dt) {
    const f = g.flags;
    // A bell is "made" when the shaft is within 8% of the order.
    if (!f.matched && f.orderT !== undefined && !f.bellPending && Math.abs(m.rpm - m.orderedRpm) < 0.08) {
      f.matched = true; f.bellsMade = (f.bellsMade ?? 0) + 1; const rt = g.t - f.orderT; f.respTotal = (f.respTotal ?? 0) + rt;
      g.say('eoow', `Shaft answering ${m.bellName.toLowerCase()} (${rt.toFixed(0)} s).`);
      if (f.flank && m.bellName === 'AHEAD FLANK') f.flankMade = true;
    }
    if (f.quiet && !m.ctl.pumpsFast && !f.quietDone) { f.quietDone = g.t - f.quietT < 60; if (!f.quietDone) f.quietLate = true; f.quietDone = true; }
    if (f.quiet) f.noiseTime = (f.noiseTime ?? 0) + (m.noise > 0.6 ? dt : 0);
    if (m.scrammed && !f.scrammedAt) f.scrammedAt = g.t;
    if (f.scrammedAt && !f.recovered && m.frac < 0.1 && !m.scrammed) f.maxSur = Math.max(f.maxSur ?? 0, m.sur);
    if (f.scrammedAt && !f.recovered && !m.scrammed && m.frac > 0.05 && m.Tavg > 470) {
      f.recovered = g.t; g.say('eoow', 'Conn, maneuvering: the reactor is critical and heating up. Ready to answer bells on the main engines.'); g.say('okafor', 'Now: EPM off, and bring the throttles open slowly. Watch T<sub>avg</sub>; pull a little rod to bring it back to 500.');
    }
    if (f.recovered && !f.final && g.t > f.recovered + 30) { f.final = true; order(m, g, 'AHEAD STD', 'Maneuvering, conn: very well. All ahead standard, make turns for twelve knots.'); }
  },
  script: [
    { at: 20, do: (m, g) => order(m, g, 'AHEAD 2/3') },
    { at: 30, do: (m, g) => { if (g.flags.bellPending) g.say('okafor', 'The telegraph moved: red pointer. Press <b>Answer bell</b>, then open the ahead throttle until the shaft meets the order.'); } },
    { at: 170, do: (m, g) => order(m, g, 'AHEAD STD') },
    { at: 320, do: (m, g) => { g.flags.quiet = true; g.flags.quietT = g.t; g.say('ood', 'Sonar has a contact, bearing two-seven-zero, faint. Rig ship for ultra-quiet.'); g.say('okafor', 'Shift the main coolant pumps to <b>slow</b>. Then the power has to stay under 50%.'); } },
    { at: 340, do: (m, g) => order(m, g, 'AHEAD 1/3') },
    { at: 640, do: (m, g) => { g.slow(1); g.flags.flank = true; g.flags.quiet = false; g.say('ood', '<b>Torpedo in the water! Bearing two-six-five!</b> Secure from ultra-quiet!'); order(m, g, 'AHEAD FLANK', 'Maneuvering, conn: <b>all ahead flank, cavitate!</b>'); g.say('okafor', 'Pumps to <b>fast</b> first. Then open the throttles all the way.'); } },
    { when: (m, g) => g.flags.flank && m.frac > 0.8 && g.t > 700 && !m.scrammed, do: (m, g) => { g.slow(1); m.scram('Scram: a relay in the protection cabinet chattered'); g.say('okafor', 'Scram. Not your fault: a relay. It happens at the worst moment, which is why they drill it.', 'warn'); } },
    { when: (m, g) => g.flags.scrammedAt && g.t > g.flags.scrammedAt + 4, do: (m, g) => { m.ctl.bell = bell('AHEAD 1/3'); g.flags.bellPending = true; g.flags.orderT = g.t; g.flags.matched = false; g.say('ood', 'Maneuvering, conn: <b>answer ahead one-third on the EPM.</b> The torpedo has lost us; we\'re going deep and quiet.'); g.say('okafor', 'Close the throttles (there\'s no steam to waste), EPM <b>on</b>, answer the bell. Then: scram reset, and pull rods. Keep the startup rate under one decade a minute. The battery is the clock.'); } },
  ],
  fail(m) {
    if (m.battery <= 0 && m.scrammed) return 'The battery ran flat. Nightjar lost propulsion and electric power at depth and had to blow to the surface — in front of the destroyer that was hunting her.';
    if (m.battery <= 0 && m.frac < 0.02) return 'The battery ran flat before the reactor was back. Dead in the water.';
    return null;
  },
  win: (m, g) => g.done.has('mains') && g.done.has('bells'),
  score(m, g, r) {
    if (r.failed) return { score: 25, notes: [] };
    const f = g.flags, notes = [];
    let s = 50;
    const avg = (f.respTotal ?? 0) / Math.max(1, f.bellsMade ?? 1);
    const bs = Math.max(0, 15 - Math.max(0, avg - 30) / 4); s += bs; notes.push(`Average time to make a bell: ${avg.toFixed(0)} s. +${bs.toFixed(0)}`);
    if (f.quietDone && !f.quietLate && (f.noiseTime ?? 0) < 20) { s += 10; notes.push('Rigged for quiet promptly and stayed quiet. +10'); } else notes.push('Too slow (or too loud) rigging for quiet. +0');
    if (f.flankMade) { s += 5; notes.push('Answered flank without a low-flow scram. +5'); }
    const ms = f.maxSur ?? 0;
    if (ms < 1) { s += 10; notes.push(`Recovery startup rate peaked at ${ms.toFixed(2)} DPM. +10`); } else notes.push(`Startup rate reached ${ms.toFixed(2)} DPM during recovery (limit 1). +0`);
    const bt = Math.round(m.battery);
    s += Math.min(10, bt / 7); notes.push(`Battery left: ${bt}%. +${Math.min(10, bt / 7).toFixed(0)}`);
    return { score: Math.min(100, s), grade: grade(s), headline: 'Nightjar slips away', notes };
  },
  epilogue: `<p>Nightjar is fictional, but the drill isn't. Every US nuclear submarine crew practises the <b>fast recovery startup</b> until it's automatic: after a scram the boat shifts to the battery and the emergency propulsion motor while the reactor operator restarts the plant. The first nuclear submarine, USS <i>Nautilus</i> (SSN-571), signalled "underway on nuclear power" on 17 January 1955.</p>
  <p>Two US nuclear submarines have been lost: <i>Thresher</i> in April 1963, during deep-diving trials after a piping failure and a reactor scram left her unable to blow to the surface, and <i>Scorpion</i> in May 1968. <i>Thresher</i>'s loss led to the SUBSAFE programme, and to faster ways of getting propulsion back after a scram. No submarine certified under SUBSAFE has been lost since.</p>`,
};
