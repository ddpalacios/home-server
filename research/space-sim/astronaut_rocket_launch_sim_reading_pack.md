# Astronaut Rocket Launch — Simulation Starter Pack

**Purpose:** A starting point for adding a *"being in an astronaut rocket"* experience to the space sim —
simulating a launch, the intensity of **breaking free of Earth's gravity**, and the ride up to orbit.
This pack covers two halves of that experience:

1. **The vehicle & trajectory** — how a rocket actually climbs out of the gravity well (ascent
   dynamics, the gravity turn, staging, guidance). This is what drives the *camera path, thrust,
   altitude/velocity readouts, and shaking* in a sim.
2. **The human body** — what the crew *feels*: g-load buildup, chest-crushing acceleration, the
   physiological limits and blackout thresholds. This is what drives the *g-meter, vignette/graying
   effect, breathing/HUD cues, and the "intensity"* of the sim.

> **Note on download:** The PDFs below live on NASA NTRS (public domain, freely downloadable) and
> arXiv (open access). They could **not** be auto-downloaded in this build session because the
> sandbox network policy blocks outbound web egress. Grab them from the direct links from any
> normal network, or re-run this from a session with open egress. All NTRS documents are U.S.
> Government works and free to redistribute.

---

## Part 1 — Rocket ascent, "breaking gravity," and trajectory (the vehicle)

### 1. Launch Vehicle Ascent Trajectory Simulation Using POST2 (AAS 17-274)
- **Source (PDF):** https://ntrs.nasa.gov/api/citations/20170001620/downloads/20170001620.pdf
- **Publisher:** NASA Technical Reports Server (NTRS), 2017
- **Why it's the best starting point:** POST2 (Program to Optimize Simulated Trajectories II) is
  NASA's 40+ year-old workhorse for simulating a launch vehicle from **liftoff through ascent to
  orbit**. The report walks through the actual models — liftoff, pitch-over, atmospheric flight,
  and orbit insertion — that you'd reimplement (in simplified form) for a sim's flight profile.
- **Use in the sim:** blueprint for the phase timeline (vertical rise → pitchover → gravity turn →
  MECO → coast/insertion) and for what state variables to track (mass, thrust, altitude, velocity,
  dynamic pressure "max-Q").

### 2. End-To-End Simulation of Launch Vehicle Trajectories Including Stage Separation Dynamics
- **Source (PDF):** https://ntrs.nasa.gov/api/citations/20120014503/downloads/20120014503.pdf
- **Publisher:** NASA Technical Reports Server (NTRS), 2012
- **What it covers:** A full mission simulation — lift-off, through **stage separation**, orbiter
  ascent to orbit, and booster glide-back. Good for modeling the dramatic "stage sep" beat that
  players feel (thrust drop-out, jolt, then re-ignition).
- **Use in the sim:** the discrete events (booster sep, fairing jettison) that create the punchy,
  physical moments during the climb.

### 3. Atmospheric Ascent Guidance for Rocket-Powered Launch Vehicles
- **Source (PDF):** https://ntrs.nasa.gov/api/citations/20030000844/downloads/20030000844.pdf
- **Publisher:** NASA Technical Reports Server (NTRS), 2003
- **What it covers:** The guidance algorithm that steers a rocket from vertical-rise completion
  through main-engine cutoff, solving the ascent as an optimal-control problem. Explains *why* the
  vehicle pitches and how the powered flight is shaped.
- **Use in the sim:** the "why the rocket leans over instead of going straight up" answer, and a
  reference if you ever want an autopilot/guidance line drawn on the HUD.

### 4. Convex Optimization of Launch Vehicle Ascent Trajectory (with heat-flux & splash-down constraints)
- **Source (PDF):** https://arxiv.org/pdf/2008.13239
- **Publisher:** arXiv (open access), 2020
- **What it covers:** Modern, readable treatment of the **gravity-turn ascent** as a trajectory
  optimization problem, with the equations of motion for a rocket climbing through the atmosphere.
