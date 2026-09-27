# WAR WORLD — Pre-release Test Plan

Updated: 2026-09-27. Historical audit baseline: `b1986f7`. Test the canonical source in this
repository, not the archived Desktop checkout. Finding IDs are defined in
[the pre-release review](PRE_RELEASE_REVIEW.md).

## 1. Evidence policy and executed checks

Statuses: **Not run**, **Passed**, **Failed**, **Blocked**. Do not infer a runtime pass from
compilation, a screenshot, a deterministic adapter test or an unrelated scenario. Every Roblox
runtime scenario below remains **Not run** until its own result record is attached.

The integrated candidate's full `npm run check` passed on 2026-09-27 using Node 24 and Rojo 7.6.1:

| Check                               | Recorded result                | What it proves, and what it does not                                                |
| ----------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| roblox-ts compilation               | Passed                         | Source compiles to Luau; not proof of correct Roblox behavior                       |
| Formatting check                    | Passed                         | Repository formatting matches configured rules                                      |
| Localization validation             | Passed: 183 keys × 6 languages | Catalog/placeholder coverage; not human translation quality                         |
| Deterministic policy harness        | Passed: 36 scenarios           | Actual service/policy decisions under explicit adapters; not live platform fidelity |
| Project validation                  | Passed: 37 required files      | Required source/tooling and mapping conditions exist                                |
| Rojo sourcemap and place generation | Passed                         | A candidate build/WarWorld.rbxlx was generated; not a running/public experience     |

This result applies to the integrated source at that run. Record its commit plus uncommitted
changes/build timestamp in the release evidence; rerun after material changes. Earlier b1986f7
counts (30 files, 124 keys) are historical only.

The harness transpiles actual TypeScript combat, resource, profile, rate-limit, NPC, depot and
extraction services, plus input/onboarding policies. Its 36 scenarios cover session ownership,
failed loads, migration, ordered snapshots and stale/acknowledgement-lost saves; elimination
idempotence; authoritative shot origin; resource visibility/range/reset generations; drone
obstruction/windup decisions; depot holds, damage and conserved transfers; extraction timing and
idempotent reward; and client focus/onboarding priorities. It does not reproduce the Roblox
scheduler, physics, pathfinder, render pipeline, device controls, replication or live DataStore.

Use an isolated private test experience and dedicated test storage for persistence, invalid-input
and recovery tests. Do not corrupt production profiles or test another creator's game. Do not
silently enable data access, upload account assets or publish a test place publicly.

## 2. Required platform matrix

| Target                                   | Required inputs                            | Required evidence                                               | Status  |
| ---------------------------------------- | ------------------------------------------ | --------------------------------------------------------------- | ------- |
| Windows reference PC                     | Keyboard/mouse and controller              | Full loop, focus transitions, frame-time capture                | Not run |
| Reference Mac                            | Keyboard/trackpad, keyboard action binding | Full loop, first-person camera, menu cursor, frame-time capture | Not run |
| Minimum Android phone                    | Touch only                                 | Full loop, UI fit and sustained performance after warm-up       | Not run |
| Reference iPhone/iPad                    | Touch only                                 | Full loop, safe areas, menu fit and performance                 | Not run |
| Each console family declared for release | Controller only                            | Every gameplay action/menu, safe-area UI, performance           | Not run |

Record exact hardware, OS, resolution, quality, input device and network conditions. Minimum
hardware and supported console families still need to be named. Studio emulation checks layout,
not real-device performance. Missing hardware coverage is a release risk, never an assumed pass.

## 3. Current rule baseline for tests

- Public phases: Scavenge 4 minutes → Conflict 6 → Raid 6 → Extraction 4, then 15 seconds intermission.
- Studio phases: 90/90/90/60 seconds. Verify both configurations; fast Studio rounds do not prove
  20-minute pacing or longer-session stability.
- Six teams of four; backfill is available in all active phases when there is space.
- Live structure caps: 36 per player, 120 per team, 480 server-wide.
- Energy-core carry cap: 3; each team depot: 24.
- Friendly deposit: 1 second before Extraction. Friendly withdrawal during Extraction: up to 3.
- Enemy theft: 6 seconds during Raid/Extraction, up to 2 cores, leaving at least 1 in storage.
- Extraction: 8 seconds alive, inside the zone and uninterrupted by damage; each core is consumed
  once for 100 score, 100 XP and 25 credits.

The authoritative [configuration](../src/shared/catalog/match-config.ts) and
[game design](GAME_DESIGN.md) take precedence if a deliberate balance change is documented.

## 4. Functional regression scenarios

“VM coverage” identifies supporting automated evidence, not a passed Roblox runtime test.

