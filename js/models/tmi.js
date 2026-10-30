// Three Mile Island Unit 2: a Babcock & Wilcox 177-assembly PWR (2,772 MWt) with two once-
// through steam generators (OTSGs), four reactor coolant pumps and the Integrated Control System.
//
// Lumped model of the reactor coolant system (RCS) built to show what fooled the operators on
// 28 March 1979: mass M and average temperature T of the coolant; total volume fixed, so the
// space the water doesn't fill is steam. While the loops are subcooled that steam is the
// pressurizer's bubble; once the hot legs reach saturation, steam forms in the loops and pushes
// water up into the pressurizer — so the pressurizer level rises while coolant pours out of a
// stuck-open PORV. With the pumps running, steam and water stay mixed and the core stays cool;
// with them off, the steam separates and the core uncovers.

import { Kinetics, DecayHeat, clamp, lag, psat, tsat, PSIA } from '../engine/physics.js';

const BTU_PER_MW = 947.8;
// Saturated liquid density, lb/ft³, against °F.
const RHO = [[100, 62.0], [212, 59.8], [300, 57.3], [400, 53.6], [500, 49.0], [550, 45.9], [600, 42.3], [650, 37.3], [700, 27.0]];
const rhoL = (T) => {
  if (T <= RHO[0][0]) return RHO[0][1];
  for (let i = 1; i < RHO.length; i++) if (T <= RHO[i][0]) { const [a, ra] = RHO[i - 1], [b, rb] = RHO[i]; return ra + ((T - a) / (b - a)) * (rb - ra); }
  return RHO[RHO.length - 1][1];
};
const hfg = (P) => clamp(1200 - 0.27 * P, 400, 970); // BTU/lb, ~650 at 2,000 psia

export const TMI = {
  MWt: 2772, beta: 0.0065, Lambda: 2.2e-5,
  Pset: 2155, porvOpen: 2255, porvClose: 2205, trip: 2355, codeSafety: 2500, rdLow: 1900, esas: 1640, // psig
  Vloop: 10600, Vpzr: 1500, // ft³
  pzrHeight: 400, pzrLevelSet: 220, // in
  Tavg: 582, dT: 47, // °F at full power: Thot 605, Tcold 558
  C: 9.0e5, // BTU/°F, coolant and metal
  rcpMW: 9, // each, as heat
  sgFull: 45, // klb secondary water per OTSG at power
  stmPsig: 1010, sgSafety: 1050,
};

export class TMIModel {
  constructor({ power = 0.97 } = {}) {
    const S = (this.spec = TMI);
    this.t = 0;
    this.ctl = {
      rcp: [true, true, true, true], // 1A 1B 2A 2B
      hpi: [true, false, false], // makeup pumps MU-P1A/B/C (one runs for normal makeup)
      hpiValve: 0.08, // HPI injection valves (fraction open); 0.08 ≈ normal makeup
      letdown: true,
      blockValve: true, // RC-V2 open
      porvSwitch: 'auto', // 'auto' | 'open' | 'close'
      heaters: true, spray: 'auto',
      efwPumps: [false, false, false], efwBlock: [false, false], // EF-V12A/B: shut (left shut after a test)
      mainFeed: true,
      turbine: true,
    };
    this.porvStuck = false; // set by the mission
    this.porv = false; // actual valve position
    this.porvSolenoid = false; // what the panel lamp shows
    this.scrammed = false;
    this.why = null;
    this.T = S.Tavg;
    this.Tf = S.Tavg + 1100 * power;
    this.P = S.Pset;
    this.Mnom = 0;
    // Coolant mass that fills the loops and the pressurizer to its level setpoint.
    const Vw = S.Vloop + (S.pzrLevelSet / S.pzrHeight) * S.Vpzr;
    this.M = Vw * rhoL(S.Tavg) / 1000; // klb
    this.Mnom = this.M;
    this.sg = [S.sgFull, S.sgFull];
    this.TsFull = tsat(S.stmPsig + PSIA);
    this.Ts = this.TsFull;
    this.decay = new DecayHeat(power);
    this.k = new Kinetics({ beta: S.beta, Lambda: S.Lambda, n0: power });
    this.k.S = 1e-10;
    this.rods = 0.85; // regulating groups withdrawn
    this.base = 0;
    this.rcdtP = 3; this.rcdtT = 110; this.rcdtLevel = 70; this.rupture = false;
    this.tailpipe = 200; // °F; a known small leak kept it warm before the accident
    this.contP = 0; this.sump = 0; this.radiation = 1;
    this.Tclad = this.T + 40;
    this.damage = 0; this.h2 = 0;
    this.flow = [1, 1, 1, 1];
    this.events = [];
    this.alarms = new Set();
    this.q = {};
    this.voidLoop = 0;
    this.saturated = false;
    this.rcpVib = 0;
  }