- **Use in the sim:** the actual math (gravity losses, angle-of-attack losses, thrust vs. gravity)
  behind "breaking gravity." Even a stripped-down 2-D integration of these EOM gives a believable
  ascent curve.

**Core physics cheat-sheet for the ascent (well-established, for the sim's numbers):**
- **Escape velocity from Earth's surface:** ~**11.2 km/s** (~25,000 mph) — the "breaking gravity" number.
- **Orbital velocity for low Earth orbit:** ~**7.8 km/s**.
- **Tsiolkovsky rocket equation:** `Δv = v_e · ln(m0 / mf)` — thrust vs. mass ratio; why staging matters.
- **Gravity turn:** short vertical rise to clear the tower → programmed *pitchover* → a zero-lift,
  near-zero-angle-of-attack curve where gravity itself rotates the velocity vector toward horizontal.
- **Max-Q** (peak aerodynamic pressure) ~60–90 s in: the point of maximum structural stress /
  strongest shaking — a great "intensity" beat for the sim.

---

## Part 2 — What the crew feels: g-forces and human limits (the "intensity")

### 5. Issues on Human Acceleration Tolerance After Long-Duration Space Flights
- **Source (PDF):** https://ntrs.nasa.gov/api/citations/19930020462/downloads/19930020462.pdf
- **Publisher:** NASA Technical Reports Server (NTRS), 1993
- **What it covers:** Review of human tolerance to sustained acceleration, how it degrades after
  time in microgravity, and the countermeasures (anti-G suits, straining maneuvers, exercise).
- **Use in the sim:** grounds the g-meter and the "graying-out" thresholds in real physiology;
  supports difficulty/health mechanics if you add them.

### 6. Objective Measurement of Human Tolerance to +Gz Acceleration Stress
- **Source (PDF):** https://ntrs.nasa.gov/api/citations/19800010433/downloads/19800010433.pdf
- **Publisher:** NASA Technical Reports Server (NTRS), 1980
- **What it covers:** Centrifuge measurements of the eye-level blood-flow cessation that precedes
  visual blackout (grayout → blackout → G-LOC), quantifying the onset timing.
- **Use in the sim:** the timing/curve for a **vignette + desaturation "grayout" screen effect**
  as sustained g climbs — the single most immersive cue for "the intensity of going to space."

**G-load cheat-sheet for the crew experience (well-established, for the sim's numbers):**
- **Typical crewed launch:** peaks around **3–4 g** (Shuttle/SLS-class, gentle by design).
- **Emergency / ballistic re-entry (e.g. Soyuz):** up to ~**8 g**.
- **G-LOC (G-induced Loss Of Consciousness):** blood drains from the brain faster than the heart can
  compensate → tunnel vision → grayout → blackout → loss of consciousness.
- **Direction matters:** eyeballs-in (`+Gx`, lying back — how astronauts launch) is tolerated far
  better than eyeballs-down (`+Gz`, sitting upright) — which is exactly why crews launch reclined.
- **Countermeasures:** anti-G suit + anti-G straining maneuver (tensing legs/abdomen + timed breathing).

---

## Suggested minimal sim slice (a concrete "starting point")
1. **Phase timeline** from Papers 1–2: `Ignition → Liftoff → Pitchover → Gravity turn → Max-Q →
   Booster sep → MECO → Coast/Insertion`.
2. **A g-curve** driving a **g-meter HUD** + **screen grayout/vignette** as g rises past ~4–5,
   calibrated with Papers 5–6.
3. **Camera shake** peaking at liftoff and **Max-Q**, easing in the thin upper atmosphere.
4. **Altitude/velocity readouts** integrating the simple ascent EOM from Paper 4, with the
   **11.2 km/s escape / 7.8 km/s orbit** markers as the "breaking gravity" goalposts.

---

*Compiled as a research starting point for the space-sim astronaut-rocket feature. All linked PDFs
are freely available from NASA NTRS (public domain) and arXiv (open access); download them from an
unrestricted network to add the full-text papers to the DataPilot `Space` library.*
