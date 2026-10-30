// Browns Ferry Unit 1: a General Electric BWR/4 with a Mark I containment (TVA, Alabama), at its
// original rating of 3,293 MWt. The core boils water directly; steam goes straight to the turbine.
//
// Lumped model: point kinetics with void and Doppler feedback; reactor water temperature at
// saturation sets the dome pressure (energy balance); vessel water mass sets the level, read on
// the instruments with swell from the voids; feedwater, CRD, HPCI, RCIC, core spray, LPCI and the
// condensate booster pumps put water in, each over its own pressure range; turbine, bypass, the
// 13 safety/relief valves (to the suppression pool) and the MSIVs let steam out. When the level
// falls below the top of active fuel, the cladding heats up.

import { Kinetics, DecayHeat, clamp, lag, psat, tsat, PSIA } from '../engine/physics.js';

const BTU_PER_MW = 947.8;

export const BWR = {
  MWt: 3293, MWe: 1098, beta: 0.0060, Lambda: 4e-5,
  Pnom: 1005, // dome pressure, psig
  Wfull: 3.72, // steam flow at full power, klb/s (13.4 Mlb/h)
  klbPerIn: 1.3, // water per inch of level above the core
  Lnorm: 33, L8: 55, L7: 39, L4: 27, L3: 2, L2: -45, L1: -122, TAF: -162, BAF: -306, // inches
  C: 1.2e6, // BTU/°F, water and steel in the vessel
  voidCoef: -0.11, // Δk/k per unit void fraction
  voidRef: 0.42,
  doppler: -2.0e-5, // per °F of fuel
  rodGroups: 10, rodWorth: 0.17,
  srvs: 13, srvFlow: 0.22, // klb/s each at 1,100 psig
  srvLift: [1105, 1105, 1105, 1105, 1115, 1115, 1115, 1115, 1125, 1125, 1125, 1125, 1125],
};

const shape = (s) => s - Math.sin(2 * Math.PI * s) / (2 * Math.PI);
/** Injection flow, klb/s, for a pump of `rated` klb/s that delivers up to `shutoff` psig. */
const pump = (rated, shutoff, P) => (P >= shutoff ? 0 : rated * Math.sqrt(1 - Math.max(0, P) / shutoff));

export const BWR_TRIPS = {
  manual: 'Manual scram', mode: 'Mode switch in SHUTDOWN', aprm: 'APRM high flux', l3: 'Reactor water level low (L3)',
  pHigh: 'Reactor pressure high', msiv: 'MSIV closure', tsv: 'Turbine stop valve closure', sdv: 'Scram discharge volume high',
};

export class BWRModel {
  constructor({ power = 1.0 } = {}) {
    const S = (this.spec = BWR);
    this.t = 0;
    this.ctl = {
      mode: 'run',
      recirc: [true, true], recircSpeed: [1, 1], // M-G set speed demand 0.2–1
      feedAuto: true, feedPumps: [true, true, true], levelSet: S.Lnorm, feedManual: 1,
      loadSet: power, prSet: S.Pnom,
      msiv: true, // MSIVs open (control switch)
      srv: Array(S.srvs).fill(false), // manually opened
      hpci: 'auto', rcic: 'auto', cs: ['auto', 'auto'], lpci: ['auto', 'auto'], // 'auto' | 'on' | 'off'
      cbp: false, // condensate booster pumps lined up to inject through the feed line
      crd: true, rhrCooling: false, adsInhibit: false,
    };
    // What the fire (or anything else) has taken away. A false entry won't run, whatever the switch says.
    this.avail = { hpci: true, rcic: true, cs: [true, true], lpci: [true, true], msivCtl: true, recirc: [true, true], srv: Array(S.srvs).fill(true), feed: true, cbp: true, crd: true, levelInd: true };
    this.scrammed = false;
    this.why = null;
    this.Tw = tsat(S.Pnom + PSIA);
    this.M = 0; // klb of water relative to normal level (normal = 0)
    this.flowFrac = 1;
    this.rodGroups = Array(S.rodGroups).fill(0.62); // fraction withdrawn
    this.decay = new DecayHeat(power);
    this.Tf = this.Tw + 1200 * power;
    this.k = new Kinetics({ beta: S.beta, Lambda: S.Lambda, n0: power });
    this.k.S = 1e-9;
    this.alpha = this.voidFrac(power, 1);
    this.p0 = power;
    this.base = 0;
    this.base = -this.rhoNoBase(power);
    this.k.equilibrate(0);
    this.Tclad = this.Tw + 60;
    this.damage = 0; // fraction of fuel damaged
    this.pool = 92; // °F, suppression pool
    this.turbFlow = S.Wfull * power;
    this.turbineTripped = false;
    this.adsTimer = null;
    this.events = [];
    this.alarms = new Set();
    this.q = {};
    this.sur = 0;
    this.logLag = Math.log10(power);
    this.levelInd = S.Lnorm;
  }

