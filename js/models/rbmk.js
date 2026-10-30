// Chernobyl Unit 4: an RBMK-1000 (3,200 MWt): 1,661 pressure tubes of boiling water in a
// graphite stack, two loops of four main circulation pumps (MCPs), drum separators, two
// turbine-generators (TG-7, TG-8). Lumped model, tuned to the account in IAEA INSAG-7:
//
// · Positive void coefficient: more steam means more reactivity. It's worst at low power with
//   few rods in the core (low operating reactivity margin, ORM).
// · Xenon: after a day at reduced power and a dip to near zero, xenon holds the core down and the
//   rods must come out to keep it critical — the ORM falls.
// · The rods' graphite displacers: a rod that starts fully withdrawn has water below its
//   displacer; in the first ~1.25 m of an AZ-5 insertion the graphite pushes that water out of the
//   bottom of the core and adds reactivity there before the absorber arrives.
// · Each insertion takes ~18 s (0.4 m/s over 7 m).
//
// Units: MW thermal, bar, °C, ORM in equivalent fully-inserted manual rods.

import { Kinetics, DecayHeat, Xenon, clamp, lag } from '../engine/physics.js';

export const RBMK = {
  MWt: 3200, beta: 0.0050, Lambda: 1.0e-3 * 0.8, // graphite: a long neutron lifetime
  rodTravel: 7, rodSpeed: 0.4, // m, m/s
  rods: { RR: 139, USP: 24, AR: 12, LAR: 12, AZ: 24 }, // 211 in all
  rodWorth: 4.0e-4, // Δk/k per equivalent rod
  xenonWorth: 0.030,
  voidCoef: 2.2e-4, // Δk/k per % void (≈ +4β for full voiding)
  doppler: -1.1e-5, // per °C of fuel
  graphite: 0.6e-5, // per °C of graphite (slow)
  ormLimit: 15, // regulations: below this, shut down
  testMinMW: 700, // the test programme's own minimum
};

export const RBMK_TRIPS = { az5: 'AZ-5 pressed', power: 'Emergency power protection (AZ-5)', level: 'Drum separator level low', tg: 'Both turbines stopped', period: 'Short period (AZM)' };

export class RBMKModel {
  /** state: '2310' — the evening of 25 April 1986, 1,600 MW after nine hours at half power. */
  constructor({ power = 1600, hoursAtPower = 9, orm = 26 } = {}) {
    const S = (this.spec = RBMK);
    this.t = 0;
    const p = power / S.MWt;
    this.ctl = {
      mcp: [true, true, true, false, true, true, true, false], // 4 per loop; pumps 4 and 8 on standby
      tg8: true, // TG-8 stop valves open
      tripBlocked: false, // the turbine-trip AZ-5 signal blocked (the test programme did this)
      levelTripBlocked: false,
      autoMode: 'LAR', // 'LAR' local automatic, 'AR' global automatic, 'MAN'
      setMW: power,
      feed: 1, // feedwater, fraction of what the steaming needs
      rrCmd: 0, // −1 insert, +1 withdraw manual rods
      eccs: true,
    };
    this.xe = new Xenon({ worth: S.xenonWorth, frac0: 1, burn: 5 }); // high flux: xenon burns out fast at power, so it piles up when power falls
    // The day before: full power, then half power for `hoursAtPower` hours.
    for (let i = 0; i < hoursAtPower * 60; i++) this.xe.step(60, p);
    // Rods: RR in as an equivalent count; AR/LAR in about half; USP mostly in; AZ out.
    this.rr = orm - 8; // equivalent manual rods in
    this.ar = 0.5; this.usp = 0.4; this.az = 0;
    this.az5 = null; // AZ-5 in progress: seconds since pressed
    this.jammed = false;
    this.decay = new DecayHeat(p);
    this.Tfuel = 280 + 900 * p;
    this.Tgraph = 500 + 150 * p;
    this.flow = this.flowTarget();
    this.void = this.voidTarget(p);
    this.k = new Kinetics({ beta: S.beta, Lambda: S.Lambda, n0: p });
    this.k.S = 1e-9;
    this.base = 0;
    this.base = -this.rho();
    this.k.equilibrate(0);
    this.drumP = 65; this.drumLevel = 0; // bar; cm about normal
    this.rundown = 1; // TG-8-fed pumps' speed
    this.destroyed = false; this.peakMW = power;
    this.events = []; this.alarms = new Set();
    this.sur = 0; this.periodS = Infinity;
    this.logLag = Math.log10(p);
    this.ormPrinted = this.orm; this.ormAge = 0;
  }