  get frac() { return this.k.n; }
  get pumpsOn() { return this.flow.reduce((a, b) => a + b, 0) / 4; }
  get Thot() { return this.T + (this.q.core ?? 0.97) * this.spec.dT / Math.max(0.05, this.pumpsOn > 0.1 ? this.pumpsOn : 0.05) / 2 * (this.saturated ? 0 : 1); }
  get Tcold() { return this.saturated ? this.T - 2 : this.T - (this.Thot - this.T); }
  get TsatP() { return tsat(this.P + PSIA); }
  /** Pressurizer level, inches (0–400): what the operators trusted. */
  get pzrLevel() { return this.pzrFrac * this.spec.pzrHeight; }
  get subcooling() { return this.TsatP - this.Thot; }
  /** Wide-range hot-leg indicator: the 1979 meters stopped at 620 °F. */
  get ThotInd() { return Math.min(620, this.Thot); }
  get incoreTC() { return this.Tclad; }
  get sgLevel() { return this.sg.map((m) => clamp((m / this.spec.sgFull) * 100, 0, 250)); } // in, startup range

  rho() {
    const shape = (s) => s - Math.sin(2 * Math.PI * s) / (2 * Math.PI);
    return -0.12 * (1 - shape(this.rods)) + this.base - 2.0e-5 * (this.Tf - this.spec.Tavg - 1100 * 0.97) - 22e-5 * (this.T - this.spec.Tavg);
  }

  scram(why) { if (this.scrammed) return; this.scrammed = true; this.why = why; this.events.push({ type: 'scram', why }); }

  step(dt) { const n = Math.max(1, Math.ceil(dt / 0.05)), h = dt / n; for (let i = 0; i < n; i++) this.substep(h); }