  get P() { return Math.max(0, psat(this.Tw) - PSIA); } // dome, psig (the SRVs vent to the pool, so never a vacuum)
  get frac() { return this.k.n; }
  /** Collapsed level, inches above instrument zero. */
  get Lc() { return this.spec.Lnorm + this.M / this.spec.klbPerIn; }
  /** Indicated level (downcomer): collapsed plus swell from the voids. */
  get level() { return this.Lc + 40 * (this.alpha - this.spec.voidRef) * clamp(this.frac / 0.3, 0, 1); }
  get coreFlow() { return this.flowFrac; }
  voidFrac(p, flow) { return clamp(this.spec.voidRef * Math.pow(Math.max(p, 1e-4) / Math.max(flow, 0.25), 0.4) * (1 - (this.P - this.spec.Pnom) * 0.0003), 0, 0.75); }

  rhoNoBase(p) {
    const S = this.spec;
    let rods = 0;
    this.rodGroups.forEach((g) => { rods -= (S.rodWorth / S.rodGroups) * (1 - shape(g)); });
    return rods + S.voidCoef * (this.alpha - S.voidRef) + S.doppler * (this.Tf - this.Tw - 1200 * p) - 0;
  }
  rho() { return this.rhoNoBase(this.p0) + this.base; }

  scram(why) {
    if (this.scrammed) return;
    this.scrammed = true;
    this.why = why;
    this.events.push({ type: 'scram', why: BWR_TRIPS[why] || why });
  }
  resetScram() {
    if (!this.scrammed || this.ctl.mode === 'run' && this.trippedSignals().length) return false;
    this.scrammed = false; this.why = null; return true;
  }
  trippedSignals() { return [...this.alarms].filter((a) => a.startsWith('trip:')); }

