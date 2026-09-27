# WAR WORLD — Pre-release Review and Implementation Status

Updated: 2026-09-27. Historical audit baseline: commit `b1986f7`
(`fix: sharpen visuals and first-person controls`).
Current status: approved corrections integrated in the working candidate; full check passed.
Visual, multiplayer/live-service and launch-device acceptance remain open.

## Executive assessment

The core idea remains promising: gather supplies, protect team energy, build useful cover, raid
rivals and extract before a self-contained round ends. The new depot objective gives bases
something meaningful to protect, linking construction, raiding and winning more clearly than
the original prototype. Whether the loop is enjoyable, balanced or commercially successful
still requires uncoached player tests; source inspection cannot establish those outcomes.

The owner approved the audit corrections, 20-minute pacing, team depots, readable stylized realism,
PC/mobile/console launch, zero initial asset spending and English technical documentation.
These decisions are no longer awaiting approval. The project is not yet certified release-ready.

## 1. Source location and evidence history

The canonical runnable source is this repository in Documents/WAR WORLD. The earlier
Desktop/worldwar history was imported and the Desktop copy is retained untouched as a historical
reference. Source, build tooling and these documents now share one repository. The implementation
branch is `codex/release-ready`; origin is `Riccardo-RG/Roblox-war`, initially empty. This is not a
claim that a push or Roblox publication has occurred.

The original read-only audit performed these checks against b1986f7:

| Historical baseline check     | Result | Evidence scope                                   |
| ----------------------------- | ------ | ------------------------------------------------ |
| npm run validate              | Passed | 30 required files and core project configuration |
| npm run validate:localization | Passed | 124 keys across six languages at that baseline   |
| npm run format:check          | Passed | Formatting of the baseline                       |
| git status --short            | Clean  | The initial audit did not alter game source      |

Those counts and passes do not certify the changed candidate. The current implementation has
36 passing deterministic Node VM scenarios covering actual server services and selected client
policies. The integrated full check passed with Node 24 and Rojo 7.6.1: compilation, formatting,
183 localization keys in six languages, 36 scenarios, 37 required files, Rojo sourcemap and place
generation. Record the exact source/build and rerun after material changes. Roblox rendering,
live-service behavior and launch-device acceptance still need their own recorded evidence.
Screenshots from previous builds are not proof of the currently loaded version.

## 2. Current approved rules

The six teams of four players remain. Production phases are now Scavenge 4 minutes, Conflict
6, Raid 6 and Extraction 4, followed by a 15-second intermission. Studio uses 90/90/90/60 seconds.
All active phases allow backfill when a team slot is available; same-server reconnect reservations
are best-effort, not guaranteed cross-server matchmaking.

The team depot is implemented with a capacity of 24 energy cores. Players carry at most 3.
Friendly deposits take 1 second before Extraction; during Extraction, teammates can withdraw
up to 3 for delivery. Rival theft takes 6 seconds during Raid or Extraction, transfers at most
2 and leaves at least 1 core in the depot. Interrupted/damaged holds cannot complete a transfer.

Extraction requires 8 continuous seconds alive inside the zone without damage. Each delivered
core grants 100 team score, 100 XP and 25 credits, keeping the objective more valuable than an
elimination (10 score, 20 XP, 4 credits) or drone (2 score, 10 XP, 1 credit). These values are
implemented test hypotheses, not proven optimal balance. See [game design](GAME_DESIGN.md).

## 3. Visual direction and production changes

### Historical limitations

The baseline used a large flat plane, primitive trees/rocks/buildings and a basic first-person
tool. It relied heavily on lighting adjustments without a mature asset/level workflow.
Generated content and Terrain could replace manual edits placed in the wrong hierarchy.
These observations explain the audit's art priority; they are not a description of all current
geometry.

### Current implementation and remaining work

The working art pass introduces an island/coastline, moderate terrain relief, readable paths,
shared six-camp anchors, industrial landmarks, restrained lighting and a coherent original
environment kit. Bright accents are reserved for readable gameplay cues rather than coating
the whole scene. Gameplay cover and building areas must remain practical and consistent.

[World bootstrap](../src/server/services/world-bootstrap-service.ts) separates disposable
GeneratedWorld from retained Environment/AuthoredEnvironment. Authored terrain requires its
explicit opt-out attribute; see the [developer guide](DEVELOPER_GUIDE.md) before manual editing.
The [world layout](../src/server/world/world-layout.ts) aligns terrain, protected routes and camps.

