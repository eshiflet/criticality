// Vogtle Unit 3: a Westinghouse AP1000 (Georgia Power, near Waynesboro, Georgia), the first new
// US reactor design to start up in a generation. The plant around the core is the lumped model in
// w-plant.js; this adds what the first startup of a brand-new AP1000 needs:
//
// · A fresh core: no xenon, no fission products, no decay heat, only the start-up sources.
// · A cold start: heat-up from Mode 5 on the reactor coolant pumps' own heat, with the normal
//   residual heat removal system (RNS) cooling until it's isolated, and pressurizer pressure
//   raised by hand to stay inside the pressure–temperature limits.
// · Mechanical-shim rod control: four "M" banks (gray rods first) that overlap, plus the shutdown
//   banks, which come out at hot standby.
// · Steam generator inventory with a feedwater regulating valve (auto or manual) and a startup
//   feedwater pump.
// · The passive residual heat removal (PRHR) heat exchanger, in the in-containment refuelling-water
//   tank (IRWST), which cools the plant by natural circulation when feedwater is lost.
//
// The physics coefficients are illustrative, chosen so a fresh, high-boron core behaves as fresh
// cores do: the critical boron comes in off the prediction, and the moderator temperature
// coefficient at zero power is slightly positive.

import { Kinetics, clamp, lag, psat, PSIA } from '../engine/physics.js';
import { Plant, TRIPS as W_TRIPS, tsatF } from './w-plant.js';

export const TRIPS = { ...W_TRIPS, sgLow: 'Steam generator narrow-range level low', sgHigh: 'Steam generator level high-2' };

const H = 426.72; // cm: 14 ft of active fuel
const STEPS = 269; // 5/8-in steps of full travel
const OVERLAP = 115;
const SG_GAIN = 3.5; // % of narrow range per second per unit (rated flow) of feed-steam mismatch
const MTC_K = 0.75; // pcm/°F² above no-load + 2 °F
const shape = (s) => s - Math.sin(2 * Math.PI * s) / (2 * Math.PI);

export const AP = {
  beta: 0.0068, Lambda: 2.0e-5, // fresh U-235 fuel: a little more delayed neutrons than a burnt core
  boronWorth: 9.0e-5, // Δk/k per ppm
  shutdownWorth: [0.012, 0.012, 0.012, 0.012], // SD1–SD4
  controlWorth: [0.0035, 0.0035, 0.0055, 0.0075], // MA–MD (MA/MB mostly gray rods)
  predictedCB: 1460, // ppm, the core designers' estimate, MD at the dilution position
  dilutionSteps: 3 * (STEPS - OVERLAP) + 150, // MA–MC out, MD at 150 steps
  predictedITC: -1.0, // pcm/°F at hot zero power
  Tcold: 180, // °F at the start (Mode 5)
};

/** Pressure–temperature limits for the heat-up (psig against °F): stay between these. */
export const PT = {
  max: (T) => (T < 300 ? 480 : T < 400 ? 480 + ((T - 300) / 100) * 2005 : 2485), // cold overpressure (RNS relief) then the vessel limit
  min: (T) => Math.max(325, psat(T + 50) - PSIA), // 50 °F subcooling, and the RCPs' minimum
};

export class AP1000Plant extends Plant {
  constructor({ boron }) {
    super('ap1000', { H, boron, hot: false, boronWorth: -AP.boronWorth });
    this.T0 = this.spec.Tnl; // reactivities are measured from hot zero power
    this.Tavg = this.Tf = this.Ts = AP.Tcold;
    this.Ppzr = 380;
    this.flow = this.flow.map(() => 0);
    Object.assign(this.ctl, {
      pumps: [false, false, false, false],
      pzrSet: 380, rns: true, dumpSet: 1092,
      fwMode: 'auto', fwDemand: 0, fwPump: true,
      prhrIsolate: false,
    });
    this.UA0 = this.UA;
    this.sgInv = 50; this.lvlLag = 50; this.feedFrac = 0; this.feedOn = false; this.fwValve = 0; this.fwGain = 0.16;
    this.fwFault = false; this.sufwFailed = false; this.sufwOn = false;
    this.prhr = false; this.Tirwst = 95;
    this.pzrLev = 30;
    this.heatupRate = 0; this.dTdtLag = 0;
    this.rnsLift = false;
    this.q.prhr = 0;
  }

