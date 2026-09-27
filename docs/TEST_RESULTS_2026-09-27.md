# Validation record — 2026-09-27

## Candidate identity

- Repository: `Riccardo-RG/Roblox-war`.
- Branch: `codex/release-ready`, based on historical source commit `b1986f7`.
- This record covers the integration checkpoint on 2026-09-27, not a tagged release.
- Canonical source: the repository in `Documents/WAR WORLD`; the earlier Desktop checkout was preserved.
- Node.js 24.19.0; Rojo CLI 7.6.1; Studio log version 0.740.19.7400003 on macOS.
- Generated game place SHA-256 after original-mesh integration: `f582bb9d25671dc6a0ac95811fbd15ebd64a143d3d733e1814a84e8a6033c896`.

## Automated evidence

The final `npm run check` pipeline passed after the combined art-library export and validator
were added. `git diff --check` also passed.

| Check                          | Result                                  | Limitations                                                        |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------------ |
| TypeScript to Luau compilation | Passed                                  | Does not execute the Roblox engine                                 |
| Prettier                       | Passed                                  | Formatting only                                                    |
| Original art validation        | Four models and combined library passed | Offline geometry/material/binary checks, not Roblox asset delivery |
| Localization                   | 183 keys across six languages passed    | Does not certify translation quality or text layout                |
| Deterministic policy harness   | 36 scenarios passed                     | Real TypeScript services with simulated engine/DataStore adapters  |
| Project configuration          | 37 required files passed                | Structural checks, not runtime acceptance                          |
| Rojo sourcemap and place build | Passed                                  | Generated `build/WarWorld.rbxlx`; no public publication            |

The policy harness covers profile ownership, expired leases, migration, ordered and idempotent
saves, combat rewards and authoritative origin, resource range/visibility and reset generations,
NPC wall checks, depot transfer limits and interruption, timed extraction, input gating and
contextual onboarding. See [the test plan](TEST_PLAN.md) for the real-engine scenarios still required.

## Initial Studio art inspection and upload blocker (superseded)

The existing Studio window was reused with the local `build/WarWorldArt.rbxlx` authoring place.
This is a separate art-preview place, **not the playable game**. No additional Studio application
instance was intentionally launched during this integration step.

1. `CoastalPine.obj` loaded in the Import Preview, but its material colours were absent.
   No OBJ import was submitted.
2. The original exporter was extended with GLB/glTF, explicit normals and an embedded original
   colour palette. `CoastalPine.glb` visibly showed green foliage and a brown trunk in Studio's
   Import Preview. This confirms the preview only, not final gameplay appearance or performance.
3. The owner explicitly authorized uploading the original meshes through the account open in
   Studio. This authorization did not include publishing the game or selling the assets.
4. The authorized GLB import attempt failed. At `2026-09-27T19:12:29Z`, Studio logged HTTP 401
   and `User is not authenticated` for mesh/image upload requests. The import queue displayed a
   failed status. No successful asset IDs or integrated `WorldArtLibrary` were obtained.
5. Further upload attempts stopped pending account reauthentication by the owner. No credentials
   were extracted or changed, and no public experience was published.

After signing in again, import the verified combined library, inspect hierarchy/scale/collision,
save the resulting local model, connect its Rojo mapping and rerun the full pipeline. Do not claim
that an offline GLB validation or successful preview completes this integration.

## Follow-up fixes and earlier UI handoff (superseded)

The full check passed again after these bounded corrections:

- Round reset skips players whose profile/runtime state has not loaded yet.
- Shutdown drains profile operations already started by departed players, subject to the existing
  25-second deadline. A profile that loads during shutdown is released without spawning a character.
- Three additional actual-main-method adapter scenarios cover these boundaries (36 total).
- Client toasts render above the menu; prompt visibility uses a set and prunes streamed-out prompts;
  local viewmodels survive camera replacement; menu focus is assigned after revealing the page.
- The reactor energy pickup moved nine studs in front of the cooling stack to remove a calculated
  geometry intersection. Physical interaction still needs a Roblox runtime test.

The owner subsequently identified the current Studio account as `Xriccard0xxxfire` and supplied
its welcome-screen screenshot. The old Studio log records a logout at 19:28 UTC. The earlier
HTTP 401 is therefore **historical evidence**, not proof that the new session is unauthenticated.

The UI connection could not attach to the current Studio window: `noWindowsAvailable`, including
one connection reset. Further UI retries stopped to respect the owner's request to avoid wasteful
automation. No new upload was submitted with the newly identified session, and no gameplay pass
is claimed. The next manual step is to open the generated `build/WarWorld.rbxlx` through the
existing Studio session; do not open another Studio instance or substitute an AutoSave.

This current handoff supersedes earlier instructions to repeat login. Use the account the owner
has identified; do not request credentials or switch accounts.

A final read-only UI check subsequently reached a Studio dialog showing **"Accedi a Roblox"**
with empty username and password fields, rather than the owner's authenticated welcome screen.
No field was filled, no account was switched, and no import was retried. The automation surface
still cannot reach the intended authenticated project session. This is the same manual Studio
handoff blocker across three consecutive goal turns, despite the changing UI/error presentation.
Further automated retries stop here. The owner should bring the intended authenticated Studio
window forward and open `build/WarWorld.rbxlx` there before work resumes.

## Successful original-art import

