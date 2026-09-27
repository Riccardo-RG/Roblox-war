# Playtest checklist

This checklist records expected behavior, not completed tests. Runtime items remain **Not run**
until a tester records the candidate build, device, steps and observed result. Use the evidence
template in [TEST_PLAN.md](TEST_PLAN.md). Do not infer a runtime pass from compilation or the
deterministic service harness.

A Studio round is 90 seconds Scavenge, 90 Conflict, 90 Raid and 60 Extraction, followed by a
15-second intermission. Public phases are 4 / 6 / 6 / 4 minutes.

## Setup

- Generate a fresh candidate from this repository and use the existing Studio window.
- Record the source commit, uncommitted changes, build timestamp and workflow: file or Rojo sync.
- Start with two test clients; later repeat at 6, 12 and 24 participants.
- Keep server and client Output available. Capture unexpected errors and warnings.
- Use a separate private test experience for live persistence and adversarial requests.
- Check the [current control table](ROBLOX_STUDIO.md#controls) on each input device.

## Camera, menus and onboarding

- Spawn on the correct team camp and enter first-person view; repeat after elimination and reset.
- Open and close the guide through T, the ? icon and the controller-accessible Guide tab.
- Open Kit with V, L3 or touch. Navigate Guide/Craft/Build/Settings without a mouse on controller.
- Verify the pointer and camera capture after menu close, Alt/Option release, focus loss and resume.
- Holding the action gathers/fires at the intended rate; releasing it or opening a menu stops it.
- Disable weapon motion and confirm the first-person viewmodel remains steady. No camera shake.
- Check interaction prompts do not compete with repair controls: controller X interacts and
  D-pad down uses a patch.
- Check text, safe areas and usable targets on small mobile landscape and console viewing distance.
- Observe a new player without verbal instructions: record confusing controls or objectives.

## Scavenge and construction

- Gather each resource only while alive, within 16 studs in 3D and with a clear target.
- Attempt gathering through a wall and from another floor; no resources may be granted.
- Deplete a node and verify every decorative child disappears/restores consistently.
- Deplete just before a reset, deplete again after it, then allow the old timer to expire; the
  previous round must not refill the new round's node.
- Craft a blaster and patch, checking exact costs and capacity. Invalid requests must spend nothing.
- Preview and place each structure on flat ground, slopes and an allied foundation.
- Try protected spawns, extraction, depots, monuments, water, another player's body and a point
  behind a wall; rejected placement must be explained and must not spend materials.
- Reach player/team/server budgets: 36 / 120 / 480 live structures. Destroy one and verify a
  corresponding slot becomes available again.
- Open an allied doorway with the native prompt; rivals cannot open it. Verify moving doors
  do not trap players or leave stale prompts after destruction.

## Team depots

- Carry at most three cores. Deposit with a one-second friendly interaction before Extraction.
- Fill a shared depot to 24 cores; excess remains with the player and never disappears.
- Cancel before the hold completes, move away, lose line of sight, take damage or respawn during
  the hold. No completed transfer may be awarded.
- Hit a player immediately before access completes, including damage followed by quick healing;
  the interaction must remain interrupted.
- During Scavenge/Conflict, rivals cannot steal. During Raid/Extraction, a six-second rival hold
  transfers up to two cores and leaves one protected reserve core.
- Have two players access simultaneously; total depot plus carried cores must stay conserved.
- During Extraction, friendly withdrawal transfers up to three cores and respects carry capacity.
- Attempt repeated/forged prompt completion without a valid hold. No cores may be granted.

## Combat and NPCs

- Confirm PvP is disabled during Scavenge and between rounds; friendly fire remains disabled.
- Fire with/without a blaster, while alive/dead and as a spectator. Only valid shots act.
- Eliminate a rival, then keep firing at the same body. Exactly one reward: 10 team points,
  20 XP and 4 credits. Duplicate or out-of-order shot sequences cannot repeat damage.
- Supply an origin beyond nearby cover in an isolated test; the server trace must still begin
  at the server-observed head. Check normal play under representative latency as well.
- A neutralized drone grants 2 team points, 10 XP and 1 credit.
- Drones must route around solid cover rather than teleport through it.
- Drone attack windup gives a visible warning. Moving beyond range or behind a wall during the
  windup prevents damage. Test floors, slopes, team bases and freshly built obstacles.
- Confirm paths/respawn callbacks from the previous round cannot create duplicate drones.
- At elimination, all carried cores and half resources/consumables enter one recovery cache;
  tools/blaster remain. Test the seven-second allied priority and partial inventory capacity.

## Raid and extraction

- Create breach charges at an eligible workbench; verify costs, distance and obstruction checks.
- Allied structures reject raid damage. Rival damage is allowed only in Raid/Extraction.
- Breach a defended depot route, then complete a valid theft and extraction trip.
- Enter the extraction area carrying a core; no instant reward is granted.
- Remain alive, inside and undamaged for eight seconds. One core awards 100 team points,
  100 XP and 25 credits, and is consumed exactly once.
- Leave, take damage, die or cross a phase boundary during progress; incomplete progress resets.
- Complete multiple deliveries: rewards match consumed cores, while successfulExtractions
  increases at most once for the round.
- Verify tied top scores announce a tie. Idle players cannot farm participation rewards.
- Complete at least two round resets and verify inventory, depot, structures, loot, timers and
  team scores reset while persistent progression remains.

## Late joining, reconnection and persistence

- Join during each active phase, including Raid/Extraction. A free team slot permits active play.
- Check catch-up kits never grant objective cores or make late entry the dominant strategy.
- Rejoin the same server within three minutes: restore valid round state and acquire a fresh
  persistent-data session. Check full-team/capacity handling without duplication.
- Leave while the profile is still loading; any newly acquired lease must be released safely.
- In a private data-enabled experience, verify saves across autosave, departure and shutdown.
- Simulate service errors: a failed production load must not overwrite saved progression with zero.
- Attempt overlapping sessions: only the valid owner may write. An expired owner cannot overwrite
  the new server after takeover.
- Simulate a committed write with a lost response; retry must be idempotent.
- Inspect warnings and user feedback when a data session cannot safely continue.

## Localization, visual quality and performance

- Complete an English and an Italian round; inspect all six locales in the same UI layouts.
- Delay localization replication and select an unsupported locale; readable fallback must appear.
- Inspect tutorial/recipe/depot/extraction wording and prompts for truncation or raw keys.
- Compare agreed camera positions at low and high Roblox quality: important targets and routes
  must remain visible, without crushed shadows, blinding highlights or excessive bloom.
- Capture median/p95/p99 frame times, memory, instance counts, network traffic and loading time
  under representative and maximum planned load. Record device and quality settings.
- Test sustained mobile play and several resets for heat and accumulating work.
- Run the full loop on each declared PC, mobile and console target. Emulation is not enough.

## Automated regression boundary

```sh
node scripts/test-server-policies.mjs
npm run check
```

The server harness executes actual TypeScript service methods with deterministic adapters. Its
scenarios cover policies and mutations, including failed-data and repeated-reward regressions.
They do not simulate Roblox networking, real DataStore contention, navigation meshes or render
performance. A clean automated run and a clean two-client round are necessary steps; publication
also requires device coverage and the owner's review of the exact candidate.