  get sgLevel() { return this.sgInv; }
  /** The feedwater regulating valve starts hunting: its controller was tuned on paper. */
  startFwFault() { this.fwFault = true; this.fwValve += 0.1; }
  get pzrLevel() { return this.pzrLev; }
  get pzrLevelProgram() { const S = this.spec; return this.Tavg < S.Tnl ? 25 : 25 + ((S.lvlFull - 25) * (this.Tavg - S.Tnl)) / (S.Tfull - S.Tnl); }
  get steamPsig() { return Math.max(0, psat(this.Ts) - PSIA); }
  /**
   * A fresh, high-boron core: the moderator coefficient is slightly positive at hot zero power, and
   * turns negative as the water heats a few degrees above no-load (it falls with temperature).
   */
  get mtc0() { return -30 + 0.022 * this.boron; }
  get mtc() { return this.mtc0 - 2 * MTC_K * Math.max(0, this.Tavg - this.T0 - 2); }
  reactivity() {
    const dT = this.Tavg - this.T0, hi = Math.max(0, dT - 2);
    return this.boronWorth * (this.boron - this.B0) + 1e-5 * (this.doppler * (this.Tf - this.T0) + this.mtc0 * dT - MTC_K * hi * hi);
  }
  get ptMin() { return PT.min(this.Tavg); }
  get ptMax() { return PT.max(this.Tavg); }

  /**
   * Automatic rod control with a power-mismatch term (nuclear power against turbine load), slower
   * than the four-loop plant's: with a nearly flat moderator coefficient, temperature alone gives
   * the controller too little to work with and it hunts.
   */
  rodDemand(now) {
    const c = this.ctl;
    if (this.trip.latched || c.lever || c.rodMode !== 'auto') return super.rodDemand(now);
    const e = this.Tavg - this.Tref + 40 * (this.frac - this.load), a = Math.abs(e);
    if (a < 1.5) return { target: now, rate: 0 };
    if (e < 0 && this.withdrawBlocked(true)) return { target: now, rate: 0 };
    return { target: e > 0 ? 1 : 0, rate: this.rodRate(a < 3 ? 8 : Math.min(40, 8 + (a - 3) * 8)) };
  }

  /** Start or stop a reactor coolant pump; returns a reason if it can't. */
  setPump(i, on) {
    if (on && this.Ppzr < 320) return 'RCP start blocked: pressurizer pressure below 325 psig (pump minimum).';
    this.ctl.pumps[i] = on;
    return null;
  }
  /** RNS: can only be put back in service cold and at low pressure. */
  setRns(on) {
    if (on && (this.Tavg > 350 || this.Ppzr > 450)) return 'RNS interlock: it can only be lined up below 350 °F and 450 psig.';
    this.ctl.rns = on;
    return null;
  }