The authenticated `Xriccard0xxxfire` welcome screen was subsequently reached by the UI control.
The owner opened `build/WarWorldArt.rbxlx` manually after the automated file-open dialog stalled.
In that same Studio session, the combined `WorldArtLibrary.glb` was imported successfully:

- Creator: Me; Upload to Roblox enabled; no package or playable experience publication.
- Import units: Stud; scale factor 1; 1,110 polygons; combined dimensions 30.66 × 24.40 × 21.79.
- The import queue displayed a green success status. All four coloured models appeared in the
  actual authoring viewport, beyond the earlier preview-only evidence.
- The saved local place contains 12 numeric MeshPart asset IDs and shared palette texture
  `rbxassetid://96332452588684`.
- Four template Models were cloned into `ServerStorage.WorldArtLibrary` as direct children.
  Their parts were anchored, with touching disabled, Automatic render fidelity and Hull collision
  fidelity set through Studio's command bar. The authoring place was saved locally.

Studio's output at 19:56:24 UTC confirmed the following bounding boxes (rounded to three decimals):

| Template    | MeshParts | Dimensions in studs      |
| ----------- | --------: | ------------------------ |
| CoastalPine |         5 | 15.282 × 23.848 × 13.089 |
| CoastalRock |         2 | 9.685 × 5.400 × 7.666    |
| SupplyCrate |         3 | 4.600 × 3.520 × 3.795    |
| ScrapPile   |         2 | 6.349 × 2.292 × 5.100    |

The source log is `0.740.19.7400003_20260927T192915Z_Studio_9dd89_last.log`. At 19:54:21 UTC,
the new palette briefly reported that its content representation was still being generated.
The later coloured editor viewport does not certify asset delivery to a fresh client or a private
staging experience. Those checks remain required. No account credentials were read or changed.

## Open acceptance gates

- Complete gameplay execution on the integrated build, including respawn and consecutive resets.
- Multi-client combat, depot contention, prompt event ordering and extraction under latency.
- Private staging DataStore contention, outages, reconnect and shutdown behaviour.
- Mobile and console input, safe areas and full match completion on real devices.
- Measured frame times, memory and networking at representative 2/6/12/24-player loads.
- Final visual review, asset permissions, localization review and owner publication approval.

The game is **not yet certified ready for publication**. This record is evidence of completed
checks and remaining acceptance gates, not release sign-off.

## Saved library and build integration

`scripts/export-studio-art.py` extracts the saved `ServerStorage.WorldArtLibrary` into
`assets/original/world-kit/WorldArtLibrary.rbxmx` with Python's standard XML parser. It validates
the exact template hierarchy, 5/2/3/2 MeshPart counts, anchors, Automatic render fidelity,
numeric asset IDs, internal instance references and referenced SharedStrings. It preserves
the serialized physics payloads rather than claiming to decode their collision settings.
The authoring place is not modified by this export.

The Rojo project now maps this library into ServerStorage, with a narrow Git ignore exception
for the exported model. Rebuilding does not upload the assets again. The generated game place
contains the same 12 mesh assets and shared palette, including preserved physics payloads.

The attempt to open the rebuilt game through the existing Studio window stalled in macOS's
Go to Folder dialog. Direct field entry did not advance it; one clipboard-based fallback ended
with `Timed out waiting for the application to read the clipboard`. Further UI retries stopped
in accordance with the owner's token-efficiency request. The imported authoring scene had
already been saved safely. At that point, no Play session of the integrated build had started.

The owner subsequently opened `build/WarWorld.rbxlx`. Resetting only the automation connection
then attached to the correct existing window; no further file opening was needed.

## First in-game smoke check and owner playtest handoff

The integrated game was started with Studio's single-session Test command in the existing window.
The initial Scavenge phase, running timer, inventory and health appeared. Terrain, camp structures
and the imported coloured tree models were visible. The survival guide opened automatically and
its Close button returned to the first-person game view with a centered crosshair.

This is a **partial startup/render smoke pass**, not a completed gameplay or performance test.
Gathering, crafting, construction, combat, depot transfers, extraction, respawn and multiplayer
were not exercised in this pass. No measured FPS or all-assets delivery guarantee is claimed.
Visual follow-ups include object/tool proportions, inventory contrast over the world, and
unnecessary decimal places in health and objective counters. Their causes still need verification.

On 2026-09-27, the owner requested pushing the current checkpoint and planned to playtest the next
day. This overrides the earlier instruction to wait for release readiness before pushing; it does
not authorize publication of the Roblox experience.

For that playtest:

1. Open `build/WarWorld.rbxlx` (not the separate `WarWorldArt.rbxlx` authoring scene) and start Test.
2. Close/reopen the guide with T or the ? button; confirm first-person aiming and readable scenery.
3. Move with WASD, jump with Space, aim with the mouse/trackpad. Use 1 to gather and F or left click
   for the selected action; V opens the Kit menu for crafting, building and settings.
4. Try gather → craft → build → fight → depot → extraction, then respawn and a round reset.
   Studio uses a shortened 5-minute-30-second round; this does not validate public 20-minute pacing.
5. Record screenshots, the action just taken, phase and any Output errors for each issue.

Nothing in this handoff marks the game ready for public release. Keep staging, multiplayer and
real-device acceptance gates open until their own evidence is recorded.