  get MW() { return this.k.n * this.spec.MWt; }
  get frac() { return this.k.n; }
  /** Operating reactivity margin: equivalent manual rods in the core. */
  get orm() { return clamp(this.rr + this.ar * 12 * 0.6 + this.usp * 24 * 0.25 + this.az * 24, 0, 211); }
  get pumpsOn() { return this.ctl.mcp.filter(Boolean).length; }
  /** Fully withdrawn rods (water under their displacers). */
  // With a big margin most rods sit part-way in; as the margin falls, more and more are pulled to
  // the top stop, each with water under its displacer.
  get rodsOut() { return this.spec.rods.RR * Math.exp(-this.orm / 12) + (1 - this.az) * 24; }

  flowTarget() {
    // Each pump moves 1/6 of nominal flow; the four on TG-8's bus slow down during the rundown.
    return this.ctl.mcp.reduce((s, on, i) => s + (on ? (i >= 4 ? this.rundown ?? 1 : 1) : 0), 0) / 6;
  }
  /** Core-average steam void (%), from power, flow and the feedwater's subcooling of the inlet. */
  voidTarget(p) {
    const flow = Math.max(0.15, this.flow);
    // Extra feedwater subcools the inlet and suppresses boiling (most at low power).
    const sub = clamp((this.ctl.feed - 1) * 2, -1, 3) * (p < 0.3 ? 1 : 0.3);
    return clamp(40 * (p / flow) + 5 * p - sub, 0, 75);
  }

  rho() {
    const S = this.spec;
    const ormEff = this.orm;
    // The void coefficient grows as the margin falls and the flux sinks to the bottom of the core.
    const vc = S.voidCoef * (1 + 0.05 * Math.max(0, S.ormLimit - ormEff)) * (this.frac < 0.25 ? 1.3 : 1);
    let r = this.base - S.rodWorth * ormEff + this.xe.rho + vc * this.void + S.doppler * (this.Tfuel - 280) + S.graphite * (this.Tgraph - 500);
    // The displacers: positive for the first ~3 s of an AZ-5 on rods that started fully out.
    if (this.az5 !== null) {
      const x = this.az5 * S.rodSpeed; // m travelled
      const pos = clamp(x / 1.25, 0, 1) * (x < 2.5 ? 1 : clamp(1 - (x - 2.5) / 1.5, 0, 1));
      r += pos * this.az5Out * 4.0e-5 * (this.bottomPeaked ? 1.8 : 1);
    }
    return r;
  }

  pressAZ5(why = 'az5') {
    if (this.az5 !== null) return;
    this.az5 = 0;
    this.az5Out = this.rodsOut;
    this.bottomPeaked = this.frac < 0.25 && this.orm < this.spec.ormLimit;
    this.why = why;
    this.events.push({ type: 'az5', why: RBMK_TRIPS[why] || why });
  }

  /** Start the turbine rundown test: close TG-8's stop valves. */
  startTest() {
    if (!this.ctl.tg8) return;
    this.ctl.tg8 = false;
    this.testT = 0;
    this.events.push({ type: 'test' });
  }

  step(dt) { const n = Math.max(1, Math.ceil(dt / 0.02)), h = dt / n; for (let i = 0; i < n && !this.destroyed; i++) this.substep(h); }