| Test       | Procedure                                                                                                                | Acceptance criteria                                                                                                | Supporting VM coverage                                   | Runtime |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------- |
| COM-01     | Eliminate an enemy, keep firing at its remaining character; fire while dead; respawn and repeat                          | Exactly one reward per elimination, none for invalid life state; new life remains hittable                         | Passed                                                   | Not run |
| DATA-01    | In test-only storage, rapid cross-server rejoin, delayed save, failed load, lease loss and shutdown                      | No stale overwrite, failed load never writes a blank replacement, safe ownership release/recovery                  | Passed                                                   | Not run |
| AUTH-01    | Controlled invalid origins, NaN/large numbers, replayed sequences, impossible range, vertical separation and solid cover | Invalid requests grant no damage/inventory/score; legitimate nearby actions work                                   | Partial: combat/resources/policies                       | Not run |
| NPC-01     | Stand behind walls, inside shelter, on slopes and different elevations; move behind cover during attack windup           | No damage through cover; meaningful navigation, visible windup, no stalled or duplicated path loop                 | Passed decision cases; not real navigation               | Not run |
| AIM-01     | Shoot, gather and preview build against a small target before/after menu use on every input method                       | Crosshair, server ray and intended target align; menu clicks do not cause world actions                            | No rendering/aim integration coverage                    | Not run |
| UI-01      | Resize to small/wide viewports and test supported mobile orientations/safe areas                                         | Central crosshair; essential controls readable/reachable without covering targets                                  | No render coverage                                       | Not run |
| INPUT-01   | Open/close guide/system menus, focus chat, blur/refocus window and reconnect controller                                  | No firing while typing; correct cursor/camera return; no stuck held input                                          | Passed context policy                                    | Not run |
| INPUT-02   | Complete gather → craft → rotate/place → fight → depot → extract using only touch, then only controller                  | All actions/menus reachable without keyboard/mouse; prompts match device; right-stick menu scrolling works         | Policy only                                              | Not run |
| JOIN-01    | Join before/after each phase transition; disconnect/reconnect; fill a reserved team and all teams                        | No artificial long late-join lockout; capacity respected; reconnect fallback and inventory follow rules            | No cross-server/runtime coverage                         | Not run |
| BUILD-01   | Place near spawn, depot, extraction, routes and occupied geometry; hit every quota; destroy/rebuild                      | Protected paths remain open; no character intersection or unsupported floating build; quotas count live structures | No Roblox overlap/support coverage                       | Not run |
| BUILD-02   | Preview insufficient resources, range, obstacles, varied slopes and valid support                                        | Useful validity/rejection feedback; actual server approval remains authoritative                                   | No integrated preview coverage                           | Not run |
| MAP-01     | Walk all six camp exits and resource routes; compare terrain, landmarks and scenery placement                            | Every team can leave, gather and reach objectives; no terrain/scenery blockage                                     | No generated-geometry runtime coverage                   | Not run |
| ONBOARD-01 | Start with no guidance, then collect/craft/build/deposit; join directly into Extraction                                  | Next task is achievable, updates from real progress and prioritizes current objective                              | Passed policy/cost cases                                 | Not run |
| LOC-01     | Change language mid-round; inspect active mode, menu, prompts, counters and longest translations                         | All relevant text updates; no keys, broken placeholders or critical truncation                                     | Catalog validation, not rendered locale test             | Not run |
| LOC-02     | Delay/remove replicated translation table in a controlled test, then restore it                                          | Client starts with readable fallback and recovers without restart or assertion                                     | No replication/startup test                              | Not run |
| LIFE-01    | Die, respawn, spectate, finish a match, start next, open Kit during transitions                                          | First-person camera, input and inventory reset; no permanent loading/falling spawn                                 | Selected life-state policy cases only                    | Not run |
| RESET-01   | Run two full rounds with builds, depots, loot, NPCs and resource timers active                                           | Authored art survives, round state resets, no accumulating effects/tasks/connections                               | Resource generation invalidation only                    | Not run |
| DEPOT-01   | Release a hold early, take damage then heal, die, leave range, replace character and repeat trigger                      | No transfer on interrupted/invalid hold; legitimate completion transfers once                                      | Passed                                                   | Not run |
| DEPOT-02   | Try own/enemy prompts every phase, empty/full depot, carry cap, two simultaneous stealers                                | Correct phase/hold rules; depot ≤24, carry ≤3, enemy takes ≤2 and leaves ≥1; total cores conserved                 | Passed deterministic transfers; real concurrency pending | Not run |
| EXTRACT-01 | Enter with cores, leave before 8 seconds, take damage/heal, die, return, then stay valid                                 | Timer resets on interruption; only valid uninterrupted hold consumes/rewards cores exactly once                    | Passed                                                   | Not run |
| ECON-01    | Mix gathering, death drops, team transfers, theft and extraction across multiple players                                 | No core duplication/loss outside documented rules; depot/extraction score dominates repeat elimination farming     | Partial service scenarios                                | Not run |

For concurrency/failure injection, build controlled seams rather than waiting for accidental
outages. Preserve before/after records and logs. Test nominal flows as well as rejection paths.

## 5. Visual, comfort and onboarding acceptance