  step(h, Pw, opts) {
    const c = this.ctl, S = this.spec;
    this.hot = this.Tavg >= 550;
    this.Tdump = tsatF(c.dumpSet + PSIA);
    this.UA = this.UA0 * clamp(this.sgInv / 20, 0.03, 1); // a drying steam generator stops taking heat
    const T0 = this.Tavg, p0 = this.Ppzr;
    const why = super.step(h, Pw, opts);

    // RNS: cooling through its heat exchangers while it's lined up.
    const qRns = c.rns ? Math.min(25, 0.16 * Math.max(0, this.Tavg - 90)) : 0;
    // PRHR: natural circulation from the hot leg through the heat exchanger in the IRWST.
    const qPrhr = this.prhr && !c.prhrIsolate ? Math.max(0, 0.12 * (this.Thot - this.Tirwst)) : 0;
    this.Tavg -= (h * (qRns + qPrhr)) / S.Crcs;
    this.Tirwst += (h * qPrhr) / 2300;
    this.q.prhr = qPrhr; this.q.rns = qRns;

    // Pressurizer: thermal expansion plus heaters/sprays toward the operator's setpoint.
    const dTdt = (this.Tavg - T0) / h;
    this.Ppzr = p0 + h * (12 * dTdt + clamp((c.pzrSet - p0) / 25, -10, 3));
    if (c.rns && this.Ppzr > 470) { this.Ppzr = 470; if (!this.rnsLift) { this.rnsLift = true; this.events.push('RNS relief valve lifted: pressure above 470 psig with RNS lined up.'); } }
    if (this.Ppzr > 2485) this.Ppzr = 2485 - 5; // pressurizer safety valves
    this.dTdtLag = lag(this.dTdtLag, dTdt, 60, h);
    this.heatupRate = 3600 * this.dTdtLag;
    // Pressurizer level: surges with the coolant's expansion; the makeup system brings it to program.
    this.pzrLev = clamp(this.pzrLev + h * (1.8 * dTdt + (this.pzrLevelProgram - this.pzrLev) / 300), 0, 100);

    // Steam generator inventory: feedwater in, steam out.
    const steam = this.steamFrac;
    this.lvlLag = lag(this.lvlLag, this.sgInv, this.fwFault ? 25 : 4, h);
    let feed = 0;
    const mainFeed = c.fwPump && !this.trip.latched;
    if (mainFeed) {
      let cmd;
      if (c.fwMode === 'man') cmd = c.fwDemand / 100;
      else if (this.fwFault) cmd = steam + this.fwGain * (50 - this.lvlLag); // a mistuned valve controller: it hunts
      else cmd = steam + 0.01 * (50 - this.sgInv);
      // The valve itself: slow and sticky when the controller is fighting it.
      this.fwValve = lag(this.fwValve, clamp(cmd, 0, 1.1), this.fwFault && c.fwMode === 'auto' ? 8 : 2, h);
      feed = this.fwValve;
    } else this.fwValve = lag(this.fwValve, 0, 2, h);
    this.sufwOn = !this.sufwFailed && this.trip.latched && this.sgInv < 40;
    if (this.sufwOn) feed += 0.025 * clamp((50 - this.sgInv) / 10, 0, 1);
    this.feedFrac = feed; this.feedOn = mainFeed;
    this.sgInv = clamp(this.sgInv + h * SG_GAIN * (feed - steam), 0, 100);
    // PRHR actuates on low steam generator level with no startup feedwater.
    if (!this.prhr && this.trip.latched && this.sgInv < 10 && !this.sufwOn) { this.prhr = true; this.events.push('PRHR actuated: low steam generator level and no startup feedwater. The heat exchanger outlet valves open; natural circulation starts.'); }
    return why;
  }

  protect(autoTrip) {
    const r = super.protect(autoTrip);
    const sig = this.signals;
    if (this.sgInv < 20 && this.frac > 0.02) sig.add('sgLow');
    if (this.sgInv > 80) sig.add('sgHigh');
    if (r || this.trip.latched || !autoTrip) return r;
    if (sig.has('sgLow')) return this.tripReactor('sgLow');
    if (sig.has('sgHigh')) return this.tripReactor('sgHigh');
    return null;
  }
}

export class AP1000Model {
  /** offset: how many ppm the real critical boron sits above the prediction (the core is more reactive). */
  constructor({ boron = 1750, offset = 35 } = {}) {
    this.spec = AP;
    this.plant = new AP1000Plant({ boron });
    this.shutdown = [0, 0, 0, 0]; // withdrawn steps: in at the start (Mode 5)
    this.ctlSteps = 0; // M banks, overall demand with overlap
    this.sdDemand = false; // the shutdown-bank switch: withdraw all four in sequence
    this.actualCB = AP.predictedCB + offset;
    // Set the plant's reference boron so the core is critical at actualCB with the M banks at the dilution position.
    const atPos = this.rhoBanks(AP.dilutionSteps);
    this.plant.B0 = this.actualCB - atPos / AP.boronWorth;
    this.k = new Kinetics({ beta: AP.beta, Lambda: AP.Lambda, n0: 1e-11 });
    const rho = this.rho();
    this.k.S = (1e-11 * -rho) / AP.Lambda; // the start-up sources
    this.k.equilibrate(rho);
    this.events = [];
    this.t = 0;
  }

