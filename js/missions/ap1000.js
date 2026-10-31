// Mission 7: the first startup of a brand-new AP1000, Vogtle Unit 3 (Georgia Power), 2023.
// From cold shutdown to the grid with a fresh core nobody has run before.

import { AP1000Model, AP, PT } from '../models/ap1000.js';
import { buildAP } from '../ui/panels/ap.js';
import { grade } from '../game/runner.js';
import { psat, PSIA } from '../engine/physics.js';

const SM = { name: 'Shift Manager', role: 'Vogtle 3', tag: 'SM', color: '#9fd3e8' };
const RE = { name: 'Reactor Engineer', role: 'startup physics', tag: 'RE', color: '#f2c46b' };
const TD = { name: 'Startup Test Director', role: 'power ascension', tag: 'TD', color: '#d9a3ff' };

export const ap1000 = {
  id: 'ap1000', theme: 'ap', accent: '#6fd0ff', reactorName: 'Vogtle 3 (AP1000)',
  title: 'First of a Kind', place: 'Vogtle Unit 3 · Waynesboro, Georgia (Georgia Power)', date: 'March 2023',
  teaser: 'A reactor nobody has ever started. Heat it up from cold, dilute a fresh core to its first criticality, measure what the codes only predicted, and put it on the grid. The plant has a few things to teach you, too.',
  clockStart: 2 * 3600,
  speeds: [1, 2, 5, 10, 30, 60, 120, 240],
  maxStep: 0.5,
  people: { sm: SM, re: RE, td: TD },
  makeModel: () => new AP1000Model({ boron: 1750, offset: 25 + Math.round(Math.random() * 25) }),
  makePanel: buildAP,
  briefing: [
    { who: 'okafor', text: 'You have your licence. Now I want you somewhere no licence quite covers: the first startup of a reactor nobody has run. This room is Vogtle Unit 3, the first AP1000 built in the United States, on the Savannah River in Georgia. In March 2023 its crew took a fresh core from cold shutdown to critical for the first time.' },
    { who: 'okafor', text: 'The AP1000 is a different machine. Two loops, each a steam generator with two <b>canned-motor pumps</b> bolted to its bottom: no shaft seals to leak. A <b>steel containment</b> inside a concrete shield building, with a water tank on the roof to cool it. And safety systems that need no pumps and no power: core makeup tanks, accumulators, a refuelling-water tank <i>inside</i> containment, and in it the <b>passive RHR heat exchanger</b>, which takes the core\'s heat by natural circulation if feedwater is lost. The control room is screens, not benchboards.' },
    { who: 'okafor', text: '<b>Part one: heat-up.</b> The plant is in Mode 5 at 180 °F, the normal RHR system (RNS) cooling it, all rods in, boron at 1,750 ppm. Start the four reactor coolant pumps: their heat is your heat source. Take RNS out of service before 350 °F (and before 450 psig: its relief valve lifts at 470). Then raise pressurizer pressure by hand as you heat, staying inside the <b>pressure–temperature limits</b> plotted on the board, and don\'t heat faster than 100 °F an hour.' },
    { who: 'okafor', text: '<b>Part two: first criticality.</b> At hot standby, withdraw the shutdown banks, pull the M banks to the dilution position (MD at 150 steps), and dilute. The reactor engineers predict criticality at 1,460 ppm. It\'s a prediction. Fermi didn\'t trust his either: plot 1/M as you go. Then measure the temperature coefficient, raise power, latch the turbine and load to 25%.' },
    { who: 'okafor', text: 'A new plant always has something to tell you that the design documents didn\'t. Listen to it.' },
  ],
  controlsHelp: '<b>Heat-up:</b> RCP start needs 325 psig. Raise the <b>PZR pressure set</b> knob to keep the white dot inside the green band on the P–T plot (amber line: minimum for subcooling; red: maximum). 120–240× is sensible here. <b>Shutdown banks:</b> one switch withdraws all four in turn. <b>M banks:</b> the lever; MA–MD overlap. <b>Dilution:</b> makeup to DILUTE; press <b>Record 1/M</b> every 25 ppm or so and watch the extrapolation. <b>ITC:</b> with rods and boron still, press <b>ITC: mark</b>, move T<sub>avg</sub> 3 °F or more with the <b>steam dump set</b> knob (lower = cooler), mark again. <b>Feedwater:</b> the regulating valve runs in AUTO; MAN gives you the demand knob (match feed flow to steam flow).',
  opening: '02:00. Mode 5. The control room is crowded with test engineers, two NRC inspectors and a lot of coffee. Everything in this plant is the first of its kind in America. Take your time.',
  objectives: [
    { id: 'rcp', text: 'Start all four reactor coolant pumps', check: (m) => m.plant.ctl.pumps.every(Boolean) },
    { id: 'rns', text: 'Take RNS out of service before 350 °F', check: (m) => !m.plant.ctl.rns },
    { id: 'hsb', text: 'Hot standby: T<sub>avg</sub> 557 °F and 2,235 psig, inside the P–T limits, at ≤100 °F/h', check: (m) => m.plant.Tavg > 554 && Math.abs(m.plant.Ppzr - 2235) < 40 },
    { id: 'sd', text: 'Withdraw shutdown banks SD1–SD4', check: (m) => m.shutdown.every((s) => s >= 268.5) },
    { id: 'crit', text: 'First criticality by dilution, MD at the dilution position (startup rate under 1 DPM)', check: (m, g) => !!g.flags.critSeen },
    { id: 'invm', text: 'Plot at least four 1/M points on the way', optional: true, check: (m, g) => (g.flags.invM?.length ?? 0) >= 4 },
    { id: 'itc', text: 'Measure the isothermal temperature coefficient at zero power', check: (m, g) => g.flags.itc != null },
    { id: 'grid', text: 'Latch the turbine and put the generator on the grid', check: (m) => m.plant.ctl.latched && m.plant.load > 0.02 },
    { id: 'p25', text: 'Load to 25% power', check: (m) => m.frac > 0.24 && !m.plant.trip.latched },
    { id: 'fw', text: 'Feedwater: regulating valve to MANUAL, hold SG level 35–65% for 5 minutes', hidden: true, showIf: (m, g) => g.flags.fault && !m.plant.trip.latched, check: (m, g) => (g.flags.fwStable ?? 0) >= 300 },
    { id: 'prhr', text: 'After the trip: let passive RHR cool the plant below 530 °F', hidden: true, showIf: (m, g) => g.flags.fault && m.plant.trip.latched, check: (m) => m.plant.prhr && !m.plant.ctl.prhrIsolate && m.plant.Tavg < 530 },
  ],
  onTick(m, g, dt) {
    const f = g.flags, P = m.plant, c = P.ctl;
    if (!f.critSeen && P.hot && m.frac > 1e-9 && P.sur > 0.05 && m.k.rho > 0) f.critSeen = true;
    if (m.frac < 0.01 && P.hot) f.maxSur = Math.max(f.maxSur ?? 0, P.sur);
    if (c.latched) f.everLatched = true;
    // Heat-up quality: rate, and time outside the P–T band with pumps running.
    if (c.pumps.some(Boolean) && !P.hot && g.t > 900) f.maxRate = Math.max(f.maxRate ?? 0, P.heatupRate);
    if (c.pumps.some(Boolean) && (P.Ppzr > PT.max(P.Tavg) + 5 || P.Ppzr < PT.min(P.Tavg) - 5)) f.ptOut = (f.ptOut ?? 0) + dt;
    if (P.Ppzr < psat(P.Thot) - PSIA) f.saturated = true;
    if (P.trip.latched && !f.lastTrip) { f.lastTrip = true; if (!f.fault) f.trips = (f.trips ?? 0) + 1; }
    if (!P.trip.latched) f.lastTrip = false;
    if (f.rwl && P.boron > 1400 && m.banks[3] > 180) f.rwlBreach = true;
    if (f.fault && !P.trip.latched && c.fwMode === 'man' && P.sgInv > 35 && P.sgInv < 65) f.fwStable = (f.fwStable ?? 0) + dt;
    else if (f.fault) f.fwStable = 0;
    for (const e of m.takeEvents()) {
      if (e.type === 'trip') g.say('log', `<b>Reactor trip:</b> ${e.why}.`);
      else g.say('log', e.text);
    }
  },
  script: [
    { at: 20, do: (m, g) => g.say('sm', 'Crew, we are cleared for heat-up. Start the reactor coolant pumps when you\'re ready; RNS stays in service until we\'re above 300 °F.') },
    { when: (m) => m.plant.ctl.pumps.every(Boolean), do: (m, g) => g.say('okafor', 'Listen: no seal leak-off, no seal injection. Canned motors: the pump and its motor are sealed inside the pressure boundary. One less thing that failed at other plants. Now, the RNS is still taking heat out; isolate it and the temperature starts to climb.') },
    { when: (m) => m.plant.Tavg > 300 && m.plant.ctl.rns, do: (m, g) => { g.slow(30); g.say('sm', 'Three hundred degrees and RNS is still lined up. Isolate it: it\'s a low-pressure system and you\'re about to need pressure.'); } },
    { when: (m) => m.plant.Tavg > 400, do: (m, g) => g.say('okafor', 'Watch the amber line on the P–T plot: the subcooling floor climbs fast from here. Raise the pressure setpoint ahead of it.') },
    { when: (m) => m.plant.Tavg > 554, do: (m, g) => { g.slow(10); g.say('sm', 'Mode 3. Steam dumps are holding 1,092 psig on the steam generators. Withdraw the shutdown banks.'); } },
    { when: (m) => m.shutdown.every((s) => s >= 268.5), do: (m, g) => g.say('re', `Shutdown banks out. Pull the M banks to the dilution position: MA, MB and MC fully out, MD at 150 steps. Then dilute. Our prediction for critical boron is <b>${AP.predictedCB} ppm</b>, give or take 50. Record 1/M as you go.`) },
    { when: (m) => m.ctlSteps >= AP.dilutionSteps - 1, do: (m, g) => g.say('okafor', 'Rods in position. Before you open the dilution valve: press Record 1/M once now, at the starting count rate. That\'s your reference.') },
    { when: (m, g) => m.plant.ctl.makeup === 'dilute' && m.plant.boron < AP.predictedCB + 80 && !g.flags.critSeen, do: (m, g) => { g.slow(10); g.say('re', 'We\'re inside 80 ppm of the prediction. Slow the dilution down. This core has never been critical; nobody knows exactly where it will go.'); } },
    { when: (m, g) => g.flags.critSeen, do: (m, g) => {
      g.slow(5);
      const P = m.plant, d = P.boron - AP.predictedCB;
      g.say('re', `Critical at <b>${P.boron.toFixed(0)} ppm</b>: ${Math.abs(d).toFixed(0)} ppm ${d >= 0 ? 'above' : 'below'} the prediction. The core is ${d >= 0 ? 'more' : 'less'} reactive than the codes said. Inside the acceptance band, but write it down: that's the first thing this plant has taught us.`);
      g.say('okafor', 'Stop the dilution. Keep power low, in the zero-power testing range (intermediate range around 10⁻⁸ A), well below where the core starts to heat the water. Now the coefficient: mark the reactivity computer, move T<sub>avg</sub> a few degrees with the steam dump setpoint, mark again.');
    } },
    { when: (m, g) => g.flags.itc != null, do: async (m, g) => {
      const itc = g.flags.itc;
      g.say('re', `ITC ${itc >= 0 ? '+' : ''}${itc.toFixed(2)} pcm/°F. Predicted ${AP.predictedITC.toFixed(1)}. ${itc > 0 ? 'It\'s <b>positive</b>. With this much boron in a fresh core, the moderator coefficient is positive at zero power: heat the water and the reactor gets more reactive, not less.' : 'Negative, as predicted.'}`);
      if (itc > 0) {
        g.say('td', 'It\'ll go negative as soon as we take boron out at power. Every fresh core does this. We\'re behind schedule; let\'s keep moving.');
        const ch = await g.choose('The coefficient is positive. What do you do?', [
          ['rwl', 'Follow the procedure: set rod withdrawal limits (MD no higher than 180 steps until the boron is below 1,400 ppm), log it, and tell the NRC resident.'],
          ['go', 'The test director is right: it goes negative at power anyway. Press on.'],
          ['stop', 'Stop the startup until the core designers explain the difference.'],
        ]);
        g.flags.itcChoice = ch;
        if (ch === 'rwl') { g.flags.rwl = true; g.say('okafor', 'That\'s the job. A positive coefficient isn\'t a disaster; ignoring one is how a reactor gets ahead of you. You remember the last room where somebody wanted to keep moving.'); }
        if (ch === 'go') g.say('okafor', 'He\'s right about the physics. He\'s wrong about the process. The limit exists because the plant behaved differently from the paper, and that\'s exactly what you just measured. Noted.');
        if (ch === 'stop') { g.say('sm', 'The core designers run the numbers overnight: the measured coefficient is inside the design envelope once rod withdrawal limits are in place. We set them and resume in the morning.'); g.flags.rwl = true; }
      }
      g.say('sm', 'Raise power to the point of adding heat, latch the turbine at about 5%, and load the unit to 25%.');
    } },
    { when: (m) => m.plant.ctl.latched && m.plant.load > 0.02, do: (m, g) => g.say('sm', 'Generator breaker closed. Vogtle 3 is on the grid.') },
    { when: (m) => m.frac > 0.24 && m.plant.load > 0.15 && !m.plant.trip.latched, do: (m, g) => {
      g.slow(2); g.flags.fault = true; m.plant.startFwFault();
      g.say('td', 'Holding at 25% for testing. Hm. Feedwater regulating valve is cycling. It\'s only ever run on the factory test stand and in the simulator.');
      g.say('okafor', 'There it is. The controller tuning that looked fine on paper is hunting with real water. Watch the SG level swing grow. It\'s yours: in AUTO it will trip you; in MANUAL you are the controller. Match feed to steam.');
    } },
    { when: (m, g) => g.flags.fault && m.plant.trip.latched, do: (m, g) => {
      g.slow(5); m.plant.sufwFailed = true;
      g.say('sm', 'Reactor trip. Startup feedwater pump… breaker tripped on start. First time we\'ve asked it for real.');
      g.say('okafor', 'Now watch what this plant was built for. With no feedwater, the steam generators boil dry; when they do, the passive RHR valves open by themselves and the core\'s heat goes into the tank in containment by natural circulation. No pumps, no operator. Your job is to <b>not interfere</b>.');
    } },
    { when: (m) => m.plant.prhr, do: (m, g) => g.say('re', 'PRHR flow established. Hot leg falling. IRWST temperature rising slowly: it can do this for days.') },
    { when: (m, g) => g.flags.prhrIsolated && m.plant.prhr, do: (m, g) => g.say('okafor', 'You isolated the passive heat removal. With no feedwater, that\'s the only heat sink you have. Put it back.') },
  ],
  fail(m, g) {
    const P = m.plant, f = g.flags;
    if ((f.trips ?? 0) >= 3) return 'Three unplanned reactor trips during the first startup. The NRC resident asks for the shift log; the startup stops for a review.';
    if (P.Ppzr > PT.max(P.Tavg) + 250) return 'Pressure far above the vessel\'s pressure–temperature limit while it was cold. The heat-up stops for an engineering evaluation of the vessel.';
    if (f.prhrIsolated && P.prhr && P.Ppzr > 2450) return 'With no feedwater and the passive RHR isolated, the decay heat had nowhere to go: pressurizer safety valves lifting. Automatic depressurization would be next.';
    return null;
  },
  win: (m, g) => g.done.has('fw') || g.done.has('prhr'),
  score(m, g, r) {
    if (r.failed) return { score: 25, notes: [] };
    const f = g.flags, notes = [];
    let s = 40;
    const mr = f.maxRate ?? 0;
    if (mr <= 100) { s += 8; notes.push(`Heat-up rate peaked at ${mr.toFixed(0)} °F/h (limit 100). +8`); } else notes.push(`Heat-up rate reached ${mr.toFixed(0)} °F/h (limit 100). +0`);
    const po = f.ptOut ?? 0;
    if (po < 60) { s += 8; notes.push('Stayed inside the pressure–temperature limits. +8'); } else notes.push(`${Math.round(po / 60)} minutes outside the P–T limits. +0`);
    if (m.plant.rnsLift) { s -= 4; notes.push('RNS relief valve lifted. −4'); }
    const ms = f.maxSur ?? 0;
    if (ms <= 1) { s += 8; notes.push(`Startup rate peaked at ${ms.toFixed(2)} DPM. +8`); } else notes.push(`Startup rate reached ${ms.toFixed(2)} DPM (limit 1). +0`);
    if ((f.invM?.length ?? 0) >= 4) { s += 5; notes.push(`${f.invM.length} points on the 1/M plot. +5`); }
    if (f.itcChoice === 'rwl' || f.itcChoice === 'stop') { s += 8; notes.push('Answered a positive temperature coefficient with the procedure, not the schedule. +8'); }
    else if (f.itcChoice === 'go') notes.push('Pressed on past a positive coefficient. +0');
    if (f.rwlBreach) { s -= 5; notes.push('Withdrew MD past the rod withdrawal limit. −5'); }
    if (!(f.trips ?? 0)) { s += 5; notes.push('No unplanned trips during the startup. +5'); }
    if (g.done.has('fw')) { s += 18; notes.push('Caught the hunting feedwater valve in manual and held the plant at 25%. +18'); }
    else { s += 6; notes.push('Tripped on steam generator level; the passive RHR took the plant down and you let it. +6'); }
    s = Math.max(0, Math.min(100, s));
    return { score: s, grade: grade(s), headline: g.done.has('fw') ? 'On the grid' : 'Passive safety, demonstrated', notes };
  },
  epilogue: `<p>Vogtle Unit 3 reached initial criticality on 6 March 2023, was first synchronized to the grid on 1 April 2023, and entered commercial operation on 31 July 2023: the first new reactor design to run in the United States in decades. Unit 4 followed in April 2024. Together with the two older units, Plant Vogtle became the largest nuclear plant in the country. The project was also years late and billions of dollars over budget, which is part of its story too.</p>
  <p>They were not the first AP1000s in the world: Sanmen 1 in China started in 2018, followed by Sanmen 2 and Haiyang 1 and 2. Every first startup still finds things the documents didn't say. The particular surprises in this room (where the critical boron landed, the positive coefficient, a hunting feedwater valve, a startup feed pump that wouldn't start) are illustrative of the kinds of things startup testing exists to find, not a record of Vogtle's own test results.</p>
  <p>What doesn't change from Fermi's squash court to Georgia: you predict, you measure, you believe the measurement, and you don't let a schedule talk you out of it.</p>`,
};