- Use a fixed route: camp → resource cluster → laboratory → combat cover → extraction.
- Capture matching viewpoints at low/high quality on the named devices. Record build identity.
- Distinguish resource types, teams, enemies, entrances and objectives without color alone.
- Reject blown-out whites, unreadable shadows, excessive neon, noisy grass and blurry text outlines.
- Confirm first-person tools remain readable without hiding the target or clipping excessively.
- Camera shake is disabled. Test weapon-motion on/off and preserve stable aiming in both states.
  The setting is session-only; do not expect persistence unless that feature is added.
- The ? Guide and Kit must open, close and reopen without trapping focus. On controller, D-pad
  selects, native confirm/cancel buttons operate controls, and the right stick scrolls pages.
- Observe first-time testers without coaching. Record time to gather, craft, build, deposit and
  extract, and each point where help was needed.
- Review all six locales in context: English, Italian, Spanish, Brazilian Portuguese, French,
  German. Key validation alone does not establish fluent or age-appropriate wording.
- Verify imported original meshes, materials, collision and LOD in the actual game. On 2026-09-27,
  the authorized combined `WorldArtLibrary.glb` upload succeeded under `Xriccard0xxxfire` and
  all four colored models were visible in the authoring-place editor, not only its import preview.
  The saved place has 12 MeshParts with mesh IDs, shared texture `96332452588684`, and four
  direct-child templates in `ServerStorage.WorldArtLibrary` (5/2/3/2 parts). Anchored,
  Automatic render and Hull collision settings are verified configuration, not runtime acceptance.
  Rebuild using the [saved-library workflow](../assets/original/world-kit/README.md), then test
  placement, gathering/respawn, round resets and multiplayer replication. Reuse the existing IDs;
  no repeat upload is needed. Asset delivery in private staging and real-device performance remain
  open; the game is unpublished.

## 6. Performance protocol

Initial targets: 60 FPS on named PC/Mac and console reference devices, stable 30 FPS on the
minimum phone. These are targets, not measured results or guarantees on arbitrary hardware.

1. Freeze the candidate; record source, build, hardware, quality, resolution and network.
2. Capture repeatable traversal after warm-up, then realistic building/combat.
3. Increase load through 2, 6, 12 and 24 participants; label simulated versus real-player load.
4. Exercise 36/player, 120/team and 480/server construction caps, plus simultaneous firing,
   NPC path requests, resource respawn, depot transfers and extraction.
5. Record median/p95/p99 frame time, hitches, client/server memory, instance counts, network rates,
   loading time and time to a controllable character. Include decorative children in counts.
6. Repeat after multiple round resets and sustained mobile play to reveal leaks/thermal throttling.
7. Compare identical settings against the previous measured build; keep profiler captures and
   explain quality/performance tradeoffs.

Frame-time budgets are approximately 16.7 ms at 60 FPS and 33.3 ms at 30 FPS. Spikes and sustained
behavior matter as well as averages. Establish memory/network/loading budgets from actual
measurements; none are currently validated. Standard Roblox quality settings are used; do not
assume a custom quality selector exists.

## 7. Test result record

Store captures with the result or link to an access-controlled location.

```text
Test ID:
Date / tester:
Source commit / uncommitted changes:
Build timestamp / private test place:
Device / OS / input:
Resolution / graphics setting / network:
Player count / match phase:
Preconditions and steps:
Expected result:
Observed result:
Status: Not run | Passed | Failed | Blocked
Logs / screenshot / video / profiler capture:
Related finding or fix:
Remaining limitations / follow-up:
```

## 8. Asset provenance and integration record

```text
Asset name / internal ID:
Creator and source (repository path for original work):
License / permitted use / attribution:
Acquisition cost: 0 (initial project constraint)
Source files / Roblox asset IDs:
Account upload authorization / upload status:
Embedded scripts and dependencies inspected:
Geometry / materials / textures / collision / LOD:
Devices and scenes tested:
Changes made:
Approval status:
```

Original source files do not establish successful account upload, acceptable engine rendering
or completed collision/performance checks. Keep those statuses separate.

## 9. Release sign-off

- [ ] All P1 findings resolved with reproducible Roblox runtime evidence.
- [ ] P2 findings resolved or explicitly accepted with scope and rationale.
- [ ] Full loop completed on all declared launch devices and input methods.
- [ ] Live persistence, reconnect, departure/shutdown, respawn and reset tests passed.
- [ ] Depot economy, extraction and 20-minute pacing validated by uncoached testers.
- [ ] Visual reference area and completed map approved by the owner.
- [ ] Performance targets met on named hardware under representative load.
- [ ] Localization, onboarding, comfort and safe-area review completed.
- [ ] Asset rights, upload authorization, dependencies and imported scripts reviewed.
- [ ] Current platform content/maturity, access and supported-device declarations reviewed.
- [ ] Useful error/gameplay telemetry, versioned candidate and rollback procedure prepared.
- [ ] Owner approves publication of this exact candidate.

The full build/VM pass is real supporting evidence, but no runtime or publication item is
automatically signed off by that pass or by the existence of this document.