  get maxSteps() { return 3 * (STEPS - OVERLAP) + STEPS; }
  banksAt(d) { const out = []; for (let i = 0; i < 4; i++) out.push(clamp(d - i * (STEPS - OVERLAP), 0, STEPS)); return out; }
  get banks() { return this.banksAt(this.ctlSteps); }
  /** SD1–SD4, MA–MD, AO (held out). */
  get bankSteps() { return [...this.shutdown, ...this.banks, STEPS]; }
  get rodLabel() { const b = this.banks; const i = Math.max(0, b.findIndex((s) => s < STEPS)); return b.every((s) => s >= STEPS) ? 'M banks out' : `M${'ABCD'[i]} ${Math.round(b[i])}`; }
  /** Reactivity of the M banks at overall demand d (shutdown banks out). */
  rhoBanks(d) { return this.banksAt(d).reduce((r, s, i) => r - AP.controlWorth[i] * (1 - shape(s / STEPS)), 0); }
  rhoRods() {
    let r = this.rhoBanks(this.ctlSteps);
    this.shutdown.forEach((s, i) => { r -= AP.shutdownWorth[i] * (1 - shape(s / STEPS)); });
    return r;
  }
  rho() { return this.rhoRods() + this.plant.reactivity(); }
  get frac() { return this.k.n; }
  get modeName() {
    const P = this.plant;
    if (P.trip.latched && P.prhr) return 'TRIPPED · PRHR COOLING';
    if (P.trip.latched) return 'REACTOR TRIPPED';
    if (this.frac > 0.05) return 'MODE 1 · POWER';
    if (this.rho() > -0.01) return 'MODE 2 · STARTUP';
    if (P.Tavg >= 350) return 'MODE 3 · HOT STANDBY';
    if (P.Tavg >= 200) return 'MODE 4 · HOT SHUTDOWN';
    return 'MODE 5 · COLD SHUTDOWN';
  }

  step(dt) {
    const P = this.plant;
    let why = null;
    const n = Math.max(1, Math.ceil(dt / 0.1)), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.t += h;
      if (P.trip.latched) {
        this.shutdown = this.shutdown.map((s) => Math.max(0, s - (h * STEPS) / 1.8));
        this.ctlSteps = Math.max(0, this.ctlSteps - (h * this.maxSteps) / 1.8);
      } else {
        // Shutdown banks: withdraw (or insert) one at a time at 48 steps/min.
        const v = (48 * h) / 60;
        if (this.sdDemand) { const k = this.shutdown.findIndex((s) => s < STEPS); if (k >= 0) this.shutdown[k] = Math.min(STEPS, this.shutdown[k] + v); }
        else { const k = this.shutdown.findLastIndex((s) => s > 0); if (k >= 0) this.shutdown[k] = Math.max(0, this.shutdown[k] - v); }
        const ins = 1 - this.ctlSteps / this.maxSteps;
        const d = P.rodDemand(ins);
        if (d && d.rate) {
          const dv = d.rate * P.steps * h;
          this.ctlSteps = clamp(this.ctlSteps + (d.target < ins ? dv : -dv), 0, this.maxSteps);
        }
      }
      this.k.step(h, this.rho());
      const r = P.step(h, this.frac * P.spec.MWt * 1e6);
      if (r && !why) { why = r; this.events.push({ type: 'trip', why: r }); }
    }
    return why;
  }

  takeEvents() { const e = [...this.events, ...this.plant.takeEvents().map((text) => ({ type: 'note', text }))]; this.events = []; return e; }
}