  substep(h) {
    const S = this.spec, c = this.ctl;
    this.t += h;
    // Rods. Manual rods move at 0.4 m/s each, one group at a time (≈ 1 equivalent rod per 4 s).
    if (this.az5 === null) {
      if (c.rrCmd) this.rr = clamp(this.rr - c.rrCmd * h * 0.25, 0, S.rods.RR); // +1 withdraws
      // Automatic regulators hold the power setpoint (LAR/AR); in MAN they hold position.
      if (c.autoMode !== 'MAN') {
        const err = (this.MW - c.setMW) / Math.max(200, c.setMW);
        this.ar = clamp(this.ar + h * clamp(err * 0.05, -0.004, 0.004) * (c.autoMode === "AR" ? 0.6 : 1), 0, 1);
      }
    } else if (!this.jammed) {
      this.az5 += h;
      const x = this.az5 * S.rodSpeed / S.rodTravel; // fraction of travel
      this.rr = Math.max(this.rr, Math.min(S.rods.RR, this.az5Start ?? (this.az5Start = this.rr)) + (S.rods.RR - (this.az5Start ?? 0)) * clamp((x - 0.18) / 0.82, 0, 1));
      this.az = clamp((x - 0.18) / 0.82, 0, 1);
      this.ar = Math.max(this.ar, clamp(x, 0, 1));
    }
    // Pumps and flow; the rundown slows TG-8's four pumps over ~40 s.
    if (!c.tg8) { this.testT += h; this.rundown = Math.max(0.55, 1 - this.testT / 70); }
    this.flow = lag(this.flow, this.flowTarget(), 3, h);
    // Neutrons, heat, voids.
    const rho = this.rho();
    this.k.step(h, rho);
    const p = this.frac;
    const decay = this.decay.step(h, Math.min(p, 50));
    const heat = Math.min(p, 200) * 0.935 + decay;
    this.Tfuel = lag(this.Tfuel, 280 + 900 * heat, 4, h);
    this.Tgraph = lag(this.Tgraph, 500 + 150 * heat, 600, h);
    this.void = lag(this.void, this.voidTarget(heat), heat > 2 ? 0.3 : 1.5, h);
    this.xe.step(h, Math.min(p, 2));
    // Drum separators.
    const steam = heat;
    this.drumLevel = clamp(this.drumLevel + h * (c.feed * steam - steam) * 30 - h * 0.02 * this.drumLevel, -120, 60);
    this.drumP = lag(this.drumP, 65 + (c.tg8 ? 0 : 3) + 4 * Math.max(0, heat - 1), 20, h);
    this.peakMW = Math.max(this.peakMW, this.MW);
    // Startup rate and period.
    const lg = Math.log10(Math.max(p, 1e-9));
    this.sur = (60 * (lg - this.logLag)) / 1;
    this.logLag += (lg - this.logLag) * (1 - Math.exp(-h / 1));
    this.periodS = this.sur > 1e-3 ? 60 / (this.sur * Math.LN10) : Infinity;
    // Fuel fragments when the energy dumped in a few seconds is far beyond design.
    if (this.MW > 10 * S.MWt && !this.jammed) { this.jammed = true; this.events.push({ type: 'jam' }); }
    if (this.MW > 30000 || (this.MW > 15000 && this.Tfuel > 3000)) { this.destroyed = true; this.events.push({ type: 'destroyed' }); }
    // SKALA's ORM is a printout, minutes old.
    this.ormAge += h;
    if (this.ormAge > 300) { this.ormAge = 0; this.ormPrinted = this.orm; }
    this.protect();
  }

  protect() {
    const S = this.spec, c = this.ctl, a = this.alarms;
    a.clear();
    if (this.orm < S.ormLimit) a.add('orm');
    if (this.MW < S.testMinMW && this.MW > 1) a.add('lowPower');
    if (this.drumLevel < -40) a.add('drumLow');
    if (this.pumpsOn === 8 && this.frac < 0.3) a.add('cavitation');
    if (this.sur > 0.5) a.add('period');
    if (!c.eccs) a.add('eccs');
    if (this.az5 !== null) return;
    if (this.MW > 1.1 * S.MWt) this.pressAZ5('power');
    else if (this.periodS < 20 && this.frac > 0.01) this.pressAZ5('period');
    else if (!c.tg8 && !c.tripBlocked) this.pressAZ5('tg');
    else if (this.drumLevel < -80 && !c.levelTripBlocked) this.pressAZ5('level');
  }
  takeEvents() { const e = this.events; this.events = []; return e; }
}
