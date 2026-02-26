# Half-Atwood Machine Discovery Simulation

A no-build browser simulation for on-level physics classes studying unbalanced forces.

Students can:
- vary table mass and hanging mass,
- toggle friction on/off and change coefficient `mu`,
- run motion with custom initial velocity,
- view acceleration, tension, friction, and net force live,
- estimate time-to-distance from rest, and
- record comparison trials for class discussion.

The interface is styled in The Thinking Experiment dark/gold visual system and includes guided discovery prompts aligned to Unit 6 packet/exam patterns.

## Run locally

```bash
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000).

## Tests

```bash
npm test
```

## Main files

- `index.html` - simulation UI and guided tabs
- `styles.css` - dark gold design system and responsive layout
- `src/halfAtwoodApp.js` - UI state, animation loop, canvas rendering, table records
- `src/halfAtwoodPhysics.js` - frictionless/friction force and motion helpers
- `tests/halfAtwoodPhysics.test.js` - equation and friction behavior checks
