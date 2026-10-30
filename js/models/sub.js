// A generic naval pressurized-water reactor plant, as described in public, unclassified sources:
// a small core with a strongly negative temperature coefficient, so reactor power follows the
// steam the throttles draw without the rods moving; the rods only set the average coolant
// temperature. Two main propulsion turbines drive the shaft through reduction gears; ship's
// service turbine generators make electricity; after a scram the battery carries the ship and
// the emergency propulsion motor (EPM) turns the shaft slowly. Numbers are illustrative.

import { Kinetics, DecayHeat, clamp, lag, psat, PSIA } from '../engine/physics.js';

export const SUB = {
  beta: 0.0065, Lambda: 2.5e-5,
  rodWorth: 0.12, rodTravel: 60, rodSpeed: 2, // inches, in/s (shim speed)
  Tref: 500, dTfull: 40, // °F: Tavg is held constant, ΔT across the core at full power
  mtc: -35e-5, doppler: -2e-5, // Δk/k per °F (coolant), per °F (fuel)
  Crcs: 25, Csg: 15, // MJ/°F, small plant: fast transients
  MW: 150, // rated thermal power (illustrative)
  TsFull: 470, // steam temperature at full power, °F
  flankKts: 28,
  battery: 100, // %
};

/** Engine-order telegraph: the shaft power each bell asks for (fraction of full, astern negative). */
export const BELLS = [
  ['BACK EMERG', -0.6], ['BACK FULL', -0.4], ['BACK 2/3', -0.2], ['BACK 1/3', -0.1], ['STOP', 0],
  ['AHEAD 1/3', 0.1], ['AHEAD 2/3', 0.2], ['AHEAD STD', 0.35], ['AHEAD FULL', 0.6], ['AHEAD FLANK', 1.0],
];
export const BELL_STOP = 4;

const shape = (s) => s - Math.sin(2 * Math.PI * s) / (2 * Math.PI);

export class SubModel {
  constructor({ critical = true, power = 0.15 } = {}) {
    const S = (this.spec = SUB);
    this.t = 0;
    this.ctl = {
      rodCmd: 0, // −1 insert, 0 hold, +1 withdraw (the shim switch)
      ahead: 0, astern: 0, // throttle openings 0–1
      pumpsFast: true,
      epm: false, // emergency propulsion motor on the battery
      bell: BELL_STOP + 2,
      sstg: true, // ship's service turbine generators on line (need steam)
    };
    this.scrammed = false;
    this.why = null;
    this.Tavg = S.Tref;
    this.Tf = S.Tref;
    this.Ts = S.TsFull + 20;
    this.speed = 0; // knots
    this.rpm = 0; // shaft, fraction of full
    this.battery = S.battery;
    this.noise = 0;
    this.decay = new DecayHeat(power);
    // The core is critical with the rods half out, at Tref, with fuel at its 15%-power temperature.
    this.rod = critical ? 0.5 : 0;
    this.Tf = S.Tref + 150 * (critical ? power : 0);
    this.k = new Kinetics({ beta: S.beta, Lambda: S.Lambda, n0: critical ? power : 1e-9 });
    this.k.S = 1e-10;
    this.k.equilibrate(critical ? 0 : this.rho());
    this.flow = 1;
    this.events = [];
    this.alarms = new Set();
    this.q = { core: power, sg: power, steam: power, epm: 0 };
    this.sur = 0;
    this.logLag = Math.log10(Math.max(this.k.n, 1e-12));
  }

  get frac() { return this.k.n; }
  get rodIn() { return this.spec.rodTravel * this.rod; } // inches withdrawn
  get steamPsig() { return psat(this.Ts) - PSIA; }
  get dT() { return (this.q.core / Math.max(0.15, this.flow)) * this.spec.dTfull; }
  get Thot() { return this.Tavg + this.dT / 2; }
  get Tcold() { return this.Tavg - this.dT / 2; }
  get bellPower() { return BELLS[this.ctl.bell][1]; }
  get bellName() { return BELLS[this.ctl.bell][0]; }
  get orderedRpm() { return Math.sign(this.bellPower) * Math.sqrt(Math.abs(this.bellPower)); }

  rho() {
    const S = this.spec;
    const rods = -S.rodWorth * (0.5 - shape(this.rod)); // zero with the rods half out
    return rods + S.mtc * (this.Tavg - S.Tref) + S.doppler * (this.Tf - S.Tref - 150 * 0.15);
  }

  scram(why) {
    if (this.scrammed) return;
    this.scrammed = true;
    this.why = why;
    this.events.push({ type: 'scram', why });
  }
  resetScram() { if (this.scrammed && this.rod <= 0.001) { this.scrammed = false; this.why = null; return true; } return false; }

