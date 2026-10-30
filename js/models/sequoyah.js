// Sequoyah Unit 1: a Westinghouse four-loop PWR (TVA, near Chattanooga). The plant around the
// core (temperatures, steam generators, turbine, pressurizer, rod control, protection) is the
// lumped model in w-plant.js; this adds the core: neutrons, eight rod banks and xenon.

import { Kinetics, Xenon, clamp } from '../engine/physics.js';
import { Plant, TRIPS } from './w-plant.js';

export { TRIPS };

const STEPS = 228; // steps of 5/8 in for full travel
const OVERLAP = 100; // the next control bank starts when the one before is 100 steps from the top
const H = 365.76; // cm of active fuel

/** Integral worth shape: fraction of a bank's worth removed when s (0–1) of it is withdrawn. */
const shape = (s) => s - Math.sin(2 * Math.PI * s) / (2 * Math.PI);

export const SEQ = {
  beta: 0.0065, Lambda: 2.0e-5,
  boronWorth: 10.77e-5, // Δk/k per ppm (measured at sister plant Watts Bar 1)
  shutdownWorth: [0.011, 0.011, 0.0065, 0.0065], // SA–SD
  controlWorth: [0.007, 0.010, 0.011, 0.013], // A–D (D measured 1342 pcm at Watts Bar 1)
  xenonWorth: 0.027,
};

export class SequoyahModel {
  /** state: 'hsb' hot standby with shutdown banks out, control banks in. */
  constructor({ boron = 1180, xenonScale = 1, xenon = 0 } = {}) {
    this.spec = SEQ;
    this.plant = new Plant('sequoyah', { H, boron, hot: true, boronWorth: -SEQ.boronWorth });
    // The plant's reactivity() measures boron from B0; put B0 at the all-rods-out critical value
    // (no xenon), so the rods hold the margin below it.
    this.B0 = 1291;
    this.plant.B0 = this.B0;
    this.shutdown = [STEPS, STEPS, STEPS, STEPS]; // withdrawn steps
    this.ctlSteps = 0; // overall control-bank demand, 0 … 3·(STEPS−OVERLAP)+STEPS
    this.xe = new Xenon({ worth: SEQ.xenonWorth, frac0: xenon, timeScale: xenonScale });
    const rho = this.rho();
    this.k = new Kinetics({ beta: SEQ.beta, Lambda: SEQ.Lambda, n0: 3e-11 });
    this.k.S = (3e-11 * -rho) / SEQ.Lambda;
    this.k.equilibrate(rho);
    this.events = [];
    this.t = 0;
  }

  get maxSteps() { return 3 * (STEPS - OVERLAP) + STEPS; }
  /** Withdrawn steps of control banks A–D from the overall demand (with overlap). */
  get banks() {
    const d = this.ctlSteps, out = [];
    for (let i = 0; i < 4; i++) out.push(clamp(d - i * (STEPS - OVERLAP), 0, STEPS));
    return out;
  }
  /** Bank positions for the panel: SA–SD, A–D. */
  get bankSteps() { return [...this.shutdown, ...this.banks]; }

  rhoRods() {
    let r = 0;
    this.shutdown.forEach((s, i) => { r -= SEQ.shutdownWorth[i] * (1 - shape(s / STEPS)); });
    this.banks.forEach((s, i) => { r -= SEQ.controlWorth[i] * (1 - shape(s / STEPS)); });
    return r;
  }
  rho() { return this.rhoRods() + this.plant.reactivity() + this.xe.rho; }
  get frac() { return this.k.n; }

  /** Advance dt seconds (substeps of 0.1 s). Returns a trip reason if the reactor tripped. */
  step(dt) {
    const P = this.plant;
    let why = null;
    const n = Math.max(1, Math.ceil(dt / 0.1)), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.t += h;
      // Rod control: the plant model asks for a direction and speed in fractions of travel.
      if (P.trip.latched) {
        this.shutdown = this.shutdown.map((s) => Math.max(0, s - (h * STEPS) / 1.8));
        this.ctlSteps = Math.max(0, this.ctlSteps - (h * this.maxSteps) / 1.8);
      } else {
        const ins = 1 - this.ctlSteps / this.maxSteps;
        const d = P.rodDemand(ins);
        if (d && d.rate) {
          const v = d.rate * P.steps * h; // steps of one bank's travel
          this.ctlSteps = clamp(this.ctlSteps + (d.target < ins ? v : -v), 0, this.maxSteps);
        }
      }
      this.k.step(h, this.rho());
      this.xe.step(h, this.frac);
      const r = P.step(h, this.frac * P.spec.MWt * 1e6);
      if (r && !why) { why = r; this.events.push({ type: 'trip', why: r }); }
    }
    return why;
  }

  /** Withdraw or insert a shutdown bank by hand (startup: before the control banks). */
  moveShutdown(i, dir, h) {
    if (this.plant.trip.latched && dir > 0) return;
    this.shutdown[i] = clamp(this.shutdown[i] + (dir * 48 * h) / 60, 0, STEPS);
  }
  takeEvents() { const e = [...this.events, ...this.plant.takeEvents().map((text) => ({ type: 'note', text }))]; this.events = []; return e; }
}