  substep(h) {
    const S = this.spec, c = this.ctl;
    if (this.t === 0) this.base = -this.rho();
    this.t += h;
    // Rods.
    if (this.scrammed) this.rods = Math.max(0, this.rods - h / 1.5);
    this.k.step(h, this.rho());
    const fission = this.frac;
    const decay = this.decay.step(h, fission);
    const core = fission * 0.935 + decay;
    // Pumps: running pumps vibrate and lose head as the voids grow.
    this.flow = this.flow.map((f, i) => lag(f, c.rcp[i] ? 1 - 0.5 * this.voidLoop : 0, c.rcp[i] ? 5 : 20, h));
    const pumps = this.pumpsOn;
    this.rcpVib = c.rcp.some(Boolean) ? clamp(this.voidLoop * 3, 0, 1) : 0;
    const pumpHeat = c.rcp.filter(Boolean).length * S.rcpMW;
    this.Tf = lag(this.Tf, this.T + 1100 * core * (1 - this.uncovered()), 5, h);

    // Secondary: main feed, emergency feed (through EF-V12A/B), steaming to the turbine, the
    // turbine bypass valves (holding 1,010 psig) and the main steam safeties (1,050 psig).
    const feedEach = c.mainFeed ? 1.6 : 0; // klb/s at full power
    const efwEach = c.efwPumps.some(Boolean) ? 0.06 : 0;
    const UA = S.MWt / 2 / (S.Tavg - this.TsFull); // MW/°F per OTSG
    const qSg = [0, 1].map((i) => {
      const wet = clamp(this.sg[i] / S.sgFull, 0, 1); // OTSG: heat transfer falls with the small inventory
      const circ = pumps > 0.1 ? 1 : this.saturated ? 0.03 : 0.5; // natural circulation stops when the hot legs void
      return Math.max(0, wet * circ * UA * (this.T - this.Ts));
    });
    const T1010 = tsat(S.stmPsig + PSIA), T1050 = tsat(S.sgSafety + PSIA);
    const qTurb = c.turbine ? 0.97 * S.MWt * clamp((this.Ts - 400) / 100, 0, 1) : 0;
    const qByp = c.turbine ? 0 : clamp((this.Ts - T1010) * 0.25 * S.MWt / 3, 0, 0.25 * S.MWt);
    const qSafe = clamp((this.Ts - T1050) * S.MWt / 3, 0, 1.2 * S.MWt);
    this.Ts += (h * (qSg[0] + qSg[1] - qTurb - qByp - qSafe) * BTU_PER_MW) / 8.0e4;
    this.sg = this.sg.map((m, i) => {
      const feed = feedEach * (c.mainFeed ? clamp((S.sgFull - m) / 10 + core, 0, 1.2) : 0) + (c.efwBlock[i] ? efwEach : 0);
      return clamp(m + h * (feed - (qSg[i] * BTU_PER_MW) / 1000 / 700), 0, 120);
    });
    // Coolant mass: makeup/HPI in, letdown and the PORV (and safeties) out.
    const hpiPumps = c.hpi.filter(Boolean).length;
    const head = Math.sqrt(clamp(1 - this.P / 2900, 0, 1));
    const wHpi = hpiPumps ? Math.min(hpiPumps, 2) * 0.07 * head * clamp(c.hpiValve, 0, 1) : 0; // klb/s (~500 gpm a pump)
    const wLet = c.letdown && this.P > 300 ? 0.0035 : 0;
    // PORV: lifts at 2,255, reseats at 2,205 — unless it sticks. The lamp only shows the solenoid.
    const autoOpen = this.P > S.porvOpen || (this.porvSolenoid && this.P > S.porvClose);
    this.porvSolenoid = c.porvSwitch === 'open' || (c.porvSwitch === 'auto' && autoOpen);
    this.porv = this.porvStuck || this.porvSolenoid;
    const flowing = this.porv && c.blockValve;
    const water = this.pzrFrac > 0.92;
    const wPorv = flowing ? (water ? 0.06 : 0.028) * Math.sqrt(Math.max(0, this.P) / 2000) * (this.P > 50 ? 1 : 0) : 0; // klb/s
    const wSafety = this.P > S.codeSafety ? 0.2 * (this.P - S.codeSafety) / 50 : 0;
    this.M += h * (wHpi - wLet - wPorv - wSafety);
    // Energy.
    const qIn = (core * S.MWt + pumpHeat) * BTU_PER_MW;
    const qOut = (qSg[0] + qSg[1]) * BTU_PER_MW + (wPorv + wSafety) * 1000 * (water ? 0 : hfg(this.P + PSIA)) + wHpi * 1000 * Math.max(0, this.T - 90) * 1.05;
    this.T = Math.max(90, this.T + (h * (qIn - qOut)) / S.C);
    // A solid system can't hold more water: the excess goes out through the PORV (if the block
    // valve is open) or the code safeties, at whatever pressure that takes.
    const Vmax = S.Vloop + S.Vpzr;
    if ((this.M * 1000) / rhoL(this.T) > Vmax) {
      const excess = this.M - (Vmax * rhoL(this.T)) / 1000;
      this.M -= excess;
      this.solidRelief = excess / h; // klb/s
      if (!flowing) this.P = Math.max(this.P, S.codeSafety + 5);
      else this.P = Math.max(this.P, 2300);
      if (this.rupture) this.sump += (excess * 1000) / 8.3 / 100;
      else this.rcdtP = Math.min(260, this.rcdtP + excess * 40);
    } else this.solidRelief = 0;
    // Volumes: what the water doesn't fill is steam.
    const Vw = (this.M * 1000) / rhoL(this.T);
    const Vs = S.Vloop + S.Vpzr - Vw;
    const ThotNow = this.T + core * S.dT / Math.max(0.05, pumps > 0.1 ? pumps : 0.05) / 2;
    const satNow = ThotNow >= tsat(this.P + PSIA) - 0.5 || Vs > S.Vpzr * 0.98;
    if (satNow !== this.saturated) { this.saturated = satNow; if (satNow) this.events.push({ type: 'saturated' }); }
    if (this.saturated) {
      // Steam in the loops pushes water up into the pressurizer.
      this.voidLoop = clamp((Vs - 0.03 * S.Vpzr) / S.Vloop, 0, 1);
      this.pzrFrac = clamp(1 - Math.min(Vs, 0.03 * S.Vpzr) / S.Vpzr, 0, 1);
      // Pressure rides the saturation curve at the hot leg.
      this.P = lag(this.P, psat(this.T + 2) - PSIA, 3, h);
    } else {
      this.voidLoop = lag(this.voidLoop, 0, 20, h);
      this.pzrFrac = clamp(1 - Vs / S.Vpzr, 0, 1);
      // Bubble pressure: compression from insurge, heaters/spray toward 2,155, flashing floor.
      const dVs = Vs - (this.lastVs ?? Vs);
      let dP = (-0.35 * (this.P + PSIA) * dVs) / Math.max(30, Vs);
      if (c.heaters && this.P < S.Pset - 20 && this.pzrFrac > 0.1) dP += 2 * h;
      if (this.P > 2205 && c.spray === 'auto' && pumps > 0.4) dP -= 4 * h;
      if (wPorv) dP -= (wPorv * 1000 * (water ? 0.2 : 1) * 120 * h) / Math.max(30, Vs);
      this.P = Math.max(psat(this.T) - PSIA, this.P + dP);
    }
    this.lastVs = Vs;
    if (this.P < 0) this.P = 0;
    // Where the PORV discharges: tailpipe and the reactor coolant drain tank (rupture disk ~192 psig).
    this.tailpipe = lag(this.tailpipe, flowing ? Math.min(290, tsat(this.rcdtP + PSIA) + 20) : 200, 30, h);
    if (!this.rupture) {
      this.rcdtP = clamp(this.rcdtP + h * (wPorv * 1000 * (water ? 0.0045 : 0.011) - 0.0005 * this.rcdtP), 0, 260); // the rupture disk went at about 4:15
      this.rcdtT = lag(this.rcdtT, flowing ? tsat(this.rcdtP + PSIA) : 110, 60, h);
      if (this.rcdtP > 192) { this.rupture = true; this.events.push({ type: 'rupture' }); }
    } else {
      this.rcdtP = lag(this.rcdtP, this.contP, 30, h);
      this.contP = clamp(this.contP + h * (wPorv * 3 - 0.004 * this.contP), 0, 30);
      this.sump += h * wPorv * 1000 / 8.3 / 60; // ×100 gal
    }
    // Core cover: pumps keep steam and water mixed; without them the steam separates out.
    const u = this.uncovered();
    // Hottest cladding: uncovered fuel heats on decay heat (~1 °F/s at 1%), and above ~1,800 °F the
    // zirconium–steam reaction adds its own heat; covered fuel stays near the water.
    if (u > 0.02) this.Tclad += h * (110 * core * Math.min(1, u * 3) + (this.Tclad > 1800 ? 0.004 * (this.Tclad - 1800) : 0) - ((this.Tclad - this.T) * (1 - u)) / 60);
    else this.Tclad = lag(this.Tclad, this.T + 30 * core, 20, h);
    this.Tclad = Math.min(this.Tclad, 5100); // fuel melts and slumps; it doesn't get hotter
    if (this.Tclad > 2200) {
      const r = h * 0.0015 * (this.Tclad - 2200) / 300;
      this.damage = Math.min(Math.max(this.damage, Math.min(1, u + 0.15)), this.damage + r); // only the uncovered fuel
      this.h2 += r * 1000; // lb of hydrogen from the zirconium–steam reaction, roughly
    }
    this.radiation = 1 + 200 * this.damage * (this.rupture ? 3 : 1) + 0.5 * this.voidLoop;
    this.q = { core, decay, qSg, wHpi, wLet, wPorv, wSafety, water };
    this.protect();
  }

