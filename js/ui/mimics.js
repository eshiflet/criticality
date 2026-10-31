// One plant mimic per control room: a schematic of that reactor's own architecture, live.
// Each returns { el, update(paused) } and is placed at the top of its panel.

import { mimic, pump, valve, lbl, val, tank, pct } from './mimic.js';
import { psat, PSIA } from '../engine/physics.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rods = (xs, y1, len, cls = 'm-rod') => xs.map((x) => `<line class="${cls}" x1="${x}" x2="${x}" y1="${y1}" y2="${y1 + len}"/>`).join('');
const DEFS = '<defs><filter id="m-bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';

// ───────────────────────── Chicago Pile-1 ─────────────────────────
// A section through the pile as Fermi's group drew it: graphite layers, the lattice of uranium
// lumps, the three cadmium rods run in sideways, the bucket platform above, and the instruments.
export function cp1Mimic(m) {
  const layers = Array.from({ length: 27 }, (_, i) => `<line x1="90" x2="430" y1="${42 + i * 6.4}" y2="${42 + i * 6.4}" stroke="currentColor" stroke-opacity="0.18"/>`).join('');
  const lumps = [];
  for (let y = 70; y <= 186; y += 13) for (let x = 140; x <= 380; x += 16) lumps.push(`<rect x="${x}" y="${y}" width="5" height="5" fill="currentColor" fill-opacity="0.45"/>`);
  const M = mimic({
    title: 'CP-1 · section through the pile, looking north',
    markup: `${DEFS}<clipPath id="cp1-clip"><ellipse cx="260" cy="120" rx="170" ry="88"/></clipPath><clipPath id="cp1-slots"><rect x="34" y="0" width="460" height="220"/></clipPath>
      <rect x="70" y="206" width="380" height="11" class="m-box"/>${lbl(260, 215, 'TIMBER FRAME · SQUASH COURT FLOOR', 'middle', 'm-lbl sm')}
      <ellipse cx="260" cy="120" rx="170" ry="88" class="m-ves" style="color:var(--m-ink)"/>
      <g clip-path="url(#cp1-clip)" style="color:var(--m-ink)">${layers}<ellipse data-r="glow" cx="260" cy="124" rx="125" ry="62" class="m-core" opacity="0.2"/>${lumps.join('')}
        <rect data-r="cad" x="80" y="30" width="360" height="200" fill="#9ad0ff" opacity="0"/></g>
      ${lbl(260, 58, '57 LAYERS OF GRAPHITE · 40 t URANIUM', 'middle', 'm-lbl sm')}
      <g clip-path="url(#cp1-slots)">
        <g data-r="ctl"><rect x="150" y="117" width="300" height="7" class="m-box"/></g>
        <g data-r="saf"><rect x="70" y="92" width="300" height="7" class="m-box"/></g>
        <g data-r="zip"><rect x="150" y="150" width="300" height="7" class="m-box"/></g></g>
      ${lbl(500, 112, 'CONTROL ROD (hand)', 'start')}${val('vCtl', 500, 132)}
      ${lbl(38, 84, 'AUTO SAFETY ROD', 'start')}${val('vSaf', 38, 112)}
      <path d="M494 153.5 H598 V30" class="m-p thin m-gray" data-r="rope"/>${lbl(500, 170, 'ZIP ROD', 'start')}${lbl(500, 180, 'rope to the balcony', 'start', 'm-lbl sm')}
      <text data-r="axe" class="m-lbl" x="540" y="58">🪓 axe</text>
      <rect x="150" y="14" width="220" height="10" class="m-box"/>${lbl(260, 10, 'LIQUID-CONTROL PLATFORM · cadmium-nitrate buckets', 'middle', 'm-lbl sm')}
      <path data-r="pour" d="M200 24 V40 M260 24 V36 M320 24 V40" stroke="#9ad0ff" stroke-width="3" stroke-dasharray="3 3" opacity="0"/>
      <circle cx="226" cy="138" r="5" class="m-box"/><circle cx="300" cy="104" r="5" class="m-box"/>
      <path d="M226 138 Q240 196 330 196 H660 V190" class="m-p thin m-el" data-r="wireC"/>
      <path d="M300 104 Q330 72 420 72 H604 V96 H610" class="m-p thin m-el" data-r="wireI"/>
      <rect x="610" y="76" width="100" height="40" rx="4" class="m-box"/>${lbl(660, 90, 'ION CHAMBER', 'middle')}${lbl(660, 101, 'pen recorder', 'middle', 'm-lbl sm')}${val('vW', 660, 112, 'middle')}
      <rect x="610" y="150" width="100" height="40" rx="4" class="m-box"/>${lbl(660, 164, 'BF₃ COUNTER', 'middle')}${lbl(660, 175, 'scaler · clicks', 'middle', 'm-lbl sm')}${val('vCps', 660, 186, 'middle')}
      ${lbl(660, 28, 'BALCONY', 'middle')}${val('vDose', 660, 42, 'middle')}${val('vState', 710, 214, 'end')}`,
  });
  const S = m.spec;
  return {
    el: M.el,
    update(paused) {
      M.paused(paused);
      const r = m.rod;
      M.move('ctl', 230 * r.control); // withdrawn east, out of the pile into its slot
      M.move('saf', -230 * r.safety); // withdrawn west
      M.move('zip', 230 * r.zip);
      M.glow('glow', m.P / 1000);
      M.r.cad.setAttribute('opacity', (0.45 * m.cad).toFixed(2));
      M.r.pour.setAttribute('opacity', m.ctl.cadmium && m.cad < 1 ? 1 : 0);
      M.cls('rope', 'm-hot', m.ctl.zipOut);
      M.show('axe', m.ctl.zipOut);
      M.text('vCtl', `${m.controlFt.toFixed(1)} ft out`);
      M.text('vSaf', m.safetyLatched ? `${Math.round(100 * r.safety)}% up` : 'DROPPED');
      M.text('vW', `${m.P < 0.01 ? m.P.toExponential(1) : m.P.toFixed(m.P < 10 ? 2 : 0)} W`);
      M.text('vCps', `${Math.round(m.cps)} /s`);
      M.text('vDose', `${m.doseRate.toFixed(m.doseRate < 10 ? 2 : 0)} mrem/h`);
      M.text('vState', m.rho() > 0 ? 'SUPERCRITICAL' : m.rho() > -0.0003 ? 'NEAR CRITICAL' : 'SUBCRITICAL');
      M.flow('wireC', Math.min(1, m.cps / 2000));
      M.flow('wireI', Math.min(1, m.P / S.limitW * 20));
    },
  };
}

