# Criticality

A browser game about seven reactor control rooms, from Chicago Pile-1 in 1942 to the first
startup of an AP1000 in 2023. Each mission puts you in the operator's seat for a night that
mattered. The plant models are built from public sources and are physically based; the events
follow the historical record. The submarine and its patrol are fictional.

| # | Mission | Plant | Date | You must… |
|---|---------|-------|------|-----------|
| 1 | **First Light** | Chicago Pile-1 (graphite, natural uranium) | 2 Dec 1942 | approach critical in Fermi's steps with 1/M plots, hold ½ W, drop the ZIP |
| 2 | **Silent Running** | naval PWR, fictional SSN *Nightjar* | 1963 | answer bells, rig for quiet, evade, recover from a scram on the battery |
| 3 | **Candle** | Browns Ferry 1 (GE BWR/4), TVA | 22 Mar 1975 | keep the core covered as the cable fire takes the ECCS away |
| 4 | **Stuck Open** | Three Mile Island 2 (B&W PWR) | 28 Mar 1979 | see through the PORV lamp and the rising pressurizer level |
| 5 | **The Test** | Chernobyl 4 (RBMK-1000) | 25–26 Apr 1986 | hold the reactivity margin — or refuse the test |
| 6 | **Certification** | Sequoyah 1 (Westinghouse 4-loop), TVA | today | full startup to 100%, then ride out a turbine trip |
| 7 | **First of a Kind** | Vogtle 3 (Westinghouse AP1000), Georgia Power | Mar 2023 | heat up from cold, dilute a fresh core to first criticality, measure the coefficient, load to 25% |

Every control room has a live **plant mimic** at the top: a schematic of that reactor's own
architecture (CP-1's pile section, the submarine's shaft and screw, the BWR's Mark I torus, TMI's
candy-cane loops, the RBMK's drum separators, the AP1000's passive safety tanks), with moving
fluid, turning pumps, valves that show red for open and green for shut, and live values.

Passing a mission (grade C or better) unlocks the next and a free-play **sandbox** for that
reactor. Progress is saved in the browser.

## Running it

No build step. Serve the folder and open it:

```bash
python3 -m http.server 8750
```

then visit <http://localhost:8750>. (Opening `index.html` from disk won't work: browsers block ES
modules on `file://`.) The "Unlock all" link on the Archive screen opens every mission.

Model checks run headless under Node 18+:

```bash
node tests/run.mjs
```

## How it's built

- `js/engine/physics.js` — six-group point kinetics with a source (implicit, so prompt jumps are
  stable), decay heat, iodine/xenon, saturated-steam tables.
- `js/models/` — one lumped plant model per reactor:
  - `cp1.js` — CP-1: three cadmium rods, cadmium solution, BF₃ counter, ion chamber, balcony dose.
  - `sub.js` — naval PWR: strong negative temperature coefficient (power follows steam demand),
    throttles, shaft and ship speed, pumps fast/slow, EPM and battery, self-noise.
  - `bwr.js` — BWR/4: void and Doppler feedback, recirculation flow control, vessel energy balance
    (pressure from saturation), level with swell, feedwater/HPCI/RCIC/CS/LPCI/booster/CRD, 13
    SRVs to the suppression pool, ADS, cladding heat-up when uncovered.
  - `tmi.js` — B&W PWR: RCS mass and energy with a fixed volume, so loop voids push water into the
    pressurizer; OTSGs with a small inventory; PORV with a solenoid-only lamp; block valve; HPI;
    RC drain tank and rupture disk; RCP cavitation; core uncovery, zirconium–steam heating, damage.
  - `rbmk.js` — RBMK-1000: positive void coefficient that grows as the margin falls, xenon pit,
    ORM, automatic regulators, MCPs and turbine rundown, AZ-5 with the graphite-displacer
    positive scram, rod jamming, destruction.
  - `sequoyah.js` + `w-plant.js` — Westinghouse four-loop: eight rod banks with overlap, boron,
    Tavg program, steam dumps, P-6/P-7/P-10/C-5 interlocks, full reactor protection (ported from
    the m-builder project).
  - `ap1000.js` — AP1000 on the same plant model: a cold heat-up on pump heat with RNS and
    pressure–temperature limits, a fresh core (no xenon or decay heat), M banks plus shutdown banks,
    a moderator coefficient that is positive at hot zero power and falls with temperature, steam
    generator inventory with a feedwater regulating valve, and passive RHR into the IRWST.
- `js/ui/mimic.js`, `js/ui/mimics.js` — the plant mimics: an SVG toolkit (levels, flow, pumps,
  valves, rods) and one schematic per reactor.
- `js/ui/widgets.js` — gauges (linear/log), edgewise meters, LED/Nixie/VFD readouts, lamps,
  annunciator windows with flash/ACK/RESET and a horn, selector switches, guarded pushbuttons,
  spring-return levers, setpoint knobs, J-handle toggles, strip-chart recorders, bars.
- `js/ui/panels/` — one control room per reactor, each themed after photographs of the real
  thing (CP-1's wood and brass, battleship grey, GE green-grey, TMI's charcoal and orange handles,
  the RBMK's off-white panels and rod-position field, Westinghouse sage green).
- `js/missions/` — briefing, objectives, scripted events and choices, scoring, epilogue.
- `js/game/runner.js` — the mission loop: clock, time compression, script, objectives, log.
- `js/ui/audio.js` — synthesised counter clicks, horns, telegraph bells (WebAudio, no files).

## Accuracy and liberties

The models are lumped and tuned to reproduce the published sequences (INSAG-7 for Chernobyl, the
Kemeny and Rogovin reports for TMI, NRC bulletins for Browns Ferry, Fermi's group's accounts for
CP-1). Notable simplifications: CP-1's rod worths are illustrative; the Browns Ferry and TMI
models use one node for the whole vessel; RBMK rods are grouped by type; the submarine plant is
generic and unclassified by construction. Real people appear only in documented roles, and never
with invented lines (CP-1's two quotations from Fermi are the famous recorded ones).

## Progress log

- 2026-10-30 (overnight): project created; six plant models with headless checks; widget
  library, audio, mission runner, title/campaign/briefing/debrief screens; all six missions
  playable end to end; tested in the browser at desktop width.
- Polish pass: keyboard shortcuts (space, 1–6, H), in-mission help, phone layout (no horizontal
  scroll at 375 px in any control room), rank promotions, Chernobyl branch for players who keep
  the reactor inside the test programme.

- 2026-10-30 (day): plant mimics in every control room; seventh mission, the AP1000 first
  startup at Vogtle 3, with headless checks for its heat-up, criticality, coefficient, feedwater
  fault and passive RHR.

### Ideas for next

- Rod-by-rod control where the real boards had it (the BWR rod select matrix, RBMK rod groups,
  Sequoyah bank selection) instead of grouped rods.
- A post-mission replay chart (power, pressure, level against time) in the debrief.
- More sandbox scenarios per plant (e.g. a Sequoyah steam-generator tube rupture, a BWR ATWS).
- Volume control and a "no horn" option.

