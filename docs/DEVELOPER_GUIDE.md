# WAR WORLD — Developer Guide

Updated: 2026-09-27. This guide describes the current implementation candidate. The full check
pipeline has passed; this is not a release certificate or a claim that runtime acceptance passed.

## 1. Canonical source and history

This repository is the canonical, runnable project in the owner's Documents/WAR WORLD folder.
The earlier Desktop/worldwar history was imported; its reviewed baseline is commit
`b1986f7`. The Desktop checkout remains an untouched historical reference, not a second active
development folder. Source, build tooling and English documentation now live together here.

Implementation of the audit corrections and the 20-minute/depot design was approved. The working
branch is `codex/release-ready`; the configured origin is `Riccardo-RG/Roblox-war`, which was empty
when selected. A configured remote is not evidence that a push has completed. A source push is
also separate from publishing the Roblox experience.

Preserve unrelated changes and unsaved Studio work. Record the source commit, any uncommitted
changes, and the generated build timestamp for every test.

## 2. Stack and repository layout

Use Node.js 22 or newer, Roblox Studio and compatible Rojo CLI/plugin versions (the project
baseline is Rojo 7.6 or newer). TypeScript is compiled to Luau with roblox-ts. Keep the committed
package lockfile unless a dependency change is intentional and reviewed.

| Location                                                  | Responsibility                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| [src/server/main.server.ts](../src/server/main.server.ts) | Composition, player lifecycle, network dispatch and round resets            |
| [src/server/services](../src/server/services)             | Authoritative inventory, damage, building, objectives, NPCs and persistence |
| [src/server/world](../src/server/world)                   | Original environment generation, terrain, routes and shared anchors         |
| [src/client/controllers](../src/client/controllers)       | First-person camera, input context, aiming, preview and feedback            |
| [src/client/ui](../src/client/ui)                         | Responsive HUD, guide, menus and state-aware onboarding                     |
| [src/shared/catalog](../src/shared/catalog)               | Items, recipes, build definitions, durations and limits                     |
| [src/shared/localization](../src/shared/localization)     | Typed messages and six-language translations                                |
| [src/shared/network](../src/shared/network)               | Client/server request and event protocol                                    |
| [src/shared/util](../src/shared/util)                     | Small testable geometry, authority and persistence policies                 |
| [scripts](../scripts)                                     | Validators, deterministic regression harness and original asset generators  |
| [assets/original/world-kit](../assets/original/world-kit) | Original mesh sources, provenance and saved Studio library workflow         |
| [default.project.json](../default.project.json)           | Rojo mapping and place configuration                                        |
| build/WarWorld.rbxlx                                      | Generated candidate place; not the authoritative source                     |

Never grant damage, resources, score or construction success on the client. A preview is advisory;
the server checks life state, phase, ownership, inventory, rate and relevant geometry.

## 3. Validation and build commands

Run commands from this repository's root, with the intended Node runtime on PATH.

```sh
npm ci
npm run check
```

Use `npm ci` when dependencies need to be installed from the lockfile. The full check pipeline
runs compilation, formatting, localization validation, deterministic policy tests, Rojo sourcemap
generation, project validation and place generation. It can write out and build files.

For focused checks:

```sh
npm run validate
npm run validate:localization
npm run format:check
npm run test:server
```

To compile and regenerate a place separately:

```sh
npm run build
npm run rojo:build
```

Both `build` and `typecheck` invoke rbxtsc and generate compiler output. `npm run format`
rewrites files; prefer a scoped formatter invocation during parallel work. Do not run competing
compilers, Rojo servers or broad formatters in the same checkout.

The deterministic harness has passed 36 scenarios during this implementation pass. It transpiles
the actual TypeScript services and selected client policies into a Node VM with explicit Roblox
adapters. It checks meaningful state transitions, but does not reproduce Roblox scheduling,
physics, pathfinding, rendering, controller hardware, network latency or the live DataStore
service. The full check pipeline passed on 2026-09-27 with Node 24 and Rojo 7.6.1: compilation,
formatting, 183 localization keys in six languages, 36 VM scenarios, 37 required project files,
sourcemap and generated place. Device/runtime gates remain open; record the exact source/build
and rerun after material changes.

## 4. One Studio session, one known build

Choose one workflow per test and identify its active source/build. Reuse the existing Studio
application/window; do not repeatedly launch new Studio instances.

### Generated place