  step(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.1)), h = dt / n;
    for (let i = 0; i < n; i++) this.substep(h);
  }

  substep(h) {
    const S = this.spec, c = this.ctl, A = this.avail;
    this.t += h;
    const P = this.P;
    // Rods: a scram drives every rod in within about 3 s.
    if (this.scrammed) this.rodGroups = this.rodGroups.map((g) => Math.max(0, g - h / 3));
    // Recirculation: core flow from the two pumps, down to natural circulation (~30%).
    const speeds = [0, 1].map((i) => (c.recirc[i] && A.recirc[i] ? clamp(c.recircSpeed[i], 0.2, 1) : 0));
    const flowTarget = Math.max(0.3 * clamp(this.frac / 0.5 + 0.1, 0, 1), 0.15 + 0.425 * (speeds[0] + speeds[1]));
    this.flowFrac = lag(this.flowFrac, Math.min(1.05, flowTarget), 5, h);
    // Neutrons, voids, fuel.
    const fission = this.frac;
    this.alpha = lag(this.alpha, this.voidFrac(fission + this.decay.value, this.flowFrac), 1.0, h);
    this.k.step(h, this.rho());
    const decay = this.decay.step(h, fission);
    const core = fission * 0.935 + decay; // fraction of rated
    this.Tf = lag(this.Tf, this.Tw + 1200 * core * (this.uncovered() < 1 ? 1 : 0), 6, h);
    // Steam out: turbine (pressure regulator), bypass, SRVs. MSIVs shut isolate the lot.
    const msivOpen = c.msiv && (A.msivCtl || true) && !this.msivClosed;
    let wTurb = 0, wBypass = 0;
    if (msivOpen) {
      const err = P - c.prSet;
      const demand = this.turbineTripped ? 0 : clamp(c.loadSet, 0, 1.05) * S.Wfull;
      const want = Math.max(0, S.Wfull * (core + err / 30)); // EHC holds pressure
      wTurb = Math.min(want, demand);
      wBypass = clamp(want - wTurb, 0, 0.25 * S.Wfull);
    }
    this.turbFlow = lag(this.turbFlow, wTurb, 1.5, h);
    let wSrv = 0, srvOpen = 0;
    this.srvState = c.srv.map((m, i) => {
      const lift = P > S.srvLift[i] || (this.srvState?.[i] && P > S.srvLift[i] - 50);
      const open = (m && A.srv[i]) || lift || (this.adsFired && i < 6 && A.srv[i]);
      if (open) { wSrv += S.srvFlow * Math.max(0, P + PSIA) / 1115; srvOpen++; }
      return open;
    });
    // Water in.
    const hfg = 1100 - 0.42 * Math.max(0, P); // BTU/lb, roughly, 650 at 1,000 psig
    const feedOK = A.feed && msivOpen && !this.feedTripped;
    let wFeed = 0;
    if (feedOK) {
      const pumps = c.feedPumps.filter(Boolean).length;
      const cap = (pumps * 1.4 * S.Wfull) / 3;
      const want = c.feedAuto ? S.Wfull * core + (c.levelSet - this.level) * 0.08 + (this.turbFlow + wBypass - S.Wfull * core) : c.feedManual * S.Wfull;
      wFeed = clamp(want, 0, cap);
    }
    const run = (sw, avail, autoStart) => avail && (sw === 'on' || (sw === 'auto' && autoStart));
    const l2 = this.level < S.L2, l1 = this.level < S.L1;
    if (l2 && !this.l2Latched) { this.l2Latched = true; this.events.push({ type: 'note', text: 'Level 2: HPCI and RCIC initiate; recirculation pumps trip.' }); c.recirc = [false, false]; }
    if (this.level > S.L8) this.l2Latched = false;
    const hpciOn = run(c.hpci, A.hpci, this.l2Latched) && P > 150;
    const rcicOn = run(c.rcic, A.rcic, this.l2Latched) && P > 50;
    let wHpci = hpciOn ? 0.69 : 0, wRcic = rcicOn ? 0.083 : 0;
    if (this.level > S.L8) { wHpci = 0; wRcic = 0; } // high level trips the steam-driven pumps
    const wCs = [0, 1].reduce((s, i) => s + (run(c.cs[i], A.cs[i], l1) ? pump(0.87, 315, P) : 0), 0);
    const wLpci = [0, 1].reduce((s, i) => s + (run(c.lpci[i], A.lpci[i], l1) ? pump(2.4, 225, P) : 0), 0);
    const wCbp = c.cbp && A.cbp ? pump(1.1, 450, P) : 0;
    const wCrd = c.crd && A.crd ? 0.017 : 0;
    const wIn = wFeed + wHpci + wRcic + wCs + wLpci + wCbp + wCrd;
    const steamDriven = (wHpci ? 0.035 : 0) + (wRcic ? 0.006 : 0);
    const wOut = this.turbFlow + wBypass + wSrv + steamDriven;
    // Energy: heat in, steam out at hfg, feed and injection heated from ~100–380 °F up to saturation.
    const Tfeed = feedOK ? 380 : 100;
    const qIn = core * S.MWt * BTU_PER_MW;
    const qOut = wOut * 1000 * hfg + wIn * 1000 * Math.max(0, this.Tw - Tfeed) * 1.1;
    this.Tw = Math.max(100, this.Tw + (h * (qIn - qOut)) / S.C);
    this.M += h * (wIn - wOut);
    this.M = Math.min(this.M, 120);
    this.q = { core, decay, wFeed, wHpci, wRcic, wCs, wLpci, wCbp, wCrd, wTurb: this.turbFlow, wBypass, wSrv, srvOpen, wIn, wOut };
    // Suppression pool: the SRVs and HPCI/RCIC exhaust dump into it; RHR cooling takes heat out.
    this.pool += (h * (wSrv * 1000 * 1190 + steamDriven * 1000 * 1000 - (c.rhrCooling && A.lpci[0] ? 1.0e5 * Math.max(0, this.pool - 85) / 10 : 0))) / 1.0e7;
    // Cladding: covered fuel stays near the water; uncovered fuel heats on decay heat.
    const u = this.uncovered();
    const heatUp = u * core * 30; // °F/s per unit uncovered at full decay heat… roughly
    this.Tclad = this.Tclad + h * (heatUp - (1 - u) * (this.Tclad - this.Tw - 40 * core) / 5 - u * (this.Tclad - this.Tw) / 400);
    if (this.Tclad > 2200) this.damage = Math.min(1, this.damage + h * 0.002 * (this.Tclad - 2200) / 300);
    // ADS: low-low-low level with high drywell pressure… here L1 for two minutes, unless inhibited.
    if (l1 && !c.adsInhibit && !this.adsFired) { this.adsTimer = (this.adsTimer ?? 120) - h; if (this.adsTimer <= 0) { this.adsFired = true; this.events.push({ type: 'note', text: 'ADS actuated: six relief valves open to blow the vessel down.' }); } }
    if (!l1 && !this.adsFired) this.adsTimer = null;
    // Startup rate.
    const lg = Math.log10(Math.max(this.frac, 1e-12));
    this.sur = (60 * (lg - this.logLag)) / 2;
    this.logLag += (lg - this.logLag) * (1 - Math.exp(-h / 2));
    this.levelInd = A.levelInd ? this.level : this.levelInd + (Math.random() - 0.5) * 2 * h;
    this.protect();
  }

  uncovered() { const S = this.spec; return clamp((S.TAF - this.Lc) / (S.TAF - S.BAF), 0, 1); }

  protect() {
    const S = this.spec, a = this.alarms, c = this.ctl;
    a.clear();
    const sig = [];
    if (c.mode === 'shutdown') sig.push('mode');
    if (this.frac > 1.18) sig.push('aprm');
    if (this.level < S.L3) sig.push('l3');
    if (this.P > 1055) sig.push('pHigh');
    if (this.level < S.L1 && !this.msivClosed) { this.msivClosed = true; this.events.push({ type: 'note', text: 'Level 1: the MSIVs close.' }); }
    if (!c.msiv || this.msivClosed) sig.push('msiv');
    if (this.turbineTripped && this.frac > 0.3) sig.push('tsv');
    sig.forEach((s) => a.add('trip:' + s));
    if (this.level > S.L7) a.add('lvlHi');
    if (this.level < S.L4) a.add('lvlLo');
    if (this.level > S.L8 && !this.turbineTripped) { this.turbineTripped = true; this.feedTripped = true; this.events.push({ type: 'note', text: 'Level 8: turbine and feed pumps trip.' }); }
    if (this.pool > 95) a.add('poolHi');
    if (this.Tclad > 1500) a.add('cladHi');
    if (this.q.srvOpen) a.add('srvOpen');
    if (this.Lc > 100) a.add('flooding'); // water rising into the steam lines
    if (!this.scrammed && sig.length) this.scram(sig[0]);
  }

  /** Close (true) or open the MSIVs from the control switch. */
  setMsiv(open) { if (!this.avail.msivCtl) return false; this.ctl.msiv = open; if (open) this.msivClosed = false; return true; }
  tripTurbine() { this.turbineTripped = true; }
  takeEvents() { const e = this.events; this.events = []; return e; }
}