  step(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.05)), h = dt / n;
    for (let i = 0; i < n; i++) this.substep(h);
  }

  substep(h) {
    const S = this.spec, c = this.ctl;
    this.t += h;
    // Rods.
    if (this.scrammed) this.rod = Math.max(0, this.rod - h / 1.2);
    else if (c.rodCmd) this.rod = clamp(this.rod + (c.rodCmd * S.rodSpeed * h) / S.rodTravel, 0, 1);
    // Neutrons and heat.
    this.k.step(h, this.rho());
    const fission = this.frac;
    const decay = this.decay.step(h, fission);
    const core = fission * 0.935 + decay;
    // Pumps: slow speed gives about half flow (quieter).
    this.flow = lag(this.flow, c.pumpsFast ? 1 : 0.5, 4, h);
    // Fuel to coolant.
    this.Tf = lag(this.Tf, this.Tavg + 150 * core, 4, h);
    // Steam: the throttles draw steam in proportion to opening and pressure; the SSTGs a little more.
    const pRel = clamp(this.steamPsig / 450, 0, 1.3);
    const turb = (c.ahead + c.astern) * pRel * 1.0;
    const hotel = c.sstg ? 0.04 * pRel : 0;
    const qSteam = turb + hotel;
    const UA = 1 / ((S.Tref - S.TsFull) * 1); // full power at the full-power temperature difference
    const qSg = UA * Math.sqrt(this.flow) * (this.Tavg - this.Ts);
    this.Tavg += (h * (core - qSg) * S.MW) / S.Crcs;
    this.Ts += (h * (qSg - qSteam) * S.MW) / S.Csg;
    this.Ts = Math.max(212, this.Ts);
    this.q = { core, sg: qSg, steam: qSteam, turb };
    // Shaft and ship: the turbines (or the EPM, ~5% power, ahead only) turn the shaft.
    const epm = c.epm && this.battery > 0 ? 0.05 * (this.bellPower >= 0 ? 1 : -1) * Math.min(1, Math.abs(this.bellPower) * 10) : 0;
    const shaftPower = (c.ahead - c.astern) * pRel + epm;
    const rpmTarget = Math.sign(shaftPower) * Math.sqrt(Math.abs(shaftPower));
    this.rpm = lag(this.rpm, rpmTarget, 3, h);
    this.speed = lag(this.speed, this.rpm * S.flankKts, 40, h);
    // Battery: the EPM and, without the SSTGs, the ship's hotel load.
    const drain = (c.epm ? 0.06 : 0) + (c.sstg && pRel > 0.4 ? 0 : 0.02); // %/s
    this.battery = clamp(this.battery - drain * h * 1.2, 0, 100); // about 17 minutes on the EPM
    if (c.sstg && pRel < 0.4 && !this.sstgLost) { this.sstgLost = true; this.events.push({ type: 'note', text: 'Steam pressure too low for the SSTGs: electrical load on the battery.' }); }
    if (pRel >= 0.5) this.sstgLost = false;
    // Noise: pumps in fast speed and a fast-turning shaft are what an enemy hears.
    this.noise = clamp(0.25 + (c.pumpsFast ? 0.35 : 0) + 0.5 * Math.abs(this.rpm) ** 2, 0, 1.2);
    // Startup rate (decades per minute).
    const lg = Math.log10(Math.max(this.frac, 1e-12));
    this.sur = (60 * (lg - this.logLag)) / 2;
    this.logLag += (lg - this.logLag) * (1 - Math.exp(-h / 2));
    this.protect();
  }

  protect() {
    const a = this.alarms;
    a.clear();
    if (this.frac > 1.0) a.add('pwrHi');
    if (this.Thot > this.spec.Tref + 35) a.add('thotHi');
    if (this.sur > 1.5 && this.frac < 0.1) a.add('surHi');
    if (!this.ctl.pumpsFast && this.frac > 0.55) a.add('flowLow');
    if (this.battery < 25) a.add('battLow');
    if (this.steamPsig < 300) a.add('steamLow');
    if (this.frac > 1.15) this.scram('High power');
    else if (this.sur > 4 && this.frac < 0.1) this.scram('High startup rate'); // source and intermediate range only
    else if (this.Thot > this.spec.Tref + 55) this.scram('High coolant temperature');
    else if (this.frac > 0.6 && this.flow < 0.55) this.scram('Low coolant flow');
  }
  takeEvents() { const e = this.events; this.events = []; return e; }
}
