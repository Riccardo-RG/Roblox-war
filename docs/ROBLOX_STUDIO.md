# Roblox Studio setup and controls

The source is code-first: edit TypeScript in this repository, compile it with roblox-ts and use
Rojo to assemble or synchronize the place. Studio is still required to run Roblox physics,
rendering, avatars, networking and platform services.

## Open one known candidate

1. From this repository, run npm run check to generate the current candidate.
2. Reuse the existing Studio window. Resolve any unsaved work before switching places.
3. Use Studio's file-opening command to select build/WarWorld.rbxlx in this checkout.
4. Start Play and keep Output visible. The environment is generated when the server starts;
   a sparse editor viewport before Play is not by itself a startup failure.
5. Record the candidate commit/build timestamp and relevant client/server errors.

Do not select an AutoSave recovery file, a .lock file or an older Desktop build by accident.
Generating a new file does not update a previously opened place automatically. Stop the test and
reopen the known build, or deliberately use the live-sync workflow below. Do not repeatedly open
new Studio application sessions.

## Live development

Run one compiler watcher and one Rojo server from this repository, in separate terminals:

```sh
npm run watch
```

```sh
npm run rojo:serve
```

Connect the Studio Rojo plugin to the CLI-reported address, normally localhost:34872, and verify
the mapping before synchronization. Edit files in src, not the generated scripts shown in
Explorer. Stop Play before changing authored scene data or switching between different places.

## Controls

| Action                             | Keyboard / mouse                     | Controller            | Touch                       |
| ---------------------------------- | ------------------------------------ | --------------------- | --------------------------- |
| Move / jump                        | WASD / Space                         | Left stick / A        | Native joystick / jump      |
| Aim                                | Mouse or trackpad                    | Right stick           | Drag view                   |
| Select mode                        | 1 Gather, 2 Build, 3 Blaster, 4 Raid | LB / RB               | Mode buttons                |
| Use selected action                | Left click or F                      | RT                    | Action button               |
| Open kit menu                      | V                                    | L3                    | Kit button                  |
| Open guide                         | T or ? button                        | Guide tab in kit menu | ? button                    |
| Rotate construction                | R                                    | Y                     | Rotate button in Build mode |
| Use repair patch                   | B                                    | D-pad down            | Repair button               |
| Interact with depot / door / cache | Native E prompt                      | Native X prompt       | Native prompt               |
| Navigate menus                     | Pointer / buttons                    | D-pad and A           | Tap                         |
| Close menu / back                  | Menu close button or V               | B                     | Close button                |

Holding the action repeats gathering and blaster fire subject to server cooldowns. Alt/Option
temporarily releases the pointer on desktop; releasing it restores aiming. Menu navigation is
intended to work without holding Alt. F is a keyboard action alternative, but aiming still
requires a mouse, trackpad or another supported pointing input.

The kit menu contains Guide, Craft, Build and Settings. Selecting a construction closes the menu
to place it. Weapon motion can be disabled in Settings; camera shake is disabled. These settings
last for the current session. Graphics quality uses the standard Roblox control; there is no
separate custom quality selector.

These are implemented bindings, not proof of hardware compatibility. Verify them on actual
keyboard/trackpad, touch and controller devices, including respawn and focus changes.

## Multiplayer and diagnostics

Use Studio's local server/client test controls with at least two clients for PvP, ownership,
depot theft and reward tests. These are intentional test players, not duplicate editor sessions.
A Studio round lasts 5 minutes 30 seconds plus 15 seconds between rounds. Public timings are
20 minutes plus intermission.

Useful panels are Explorer, Properties and Output. Use the Developer Console and MicroProfiler
for timing/memory evidence. Device emulation checks layout and input assumptions, not actual
mobile GPU performance. Follow the [playtest checklist](PLAYTEST_CHECKLIST.md) and record results
using the [test plan](TEST_PLAN.md).

## Persistence and assets

Test persistence in a separate private experience with dedicated data. Enable Studio API access
only for that test experience when required. Without API access, Studio uses temporary profiles
that are never written into persistent records. A production session with unavailable/locked data
must not continue with a replacement blank persistent profile.

The initial asset budget is zero. Prefer original project assets; review provenance and embedded
scripts before any third-party import. On 2026-09-27, the original combined `WorldArtLibrary.glb`
was uploaded successfully under `Xriccard0xxxfire` and all four colored models were visible in the
editor of the saved `build/WarWorldArt.rbxlx` authoring place, not only in the import preview.
The saved library contains 12 MeshParts with Roblox mesh IDs and shared texture `96332452588684`.

Follow the [world-kit workflow](../assets/original/world-kit/README.md) to retain the imported
templates in the source-backed library and rebuild the game. Existing asset IDs do not need
another upload. Authoring-place inspection does not pass in-game rendering, collision, round-reset,
multiplayer or private-staging delivery checks; those and real-device tests remain open.
