// Control-room widgets. Each returns { el, set(...) } (meters) or wires its own input and calls
// back. Drawn in SVG/HTML and coloured by CSS variables, so each control room can have its own
// look: --face, --ink, --needle, --bezel, --plate, --plate-ink, --dig-bg, --dig-fg.

export const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
};
const svg = (markup, cls = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = markup; return d; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '—');

/** Round dial: 270° sweep (or `sweep`), linear or log scale, coloured zones, optional setpoint pointer. */
export function gauge({ label, unit = '', min = 0, max = 100, ticks, minor = 4, log = false, zones = [], size = 130, sweep = 270, digits = 0, readout = true, tickFmt }) {
  const r = 50, cx = 60, cy = 60, a0 = -sweep / 2;
  const frac = (v) => {
    if (log) { const l = Math.log10(clamp(v, min, max)); return (l - Math.log10(min)) / (Math.log10(max) - Math.log10(min)); }
    return (clamp(v, min, max) - min) / (max - min);
  };
  const ang = (v) => a0 + sweep * frac(v);
  const pt = (a, rr) => [cx + rr * Math.sin((a * Math.PI) / 180), cy - rr * Math.cos((a * Math.PI) / 180)];
  ticks ??= log ? (() => { const t = []; for (let e = Math.ceil(Math.log10(min)); e <= Math.log10(max) + 1e-9; e++) t.push(10 ** e); return t; })() : Array.from({ length: 6 }, (_, i) => min + ((max - min) * i) / 5);
  const arc = (v1, v2, rr) => { const [x1, y1] = pt(ang(v1), rr), [x2, y2] = pt(ang(v2), rr); const big = ang(v2) - ang(v1) > 180 ? 1 : 0; return `M${x1} ${y1} A${rr} ${rr} 0 ${big} 1 ${x2} ${y2}`; };
  let marks = '';
  zones.forEach((z) => { marks += `<path d="${arc(z.from, z.to, r - 4)}" stroke="${z.color}" stroke-width="5" fill="none" opacity="0.85"/>`; });
  ticks.forEach((t, i) => {
    const a = ang(t), [x1, y1] = pt(a, r), [x2, y2] = pt(a, r - 8), [tx, ty] = pt(a, r - 17);
    const txt = tickFmt ? tickFmt(t) : log ? (Math.log10(t) % 1 === 0 ? `10${sup(Math.log10(t))}` : t) : +t.toFixed(2);
    marks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="g-tick" stroke-width="1.6"/><text x="${tx}" y="${ty + 3}" class="g-num" text-anchor="middle">${txt}</text>`;
    if (!log && i < ticks.length - 1) for (let k = 1; k < minor; k++) { const v = t + ((ticks[i + 1] - t) * k) / minor, [a1, b1] = pt(ang(v), r), [a2, b2] = pt(ang(v), r - 4); marks += `<line x1="${a1}" y1="${b1}" x2="${a2}" y2="${b2}" class="g-tick" stroke-width="0.8"/>`; }
  });
  const el = svg(`<svg viewBox="0 0 120 ${readout ? 128 : 112}" width="${size}" height="${(size * (readout ? 128 : 112)) / 120}">
    <circle cx="60" cy="60" r="58" class="g-bezel"/><circle cx="60" cy="60" r="54" class="g-face"/>
    ${marks}
    <text x="60" y="${sweep > 200 ? 88 : 80}" class="g-unit" text-anchor="middle">${unit}</text>
    <g class="g-set" style="display:none"><path d="M60 8 L56 1 L64 1 Z" class="g-setp"/></g>
    <g class="g-needle"><path d="M60 64 L58.4 60 L60 13 L61.6 60 Z" class="g-ndl"/></g>
    <circle cx="60" cy="60" r="4.5" class="g-hub"/>
    ${readout ? `<text x="60" y="124" class="g-read" text-anchor="middle">—</text>` : ''}
  </svg><div class="w-label">${label}</div>`, 'w gauge');
  const needle = el.querySelector('.g-needle'), read = el.querySelector('.g-read'), setG = el.querySelector('.g-set');
  let shown = null;
  return {
    el,
    set(v, text) {
      const a = Number.isFinite(v) ? ang(v) : a0;
      shown = shown === null ? a : shown + (a - shown) * 0.35; // needle damping
      needle.setAttribute('transform', `rotate(${shown} 60 60)`);
      if (read) read.textContent = text ?? (Number.isFinite(v) ? (log ? v.toExponential(1) : fmt(v, digits)) : '—');
    },
    setpoint(v) { setG.style.display = v == null ? 'none' : ''; if (v != null) setG.setAttribute('transform', `rotate(${ang(v)} 60 60)`); },
  };
}
const sup = (n) => String(n).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'['0123456789'.indexOf(c)] ?? (c === '-' ? '⁻' : c)).join('');

/** Vertical edgewise meter with a scale, a pointer and an optional amber setpoint. */
export function edgewise({ label, unit = '', min = 0, max = 100, ticks, digits = 0, zones = [] }) {
  ticks ??= Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  const y = (v) => 102 - (96 * (clamp(v, min, max) - min)) / (max - min);
  const z = zones.map((q) => `<rect x="20" y="${y(q.to)}" width="4" height="${y(q.from) - y(q.to)}" fill="${q.color}"/>`).join('');
  const t = ticks.map((v) => `<line x1="20" x2="28" y1="${y(v)}" y2="${y(v)}" class="g-tick"/><text x="31" y="${y(v) + 3}" class="g-num">${+v.toFixed(2)}</text>`).join('');
  const el = svg(`<svg viewBox="0 0 60 108" width="54" height="98"><rect x="1" y="1" width="58" height="106" rx="3" class="g-bezel"/><rect x="5" y="4" width="50" height="100" rx="2" class="g-face"/>${z}${t}
    <path class="e-set" d="M11 0 l7 -4 v8 z" style="display:none"/><path class="e-ptr g-ndl" d="M7 0 l12 -2.5 v5 z"/></svg>
    <div class="w-dig">—</div><div class="w-label">${label}${unit ? ` <span class="w-unit">${unit}</span>` : ''}</div>`, 'w edgewise');
  const ptr = el.querySelector('.e-ptr'), set = el.querySelector('.e-set'), dig = el.querySelector('.w-dig');
  return {
    el,
    set(v, text) { ptr.setAttribute('transform', `translate(0 ${Number.isFinite(v) ? y(v) : y(min)})`); dig.textContent = text ?? fmt(v, digits); },
    setpoint(v) { set.style.display = v == null ? 'none' : ''; if (v != null) set.setAttribute('transform', `translate(0 ${y(v)})`); },
  };
}

/** Digital readout: style 'led' (red segments), 'nixie' (orange glow), 'lcd', 'vfd' (cyan). */
export function digital({ label, style = 'led', width = 6, unit = '' }) {
  const el = h('div', { class: `w digital d-${style}` }, h('div', { class: 'd-win' }, h('span', { class: 'd-val' }, '—'), unit ? h('span', { class: 'd-unit' }, unit) : null), label ? h('div', { class: 'w-label' }, label) : null);
  const v = el.querySelector('.d-val');
  v.style.minWidth = `${width * 0.62}em`;
  return { el, set(text, warn) { v.textContent = text; el.classList.toggle('warn', !!warn); } };
}

/** Indicating lamp. colors: red, green, amber, white, blue. */
export function lamp({ label, color = 'red', small = false }) {
  const el = h('div', { class: `w lamp-w${small ? ' small' : ''}` }, h('div', { class: `lamp ${color}` }), label ? h('div', { class: 'w-label' }, label) : null);
  const l = el.querySelector('.lamp');
  return { el, set(on, flash) { l.classList.toggle('on', !!on); l.classList.toggle('flash', !!flash); } };
}

/**
 * Annunciator window grid. defs: [key, text, kind('alarm'|'trip'|'status')]. Alarms flash until
 * acknowledged (and sound the horn via onHorn), stay lit while active, and flash slowly when they
 * clear until reset.
 */
export function annunciators(defs, { cols = 6, onHorn } = {}) {
  const state = new Map(defs.map(([k]) => [k, 'off'])); // off | flash | lit | clear
  const tiles = new Map();
  const grid = h('div', { class: 'ann-grid', style: { '--cols': cols } });
  defs.forEach(([k, text, kind = 'alarm']) => { const t = h('div', { class: `ann ${kind}` }, text); tiles.set(k, t); grid.append(t); });
  const ack = h('button', { class: 'pb small', onclick: () => { state.forEach((s, k) => { if (s === 'flash') state.set(k, 'lit'); }); paint(); onHorn?.(false); } }, 'ACK');
  const reset = h('button', { class: 'pb small', onclick: () => { state.forEach((s, k) => { if (s === 'clear') state.set(k, 'off'); }); paint(); } }, 'RESET');
  const el = h('div', { class: 'w annunciators' }, grid, h('div', { class: 'ann-btns' }, ack, reset));
  function paint() { state.forEach((s, k) => { const t = tiles.get(k); t.className = `ann ${t.className.split(' ')[1]} ${s}`; }); }
  return {
    el,
    update(active) {
      let horn = false;
      state.forEach((s, k) => {
        const on = active.has(k);
        const kind = tiles.get(k).className.split(' ')[1];
        if (kind === 'status') { state.set(k, on ? 'lit' : 'off'); return; }
        if (on && (s === 'off' || s === 'clear')) { state.set(k, 'flash'); horn = true; }
        else if (!on && (s === 'lit' || s === 'flash')) state.set(k, s === 'flash' ? 'off' : 'clear');
      });
      paint();
      if (horn) onHorn?.(true);
      return [...state.values()].some((s) => s === 'flash');
    },
    reset() { state.forEach((_, k) => state.set(k, 'off')); paint(); },
  };
}

/** Rotary selector switch with labelled positions. */
export function selector({ label, positions, value, onChange, style = 'pistol' }) {
  let i = Math.max(0, positions.findIndex((p) => p[0] === value));
  const n = positions.length, span = n > 3 ? 140 : n > 2 ? 90 : 60, W = n > 3 ? 120 : 80, cx = W / 2, R = n > 3 ? 44 : 30;
  const ang = (k) => -span / 2 + (span * k) / Math.max(1, n - 1);
  const labels = positions.map(([, t], k) => { const a = (ang(k) * Math.PI) / 180; return `<text x="${cx + R * Math.sin(a)}" y="${(n > 3 ? 48 : 36) - (n > 3 ? 36 : 26) * Math.cos(a)}" class="s-pos" text-anchor="middle">${t}</text>`; }).join('');
  const handle = style === 'pistol'
    ? `<path d="M${cx} 44 L${cx - 4} 22 Q${cx} 16 ${cx + 4} 22 Z" class="s-grip"/><circle cx="${cx}" cy="44" r="9" class="s-body"/>`
    : `<rect x="${cx - 4}" y="22" width="8" height="30" rx="3" class="s-grip"/><circle cx="${cx}" cy="44" r="8" class="s-body"/>`;
  const el = svg(`<svg viewBox="0 0 ${W} 60" width="${W}" height="60" tabindex="0" role="slider" aria-label="${label}">${labels}<g class="s-h">${handle}</g></svg><div class="w-label">${label}</div>`, 'w selector');
  const g = el.querySelector('.s-h');
  const paint = () => g.setAttribute('transform', `rotate(${ang(i)} ${cx} 44)`);
  const go = (k) => { k = clamp(k, 0, n - 1); if (k === i) return; i = k; paint(); onChange?.(positions[i][0]); };
  el.querySelector('svg').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); go(e.clientX - r.left < r.width / 2 ? i - 1 : i + 1); });
  el.querySelector('svg').addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') go(i - 1); if (e.key === 'ArrowRight') go(i + 1); });
  paint();
  return { el, set(v) { const k = positions.findIndex((p) => p[0] === v); if (k >= 0 && k !== i) { i = k; paint(); } }, get value() { return positions[i][0]; } };
}

/** Pushbutton, optionally lit and/or under a flip-up guard (click once to lift, again to press). */
export function button({ label, color = 'gray', guarded = false, big = false, onPress, title }) {
  const b = h('button', { class: `pb ${color}${big ? ' big' : ''}`, title }, label);
  const wrap = h('div', { class: `w pbw${guarded ? ' guarded' : ''}` }, b);
  let open = !guarded;
  if (guarded) {
    const guard = h('div', { class: 'guard', title: 'Lift the guard' }, 'LIFT');
    guard.addEventListener('click', () => { open = !open; wrap.classList.toggle('open', open); });
    wrap.append(guard);
  }
  b.addEventListener('click', () => { if (open) onPress?.(); });
  return { el: wrap, set(lit) { b.classList.toggle('lit', !!lit); }, disable(d) { b.disabled = !!d; } };
}

/** Spring-return lever: hold up (+1) or down (−1); springs back to 0. Arrow keys work when focused. */
export function lever({ label, up = 'OUT', down = 'IN', onChange }) {
  const el = svg(`<svg viewBox="0 0 60 110" width="56" height="102" tabindex="0" role="slider" aria-label="${label}">
    <rect x="22" y="8" width="16" height="94" rx="8" class="lv-slot"/><text x="30" y="7" class="s-pos" text-anchor="middle">${up}</text><text x="30" y="109" class="s-pos" text-anchor="middle">${down}</text>
    <g class="lv-h"><rect x="26" y="40" width="8" height="30" class="lv-shaft"/><rect x="12" y="48" width="36" height="14" rx="6" class="s-grip"/></g></svg><div class="w-label">${label}</div>`, 'w lever');
  const g = el.querySelector('.lv-h'), s = el.querySelector('svg');
  let v = 0;
  const setV = (n) => { if (n === v) return; v = n; g.setAttribute('transform', `translate(0 ${-v * 26})`); onChange?.(v); };
  const fromY = (e) => { const r = s.getBoundingClientRect(); return e.clientY - r.top < r.height / 2 ? 1 : -1; };
  s.addEventListener('pointerdown', (e) => { s.setPointerCapture(e.pointerId); setV(fromY(e)); });
  s.addEventListener('pointerup', () => setV(0));
  s.addEventListener('pointercancel', () => setV(0));
  s.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') { setV(1); e.preventDefault(); } if (e.key === 'ArrowDown') { setV(-1); e.preventDefault(); } });
  s.addEventListener('keyup', () => setV(0));
  return { el, get value() { return v; } };
}

/** Setpoint knob: drag up/down, scroll, or click the − / + halves. */
export function knob({ label, min, max, step = 1, value, fmt: f = (x) => x, onChange }) {
  let v = value;
  const el = svg(`<svg viewBox="0 0 70 70" width="66" height="66" tabindex="0" role="slider" aria-label="${label}"><circle cx="35" cy="35" r="30" class="k-skirt"/>
    ${Array.from({ length: 11 }, (_, i) => { const a = ((-135 + 27 * i) * Math.PI) / 180; return `<line x1="${35 + 26 * Math.sin(a)}" y1="${35 - 26 * Math.cos(a)}" x2="${35 + 30 * Math.sin(a)}" y2="${35 - 30 * Math.cos(a)}" class="g-tick"/>`; }).join('')}
    <g class="k-cap"><circle cx="35" cy="35" r="20" class="s-body"/><rect x="33" y="16" width="4" height="12" rx="2" class="k-mark"/></g></svg><div class="w-dig">${f(v)}</div><div class="w-label">${label}</div>`, 'w knob');
  const cap = el.querySelector('.k-cap'), dig = el.querySelector('.w-dig'), s = el.querySelector('svg');
  const paint = () => { cap.setAttribute('transform', `rotate(${-135 + (270 * (v - min)) / (max - min)} 35 35)`); dig.textContent = f(v); };
  const setV = (n, fire = true) => { n = clamp(Math.round(n / step) * step, min, max); if (n === v) return; v = n; paint(); if (fire) onChange?.(v); };
  let drag = null;
  s.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, v, moved: false }; s.setPointerCapture(e.pointerId); });
  s.addEventListener('pointermove', (e) => { if (!drag) return; const dy = drag.y - e.clientY; if (Math.abs(dy) > 3) drag.moved = true; if (drag.moved) setV(drag.v + (dy / 120) * (max - min)); });
  s.addEventListener('pointerup', (e) => { if (drag && !drag.moved) { const r = s.getBoundingClientRect(); setV(v + (e.clientX - r.left < r.width / 2 ? -step : step)); } drag = null; });
  s.addEventListener('wheel', (e) => { e.preventDefault(); setV(v + (e.deltaY < 0 ? step : -step)); }, { passive: false });
  s.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowRight') setV(v + step); if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') setV(v - step); });
  paint();
  return { el, set(n) { setV(n, false); }, get value() { return v; } };
}

/** Two-position toggle (J-handle / bat-handle) with lamps: e.g. STOP / START. */
export function toggle({ label, off = 'OFF', on = 'ON', value = false, onChange, lamps = true }) {
  let v = value;
  const el = h('div', { class: 'w toggle' },
    lamps ? h('div', { class: 'tg-lamps' }, h('div', { class: 'lamp green small' }), h('div', { class: 'lamp red small' })) : null,
    h('button', { class: 'tg-handle', 'aria-pressed': String(v), title: `${off} / ${on}` }, h('span', { class: 'tg-off' }, off), h('span', { class: 'tg-on' }, on)),
    h('div', { class: 'w-label' }, label));
  const b = el.querySelector('.tg-handle'), [gl, rl] = el.querySelectorAll('.lamp');
  const paint = () => { b.classList.toggle('on', v); b.setAttribute('aria-pressed', String(v)); if (gl) { gl.classList.toggle('on', !v); rl.classList.toggle('on', v); } };
  b.addEventListener('click', () => { v = !v; paint(); onChange?.(v); });
  paint();
  return { el, set(n, lampsOverride) { v = !!n; paint(); if (lampsOverride && gl) { gl.classList.toggle('on', lampsOverride === 'green'); rl.classList.toggle('on', lampsOverride === 'red'); } }, get value() { return v; } };
}

/** Strip-chart recorder: scrolling pens on chart paper over the last `window` seconds of sim time. */
export function stripChart({ label, pens, window = 600, height = 150, width = 300, log = false, min = 0, max = 100, paper = 'light' }) {
  const c = h('canvas', { width: width * 2, height: height * 2, style: { width: `${width}px`, height: `${height}px` } });
  const el = h('div', { class: `w strip p-${paper}` }, c, h('div', { class: 'strip-key' }, pens.map((p) => h('span', {}, h('i', { style: { background: p.color } }), p.name))), label ? h('div', { class: 'w-label' }, label) : null);
  const data = [];
  const ctx = c.getContext('2d');
  const yOf = (v, p) => {
    const lo = p.min ?? min, hi = p.max ?? max;
    const f = log || p.log ? (Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) : (v - lo) / (hi - lo);
    return c.height - 8 - clamp(f, -0.02, 1.02) * (c.height - 16);
  };
  return {
    el,
    push(t, vals) { data.push([t, vals]); while (data.length > 1 && data[0][0] < t - window * 1.2) data.shift(); },
    clear() { data.length = 0; },
    draw(t) {
      const W = c.width, H = c.height;
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = paper === 'light' ? 'rgba(160,40,40,0.18)' : 'rgba(120,200,160,0.15)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) { const y = 8 + ((H - 16) * i) / 10; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      const off = (t / (window / 12)) % 1;
      for (let i = 0; i <= 12; i++) { const x = W - ((i + off) * W) / 12; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      pens.forEach((p, k) => {
        ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.beginPath();
        let first = true;
        for (const [tt, v] of data) { if (tt < t - window) continue; const x = W - ((t - tt) / window) * W, y = yOf(v[k], p); if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
        ctx.stroke();
      });
    },
  };
}

/** Horizontal bar graph. */
export function bar({ label, min = 0, max = 100, unit = '', digits = 0, color }) {
  const fill = h('div', { class: 'bar-fill', style: color ? { background: color } : {} });
  const val = h('span', { class: 'bar-val' }, '—');
  const el = h('div', { class: 'w barw' }, h('div', { class: 'w-label' }, label), h('div', { class: 'bar' }, fill), val);
  return { el, set(v) { fill.style.width = `${clamp(((v - min) / (max - min)) * 100, 0, 100)}%`; val.textContent = `${fmt(v, digits)}${unit}`; } };
}

/** A labelled group of widgets (a panel section). */
export function section(title, ...kids) { return h('div', { class: 'sec' }, title ? h('div', { class: 'sec-title' }, title) : null, h('div', { class: 'sec-body' }, ...kids)); }
