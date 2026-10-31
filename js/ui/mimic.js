// Plant mimic: a schematic of the whole plant drawn in SVG, with live values, water levels, pumps
// that turn, valves that open and fluid that moves along the pipes. Each control room draws its own
// (js/ui/mimics.js); this is the toolkit. Colours follow US control-room practice: red = open or
// running, green = closed or stopped.

import { h } from './widgets.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * Build a mimic from SVG markup. Elements with data-r="name" are addressable. Pipes drawn as
 * <path class="m-p …" data-r> get a moving-fluid overlay; rects with data-lvl are level gauges
 * (their drawn box is the full range).
 */
export function mimic({ title, w = 720, h: H = 220, markup, cls = '' }) {
  const box = h('div', { class: `mimic ${cls}` });
  box.innerHTML = `<div class="m-title">${title}</div><div class="m-scroll"><svg viewBox="0 0 ${w} ${H}" role="img" aria-label="${title}">${markup}</svg></div>`;
  const svgEl = box.querySelector('svg');
  const r = {};
  svgEl.querySelectorAll('[data-r]').forEach((e) => { r[e.dataset.r] = e; });
  // Fluid overlays for addressable pipes.
  svgEl.querySelectorAll('path.m-p[data-r]').forEach((p) => {
    const o = p.cloneNode(false);
    o.removeAttribute('data-r');
    o.setAttribute('class', 'm-fl');
    p.after(o);
    r[`${p.dataset.r}$`] = o;
  });
  // Level gauges remember their full box.
  const lv = {};
  svgEl.querySelectorAll('[data-lvl]').forEach((e) => { lv[e.dataset.r] = { y: +e.getAttribute('y'), h: +e.getAttribute('height') }; });
  const shown = new Map();
  const put = (key, val, f) => { if (shown.get(key) !== val) { shown.set(key, val); f(); } };

  return {
    el: box,
    r,
    /** Text value. */
    text(ref, s) { put(`t:${ref}`, s, () => { r[ref].textContent = s; }); },
    /** Water level 0–1 in a data-lvl rect. */
    level(ref, f) {
      const b = lv[ref], v = clamp(f, 0, 1);
      const k = v.toFixed(3);
      put(`l:${ref}`, k, () => { r[ref].setAttribute('y', (b.y + b.h * (1 - v)).toFixed(1)); r[ref].setAttribute('height', (b.h * v).toFixed(1)); });
    },
    /** Fluid moving along a pipe: f = 0 (still) … 1 (full flow); negative runs it backwards. */
    flow(ref, f) {
      const o = r[`${ref}$`], a = Math.abs(f);
      const k = a < 0.02 ? 'off' : `${Math.sign(f)}:${Math.round(a * 10)}`;
      put(`f:${ref}`, k, () => {
        if (k === 'off') { o.style.opacity = 0; return; }
        o.style.opacity = 1;
        o.style.animationDuration = `${(1.4 / clamp(a, 0.1, 1.5)).toFixed(2)}s`;
        o.style.animationDirection = f < 0 ? 'reverse' : 'normal';
      });
    },
    /** Colour a pipe by temperature between lo (blue) and hi (red). */
    heat(ref, T, lo, hi) {
      const x = clamp((T - lo) / (hi - lo), 0, 1), k = x.toFixed(2);
      put(`h:${ref}`, k, () => { r[ref].style.stroke = `rgb(${Math.round(70 + 150 * x)}, ${Math.round(110 - 50 * x)}, ${Math.round(190 - 140 * x)})`; });
    },
    /** Pumps, fans, propellers: spin at rate 0–1 (negative reverses); `on` lights it red. */
    spin(ref, rate, on = Math.abs(rate) > 0.02) {
      const e = r[ref], k = `${on}:${Math.sign(rate)}:${Math.round(Math.abs(rate) * 10)}`;
      put(`s:${ref}`, k, () => {
        e.classList.toggle('on', on);
        const b = e.querySelector('.m-blades');
        if (!b) return;
        b.classList.toggle('m-spin', Math.abs(rate) > 0.02);
        b.style.animationDuration = `${(0.9 / clamp(Math.abs(rate), 0.15, 1.5)).toFixed(2)}s`;
        b.style.animationDirection = rate < 0 ? 'reverse' : 'normal';
      });
    },
    /** Valve: open (red) or shut (green); 'fail' greys it out. */
    valve(ref, open, fail = false) { put(`v:${ref}`, `${open}${fail}`, () => { r[ref].classList.toggle('open', !!open); r[ref].classList.toggle('fail', !!fail); }); },
    /** Toggle a class (on, dead, alarm…). */
    cls(ref, c, on) { put(`c:${ref}:${c}`, !!on, () => r[ref].classList.toggle(c, !!on)); },
    /** Shift an element (rods, a tilting lid). */
    move(ref, dx, dy = 0, rot = 0, cx = 0, cy = 0) {
      const k = `${dx.toFixed(1)},${dy.toFixed(1)},${rot.toFixed(1)}`;
      put(`m:${ref}`, k, () => r[ref].setAttribute('transform', `translate(${dx.toFixed(1)} ${dy.toFixed(1)})${rot ? ` rotate(${rot.toFixed(1)} ${cx} ${cy})` : ''}`));
    },
    /** Core glow from neutron power (fraction of rated, log scale over 9 decades). */
    glow(ref, frac) {
      const lg = Math.log10(Math.max(frac, 1e-14)), x = clamp((lg + 9) / 9, 0, 1.15);
      const k = x.toFixed(2);
      put(`g:${ref}`, k, () => { r[ref].style.opacity = (0.15 + 0.85 * Math.min(1, x)).toFixed(2); r[ref].style.filter = x > 1 ? 'url(#m-bloom)' : ''; });
    },
    show(ref, on) { put(`d:${ref}`, !!on, () => { r[ref].style.display = on ? '' : 'none'; }); },
    paused(p) { box.classList.toggle('paused', !!p); },
  };
}