Original mesh sources, provenance and the saved-library workflow are in
[the world kit](../assets/original/world-kit/README.md). On 2026-09-27, the authorized combined
`WorldArtLibrary.glb` upload succeeded under `Xriccard0xxxfire`. All four colored models were
observed in the Studio editor, beyond the import preview. The saved authoring place contains
12 MeshParts with mesh asset IDs, shared texture `96332452588684`, and four templates under
`ServerStorage.WorldArtLibrary`. This supersedes the earlier HTTP 401 attempt; authentication is
not the current blocker. Final in-game appearance, collision, round-reset behavior, private-staging
asset delivery and device performance remain unverified; the game is unpublished.
Source geometry is not a substitute for an observed finished scene. The initial budget remains
zero; external free assets still need licensing, provenance and embedded-script review.

The next visual acceptance milestone remains one representative camp → resource cluster →
landmark → cover → extraction route, compared under fixed camera/quality settings. Owner approval
and real-device measurements are still required. Avoid glare, unreadable shadows, noisy ground
textures, excessive foliage detail and effects obscuring the first-person target.

## 4. Audit findings: preserved IDs and current implementation

P1 denotes a public-release blocker in the original audit; P2 denotes a required correction or
explicit scope decision. Historical source conditions below refer to b1986f7. “Implemented”
means corresponding code is present, not that the Roblox regression scenario has passed.
Finding IDs are retained so runtime evidence can close the original issues without losing history.

| ID         | Priority | Historical finding                                                         | Implemented correction and remaining acceptance                                                                                                                                                                                                                                                        |
| ---------- | -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| COM-01     | P1       | Already-dead hit targets could repeatedly award elimination rewards        | Live-state checks and one reward per victim Humanoid. Actual-service VM scenario passes; test real death/respawn and replicated hits. [Combat](../src/server/services/combat-service.ts)                                                                                                               |
| DATA-01    | P1       | Saves ignored stored ownership and could overwrite a newer session         | Atomic profile leases, ordered per-user operations, write IDs, safe migration and no persistent blank fallback after failed load. VM concurrency/failure cases pass; live cross-server/shutdown tests remain. [Profiles](../src/server/services/profile-store-service.ts)                              |
| AUTH-01    | P1       | Client-origin tolerance and horizontal-only distance allowed geometry gaps | Blaster ray begins at server head; relevant interactions check live state, finite values, 3D range and visibility. VM combat/resource cases pass; latency/adversarial Roblox cases remain. [Combat](../src/server/services/combat-service.ts), [resources](../src/server/services/resource-service.ts) |
| NPC-01     | P1       | Drones moved and attacked without meaningful obstacle checks               | Swept collision, throttled path requests, vertical range, attack windup and final LOS/life checks. VM blocked-movement/windup cases pass; actual pathfinding and terrain tests remain. [NPCs](../src/server/services/npc-service.ts)                                                                   |
| AIM-01     | P1       | Cursor-derived actions disagreed with the viewport-center shot ray         | Unified center aiming and first-person interaction flow. Target alignment, camera transitions and latency require runtime confirmation. [Game controller](../src/client/controllers/game-controller.ts)                                                                                                |
| UI-01      | P1       | Scaling the full HUD could displace anchors and crosshair                  | Responsive panels, central aim indicator and modal Kit workflow. Safe areas, text size and every launch viewport remain to be checked. [UI](../src/client/ui/ui-controller.ts)                                                                                                                         |
| JOIN-01    | P1       | Backfill closed early, leaving long non-playable waits                     | Backfill throughout active phases, revised 20-minute timing and best-effort reconnect handling. Test phase boundaries, full teams and departures. [Match](../src/server/services/match-service.ts), [teams](../src/server/services/team-service.ts)                                                    |
| BUILD-01   | P2       | Spawn/extraction blocking and cumulative structure quota                   | Protected routes, support/overlap/LOS validation and live caps of 36/player, 120/team and 480/server. Runtime placement, destruction and rebuilding remain open. [Building](../src/server/services/building-service.ts)                                                                                |
| MAP-01     | P2       | Six camps shared only four cardinal clearance definitions                  | One shared six-camp layout for protected areas, starter supplies, art and routes. Walk every spawn/exit on generated and authored geometry. [Layout](../src/server/world/world-layout.ts)                                                                                                              |
| INPUT-01   | P1       | Incomplete mouse focus handling, controller menus and touch rotation       | Input-context precedence, focus reset, controller menu navigation/scrolling, touch rotation and input-specific prompts. Pure policy tests pass; physical devices and system menus still need tests. [Input policy](../src/client/controllers/input-policy.ts)                                          |
| BUILD-02   | P2       | Preview did not distinguish invalid placements                             | Client validity feedback reflects available placement checks while the server stays authoritative. Compare preview/acceptance across slopes, obstacles and insufficient materials. [Game controller](../src/client/controllers/game-controller.ts)                                                     |
| ONBOARD-01 | P2       | Static guide did not track actual progress or next achievable task         | State-aware next-action policy with phase priority, resources, recipes and progress counters. Pure policy cases pass; uncoached first-time usability remains open. [Onboarding](../src/client/ui/onboarding-policy.ts)                                                                                 |
| LOC-01     | P2       | A locale change left current mode text stale                               | Locale refresh updates current UI and mode text. Key/placeholder checks do not replace human language and layout review. [UI](../src/client/ui/ui-controller.ts)                                                                                                                                       |
| LOC-02     | P1       | Translation-table timeout could abort client startup                       | Readable local fallback and late attachment of replicated localization. Test delayed/missing table and live locale changes. [Localizer](../src/client/localization/localizer.ts)                                                                                                                       |

