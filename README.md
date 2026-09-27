# WAR WORLD

A first-person Roblox PvPvE survival game built in TypeScript. Gather supplies, fortify a team
energy depot, contest rival camps and extract energy cores before a 20-minute round ends.
Combat uses stylized blasters and drones without graphic violence.

This repository is the canonical, runnable source checkout. The earlier Desktop checkout is
an archival reference; build and edit from this repository rather than maintaining two active
copies. The repository includes source, generated-place tooling and English technical documentation.

## Current development scope

- Six teams of up to four players, with late entry during every active match phase.
- Server-validated gathering, crafting, construction, combat, depot transfers and extraction.
- Team depots that make defense and raiding part of the objective loop.
- First-person input, contextual menus, onboarding and local visual settings for PC, touch and
  controller. Each launch platform still needs real-device acceptance testing.
- Original procedural terrain and imported environment meshes with a readable, stylized-realism direction.
- English, Italian, Spanish, Brazilian Portuguese, French and German localization.
- Persistent profiles with session ownership, expiring leases and ordered saves; unavailable
  APIs can use temporary profiles in Studio only.

The current work is a playtest checkpoint under validation, **not a runtime-certified public
release**. A single-session Studio smoke check reached the game and closed its initial guide into
the first-person view; the full gameplay loop remains untested. Compilation and simulated policy
tests do not establish frame rates, graphics quality,
controller usability, network behavior or live DataStore reliability.

## Requirements and build

Use Node.js 22 or newer, Roblox Studio and a compatible Rojo CLI/plugin (the project baseline
uses Rojo 7.6 or newer). Keep the committed package lockfile when installing dependencies.

```sh
npm ci
npm run check
```

The check pipeline compiles TypeScript to Luau, validates formatting and localization, exercises
server policies, validates the Rojo mapping and generates build/WarWorld.rbxlx. To run only the
deterministic server policy scenarios:

```sh
node scripts/test-server-policies.mjs
```

Open build/WarWorld.rbxlx from the **existing Roblox Studio window**, then start Play. The world
is generated when the server starts. Avoid AutoSave copies and .lock files when selecting the
candidate. Do not discard unsaved Studio work to replace a build.

For live development, run these in separate terminals from the repository root:

```sh
npm run watch
```

```sh
npm run rojo:serve
```

Connect the Studio Rojo plugin to the address printed by the CLI, normally localhost:34872.
Use either live sync or a known generated build for a test, and record which one is active.

## Documentation

- [Studio setup and controls](docs/ROBLOX_STUDIO.md)
- [Game rules and balance](docs/GAME_DESIGN.md)
- [Technical architecture and data ownership](docs/ARCHITETTURA.md)
- [Playable regression checklist](docs/PLAYTEST_CHECKLIST.md)
- [Cross-platform test plan and evidence record](docs/TEST_PLAN.md)
- [Localization workflow](docs/LOCALIZZAZIONE.md)
- [Remaining release gates and roadmap](docs/ROADMAP.md)
- [Pre-release analysis](docs/PRE_RELEASE_REVIEW.md)
- [Latest validation record](docs/TEST_RESULTS_2026-09-27.md)

The initial asset budget is zero. Current environment work is authored for this project; any
future free asset still needs provenance, licensing and embedded-script review. The four original
mesh models were uploaded successfully and observed with their colors in the Studio editor on
2026-09-27. See the [world kit](assets/original/world-kit/README.md) for the saved library workflow.
Imported trees were also visible in the initial game smoke check. Full in-game integration,
private-staging asset delivery and real-device acceptance still need testing.