// ───────────────────────── Naval PWR (submarine) ─────────────────────────
// Reactor compartment forward, engine room aft: the main engines drive the shaft through the
// reduction gear to the screw; the SSTGs make electricity; the EPM can turn the shaft on the battery.
export function subMimic(m) {
  const M = mimic({
    title: 'USS Nightjar · propulsion plant',
    h: 210,
    markup: `${DEFS}<path class="m-shell" d="M14 105 Q16 44 120 38 H590 Q672 46 690 105 Q672 164 590 172 H120 Q16 166 14 105 Z"/>
      <path class="m-cont" d="M150 42 V168 M300 40 V170"/>${lbl(225, 56, 'REACTOR COMPARTMENT', 'middle', 'm-lbl sm')}${lbl(450, 56, 'ENGINE ROOM', 'middle', 'm-lbl sm')}${lbl(80, 108, 'FORWARD', 'middle', 'm-lbl sm')}
      <path class="m-p m-hot" data-r="hot" d="M196 92 H226 Q236 92 238 104 L242 116"/>
      <path class="m-p m-cold" data-r="cold" d="M266 146 V156 H230 M214 156 H196 V146"/>
      ${pump('rcp', 222, 156, 7)}
      ${tank(168, 70, 28, 88, 12)}<rect class="m-core" data-r="core" x="174" y="112" width="16" height="34" rx="2"/><g data-r="rods">${rods([177, 182, 187], 78, 34)}</g>
      ${tank(206, 66, 14, 34, 6, 'pzrW', 2)}
      ${tank(240, 70, 28, 84, 12, 'sgW')}
      <path class="m-p m-stm" data-r="steam" d="M254 70 V60 H360"/>
      <path class="m-p m-stm thin" data-r="sstgS" d="M330 60 V124 H352"/>
      <polygon class="m-turb" data-r="turb" points="360,64 420,58 420,104 360,96"/>${lbl(390, 84, 'MAIN ENGINES', 'middle', 'm-lbl sm')}
      <rect class="m-box" data-r="sstg" x="352" y="114" width="54" height="22" rx="3"/>${lbl(379, 128, 'SSTG', 'middle', 'm-lbl sm')}
      <rect class="m-box" x="428" y="70" width="34" height="40" rx="3"/>${lbl(445, 93, 'GEAR', 'middle', 'm-lbl sm')}
      <line class="m-shaft" x1="420" x2="428" y1="80" y2="80"/>
      <path class="m-p m-gray" data-r="shaft" d="M462 90 H676"/>
      <rect class="m-box" data-r="epm" x="520" y="80" width="40" height="20" rx="3"/>${lbl(540, 94, 'EPM', 'middle', 'm-lbl sm')}
      <g data-r="screw" transform="translate(694 105)"><circle r="2" fill="var(--m-ink)"/><g class="m-blades"><ellipse rx="3.5" ry="13" fill="var(--m-fill)" stroke="var(--m-ink)" stroke-width="1.2"/><ellipse rx="13" ry="3.5" fill="var(--m-fill)" stroke="var(--m-ink)" stroke-width="1.2"/></g></g>
      <path class="m-p thin m-gray" d="M676 90 Q690 92 694 105"/>
      <rect class="m-box" x="360" y="144" width="62" height="20" rx="3"/>${lbl(391, 158, 'CONDENSER', 'middle', 'm-lbl sm')}
      <path class="m-p thin m-stm" d="M390 104 V144"/>
      <path class="m-p thin m-sea" data-r="sea" d="M434 170 V154 H422 M360 154 H340 V170"/>${lbl(436, 188, 'SEAWATER', 'start', 'm-lbl sm')}
      <path class="m-p m-fw" data-r="feed" d="M374 164 V168 H286 V140 H268"/>
      <path class="m-p thin m-el" data-r="bus" d="M406 125 H600 V140"/><path class="m-p thin m-el" data-r="epmBus" d="M540 125 V100"/>
      <rect class="m-box" x="580" y="140" width="50" height="22" rx="3"/><rect class="m-wat" data-r="bat" data-lvl x="583" y="143" width="44" height="16" style="fill:var(--m-el)"/>${lbl(605, 178, 'BATTERY', 'middle', 'm-lbl sm')}
      ${val('vPwr', 150, 194)}${val('vTavg', 240, 112, 'end')}${val('vStm', 306, 54)}
      ${val('vRpm', 590, 76, 'middle')}${val('vKts', 590, 196, 'middle', true)}${val('vBat', 640, 156)}
      ${val('vPump', 268, 186)}${val('vState', 20, 200)}`,
  });
  return {
    el: M.el,
    update(paused) {
      M.paused(paused);
      const c = m.ctl;
      M.r.rods.querySelectorAll('line').forEach((l) => l.setAttribute('y2', (78 + 34 * (1 - m.rod) + 0.5).toFixed(1)));
      M.glow('core', m.frac);
      M.flow('hot', m.flow); M.flow('cold', m.flow);
      M.spin('rcp', c.pumpsFast ? 1 : 0.45);
      M.heat('hot', m.Thot, 470, 540);
      M.level('pzrW', 0.55);
      M.level('sgW', clamp(0.55 - 0.2 * (m.q.steam - m.q.sg), 0.1, 0.9));
      M.flow('steam', clamp(m.q.steam * 1.2, 0, 1));
      M.flow('sstgS', c.sstg && !m.sstgLost ? 0.4 : 0);
      M.cls('turb', 'on', c.ahead + c.astern > 0.01);
      M.cls('sstg', 'on', c.sstg && !m.sstgLost);
      M.cls('epm', 'on', c.epm && m.battery > 0);
      M.flow('shaft', m.rpm);
      M.spin('screw', m.rpm, Math.abs(m.rpm) > 0.02);
      M.flow('feed', clamp(m.q.sg * 1.2, 0, 1));
      M.flow('sea', 0.6);
      M.flow('bus', c.sstg && !m.sstgLost ? 0.5 : -0.5);
      M.flow('epmBus', c.epm && m.battery > 0 ? 0.6 : 0);
      M.level('bat', m.battery / 100);
      M.text('vPwr', `${pct(m.frac)} power`);
      M.text('vTavg', `${m.Tavg.toFixed(0)}°F`);
      M.text('vStm', `${m.steamPsig.toFixed(0)} psig`);
      M.text('vRpm', `shaft ${Math.round(100 * Math.abs(m.rpm))}% ${m.rpm < -0.01 ? 'ASTERN' : ''}`);
      M.text('vKts', `${Math.abs(m.speed).toFixed(1)} kt`);
      M.text('vBat', `${m.battery.toFixed(0)}%`);
      M.text('vPump', c.pumpsFast ? 'RCPs FAST' : 'RCPs SLOW');
      M.text('vState', m.scrammed ? 'REACTOR SCRAMMED' : `BELL: ${m.bellName}`);
    },
  };
}

