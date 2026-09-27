# Roadmap and release gates

## Current candidate

The implementation work targets a 20-minute survival round with contestable team depots,
first-person play, readable stylized-realism art and PC/mobile/controller input. The canonical
source is this repository. The earlier Desktop checkout is retained as a historical reference.

Server policy regressions run in a deterministic adapter harness. Compilation, translation-key
validation and generated-place checks cover additional static requirements. None of these are
a substitute for an observed full round, real-device frame-time measurements or live persistence
testing. The candidate must not be described as fully release-ready while these gates remain open.

## Gate 1: one dependable complete round

- Complete Scavenge → Conflict → Raid → Extraction and two consecutive resets with two clients.
- Confirm first-person camera, menu focus, tool feedback and tutorial behavior after respawn.
- Verify every depot operation, capacity, carry limit, hold interruption and raid restriction.
- Reproduce regression cases for repeated eliminations, stale resource timers and blocked drones.
- Confirm late entrants can act during every active phase and do not receive free objective cores.
- Prove data-session ownership, failed-load handling and departure/shutdown saves in a separate
  private test experience. Simulated DataStore tests alone do not complete this gate.

## Gate 2: a visual standard and an enjoyable loop

- Review a representative route containing terrain, cover, a resource, a monument and a camp
  using identical camera and graphics settings before/after changes.
- Approve readable lighting, object scale, materials, silhouettes and restrained color accents.
- Observe new players without explaining controls aloud: record first resource, craft, build,
  deposit, fight and extraction.
- Test 20-minute pacing and whether depot defense/theft gives construction a useful role.
- Evaluate combat, gathering and damage feedback with motion reduction enabled.
- Keep the initial asset budget at zero. The four original mesh models were uploaded successfully
  and observed with their colors in the Studio editor. Verify the saved library in the playable
  game: placement, materials, collision, gathering/respawn and consecutive round resets.

## Gate 3: multiplayer and target devices

- Run sessions with 2, 6, 12 and 24 participants; distinguish test clients from real players.
- Test at 36 structures/player, 120/team and 480/server with NPCs, firing and resource respawns.
- Measure initial loading, frame-time percentiles, memory, network traffic and server work.
- Test named Windows/Mac machines, minimum Android hardware, iOS devices and every console family
  actually selected for launch. Studio emulation does not demonstrate hardware performance.
- Repeat after multiple match resets and sustained mobile play to detect accumulation and heat.
- Check six languages, long text, safe areas and complete controller-only navigation.

A 60 FPS target corresponds to about 16.7 ms/frame; 30 FPS corresponds to about 33.3 ms/frame.
These are target budgets, not measurements of this game. Minimum hardware, memory/network budgets
and observed performance must be recorded in the [test plan](TEST_PLAN.md).

## Gate 4: private candidate review and publication decision

- Capture reproducible evidence for all required functional and device tests.
- Review localization in context, onboarding clarity and the final visual candidate with the owner.
- Review the experience's current maturity/access configuration and supported-device declarations.
- Verify delivery of the existing mesh/texture asset IDs to clients in private staging; a successful
  account upload and local authoring-place inspection do not establish staging availability.
- Record asset provenance, build identity, change notes, remaining limitations and a rollback build.
- Publish only the exact candidate approved by the owner after the required gates pass.

A push to the source repository does not publish the Roblox experience. A locally generated
place is not evidence that the live experience runs that version.

## After the initial release

Prioritize improvements demonstrated by playtest evidence: party formation, matchmaking and
cross-server reconnect routing; more objective/event variation; original mesh/animation/audio
passes; measured quality tiers; cosmetics and progression that preserve competitive fairness.

Vehicles, complex electricity, agriculture, trading, clans and persistent weekly worlds remain
outside the initial scope. They should not delay making the current loop reliable and enjoyable.
