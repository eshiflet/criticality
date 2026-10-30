// Shared reactor physics: six-group point kinetics with a source, decay heat, iodine/xenon,
// and saturated steam. Everything here is plain numbers, so it runs headless under node too.

/** Delayed-neutron groups: half-lives (s) and fractions of β. */
export const DELAYED = {
  U235: { T: [55.7, 22.7, 6.22, 2.30, 0.61, 0.23], a: [0.033, 0.219, 0.196, 0.395, 0.115, 0.042] },
};

/**
 * Point kinetics. n is the neutron population in arbitrary units scaled so that `power()`
 * returns a fraction of rated power (or watts, for CP-1) via `scale`.
 */
export class Kinetics {
  constructor({ beta = 0.0065, Lambda = 2e-5, source = 0, n0 = 1e-9, rho0 = null }) {
    const g = DELAYED.U235;
    this.beta = beta;
    this.Lambda = Lambda;
    this.betas = g.a.map((x) => x * beta);
    this.lambdas = g.T.map((t) => Math.LN2 / t);
    this.S = source; // neutrons per second (in the units of n per Λ)
    this.n = n0;
    this.C = this.betas.map((b, i) => (b * n0) / (Lambda * this.lambdas[i]));
    this.rho = 0;
    if (rho0 !== null) this.equilibrate(rho0);
  }

  /** Settle into the steady state: n = −S·Λ/ρ when subcritical with a source, else keep n. */
  equilibrate(rho) {
    if (rho < 0 && this.S > 0) this.n = (-this.S * this.Lambda) / rho;
    this.C = this.betas.map((b, i) => (b * this.n) / (this.Lambda * this.lambdas[i]));
    this.rho = rho;
  }

  /** Advance by dt seconds at reactivity rho (Δk/k). Implicit, so prompt jumps are stable. */
  step(dt, rho) {
    const { betas, lambdas, beta, Lambda } = this;
    this.rho = rho;
    let left = dt, guard = 0;
    while (left > 1e-12 && guard++ < 50000) {
      const rate = Math.abs(rho - beta) / Lambda;
      const h = Math.min(left, 0.02, 0.2 / Math.max(rate, 1e-9));
      let denom = 1 - (h * (rho - beta)) / Lambda, num = this.n + h * this.S;
      for (let i = 0; i < 6; i++) {
        const q = 1 + h * lambdas[i];
        denom -= (h * lambdas[i] * h * betas[i]) / Lambda / q;
        num += (h * lambdas[i] * this.C[i]) / q;
      }
      this.n = Math.max(0, num / denom);
      for (let i = 0; i < 6; i++) this.C[i] = (this.C[i] + (h * betas[i] * this.n) / Lambda) / (1 + h * lambdas[i]);
      left -= h;
    }
    return this.n;
  }

  /** Reactor period (s) from the current state: n / (dn/dt). Infinity when steady. */
  period() {
    const dn = ((this.rho - this.beta) / this.Lambda) * this.n + this.lambdas.reduce((s, l, i) => s + l * this.C[i], 0) + this.S;
    return Math.abs(dn) < 1e-30 ? Infinity : this.n / dn;
  }
}

/** Decay heat after long operation, ~6.5% at shutdown, as six groups charged by fission power. */
export const DECAY_GROUPS = [[0.022, 3], [0.013, 30], [0.0095, 300], [0.006, 3000], [0.0038, 3e4], [0.006, 3e5]];
export const DECAY_SUM = DECAY_GROUPS.reduce((s, [f]) => s + f, 0);

export class DecayHeat {
  /** frac0: fission power the plant has been running at (fraction), so the groups start charged. */
  constructor(frac0 = 0) { this.H = DECAY_GROUPS.map(([f]) => f * frac0); }
  /** Step with fission power fraction p; returns decay heat as a fraction of rated. */
  step(dt, p) {
    let sum = 0;
    this.H = this.H.map((H, i) => {
      const [f, tau] = DECAY_GROUPS[i];
      const v = f * p + (H - f * p) * Math.exp(-dt / tau);
      sum += v;
      return v;
    });
    return sum;
  }
  get value() { return this.H.reduce((a, b) => a + b, 0); }
}