// ───────────────────────── Browns Ferry (GE BWR/4, Mark I) ─────────────────────────
// The core boils water in the vessel; steam goes straight out through the MSIVs to the turbine.
// The Mark I "light bulb" drywell sits on a torus of water that the relief valves blow down into.
export function bwrMimic(m) {
  const ecc = [['hpci', 'HPCI'], ['rcic', 'RCIC'], ['csA', 'CS A'], ['csB', 'CS B'], ['lpciA', 'LPCI A'], ['lpciB', 'LPCI B'], ['cbp', 'COND BSTR'], ['crd', 'CRD']];
  const M = mimic({
    title: 'Browns Ferry 1 · nuclear steam supply (GE BWR/4, Mark I containment)',
    markup: `${DEFS}<path class="m-cont" d="M60 168 V104 Q30 92 30 60 Q30 8 120 8 Q210 8 210 60 Q210 92 180 104 V168"/>${lbl(120, 22, 'DRYWELL', 'middle', 'm-lbl sm')}
      <ellipse class="m-ves" cx="120" cy="194" rx="108" ry="20"/><rect class="m-wat" data-r="pool" data-lvl x="16" y="184" width="208" height="26" rx="10" opacity="0.8"/>${lbl(120, 216, 'TORUS · SUPPRESSION POOL', 'middle', 'm-lbl sm')}
      <path class="m-cont" d="M70 168 V178 M170 168 V178"/>
      ${tank(98, 24, 44, 148, 18, 'lvl', 4)}
      <rect class="m-core" data-r="core" x="106" y="104" width="28" height="50" rx="2"/><rect data-r="dmg" x="106" y="104" width="28" height="50" fill="#3a1a10" opacity="0"/>
      <g data-r="rods">${rods([111, 117, 123, 129], 106, 48)}</g>
      <path class="m-p thin m-cold" data-r="rcL" d="M98 140 H76 V112 H98"/>${pump('rpA', 76, 126, 7)}
      <path class="m-p thin m-cold" data-r="rcR" d="M142 140 H164 V112 H142"/>${pump('rpB', 164, 126, 7)}
      <path class="m-p m-stm" data-r="steam" d="M142 36 H330"/>
      ${valve('msivI', 160, 36)}${valve('msivO', 228, 36)}${lbl(194, 30, 'MSIVs', 'middle', 'm-lbl sm')}
      <path class="m-p thin m-stm" data-r="srv" d="M176 36 V176"/>${valve('srvV', 176, 66, true)}${lbl(184, 70, 'SRVs', 'start', 'm-lbl sm')}${val('vSrv', 184, 82)}
      <polygon class="m-turb" data-r="turb" points="330,20 410,14 410,58 330,50"/>${lbl(370, 40, 'TURBINE', 'middle')}
      <line class="m-shaft" x1="410" x2="428" y1="36" y2="36"/><rect class="m-box" data-r="gen" x="428" y="22" width="50" height="28" rx="4"/>${lbl(453, 40, 'GEN', 'middle')}
      ${val('vMwe', 486, 42, 'start', true)}
      <path class="m-p thin m-stm" data-r="byp" d="M300 36 V130 H330"/>${valve('bypV', 300, 84, true)}${lbl(292, 88, 'BYPASS', 'end', 'm-lbl sm')}
      <path class="m-p thin m-stm" d="M370 54 V118"/>
      <rect class="m-box" x="330" y="118" width="96" height="30" rx="4"/>${lbl(378, 137, 'CONDENSER', 'middle')}
      <path class="m-p m-fw" data-r="feed" d="M378 148 V184 H254 V72 H142"/>${pump('cbpP', 330, 184, 7)}${pump('rfp', 290, 184, 7)}${lbl(310, 202, 'COND · BOOSTER · FEED PUMPS', 'middle', 'm-lbl sm')}
      ${ecc.map(([k, t], i) => `<rect class="m-box" data-r="e_${k}" x="${520 + (i % 2) * 96}" y="${92 + Math.floor(i / 2) * 26}" width="88" height="20" rx="3"/>${lbl(564 + (i % 2) * 96, 106 + Math.floor(i / 2) * 26, t, 'middle', 'm-lbl sm')}`).join('')}
      ${lbl(612, 84, 'INJECTION SYSTEMS', 'middle')}
      ${val('vPwr', 12, 14)}${val('vP', 236, 54)}${val('vLvl', 148, 166, 'start')}${val('vPool', 228, 208)}${val('vFlow', 76, 160, 'middle')}${val('vState', 712, 214, 'end')}`,
  });
  return {
    el: M.el,
    update(paused) {
      M.paused(paused);
      const c = m.ctl, A = m.avail, q = m.q, S = m.spec;
      const avg = m.rodGroups.reduce((a, b) => a + b, 0) / m.rodGroups.length;
      M.move('rods', 0, 48 * avg); // bottom-entry rods: withdrawn = lower
      M.glow('core', m.frac);
      M.r.dmg.setAttribute('opacity', (0.8 * m.damage).toFixed(2));
      // Vessel level: drawn box spans from below the core (−330 in) to above L8 (+80 in).
      M.level('lvl', (m.Lc + 330) / 410);
      M.level('pool', clamp((m.pool - 60) / 140, 0.25, 1));
      const wf = m.flowFrac;
      M.flow('rcL', wf); M.flow('rcR', wf);
      M.spin('rpA', c.recirc[0] && A.recirc[0] ? c.recircSpeed[0] : 0);
      M.spin('rpB', c.recirc[1] && A.recirc[1] ? c.recircSpeed[1] : 0);
      const msiv = c.msiv && !m.msivClosed;
      M.valve('msivI', msiv); M.valve('msivO', msiv);
      M.flow('steam', clamp((q.wTurb + q.wBypass) / S.Wfull, 0, 1));
      M.flow('srv', q.srvOpen ? 1 : 0); M.valve('srvV', q.srvOpen > 0);
      M.flow('byp', clamp(q.wBypass / (0.25 * S.Wfull), 0, 1)); M.valve('bypV', q.wBypass > 0.01);
      M.cls('turb', 'on', !m.turbineTripped && q.wTurb > 0.05);
      M.cls('gen', 'on', q.wTurb > 0.1);
      M.flow('feed', clamp((q.wFeed + q.wCbp) / S.Wfull, 0, 1));
      M.spin('rfp', q.wFeed > 0.01 ? 1 : 0); M.spin('cbpP', q.wCbp > 0.01 || q.wFeed > 0.01 ? 1 : 0);
      const sys = { hpci: [q.wHpci > 0, A.hpci], rcic: [q.wRcic > 0, A.rcic], csA: [c.cs[0] === 'on', A.cs[0]], csB: [c.cs[1] === 'on', A.cs[1]], lpciA: [c.lpci[0] === 'on', A.lpci[0]], lpciB: [c.lpci[1] === 'on', A.lpci[1]], cbp: [q.wCbp > 0, A.cbp], crd: [q.wCrd > 0, A.crd] };
      for (const [k, [on, ok]] of Object.entries(sys)) { M.cls(`e_${k}`, 'on', on && ok); M.cls(`e_${k}`, 'dead', !ok); }
      M.text('vPwr', `${pct(m.frac)} · ${(m.frac * S.MWt).toFixed(0)} MWt`);
      M.text('vP', `${m.P.toFixed(0)} psig`);
      M.text('vLvl', A.levelInd ? `${m.levelInd.toFixed(0)} in` : '? in');
      M.text('vPool', `${m.pool.toFixed(0)}°F`);
      M.text('vFlow', `${Math.round(100 * m.flowFrac)}% flow`);
      M.text('vSrv', q.srvOpen ? `${q.srvOpen} open` : '');
      M.text('vMwe', `${Math.round((q.wTurb / S.Wfull) * S.MWe)} MWe`);
      M.text('vState', m.damage > 0 ? 'FUEL DAMAGE' : m.Lc < S.TAF ? 'CORE UNCOVERED' : m.scrammed ? 'SCRAMMED' : 'RUN');
    },
  };
}

