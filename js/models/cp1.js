// Chicago Pile-1, 2 December 1942: 57 layers of graphite holding natural uranium metal and oxide
// in a squash court under Stagg Field. No cooling and no shielding: it ran at half a watt.
//
// Three cadmium rods: the hand-pulled control rod (marked in feet withdrawn), the automatic
// safety rod (raised by a motor, held up by a solenoid that lets go when the ionization chamber
// passes its trip setting) and the ZIP rod (pulled out against a weight and tied off; cutting the
// rope drops it in). On the platform above, the "liquid control squad" stood ready with buckets
// of cadmium-nitrate solution. Power is in watts; it's low enough that nothing heats up.

import { Kinetics } from '../engine/physics.js';

export const CP1 = {
  rodLength: 14, // ft of travel, the rods were 14 ft long
  rhoExcess: 0.0006, // all rods out (the pile came out at k ≈ 1.0006)
  controlWorth: 0.0042, // critical with the control rod about 12 ft out
  safetyWorth: 0.0045,
  zipWorth: 0.0045,
  cadmiumWorth: 0.05,
  Lambda: 1.0e-3, // s, graphite: neutrons live about a millisecond
  beta: 0.0065,
  sourceW: 1.0e-3, // W the Ra-Be source holds the pile at with all rods in, about
  rodSpeed: 0.5, // ft/s, a hand pull
  dropTime: 1.5, // s for a falling rod
  limitW: 200, // W, Fermi's limit: above this the balcony gets real radiation
};

/**
 * Integral rod-worth shape: fraction of the rod's worth that's out when s (0–1) of it is withdrawn.
 * The rods ran horizontally right through a pile far longer than the core of it that mattered, so
 * the worth is close to linear in position (which is why Fermi's 1/M plot came out straight).
 */
const shape = (s) => s;

export class CP1Model {
  constructor() {
    const S = (this.spec = CP1);
    this.t = 0;
    this.ctl = {
      control: 0, // ft withdrawn (target, set by Weil's hand)
      safetyUp: false, // motor raising the safety rod
      zipOut: false, // ZIP pulled out and tied
      tripW: 0.05, // automatic safety rod trip setting, watts (set too low, as it was that morning)
      cadmium: false, // the bucket brigade
      range: 0, // recorder range: full scale = 10^range × 0.01 W
    };
    this.rod = { control: 0, safety: 0, zip: 0 }; // fraction withdrawn 0–1
    this.safetyLatched = true; // solenoid holding
    this.tripped = null; // why the safety rod fell, if it did
    this.cad = 0; // fraction of the cadmium solution poured in
    const rho = this.rho();
    this.k = new Kinetics({ beta: S.beta, Lambda: S.Lambda, source: 0, n0: S.sourceW });
    // Source strength that holds sourceW with every rod in.
    this.k.S = (S.sourceW * -rho) / S.Lambda;
    this.k.equilibrate(rho);
    this.counts = 0; // cumulative counter clicks
    this.cps = this.cpsTrue;
    this.maxW = this.P;
    this.dose = 0; // mrem at the balcony
    this.events = [];
  }

  /** Reactivity, Δk/k. */
  rho() {
    const S = this.spec, r = this.rod;
    return S.rhoExcess
      - S.controlWorth * (1 - shape(r.control))
      - S.safetyWorth * (1 - shape(r.safety))
      - S.zipWorth * (1 - shape(r.zip))
      - S.cadmiumWorth * this.cad;
  }
  get kEff() { return 1 / (1 - this.rho()); }
  /** Where the control rod makes the pile exactly critical, with the other rods where they are (ft). */
  get criticalFt() {
    const S = this.spec, r = this.rod;
    const others = S.rhoExcess - S.safetyWorth * (1 - shape(r.safety)) - S.zipWorth * (1 - shape(r.zip)) - S.cadmiumWorth * this.cad;
    return S.rodLength * (1 - others / S.controlWorth);
  }
  get P() { return this.k.n; } // watts
  get period() { return this.k.period(); }
  get controlFt() { return this.rod.control * this.spec.rodLength; }
  /** BF₃ counter rate, counts per second: about 10 a second from the source alone. */
  get cpsTrue() { return 1e4 * this.P + 0.3; }
  /** Ionization chamber current, amperes. */
  get ionAmps() { return 2e-9 * this.P; }
  /** Recorder pen, 0–1 of full scale on the selected range. */
  get pen() { return Math.min(1.02, this.P / (0.01 * 10 ** this.ctl.range)); }
  /** Dose rate at the balcony rail, mrem/h. */
  get doseRate() { return 0.6 * this.P; }
  /** Subcritical multiplication relative to the source alone (all rods in). */
  get inverseM() { return this.spec.sourceW / Math.max(this.P, 1e-12); }

  step(dt) {
    const S = this.spec, c = this.ctl, r = this.rod;
    this.t += dt;
    // Rods: the control rod follows Weil's hand; the safety rod rises on its motor while the
    // solenoid holds; the ZIP is pulled out by hand; falling rods drop in fast.
    const move = (x, target, speed) => x + Math.max(-speed * dt, Math.min(speed * dt, target - x));
    r.control = move(r.control, c.control / S.rodLength, S.rodSpeed / S.rodLength);
    if (!this.safetyLatched) r.safety = move(r.safety, 0, 1 / S.dropTime);
    else r.safety = move(r.safety, c.safetyUp ? 1 : 0, 0.05);
    r.zip = c.zipOut ? move(r.zip, 1, 0.1) : move(r.zip, 0, 1 / S.dropTime);
    if (c.cadmium) this.cad = Math.min(1, this.cad + dt / 20);

    this.k.step(dt, this.rho());
    // Automatic safety rod: the solenoid lets go when the chamber passes the trip setting.
    if (this.safetyLatched && r.safety > 0.05 && this.P > c.tripW) {
      this.safetyLatched = false;
      this.tripped = 'auto';
      this.events.push({ type: 'safetyTrip' });
    }
    // Counter clicks (the UI turns them into sound) with Poisson noise.
    const lam = this.cpsTrue * dt;
    const n = lam > 30 ? Math.max(0, Math.round(lam + Math.sqrt(lam) * gauss())) : poisson(lam);
    this.counts += n;
    this.lastClicks = n;
    this.cps += (n / Math.max(dt, 1e-6) - this.cps) * Math.min(1, dt / 1.5);
    this.maxW = Math.max(this.maxW, this.P);
    this.dose += (this.doseRate * dt) / 3600;
  }

  /** Re-arm the safety rod's solenoid (the rod then has to be wound back up). */
  resetSafety() { this.safetyLatched = true; this.tripped = null; }
  /** Cut the ZIP rope. */
  dropZip() { this.ctl.zipOut = false; this.events.push({ type: 'zip' }); }
  takeEvents() { const e = this.events; this.events = []; return e; }
}

function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function poisson(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; }
