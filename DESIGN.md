# CRITICALITY — design notes

A browser game: six real reactors, six control rooms, one operator's career.
Plain ES modules, no build step. Serve the folder (`python3 -m http.server`) and open
`index.html`. Headless model tests run with `node tests/run.mjs`.

## Frame story

You are a new hire at the **Halden-style Historical Operations Simulator** (fictional:
"the Archive"), a training facility that rebuilds historic control rooms full-scale and
replays the events that happened in them. Your instructor is **Dr. Ruth Okafor**
(fictional), a former senior reactor operator. Her line: *"You can't change history.
You can learn from it."* Each mission is a replay: you sit in the seat, the plant
behaves as it did, and the scripted events happen as they did. What you do about them
is up to you. Real people are never given invented lines; on-shift roles are used
instead ("shift supervisor", "deputy chief engineer"). The only exceptions are a few
well-documented quotations that are paraphrased.

Career ladder: Trainee → Operator → Reactor Operator → Senior Reactor Operator → Shift
Supervisor → Instructor. Each mission awards a grade (S/A/B/C/D/F) from objectives,
safety and timing; passing (C or better) unlocks the next one. Every reactor also has
a free-play **Sandbox** once its mission is passed.

## Missions (chronological)

1. **Chicago Pile-1, 2 December 1942 — "First Light".** Squash court under Stagg Field.
   Withdraw the control rod in Fermi's steps, read the counters and pen recorder, check
   that the rate levels off each time (still subcritical), pause for lunch if the
   automatic safety rod trips, then go critical, let the power rise with a period of a
   few minutes, hold near ½ W for 4½ minutes, then shut down with the ZIP rod.
   Fail: power over 200 W (radiation in the balcony), or the "suicide squad" floods the
   pile with cadmium solution. Instruments: BF₃ counter (audible clicks, scaler),
   ionization chamber + galvanometer, Brown pen recorder with range switching.
   Controls: hand-pulled control rod (marked in feet), automatic safety rod (solenoid +
   weight), ZIP rod (rope; the axe), cadmium-solution buckets.
2. **USS Nightjar (fictional SSN), 1963 — "Silent Running".** Generic, unclassified
   naval PWR in the maneuvering room. Answer the engine-order telegraph bells with the
   ahead/astern throttles, keep Tavg on program with the rods, and keep the reactor
   coolant pumps in slow speed when quiet is ordered. Event: a reactor scram during an
   evasion; do a fast recovery startup before the battery runs out, while answering
   bells on the emergency propulsion motor.
3. **Browns Ferry Unit 1, 22 March 1975 — "Candle".** GE BWR/4. A candle used to check
   for air leaks sets the cable insulation on fire. Systems and indications fail one
   after another. Scram, keep reactor water level above the top of active fuel: high-
   pressure systems are lost, so depressurize with the relief valves and feed with the
   condensate booster pump and CRD pumps.
4. **Three Mile Island Unit 2, 28 March 1979 — "Stuck Open".** B&W 177-assembly PWR
   with once-through steam generators and the Integrated Control System. 04:00:37:
   condensate/feedwater trip → turbine trip → PORV lifts → reactor trip → PORV sticks
   open while its lamp says it's shut; emergency feedwater block valves are shut (a
   tag hangs over one indicator); the pressurizer level rises while coolant leaves.
   Win by recognising the leak (drain tank pressure, tailpipe temperature, saturation),
   shutting the PORV block valve and keeping HPI on. Graded by core damage avoided.
5. **Chernobyl Unit 4, 25–26 April 1986 — "The Test".** RBMK-1000. You inherit the
   shift after the day-long delay; xenon is building, the operating reactivity margin
   is falling. The deputy chief engineer wants the turbine rundown test done tonight.
   Paths: refuse / shut down safely (best grade); keep ORM ≥ 15 rods and power ≥ 700
   MW (the test programme's own limit) and do the test safely; or follow the
   historical path (~200 MW, ORM ~6–8 rods, all eight pumps on, trips blocked) — the
   test starts, flow falls, voids rise, AZ-5 is pressed and the graphite displacers
   add reactivity at the bottom. The ending is told plainly, with the human cost.
6. **Sequoyah Unit 1, today — "Certification".** Westinghouse 4-loop PWR. The final
   exam: from hot standby, start up, block the source-range trip at P-6, go to the
   point of adding heat, latch the turbine, load to 100% with rods in AUTO and boron
   dilution, then ride out a load rejection. Uses everything learned.

## Models (js/models)

Shared: six-group point kinetics with a source (implicit, stiff-safe), decay heat (six
groups, ~6.5% after long operation), iodine/xenon (time-scaled where missions need
hours to pass), lumped heat balances.

- **CP-1**: graphite pile, natural uranium. Λ ≈ 1 ms. k(rods, cadmium solution).
  Critical with the control rod about 13 ft out once the others are out; k_excess
  fully out ≈ 1.0006. Power = neutron level × calibration (no temperature feedback
  below ~200 W). Source: radium-beryllium.
- **Naval PWR**: small core, strong negative moderator coefficient (power follows
  steam demand), constant-Tavg program, rods for Tavg/shim, RCPs fast/slow,
  battery + EPM after a scram, decay heat.
- **BWR/4** (3293 MWt): power from rods and recirculation flow; void feedback;
  pressure set by the EHC pressure regulator / turbine bypass; water level in
  inches above instrument zero with level 8/4/3/2/1 setpoints and shrink/swell;
  SRVs, MSIVs, HPCI, RCIC, core spray, LPCI, CRD, condensate booster; fuel heat-up
  when level is below the top of active fuel.
- **B&W PWR** (2772 MWt): OTSGs with small secondary inventory, ICS (feed/turbine/
  rods), pressurizer with PORV (opens 2255, closes 2205 psig), block valve, code
  safeties, HPI/makeup, letdown, RCDT with rupture disk, RCPs that cavitate with
  voids; RCS inventory and voids drive a misleading pressurizer level; core uncovery
  and damage fraction.
- **RBMK-1000** (3200 MWt): positive void coefficient (worse with low ORM and low
  power), Doppler, xenon, ORM in equivalent rods, 211 rods in groups (RR manual,
  AR/LAR automatic, USP short, AZ emergency), graphite displacer "positive scram"
  in the first seconds of rod travel, 8 MCPs, drum separators, feedwater, TG-8
  rundown.
- **Westinghouse 4-loop**: ported from m-builder's plant model (Tavg program,
  P-6/P-10/P-7/C-5, rod banks with overlap, boron, steam dumps, RPS).

## UI (js/ui)

Widgets: round gauge, edgewise meter, digital readouts (Nixie / LED / LCD), lamps,
annunciator tiles (alarm horn + flash, ACK/RESET), rotary/toggle/J-handle switches,
guarded pushbuttons, spring-return lever, setpoint dial, throttle wheel, strip-chart
recorder, bar graphs. Special: CP-1 pen recorder + scaler, BWR rod select matrix and
four-rod display, RBMK channel cartogram and selsyn rod-position field, sub EOT.
Each control room has its own look (palette, fonts, materials) via CSS variables.

## Files

- `index.html`, `css/game.css`
- `js/main.js` — screens (title, campaign, briefing, mission, debrief, sandbox)
- `js/engine/` — kinetics, decay heat, xenon, steam tables, clock, audio
- `js/models/` — one file per reactor
- `js/ui/` — widgets, panels (one per reactor)
- `js/missions/` — one per mission: briefing, objectives, scripted events, scoring
- `tests/` — headless model and mission tests

## Progress log

(kept at the bottom of README.md once the build is under way)