  uncovered() {
    const v = this.voidLoop;
    return this.pumpsOn > 0.15 ? clamp((v - 0.85) / 0.15, 0, 1) : clamp((v - 0.42) / 0.3, 0, 1);
  }

  protect() {
    const S = this.spec, a = this.alarms, c = this.ctl;
    a.clear();
    if (this.P > S.trip) this.scram('High RC pressure');
    if (this.P < S.rdLow && this.frac > 0.1) this.scram('Low RC pressure');
    if (this.P < S.esas && !this.esas) { this.esas = true; c.hpi = [true, true, c.hpi[2]]; c.hpiValve = 1; this.events.push({ type: 'esas' }); }
    if (!c.mainFeed && c.turbine) { c.turbine = false; this.events.push({ type: 'turbineTrip' }); }
    if (!c.mainFeed && !this.efwStarted) { this.efwStarted = true; c.efwPumps = [true, true, true]; }
    if (this.porvSolenoid) a.add('porv');
    if (this.pzrLevel > 300) a.add('pzrHi');
    if (this.pzrLevel < 100) a.add('pzrLo');
    if (this.P < 2000) a.add('pLo');
    if (this.P > 2300) a.add('pHi');
    if (this.tailpipe > 230) a.add('tailpipe');
    if (this.rcdtP > 120) a.add('rcdt');
    if (this.sgLevel.some((l) => l < 10)) a.add('sgLo');
    if (this.rcpVib > 0.3) a.add('rcpVib');
    if (this.radiation > 20) a.add('rad');
    if (this.contP > 4) a.add('contP');
    if (this.Tclad > 700) a.add('incore');
  }
  takeEvents() { const e = this.events; this.events = []; return e; }
}
