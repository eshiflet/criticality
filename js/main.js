// Screens: title, the Archive (campaign), briefing, the mission itself, debrief, sandbox.

import { h } from './ui/widgets.js';
import * as audio from './ui/audio.js';
import { Runner, grade } from './game/runner.js';
import { MISSIONS } from './missions/index.js';

const app = document.getElementById('app');
const SAVE = 'criticality-save-v1';
const RANKS = ['Trainee', 'Operator', 'Reactor Operator', 'Senior Reactor Operator', 'Shift Supervisor', 'Shift Manager', 'Instructor'];

function load() { try { return JSON.parse(localStorage.getItem(SAVE)) ?? { done: {} }; } catch { return { done: {} }; } }
function save(s) { try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch { /* private mode: progress lasts this visit */ } }
let state = load();
const passed = (id) => ['S', 'A', 'B', 'C'].includes(state.done[id]?.grade);
const unlocked = (i) => i === 0 || passed(MISSIONS[i - 1].id) || state.unlockAll;
const rank = () => RANKS[MISSIONS.filter((m) => passed(m.id)).length] ?? RANKS.at(-1);

function title() {
  document.body.className = 'screen-title';
  app.replaceChildren(h('div', { class: 'title' },
    h('div', { class: 'title-mark' }, h('span', { class: 'atom' }, '⚛'), h('h1', {}, 'CRITICALITY'), h('p', { class: 'sub' }, 'Six control rooms. Six nights that mattered.')),
    h('p', { class: 'title-blurb' }, 'From a squash court in Chicago to a submarine under the ice, from a cable fire in Alabama to the night in Pripyat: sit at the controls of six real reactors, rebuilt in the Archive, and live through what happened in them.'),
    h('div', { class: 'title-btns' },
      h('button', { class: 'big-btn', onclick: () => { audio.beep(660, 0.1); campaign(); } }, Object.keys(state.done).length ? 'Continue' : 'Begin'),
      h('label', { class: 'toggle-line' }, h('input', { type: 'checkbox', checked: audio.sound.enabled, onchange: (e) => { audio.sound.enabled = e.target.checked; } }), ' Sound')),
    h('p', { class: 'fine' }, 'The plants are modelled from public sources and simplified to run in a browser; the events follow the historical record. The submarine and its patrol are fictional.')));
}

function campaign() {
  document.body.className = 'screen-campaign';
  const cards = MISSIONS.map((m, i) => {
    const ok = unlocked(i), d = state.done[m.id];
    return h('div', { class: `card${ok ? '' : ' locked'}`, style: { '--accent': m.accent } },
      h('div', { class: 'card-num' }, String(i + 1).padStart(2, '0')),
      h('div', { class: 'card-date' }, m.date),
      h('h3', {}, m.title),
      h('div', { class: 'card-place' }, m.place),
      h('p', {}, m.teaser),
      h('div', { class: 'card-foot' },
        d ? h('span', { class: `grade g-${d.grade}` }, d.grade) : null,
        ok ? h('button', { class: 'big-btn small', onclick: () => briefing(m) }, d ? 'Replay' : 'Brief me') : h('span', { class: 'muted' }, '🔒 Pass the one before'),
        passed(m.id) ? h('button', { class: 'chip', onclick: () => play(m, true) }, 'Sandbox') : null));
  });
  app.replaceChildren(h('div', { class: 'campaign' },
    h('header', { class: 'camp-head' }, h('div', {}, h('h1', {}, 'The Archive'), h('p', { class: 'muted' }, 'Historical Operations Simulator · operator file')),
      h('div', { class: 'rank' }, h('span', { class: 'muted' }, 'Rank'), h('b', {}, rank())),
      h('button', { class: 'chip', onclick: title }, 'Title')),
    h('div', { class: 'okafor-note' }, h('span', { class: 'who', style: { background: '#7fd1b9' } }, 'RO'), h('p', { html: campaignNote() })),
    h('div', { class: 'cards' }, cards),
    h('p', { class: 'fine' }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); if (confirm('Unlock every mission? (For testing or if you just want to look around.)')) { state.unlockAll = true; save(state); campaign(); } } }, 'Unlock all'), ' · ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); if (confirm('Erase your operator file?')) { state = { done: {} }; save(state); campaign(); } } }, 'Reset progress'))));
}