/**
 * Iodine-135 → xenon-135, normalised so that at full power equilibrium I = Xe = 1, and
 * `worth` (Δk/k) is the equilibrium xenon worth at full power (~2.8% in a PWR).
 * timeScale > 1 lets a mission compress hours of xenon into minutes.
 */
export class Xenon {
  constructor({ worth = 0.028, frac0 = 1, timeScale = 1, burn = 2.5 } = {}) {
    this.lI = Math.LN2 / (6.57 * 3600);
    this.lX = Math.LN2 / (9.14 * 3600);
    // Burnout rate at full power, as a multiple of decay: xenon in a PWR at full power is
    // removed ~2.5× faster by absorption than by decay.
    this.burn = burn;
    this.worth = worth;
    this.timeScale = timeScale;
    this.setEquilibrium(frac0);
  }
  setEquilibrium(p) {
    this.I = p; // production ∝ p, decay λI·I → I_eq ∝ p
    const yI = 0.95, yX = 0.05; // shares of xenon made via iodine and directly
    this.X = ((yI + yX) * p) / (1 + this.burn * p) * (1 + this.burn); // normalised so X(1) = 1
  }
  step(dt, p) {
    const h = dt * this.timeScale, lI = this.lI, lX = this.lX, yI = 0.95, yX = 0.05;
    // Units chosen so I_eq(p) = p and X_eq(1) = 1.
    const prodI = lI * p;
    this.I += h * (prodI - lI * this.I);
    const k = lX * (1 + this.burn * p);
    const src = lX * (1 + this.burn) * (yI * this.I + yX * p) / 1;
    this.X += h * (src - k * this.X);
    if (this.X < 0) this.X = 0;
  }
  /** Reactivity (negative) from xenon. */
  get rho() { return -this.worth * this.X; }
}

// ---------- saturated water / steam ----------

// Saturation temperature (°F) against pressure (psia), from the steam tables.
const SAT = [[100, 0.95], [150, 3.72], [212, 14.70], [250, 29.84], [300, 67.03], [350, 134.6], [400, 247.3], [450, 422.6],
  [500, 680.9], [550, 1045.4], [600, 1543.2], [650, 2208.8], [700, 3094.3], [705.1, 3200.1]];
export const PSIA = 14.7;

/** Saturation pressure (psia) at T (°F). */
export function psat(T) {
  if (T <= SAT[0][0]) return SAT[0][1] * Math.exp((T - SAT[0][0]) / 30);
  for (let i = 1; i < SAT.length; i++) {
    const [t1, p1] = SAT[i - 1], [t2, p2] = SAT[i];
    if (T <= t2) return Math.exp(Math.log(p1) + ((T - t1) / (t2 - t1)) * (Math.log(p2) - Math.log(p1)));
  }
  return SAT[SAT.length - 1][1] * (1 + (T - 705.1) / 200);
}

/** Saturation temperature (°F) at P (psia). */
export function tsat(P) {
  P = Math.max(0.1, P);
  if (P <= SAT[0][1]) return SAT[0][0] + 30 * Math.log(P / SAT[0][1]);
  for (let i = 1; i < SAT.length; i++) {
    const [t1, p1] = SAT[i - 1], [t2, p2] = SAT[i];
    if (P <= p2) return t1 + ((Math.log(P) - Math.log(p1)) / (Math.log(p2) - Math.log(p1))) * (t2 - t1);
  }
  return 705.1;
}

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
/** First-order lag: move x toward target with time constant tau over dt. */
export const lag = (x, target, tau, dt) => target + (x - target) * Math.exp(-dt / Math.max(1e-9, tau));