// ───────────────────────── Three Mile Island 2 (B&W) ─────────────────────────
// Raised-loop B&W plant: candy-cane hot legs over the top of two once-through steam generators.
// Drawn as the 1979 operators could know it: the PORV shows its solenoid, and there's no
// reactor-vessel level instrument.
export function tmiMimic(m) {
  const M = mimic({
    title: 'TMI-2 · reactor coolant system (B&W raised loop)',
    markup: `${DEFS}<path class="m-cont" d="M8 216 V40 Q8 4 60 4 H348 Q400 4 400 40 V216"/>${lbl(20, 120, 'REACTOR BUILDING', 'start', 'm-lbl sm')}
      ${tank(150, 54, 46, 140, 20)}<rect class="m-core" data-r="core" x="160" y="120" width="26" height="54" rx="2"/><rect data-r="dmg" x="160" y="120" width="26" height="54" fill="#2a1408" opacity="0"/>
      <g data-r="rods">${rods([165, 171, 177, 183], 62, 58)}</g>
      ${lbl(173, 108, 'NO RV LEVEL', 'middle', 'm-lbl sm')}${lbl(173, 116, 'INSTRUMENT', 'middle', 'm-lbl sm')}
      <path class="m-p m-hot" data-r="hot" d="M196 96 H284 Q296 96 296 84 V24 Q296 12 308 12 H334 Q346 12 346 24 V30"/>
      ${tank(236, 30, 24, 54, 10, 'pzrW', 3)}<path class="m-p thin m-hot" d="M248 84 V96"/>
      ${tank(330, 30, 32, 162, 14, 'sgW', 4)}${lbl(346, 26, 'OTSG', 'middle', 'm-lbl sm')}
      <path class="m-p m-cold" data-r="cold" d="M346 192 V204 H300 M280 204 H230 V176 H196"/>${pump('rcp', 290, 204, 8)}
      <path class="m-p thin m-gray" data-r="relief" d="M248 30 V18 H40 V160"/>${valve('blk', 214, 18)}${valve('porv', 164, 18)}
      ${lbl(214, 34, 'BLOCK', 'middle', 'm-lbl sm')}${lbl(164, 34, 'PORV', 'middle', 'm-lbl sm')}${val('vTail', 100, 14, 'middle')}
      <rect class="m-box" data-r="rcdt" x="18" y="160" width="62" height="34" rx="12"/>${lbl(49, 178, 'DRAIN TANK', 'middle', 'm-lbl sm')}${val('vRcdt', 49, 190, 'middle')}
      <path data-r="disk" d="M80 168 H96 V214" class="m-p thin m-gray"/>${lbl(98, 196, 'RUPTURE DISK', 'start', 'm-lbl sm')}
      <path class="m-p thin m-fw" data-r="hpi" d="M470 215 H240 V206"/>${pump('mu', 360, 215, 6)}${valve('hpiV', 330, 215)}${lbl(476, 218, 'HPI / MAKEUP', 'start', 'm-lbl sm')}
      <path class="m-p m-stm" data-r="steam" d="M362 60 H430 V30 H470"/>
      <polygon class="m-turb" data-r="turb" points="470,14 540,8 540,52 470,46"/>${lbl(505, 34, 'TURBINE', 'middle')}
      <line class="m-shaft" x1="540" x2="556" y1="30" y2="30"/><rect class="m-box" data-r="gen" x="556" y="16" width="44" height="28" rx="4"/>${lbl(578, 34, 'GEN', 'middle')}${val('vMwe', 606, 36, 'start', true)}
      <path class="m-p thin m-stm" d="M505 50 V120"/><rect class="m-box" x="470" y="120" width="90" height="30" rx="4"/>${lbl(515, 139, 'CONDENSER', 'middle')}
      <path class="m-p m-fw" data-r="feed" d="M515 150 V176 H384 V150 H362"/>${pump('fwp', 450, 176, 7)}${lbl(450, 192, 'MAIN FEED', 'middle', 'm-lbl sm')}
      <path class="m-p thin m-fw" data-r="efw" d="M640 200 H372 V170 H362"/>${valve('efv', 420, 200)}${pump('efp', 520, 200, 6)}${lbl(420, 192, 'EF-V12', 'middle', 'm-lbl sm')}
      <rect class="m-box" x="640" y="184" width="60" height="28" rx="3"/>${lbl(670, 202, 'CST', 'middle')}${lbl(588, 196, 'EMERG FEED', 'middle', 'm-lbl sm')}
      ${val('vPwr', 14, 214)}${val('vP', 268, 48)}${val('vPzr', 268, 60)}${val('vThot', 288, 110, 'end')}${val('vTc', 214, 172, 'middle')}${val('vSg', 368, 100)}${val('vStm', 436, 26, 'end')}`,
  });
  return {
    el: M.el,
    update(paused) {
      M.paused(paused);
      const c = m.ctl, S = m.spec, q = m.q ?? {};
      M.r.rods.querySelectorAll('line').forEach((l) => l.setAttribute('y2', (62 + 58 * (1 - m.rods) + 0.5).toFixed(1)));
      M.glow('core', m.frac);
      M.r.dmg.setAttribute('opacity', (0.85 * m.damage).toFixed(2));
      const pumps = m.pumpsOn;
      M.flow('hot', pumps > 0.05 ? pumps : 0); M.flow('cold', pumps > 0.05 ? pumps : 0);
      M.spin('rcp', pumps, c.rcp.some(Boolean));
      M.heat('hot', m.ThotInd, 540, 620);
      M.level('pzrW', m.pzrLevel / S.pzrHeight);
      M.level('sgW', clamp(m.sg[0] / 120, 0, 1));
      M.valve('blk', c.blockValve);
      M.valve('porv', m.porvSolenoid); // the lamp's view of the world
      M.text('vTail', `tailpipe ${m.tailpipe.toFixed(0)}°F`);
      M.cls('rcdt', 'alarm', m.rcdtP > 120);
      M.cls('disk', 'm-hot', m.rupture);
      const hpiOn = c.hpi.some(Boolean);
      M.flow('hpi', hpiOn ? clamp(c.hpiValve * 3, 0.15, 1) : 0); M.spin('mu', hpiOn ? 1 : 0); M.valve('hpiV', hpiOn && c.hpiValve > 0.02);
      M.flow('steam', c.turbine ? m.frac : 0.1);
      M.cls('turb', 'on', c.turbine); M.cls('gen', 'on', c.turbine);
      M.flow('feed', c.mainFeed ? 1 : 0); M.spin('fwp', c.mainFeed ? 1 : 0);
      const efw = c.efwPumps.some(Boolean);
      M.spin('efp', efw ? 1 : 0); M.valve('efv', c.efwBlock[0] || c.efwBlock[1]);
      M.flow('efw', efw && (c.efwBlock[0] || c.efwBlock[1]) ? 0.5 : 0);
      M.text('vPwr', `${pct(m.frac)}`);
      M.text('vP', `${m.P.toFixed(0)} psig`);
      M.text('vPzr', `${m.pzrLevel.toFixed(0)} in`);
      M.text('vThot', `${m.ThotInd.toFixed(0)}°F`);
      M.text('vTc', `${m.Tcold.toFixed(0)}°F`);
      M.text('vSg', `${m.sgLevel[0].toFixed(0)} in`);
      M.text('vStm', `${Math.max(0, psat(m.Ts) - PSIA).toFixed(0)} psig`);
      M.text('vRcdt', `${m.rcdtP.toFixed(0)} psig`);
      M.text('vMwe', c.turbine ? `${Math.round(m.frac * 906)} MWe` : '0 MWe');
    },
  };
}