function campaignNote() {
  const n = MISSIONS.filter((m) => passed(m.id)).length;
  return [
    "Welcome to the Archive. Every room in this building is a control room that once existed, rebuilt switch for switch. We'll start where it all started: a squash court in Chicago, 1942. Half a watt. Don't laugh.",
    "Good. Fermi would have nodded, which from him was a parade. Next: a submarine. Small reactor, fast plant, and a captain who wants his speed <i>now</i>.",
    "Next is Browns Ferry, 1975. Biggest reactor in the world when it was built. Then a man with a candle went looking for an air leak.",
    "Three Mile Island. I want you to remember one thing going in: the instruments tell the truth, but not always the truth you think you're reading.",
    "Chernobyl. I'll be honest: I almost didn't build this room. Sit down. Read the briefing twice.",
    "Last one. Sequoyah, a plant that runs today. This is your certification. Everything you've learned, on one board.",
    'You\'ve sat in every chair in the building. Some days I think the Archive exists for the ones who did it for real. Thank you for taking it seriously.',
  ][n];
}

function briefing(m) {
  document.body.className = 'screen-brief';
  app.replaceChildren(h('div', { class: 'brief', style: { '--accent': m.accent } },
    h('div', { class: 'brief-head' }, h('div', { class: 'card-date' }, m.date), h('h1', {}, m.title), h('div', { class: 'card-place' }, m.place)),
    h('div', { class: 'brief-body' },
      ...m.briefing.map((b) => h('div', { class: 'brief-p' }, b.who ? h('span', { class: 'who', style: { background: (b.who === 'okafor' ? '#7fd1b9' : b.color) ?? '#888' } }, b.who === 'okafor' ? 'RO' : b.tag ?? '•') : null, h('div', { html: b.text }))),
      h('h3', {}, 'Objectives'),
      h('ol', { class: 'obj-list' }, m.objectives.filter((o) => !o.hidden).map((o) => h('li', { html: o.text + (o.optional ? ' <span class="muted">(bonus)</span>' : '') }))),
      m.controlsHelp ? h('details', { class: 'help', open: true }, h('summary', {}, 'At the board'), h('div', { html: m.controlsHelp })) : null),
    h('div', { class: 'brief-btns' }, h('button', { class: 'chip', onclick: campaign }, 'Back'), h('button', { class: 'big-btn', onclick: () => play(m) }, 'Take the seat'))));
}

function play(m, sandbox = false) {
  document.body.className = 'screen-mission';
  window.__run = new Runner(m, { root: app, sandbox, onEnd: (r) => (r && !sandbox ? debrief(m, r) : campaign()) }); // __run: for debugging from the console
}

function debrief(m, r) {
  document.body.className = 'screen-brief';
  const g = r.grade ?? grade(r.score ?? 0);
  const prev = state.done[m.id];
  const order = ['F', 'D', 'C', 'B', 'A', 'S'];
  if (!prev || order.indexOf(g) > order.indexOf(prev.grade)) { state.done[m.id] = { grade: g, score: r.score }; save(state); }
  app.replaceChildren(h('div', { class: 'brief debrief', style: { '--accent': m.accent } },
    h('div', { class: 'brief-head' }, h('div', { class: 'card-date' }, 'Debrief'), h('h1', {}, r.headline ?? (r.failed ? 'Mission failed' : 'Mission complete')), h('div', { class: 'card-place' }, m.title)),
    h('div', { class: 'debrief-grade' }, h('span', { class: `grade big g-${g}` }, g), h('div', {}, h('div', { class: 'muted' }, 'Score'), h('b', {}, `${Math.round(r.score ?? 0)} / 100`))),
    r.failed ? h('p', { class: 'fail', html: r.failed }) : null,
    h('ul', { class: 'notes' }, (r.notes ?? []).map((n) => h('li', { html: n }))),
    h('h3', {}, 'What really happened'),
    h('div', { class: 'epilogue', html: m.epilogue }),
    h('div', { class: 'brief-btns' }, h('button', { class: 'chip', onclick: () => briefing(m) }, 'Try again'), h('button', { class: 'big-btn', onclick: campaign }, 'Back to the Archive'))));
}

title();
