// Runs one mission: owns the model, the panel, the clock and the script. The mission definition
// (js/missions/*.js) supplies the pieces; this wires them to the screen.

import { h } from '../ui/widgets.js';
import * as audio from '../ui/audio.js';

export const fmtClock = (sec) => {
  const s = ((Math.floor(sec) % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const PEOPLE = {
  okafor: { name: 'Dr. Ruth Okafor', role: 'Instructor', tag: 'RO', color: '#7fd1b9' },
  log: { name: 'Log', role: '', tag: '◆', color: '#9aa6b2' },
};

export class Runner {
  constructor(mission, { root, onEnd, sandbox = false }) {
    this.mission = mission;
    this.sandbox = sandbox;
    this.onEnd = onEnd;
    this.model = mission.makeModel({ sandbox });
    this.t = 0; // mission seconds
    this.speed = 1;
    this.paused = true;
    this.flags = {};
    this.done = new Set();
    this.failed = null;
    this.ended = false;
    this.script = (sandbox ? [] : mission.script ?? []).map((s) => ({ ...s, fired: false }));
    this.people = { ...PEOPLE, ...(mission.people ?? {}) };
    this.root = root;
    this.build();
    this.panel = mission.makePanel(this.panelEl, this.model, this);
    this.say('okafor', sandbox ? `Sandbox: ${mission.reactorName}. No script, no score. Break it if you like; that's what the Archive is for.` : mission.opening ?? 'Take your seat.');
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
    this.setPaused(false);
  }

  build() {
    const m = this.mission;
    this.clockEl = h('div', { class: 'hud-clock' }, '—');
    this.speedBtns = (m.speeds ?? [1, 2, 5, 10]).map((s) => h('button', { class: 'chip', onclick: () => this.setSpeed(s) }, `${s}×`));
    this.pauseBtn = h('button', { class: 'chip', onclick: () => this.setPaused(!this.paused) }, '❚❚');
    this.objList = h('ol', { class: 'obj-list' });
    this.logEl = h('div', { class: 'log', 'aria-live': 'polite' });
    this.choiceEl = h('div', { class: 'choice', hidden: true });
    this.panelEl = h('div', { class: `panel theme-${m.theme}` });
    const top = h('header', { class: 'hud' },
      h('div', { class: 'hud-title' }, h('b', {}, m.title), h('span', { class: 'muted' }, `${m.place} · ${m.date}`)),
      this.clockEl,
      h('div', { class: 'hud-speed' }, this.pauseBtn, ...this.speedBtns),
      m.controlsHelp ? h('button', { class: 'chip', title: 'How this board works (H)', onclick: () => this.help() }, '?') : null,
      h('button', { class: 'chip', onclick: () => this.quit() }, 'Leave'));
    this.onKey = (e) => {
      if (e.target.closest?.('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' && !e.target.closest?.('svg')) { e.preventDefault(); this.setPaused(!this.paused); }
      const n = +e.key, sp = m.speeds ?? [1, 2, 5, 10];
      if (n >= 1 && n <= sp.length) this.setSpeed(sp[n - 1]);
      if (e.key === 'h' || e.key === 'H') this.help();
    };
    window.addEventListener('keydown', this.onKey);
    const side = h('aside', { class: 'side' },
      this.sandbox ? null : h('section', { class: 'obj' }, h('h3', {}, 'Objectives'), this.objList),
      h('section', { class: 'comms' }, h('h3', {}, 'Control room'), this.logEl, this.choiceEl));
    this.root.replaceChildren(top, h('main', { class: 'mission' }, h('div', { class: 'panel-scroll' }, this.panelEl), side));
    this.renderObjectives();
    this.setSpeed(m.speeds?.[0] ?? 1);
  }

  setSpeed(s) {
    this.speed = s;
    this.speedBtns.forEach((b) => b.classList.toggle('on', b.textContent === `${s}×`));
  }
  setPaused(p) { this.paused = p; this.pauseBtn.textContent = p ? '▶' : '❚❚'; this.pauseBtn.classList.toggle('on', p); }
  /** Lower the speed to at most s (used by the script when something happens). */
  slow(s = 1) { if (this.speed > s) this.setSpeed(s); }

  help() { if (this.mission.controlsHelp) this.say('okafor', this.mission.controlsHelp + ' <span class="muted">Keys: space pauses, 1–' + (this.mission.speeds ?? [1, 2, 5, 10]).length + ' set the speed.</span>'); }

  /** Add a line to the control-room log. who: a key of people, or a { name, tag, color } object. */
  say(who, text, cls = '') {
    const p = typeof who === 'string' ? this.people[who] ?? { name: who, tag: who.slice(0, 2).toUpperCase(), color: '#aaa' } : who;
    const line = h('div', { class: `msg ${cls}` },
      h('span', { class: 'who', style: { background: p.color } }, p.tag),
      h('div', {}, h('div', { class: 'msg-head' }, h('b', {}, p.name), p.role ? h('span', { class: 'muted' }, ` · ${p.role}`) : null, h('span', { class: 'muted ts' }, ` ${fmtClock(this.clock)}`)), h('div', { class: 'msg-text', html: text })));
    this.logEl.append(line);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  /** Ask the player to choose; pauses the clock until they do. Returns a promise of the option id. */
  choose(prompt, options) {
    this.setPaused(true);
    return new Promise((resolve) => {
      this.choiceEl.replaceChildren(h('div', { class: 'choice-q', html: prompt }), ...options.map(([id, text]) => h('button', { class: 'choice-b', onclick: () => { this.choiceEl.hidden = true; this.setPaused(false); this.say('log', `You: ${text}`, 'you'); resolve(id); } }, text)));
      this.choiceEl.hidden = false;
      this.logEl.scrollTop = this.logEl.scrollHeight;
    });
  }

  get clock() { return (this.mission.clockStart ?? 0) + this.t; }

  renderObjectives() {
    if (this.sandbox) return;
    const objs = (this.mission.objectives ?? []).filter((o) => !o.hidden || this.done.has(o.id) || (o.showIf && o.showIf(this.model, this)));
    this.objList.replaceChildren(...objs.map((o) => h('li', { class: this.done.has(o.id) ? 'done' : o.failed?.(this.model, this) ? 'failed' : '' }, h('span', { html: o.text }), o.optional ? h('span', { class: 'muted' }, ' (bonus)') : null)));
  }

  frame(now) {
    if (this.ended) return;
    const dtReal = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      let left = dtReal * this.speed;
      while (left > 1e-9 && !this.ended) {
        const dt = Math.min(left, this.mission.maxStep ?? 0.5);
        this.model.step(dt);
        this.t += dt;
        left -= dt;
        this.tick(dt);
      }
    }
    this.clockEl.textContent = fmtClock(this.clock);
    this.panel.update(dtReal, this.paused);
    this.raf = requestAnimationFrame(this.frame);
  }

  tick(dt) {
    const m = this.model, mis = this.mission;
    mis.onTick?.(m, this, dt);
    for (const s of this.script) {
      if (s.fired) continue;
      const due = s.at !== undefined ? this.t >= s.at : s.when?.(m, this);
      if (due) { s.fired = true; s.do(m, this); }
    }
    let changed = false;
    for (const o of mis.objectives ?? []) if (!this.done.has(o.id) && o.check?.(m, this)) { this.done.add(o.id); changed = true; if (!o.quiet) this.say('log', `✓ ${o.text.replace(/<[^>]+>/g, '')}`, 'ok'); audio.beep(1200, 0.08, 0.08); }
    if (changed || Math.floor(this.t) % 5 === 0) this.renderObjectives();
    if (this.sandbox) return;
    const fail = mis.fail?.(m, this);
    if (fail) return this.finish({ failed: fail });
    if (mis.win?.(m, this)) this.finish({});
  }

  finish(result) {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    audio.horn(false);
    this.panel.destroy?.();
    const r = { ...result, ...(this.mission.score?.(this.model, this, result) ?? {}) };
    this.onEnd?.(r, this);
  }

  quit() {
    if (this.sandbox || confirm('Leave this mission? Progress in it will be lost.')) { this.ended = true; cancelAnimationFrame(this.raf); window.removeEventListener('keydown', this.onKey); audio.horn(false); this.panel.destroy?.(); this.onEnd?.(null, this); }
  }
}

/** Grade from a 0–100 score. */
export function grade(score) { return score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F'; }