// ───────────────────────── Chernobyl 4 (RBMK-1000) ─────────────────────────
// A graphite stack pierced by pressure tubes: water boils in the channels, the steam is separated
// in four drum separators (two drawn) and goes to two turbines. Eight main circulation pumps.
export function rbmkMimic(m) {
  const chans = Array.from({ length: 15 }, (_, i) => `<line data-r="ch${i}" x1="${164 + i * 11}" x2="${164 + i * 11}" y1="94" y2="164" stroke-width="4" stroke="#7fb0e0"/>`).join('');
  const mcps = (x0, k) => [0, 1, 2, 3].map((i) => pump(`mcp${k + i}`, x0 + i * 22, 196, 7)).join('');
  const M = mimic({
    title: 'Chernobyl 4 · RBMK-1000 multiple forced circulation circuit',
    markup: `${DEFS}<g data-r="lid"><rect class="m-box" x="140" y="72" width="200" height="14" rx="2"/>${lbl(240, 82, 'UPPER SHIELD "E"', 'middle', 'm-lbl sm')}</g>
      <rect class="m-box" x="150" y="88" width="180" height="80" rx="3" style="fill:#4b4b48"/>
      <rect class="m-core" data-r="core" x="150" y="88" width="180" height="80" opacity="0.2" style="fill-opacity:.55"/>${chans}
      <rect class="m-box" x="140" y="168" width="200" height="10" rx="2"/>${lbl(240, 186, 'GRAPHITE STACK · 1,661 CHANNELS', 'middle', 'm-lbl sm')}
      <g data-r="rods">${rods([180, 214, 248, 282, 310], 30, 40)}</g>
      ${tank(20, 30, 96, 26, 13, 'drL', 4)}${tank(364, 30, 96, 26, 13, 'drR', 4)}${lbl(68, 24, 'DRUM SEPARATORS', 'middle', 'm-lbl sm')}
      <path class="m-p m-hot" data-r="riserL" d="M200 72 V60 Q200 44 180 44 H116"/><path class="m-p m-hot" data-r="riserR" d="M280 72 V60 Q280 44 300 44 H364"/>
      <path class="m-p m-cold" data-r="downL" d="M36 56 V196 H40 M128 196 H160 V178"/>${mcps(40, 0)}
      <path class="m-p m-cold" data-r="downR" d="M444 56 V196 H436 M348 196 H320 V178"/>${mcps(370, 4)}
      ${lbl(84, 216, 'MCP 1–4', 'middle', 'm-lbl sm')}${lbl(403, 216, 'MCP 5–8 · TG-8 bus', 'middle', 'm-lbl sm')}
      <path class="m-p m-stm" data-r="steam" d="M68 30 V12 H510"/><path class="m-p m-stm" d="M412 30 V12"/>
      <polygon class="m-turb" data-r="tg7" points="510,4 570,0 570,30 510,24"/>${lbl(540, 18, 'TG-7', 'middle', 'm-lbl sm')}
      <path class="m-p m-stm" data-r="steam8" d="M490 12 V54 H510"/>${valve('sv8', 496, 40, true)}
      <polygon class="m-turb" data-r="tg8" points="510,40 570,36 570,66 510,60"/>${lbl(540, 54, 'TG-8', 'middle', 'm-lbl sm')}
      <rect class="m-box" x="510" y="104" width="90" height="28" rx="4"/>${lbl(555, 122, 'CONDENSERS', 'middle')}<path class="m-p thin m-stm" d="M540 64 V104"/>
      <path class="m-p m-fw" data-r="feed" d="M555 132 V150 H480 V46 H460"/>${lbl(486, 146, 'FEEDWATER', 'start', 'm-lbl sm')}
      ${val('vMW', 338, 104, 'start', true)}${val('vDrum', 68, 72, 'middle')}${val('vLvl', 68, 84, 'middle')}${val('vFlow', 240, 206, 'middle')}${val('vVoid', 338, 120)}${val('vState', 712, 212, 'end')}`,
  });
  return {
    el: M.el,
    update(paused) {
      M.paused(paused);
      const c = m.ctl;
      const inFrac = clamp(1 - m.rodsOut / 163, 0, 1);
      M.r.rods.querySelectorAll('line').forEach((l) => l.setAttribute('y2', (30 + 40 + 70 * inFrac).toFixed(1)));
      M.glow('core', Math.min(m.frac, 30));
      const v = clamp(m.void / 75, 0, 1);
      for (let i = 0; i < 15; i++) M.r[`ch${i}`].setAttribute('stroke', `rgb(${Math.round(127 + 128 * v)}, ${Math.round(176 + 79 * v)}, ${Math.round(224 + 31 * v)})`);
      M.flow('riserL', clamp(m.flow, 0, 1)); M.flow('riserR', clamp(m.flow, 0, 1));
      M.flow('downL', clamp(m.flow, 0, 1)); M.flow('downR', clamp(m.flow, 0, 1));
      c.mcp.forEach((on, i) => M.spin(`mcp${i}`, on ? (i >= 4 ? m.rundown : 1) : 0, on));
      const lv = clamp((m.drumLevel + 120) / 180, 0, 1);
      M.level('drL', lv); M.level('drR', lv);
      M.flow('steam', clamp(m.frac, 0, 1)); M.flow('steam8', c.tg8 ? clamp(m.frac, 0, 1) : 0);
      M.valve('sv8', c.tg8);
      M.cls('tg7', 'on', false); M.cls('tg8', 'on', c.tg8 || m.rundown > 0.56);
      M.flow('feed', clamp(c.feed * m.frac, 0, 1));
      if (m.destroyed) M.move('lid', 0, -22, -14, 240, 79);
      M.text('vMW', m.destroyed ? '— — —' : `${m.MW.toFixed(0)} MW`);
      M.text('vDrum', `${m.drumP.toFixed(0)} kgf/cm²`);
      M.text('vLvl', `${m.drumLevel >= 0 ? '+' : ''}${m.drumLevel.toFixed(0)} cm`);
      M.text('vFlow', `${(m.flow * 56).toFixed(0)} 000 m³/h`);
      M.text('vVoid', `void ${m.void.toFixed(0)}%`);
      M.text('vState', m.destroyed ? 'REACTOR DESTROYED' : m.az5 !== null ? 'AZ-5' : c.tg8 ? 'OPERATING' : 'RUNDOWN TEST');
    },
  };
}

