# WAR WORLD — Review and Validation Index

Updated: 2026-09-27.

This repository now contains the canonical playable source, tooling and English documentation,
not a documentation-only workspace. The earlier Desktop/worldwar history was imported from the
reviewed baseline `b1986f7`; the Desktop checkout remains a historical reference.

## Start here

1. [Project README](../README.md): current scope, requirements and entry points.
2. [Pre-release review](PRE_RELEASE_REVIEW.md): historical finding IDs, approved changes and current validation gaps.
3. [Developer guide](DEVELOPER_GUIDE.md): source ownership, build workflow and safe Studio usage.
4. [Test plan](TEST_PLAN.md): behavioral regressions, device coverage, evidence records and release gates.
5. [Game design](GAME_DESIGN.md): current 20-minute rules, team depots, scoring and controls context.
6. [Roadmap](ROADMAP.md): remaining runtime, visual, performance and publication gates.
7. [Validation record — 2026-09-27](TEST_RESULTS_2026-09-27.md): completed checks, Studio import evidence and remaining runtime tests.

## Approved scope

- Readable, stylized realism with original or verified free assets; initial asset budget: zero.
- PC, mobile and console at launch, with real-device acceptance required.
- A 20-minute round and contestable team energy depots.
- All audit corrections and improvements, with technical documentation in English.
- Work toward a verified release candidate, then push the source; publication remains a separate
  approval for the exact candidate.

The active implementation branch is `codex/release-ready`. The configured origin is
`Riccardo-RG/Roblox-war`, initially empty; this document does not certify push or publication.

## Evidence boundary

The implementation includes security/persistence corrections, the depot loop, revised timing,
new terrain/art, first-person input and UX/localization changes. The deterministic Node VM harness
has passed 36 scenarios against actual TypeScript service/policy code using Roblox adapters.

The full check pipeline passed with Node 24 and Rojo 7.6.1: compilation, formatting, 183 keys in
six languages, 36 VM scenarios, 37 required files, sourcemap and generated place. On 2026-09-27,
the authorized combined `WorldArtLibrary.glb` upload succeeded in Studio under `Xriccard0xxxfire`.
All four colored models were visible in the editor; the saved authoring place contains 12 MeshParts
with mesh asset IDs, shared texture `96332452588684` and four library templates. The earlier
HTTP 401 and UI-attachment blockers are superseded, not reasons to repeat login or upload.
See the [world kit](../assets/original/world-kit/README.md) and
[validation record](TEST_RESULTS_2026-09-27.md) for the evidence and saved-library workflow.

A subsequent single-session Studio smoke check reached Scavenge, displayed terrain and imported
trees, and confirmed that the initial guide closes into the first-person view. Full gameplay,
all-model placement/collision, multiplayer/live-DataStore behavior, private-staging asset delivery
and real-device performance remain pending. The owner requested pushing this checkpoint for the
next day's playtest; the game remains unpublished.
No FPS, final visual quality or release readiness is certified here. Baseline static passes remain
historical evidence only, and every runtime scenario in the test plan needs its own result record.