New depot and extraction behavior is also covered by VM scenarios for early release, damage,
phase restrictions, capacity/carry conservation, interrupted extraction and idempotent consumption.
These supplement the historical audit; they do not make the new gameplay exempt from Roblox tests.

## 5. Gameplay evaluation priorities

The previously proposed team depot and 4/6/6/4 timing are approved and implemented. Now test them:

1. Can a new player gather, craft, build and find the team depot without spoken coaching?
2. Does defending or raiding a depot affect the outcome enough to justify building?
3. Can a depleted or late-arriving team recover without receiving free objective cores?
4. Does the 8-second extraction window create understandable risk rather than unexplained failure?
5. Are solo/short-handed teams still useful, and does backfill preserve fair enough teams?
6. Do fictional weapons, readable damage cues and motion options suit the intended audience?

Avoid enlarging the first release with vehicles, electricity networks or many additional weapons
before these questions are answered. Commercial success cannot be promised from genre similarity.

## 6. Performance assessment

No actual FPS, memory, network or server-cost result is certified by this document.
The original audit's 80-builds-per-player and global-shot-fanout estimates are historical; they
must not be presented as current measured scene counts.

Current controls include live structure caps (36/player, 120/team, 480/server), explicit art
instance budgets, limited scenery density, throttled NPC navigation and distance-filtered shot
effects. Decorative parts are additional instances, so 480 structures is not a 480-part budget.
Streaming and budget constants do not themselves demonstrate acceptable performance.

Use repeatable 2/6/12/24-player tests with building, combat, NPC activity and successive resets.
Initial targets are 60 FPS on named PC/Mac and console reference devices, and stable 30 FPS on
the minimum phone. These are acceptance targets, not achieved results. Measure p95/p99 frame
time, memory, network rates, loading and sustained mobile behavior. See [the test plan](TEST_PLAN.md).

## 7. Delivery status and open release gates

| Area              | Current evidence                                                         | Still required                                                                     |
| ----------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Scope/source      | Canonical checkout, imported history and product decisions recorded      | Maintain one known candidate and portable documentation                            |
| Reliability       | Full check passed, including 36 deterministic VM scenarios               | Real multiplayer, persistence and failure recovery; rerun checks after changes     |
| Visual reference  | Original meshes uploaded; four colored models visible in Studio editor   | In-game integration, private-staging delivery, comparable route and owner approval |
| Cross-platform UX | First-person input, responsive Kit/Guide and locale handling implemented | Complete real-device touch/controller/keyboard loop and language review            |
| Closed alpha      | Test procedures defined                                                  | Uncoached testers and representative 2/6/12/24-player sessions                     |
| Public candidate  | Release gates documented                                                 | Asset/maturity/access review, observability, rollback and exact-build approval     |

Remaining owner input concerns the actual test hardware/console families, visual approval and
playtest findings—not approval of the already-accepted depot or source migration. Do not close
runtime findings on compilation alone. Update result records for the exact source/build tested,
then obtain approval to publish that candidate.