// ───────────────────────── Westinghouse four-loop (Sequoyah) ─────────────────────────
export function seqMimic(m) {
  return westinghouseMimic(m, { title: 'Sequoyah 1 · plant mimic', cont: 'ICE CONDENSER CONTAINMENT', loops: '4 SG · 4 RCP' });
}

function westinghouseMimic(m, { title, cont, loops }) {
  const P = m.plant;
  const M = mimic({
    title,
    w: 640, h: 172,
    markup: `${DEFS}<path class="m-cont" d="M14 168 V70 Q14 6 160 6 Q306 6 306 70 V168"/>${lbl(108, 24, cont, 'middle')}
      <path class="m-p m-hot" data-r="hot" d="M104 78 H160 Q176 78 182 104 L190 116"/>
      <path class="m-p m-cold" data-r="cold" d="M232 128 H250 V150 H180 M164 150 H104"/>${pump('rcp', 172, 150, 9)}
      <path class="m-p thin m-hot" d="M136 96 V78"/>
      ${tank(58, 44, 46, 112, 20)}<rect class="m-core" data-r="core" x="68" y="96" width="26" height="46" rx="3"/><g data-r="rods">${rods([74, 80, 86], 52, 44)}</g>
      ${tank(124, 36, 24, 60, 11, 'pzrW', 3)}
      ${tank(188, 30, 44, 112, 20, 'sgW', 5)}
      ${val('vPwr', 22, 164)}${val('vHot', 166, 100, 'end')}${val('vCold', 215, 164, 'middle')}${val('vPzr', 136, 32, 'middle')}
      ${lbl(296, 150, loops, 'end')}
      <path class="m-p m-stm" data-r="steam" d="M210 30 V14 H352"/>${val('vSteam', 282, 11, 'middle')}
      <path class="m-p thin m-stm" data-r="dump" d="M326 14 V120 H362"/>${valve('dumpV', 326, 66, true)}${lbl(320, 92, 'DUMP', 'end')}
      <polygon class="m-turb" data-r="turb" points="352,4 432,0 432,40 352,32"/>${lbl(392, 22, 'TURBINE', 'middle')}
      <line class="m-shaft" x1="432" x2="452" y1="20" y2="20"/><rect class="m-box" data-r="gen" x="452" y="6" width="56" height="28" rx="4"/>${lbl(480, 24, 'GEN', 'middle')}
      <path class="m-p m-gray" data-r="out" d="M508 20 H540"/>${val('vMwe', 546, 25, 'start', true)}${val('vRpm', 392, 52, 'middle')}
      <path class="m-p thin m-stm" d="M392 32 V108"/><rect class="m-box" x="362" y="108" width="96" height="36" rx="4"/>${lbl(410, 130, 'CONDENSER', 'middle')}
      <path class="m-p m-fw" data-r="feed" d="M410 144 V160 H262 V118 H232"/>${lbl(336, 156, 'FEEDWATER', 'middle')}
      ${val('vMode', 630, 160, 'end')}`,
  });
  return {
    el: M.el,
    update(paused) {
      M.paused(paused);
      const c = P.ctl;
      const ins = 1 - m.ctlSteps / m.maxSteps;
      M.r.rods.querySelectorAll('line').forEach((l) => l.setAttribute('y2', (52 + 44 * ins + 0.5).toFixed(1)));
      M.glow('core', m.frac);
      M.heat('hot', P.Thot, 540, 630);
      M.flow('hot', P.flowFrac); M.flow('cold', P.flowFrac);
      M.spin('rcp', P.flowFrac, c.pumps.some(Boolean));
      M.level('pzrW', P.pzrLevel / 100);
      M.level('sgW', P.sgLevel / 100);
      const open = P.q.dump > 1 || P.q.safety > 1;
      M.valve('dumpV', open); M.flow('dump', open ? clamp(P.q.dump / (0.2 * P.spec.MWt), 0.2, 1) : 0);
      M.flow('steam', clamp(P.steamFrac * 1.5, 0, 1));
      M.cls('turb', 'on', c.latched); M.cls('gen', 'on', P.MWe > 1);
      M.flow('out', P.MWe > 1 ? clamp(P.load, 0.2, 1) : 0);
      M.flow('feed', clamp(P.steamFrac * 1.5, 0, 1));
      M.text('vPwr', `${pct(m.frac)} · ${P.heat < 10 ? P.heat.toFixed(1) : P.heat.toFixed(0)} MWt`);
      M.text('vHot', `${P.Thot.toFixed(0)}°F`); M.text('vCold', `${P.Tcold.toFixed(0)}°F`);
      M.text('vPzr', `${P.Ppzr.toFixed(0)} psig`); M.text('vSteam', `${P.steamPsig.toFixed(0)} psig`);
      M.text('vRpm', c.latched ? `${(100 * P.load).toFixed(0)}% load` : 'tripped');
      M.text('vMwe', `${P.MWe.toFixed(0)} MWe`);
      M.text('vMode', P.trip.latched ? 'REACTOR TRIPPED' : m.frac > 0.02 ? 'POWER OPERATION' : m.k.rho >= -0.0005 && m.frac > 1e-9 ? 'CRITICAL · STARTUP' : P.hot ? 'HOT STANDBY' : 'COLD SHUTDOWN');
    },
  };
}