// Small drawing helpers for the markup.
export const pump = (ref, x, y, r = 8) => `<g class="m-pump" data-r="${ref}" transform="translate(${x} ${y})"><circle r="${r}"/><g class="m-blades"><path d="M0 ${-r + 2} L0 ${r - 2} M${-r + 2} 0 L${r - 2} 0"/></g></g>`;
export const valve = (ref, x, y, vertical = false) => `<g class="m-v" data-r="${ref}" transform="translate(${x} ${y})${vertical ? ' rotate(90)' : ''}"><path d="M-7 -6 L7 6 L7 -6 L-7 6 Z"/></g>`;
export const lbl = (x, y, t, anchor = 'start', cls = 'm-lbl') => `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${t}</text>`;
export const val = (ref, x, y, anchor = 'start', big = false) => `<text class="m-val${big ? ' big' : ''}" data-r="${ref}" x="${x}" y="${y}" text-anchor="${anchor}">—</text>`;
/** A rounded vessel with a water level inside (ref names: vessel ref, water ref). */
export const tank = (x, y, w, hh, rx, waterRef, pad = 3) => `<rect class="m-ves" x="${x}" y="${y}" width="${w}" height="${hh}" rx="${rx}"/>${waterRef ? `<rect class="m-wat" data-r="${waterRef}" data-lvl x="${x + pad}" y="${y + Math.min(rx, hh / 3)}" width="${w - 2 * pad}" height="${hh - 2 * Math.min(rx, hh / 3)}" rx="2"/>` : ''}`;
export const sci = (x) => { if (!(x > 0)) return '0'; let e = Math.floor(Math.log10(x)), mant = x / 10 ** e; if (mant >= 9.95) { mant /= 10; e += 1; } return `${mant.toFixed(1)}E${e}`; };
export const pct = (f) => { const p = 100 * f; return p >= 0.01 ? `${p.toFixed(p < 10 ? 2 : 1)}%` : `${sci(Math.max(p, 1e-12))}%`; };