1. Compile and generate the place from this checkout.
2. Stop an active Play session before switching builds. Resolve any unsaved work with the owner.
3. Open the exact build/WarWorld.rbxlx from Studio. AutoSaves and .lock files are not the candidate.
4. Record the source identity and start Play. The world is generated at server startup; an empty
   edit viewport alone does not establish a missing or broken game.
5. Capture Output errors and relevant visual/test evidence. Do not overwrite the source place
   with a temporary runtime world without an explicit authoring plan.

### Live synchronization

Run the existing scripts in separate terminals only if corresponding processes are not already
running:

```sh
npm run watch
```

```sh
npm run rojo:serve
```

Connect the existing Studio Rojo plugin to the address printed by the server, normally
localhost:34872. Verify the mapping before accepting synchronization. Live sync does not publish
the experience and does not prove that a different open place contains the same candidate.

## 5. Environment ownership and zero-budget assets

The bootstrap now recreates disposable Workspace.World.GeneratedWorld and retains
Workspace.World.Environment and Workspace.World.AuthoredEnvironment. Dynamic resources, spawns,
builds and NPCs belong to generated state; authored scenery must not be stored there.

The procedural art pipeline produces terrain, coastline, moderate elevation, routes, landmarks
and scenery from shared anchors. When the environment needs creation, the generator can also
rebuild Terrain. An AuthoredEnvironment attribute named UseAuthoredTerrain set to true opts out
of generated terrain. Test that boundary with a disposable authored scene before relying on it.
The procedural surface/placement fallbacks still assume the documented island layout.

Original mesh sources and the import/export workflow are in
[assets/original/world-kit](../assets/original/world-kit/README.md). On 2026-09-27, the authorized
combined `WorldArtLibrary.glb` upload succeeded under `Xriccard0xxxfire`, with all four colored
models visible in the editor of the saved `build/WarWorldArt.rbxlx` authoring place. The saved
place contains 12 MeshParts with real mesh IDs and shared texture `96332452588684`.
`ServerStorage.WorldArtLibrary` has four direct-child templates: `CoastalPine` (5 parts),
`CoastalRock` (2), `SupplyCrate` (3) and `ScrapPile` (2), all anchored with Automatic
RenderFidelity and Hull CollisionFidelity. These settings are recorded configuration, not a
collision or performance acceptance result. Reuse the asset IDs; do not upload them again merely
to rebuild. In-game integration, private-staging delivery, multiplayer and device checks remain
pending; the game is unpublished. The initial asset budget is zero; do not buy assets.
Any future third-party free asset needs license, provenance, script/dependency and performance
review before adoption.

Keep collision, cover and critical silhouettes consistent across quality settings. Art instance
budgets are implementation limits, not measured frame-rate guarantees. Confirm authored content
survives both server initialization and consecutive round resets.

## 6. Controls and launch requirements

See [Studio setup and controls](ROBLOX_STUDIO.md) for the full control table. Current essentials:

- Keyboard: WASD, Space, 1–4 modes, F or primary click for action, V for Kit, T for Guide,
  R to rotate, B to repair, and held Alt/Option for the menu cursor.
- Controller: sticks move/aim, primary face button jumps, shoulders cycle modes, right trigger
  acts, left-stick press opens Kit, top face button rotates, and D-pad Down repairs.
- Within controller menus: D-pad chooses controls, the primary face button confirms, the cancel
  face button returns/closes, and the right stick scrolls the current page. Prompts use the
  connected device's button names where available.
- Touch: native movement/jump, drag aiming, mode buttons, ACTION, a Build-only ROTATE button,
  repair, Kit and Guide controls.

These are implemented bindings, not a signed-off controller/touch playtest. Verify every action,
menu, focus transition and safe area on the launch devices. Weapon-motion preference is
session-only; camera shake is disabled. Standard Roblox graphics settings remain available.

## 7. Change and evidence workflow

1. Reference an audit finding ID or approved feature in [the review](PRE_RELEASE_REVIEW.md).
2. Define expected behavior and a regression scenario before editing.
3. Keep code, assets and dependency changes scoped, with server authority intact.
4. Run focused checks, then one coordinated full build. Preserve actual failures and logs.
5. Update English rules, controls, architecture and limitations in the same change.
6. Record comparable screenshots and device measurements for visual/performance work.
7. Execute the applicable [test plan](TEST_PLAN.md) scenarios, including private live-service tests.
8. Prepare a versioned candidate/rollback and obtain approval for the exact public release.

The historical baseline checks are not current-candidate evidence. A clean build, a generated
place or passing VM tests alone cannot close the release gates.