// ───────────────────────── AP1000 (Vogtle 3) ─────────────────────────
// Two loops, each a steam generator with two canned-motor pumps hung straight off its channel
// head; a steel containment inside a concrete shield building with a water tank on the roof; and
// the passive safety systems that need no pumps: core makeup tanks, accumulators, the refuelling-
// water tank inside containment with the passive RHR heat exchanger in it, and the ADS valves.
export function apMimic(m) {
  const P = m.plant;
  const M = mimic({
    title: 'Vogtle 3 · AP1000 · WPIS plant overview',
    markup: `${DEFS}<path class="m-shell" d="M8 218 V72 Q8 2 200 2 Q392 2 392 72 V218" style="stroke-width:5;opacity:.55"/>
      <path class="m-shell" d="M22 218 V74 Q22 14 200 14 Q378 14 378 74 V218"/>${lbl(306, 30, 'STEEL CONTAINMENT', 'start', 'm-lbl sm')}
      <rect class="m-ves" x="174" y="3" width="52" height="9" rx="2"/><rect class="m-wat" data-r="pcsW" data-lvl x="176" y="4" width="48" height="7"/>${lbl(232, 10, 'PCS TANK', 'start', 'm-lbl sm')}
      <path class="m-p thin m-cold" data-r="pcs" d="M200 12 Q100 14 30 72 M200 12 Q300 14 370 72"/>
      ${tank(140, 98, 40, 104, 16)}<rect class="m-core" data-r="core" x="148" y="146" width="24" height="44" rx="2"/>
      <g data-r="rods">${rods([152, 160], 104, 42, 'm-rod gray')}${rods([156, 164, 168], 104, 42)}</g>
      ${tank(196, 40, 20, 52, 9, 'pzrW', 3)}${lbl(206, 36, 'PZR', 'middle', 'm-lbl sm')}<path class="m-p thin m-hot" d="M206 92 V128"/>
      ${tank(240, 44, 40, 118, 16, 'sgW', 5)}${lbl(260, 40, 'SG ×2', 'middle', 'm-lbl sm')}
      <path class="m-p m-hot" data-r="hot" d="M180 128 H230 V158 H240"/>
      <path class="m-p m-cold" data-r="cold" d="M248 180 V196 H180 M272 180 V196 H248"/>${pump('rcpA', 248, 172, 7)}${pump('rcpB', 272, 172, 7)}${lbl(244, 214, 'CANNED RCPs ×4', 'start', 'm-lbl sm')}
      ${tank(30, 118, 82, 62, 6, 'irwst', 3)}${lbl(71, 196, 'IRWST', 'middle', 'm-lbl sm')}
      <path class="m-p thin m-gray" data-r="prhr" d="M224 128 V30 H54 V156 H96 V206 H260 V182"/>${valve('prhrV', 96, 182, true)}${lbl(60, 146, 'PRHR HX', 'start', 'm-lbl sm')}
      ${tank(114, 40, 18, 52, 8, 'cmtW', 2)}${lbl(123, 36, 'CMT', 'middle', 'm-lbl sm')}<path class="m-p thin m-cold" data-r="dvi" d="M123 92 V170 H140"/>${valve('cmtV', 123, 110, true)}
      <circle class="m-ves" cx="36" cy="88" r="11"/>${lbl(36, 70, 'ACC', 'middle', 'm-lbl sm')}<path class="m-p thin m-cold" d="M36 99 V104 H123"/>
      <path class="m-p thin m-stm" data-r="ads" d="M206 40 V22 H76 V124"/>${valve('adsV', 150, 22)}${lbl(150, 34, 'ADS 1–3', 'middle', 'm-lbl sm')}
      <path class="m-p m-stm" data-r="steam" d="M280 60 H420 V40 H440"/>
      <path class="m-p thin m-stm" data-r="dump" d="M420 60 V150 H450"/>${valve('dumpV', 420, 104, true)}${lbl(414, 108, 'DUMP', 'end', 'm-lbl sm')}
      <polygon class="m-turb" data-r="turb" points="440,22 520,16 520,62 440,56"/>${lbl(480, 42, 'TURBINE', 'middle')}
      <line class="m-shaft" x1="520" x2="536" y1="39" y2="39"/><rect class="m-box" data-r="gen" x="536" y="24" width="48" height="30" rx="4"/>${lbl(560, 43, 'GEN', 'middle')}${val('vMwe', 590, 45, 'start', true)}
      <path class="m-p thin m-stm" d="M480 60 V140"/><rect class="m-box" x="450" y="140" width="90" height="28" rx="4"/>${lbl(495, 158, 'CONDENSER', 'middle')}
      <path class="m-p m-fw" data-r="feed" d="M495 168 V196 H300 V120 H280"/>${pump('fwp', 430, 196, 7)}${valve('fcv', 350, 196)}${lbl(350, 212, 'FW REG VALVE', 'middle', 'm-lbl sm')}${lbl(430, 212, 'MAIN FEED', 'middle', 'm-lbl sm')}
      <rect class="m-box" data-r="sufw" x="560" y="182" width="70" height="20" rx="3"/>${lbl(595, 196, 'STARTUP FW', 'middle', 'm-lbl sm')}
      ${val('vPwr', 30, 214)}${val('vPzr', 192, 54, 'end')}${val('vPzrL', 192, 66, 'end')}${val('vThot', 232, 122, 'end')}${val('vTc', 214, 210, 'middle')}${val('vSg', 286, 100)}${val('vStm', 344, 54, 'middle')}
      ${val('vIrw', 71, 136, 'middle')}${val('vRods', 160, 96, 'middle')}${val('vMode', 712, 16, 'end')}${val('vRate', 712, 30, 'end')}`,
  });
  return {
    el: M.el,
    update(paused) {
      M.paused(paused);
      const c = P.ctl;
      const ins = 1 - m.ctlSteps / m.maxSteps;
      M.r.rods.querySelectorAll('line').forEach((l) => l.setAttribute('y2', (104 + 42 * ins + 0.5).toFixed(1)));
      M.glow('core', m.frac);
      M.heat('hot', P.Thot, 200, 620);
      M.heat('cold', P.Tcold, 200, 620);
      M.flow('hot', P.flowFrac > 0.05 ? P.flowFrac : 0); M.flow('cold', P.flowFrac > 0.05 ? P.flowFrac : 0);
      M.spin('rcpA', (P.flow[0] + P.flow[1]) / 2, c.pumps[0] || c.pumps[1]);
      M.spin('rcpB', (P.flow[2] + P.flow[3]) / 2, c.pumps[2] || c.pumps[3]);
      M.level('pzrW', P.pzrLevel / 100);
      M.level('sgW', P.sgLevel / 100);
      M.level('irwst', 0.85);
      M.level('cmtW', 1);
      M.level('pcsW', 1);
      M.valve('prhrV', P.prhr && !c.prhrIsolate); M.cls('prhr', 'm-hot', P.prhr && !c.prhrIsolate); M.flow('prhr', P.q.prhr > 0.5 ? clamp(P.q.prhr / 40, 0.2, 1) : 0);
      M.valve('cmtV', false); M.valve('adsV', false);
      const open = P.q.dump > 1 || P.q.safety > 1;
      M.valve('dumpV', open); M.flow('dump', open ? clamp(P.q.dump / (0.15 * P.spec.MWt), 0.2, 1) : 0);
      M.flow('steam', clamp(P.steamFrac * 3, 0, 1));
      M.cls('turb', 'on', c.latched); M.cls('gen', 'on', P.MWe > 1);
      M.flow('feed', clamp(P.feedFrac * 3, 0, 1)); M.spin('fwp', P.feedOn ? 1 : 0); M.valve('fcv', P.feedFrac > 0.002, P.fwFault && c.fwMode === 'auto');
      M.cls('sufw', 'dead', P.sufwFailed); M.cls('sufw', 'on', P.sufwOn);
      M.text('vPwr', `${pct(m.frac)} · ${P.heat < 10 ? P.heat.toFixed(1) : P.heat.toFixed(0)} MWt`);
      M.text('vPzr', `${P.Ppzr.toFixed(0)} psig`); M.text('vPzrL', `${P.pzrLevel.toFixed(0)}%`);
      M.text('vThot', `${P.Thot.toFixed(0)}°F`); M.text('vTc', `${P.Tcold.toFixed(0)}°F`);
      M.text('vSg', `${P.sgLevel.toFixed(0)}%`); M.text('vStm', `${P.steamPsig.toFixed(0)} psig`);
      M.text('vIrw', `${P.Tirwst.toFixed(0)}°F`);
      M.text('vRods', m.rodLabel);
      M.text('vMwe', `${P.MWe.toFixed(0)} MWe`);
      M.text('vMode', m.modeName);
      M.text('vRate', `heatup ${P.heatupRate >= 0 ? '+' : ''}${P.heatupRate.toFixed(0)}°F/h`);
    },
  };
}
