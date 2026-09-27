# Technical architecture

WAR WORLD is authored in TypeScript and executed by Roblox as Luau:

TypeScript source → roblox-ts → generated Luau → Rojo → Roblox Studio / Roblox servers.

Studio provides rendering, physics, avatars, replication and platform services. Do not edit
generated scripts in Studio or the out directory: source changes belong in src.

## Ownership and layout

| Location                  | Responsibility                                                            |
| ------------------------- | ------------------------------------------------------------------------- |
| src/server/main.server.ts | Composition, player lifecycle, match resets and network dispatch          |
| src/server/services       | Authoritative inventory, objectives, damage, construction and persistence |
| src/server/world          | Original environment generation and shared world anchors                  |
| src/client/controllers    | Camera, input, build preview and presentation                             |
| src/client/ui             | HUD, tutorial, menus and accessibility/quality controls                   |
| src/shared/catalog        | Items, recipes, build definitions, durations and limits                   |
| src/shared/localization   | Typed messages and six-language catalog                                   |
| src/shared/network        | Request/event protocol                                                    |
| src/shared/util           | Geometry helpers and small testable server policies                       |
| scripts                   | Build validators and deterministic service regression harness             |
| build/WarWorld.rbxlx      | Generated candidate place, not the authoritative source                   |

Generated scenery and match objects belong to the bootstrap. Hand-authored art must not be placed
inside an area cleared during initialization unless it is recreated or imported through the
source pipeline. World anchors are shared so art, protected areas and gameplay objectives align.

## Authority boundary

The client requests an action; it does not grant items, damage or points. Server services verify
the request shape, rate, living/non-spectator state, phase, ownership, available inventory and
relevant geometry. Gathering and interactions use 3D proximity and visibility. Blaster traces
start from the server-observed head, never the arbitrary origin supplied by a client. Elimination
rewards require a living-to-eliminated transition and can be granted once per victim Humanoid.

Construction approval checks support, protected areas and collision alongside resource costs.
Budgets count existing structures: 36 per player, 120 per team and 480 per server. Decorative
children are additional instances, so a structure budget is not a complete rendering budget.
Client previews remain advisory; server rejection must produce understandable feedback.

These checks are defenses against specific invalid requests, not a claim of complete anti-cheat
coverage. Movement replication, latency, forged requests and crowded physics require adversarial
tests in an isolated experience.

## Match and objective lifecycle

Public rounds run Scavenge / Conflict / Raid / Extraction for 4 / 6 / 6 / 4 minutes. Studio uses
90 / 90 / 90 / 60 seconds. An additional 15-second intermission separates rounds. New players
can join throughout active phases; reaching capacity may still require waiting for a slot.

Each team has a shared, finite energy-core depot. Deposit, withdrawal and stealing are atomic
server inventory transfers. Extraction requires an uninterrupted eight-second hold in the zone;
it is not a reward granted solely from a client or touch notification. Round reset clears
temporary inventory, structures, depots, loot and scores, while account progression remains.

NPC movement checks obstacles before applying movement. Pathfinding is throttled and asynchronous;
pending paths are discarded after reset or destruction. Drone attacks have a short windup and
recheck distance and line of sight before damage. Resource respawn callbacks carry a generation
so a previous round's timer cannot refill the next round's depleted node.

## Persistent profile sessions

The DataStore name remains WarWorld_PlayerProfile_v1. Stored records now use a version-2
envelope containing the schema-1 profile, a revision, the last write identifier and an optional
session owner/expiry. Existing schema-1 profile records migrate when successfully claimed;
unsupported envelopes are rejected without overwriting them.

The load method atomically claims ownership through UpdateAsync. Every join has a distinct owner
token; an unexpired foreign session cannot be taken over. Leases last 180 seconds and autosave
renews them approximately every 45 seconds. Per-user FIFO queues serialize local load/save/release
operations, while different players save independently. Snapshots are taken after queue entry.
Writes require the same unexpired owner. A write ID makes retries recognizable when a commit
succeeds but its response is lost.

The caller must handle load returning undefined: do not initialize a persistent player with
a replacement blank profile. Studio-only temporary profiles are explicitly marked and never
enter the persistent write path. Session loss ends the unsafe session. The release method saves
and removes the lock atomically on departure/shutdown. If a player leaves while loading, release
the newly loaded session immediately instead of leaking its lease.

Reconnect restores round state from the same-server cache only after acquiring a fresh profile
session. It must use the newly loaded persistent profile, not a stale cached copy. Cross-server
resume routing is a separate feature, not guaranteed by this cache.

## Verification boundary

The script scripts/test-server-policies.mjs transpiles the actual TypeScript services into a
deterministic Node VM with explicit Roblox adapters. Its 36 scenarios exercise profile ownership,
migration, failed loads, acknowledged/unacknowledged saves, stale writers, combat rewards, rate
limiting, resource range/visibility/reset, drone obstruction/windup decisions, depot holds and
conserved transfers, extraction timing, damage interruptions and idempotent rewards. The same
harness checks the client input-context and onboarding policies for focus precedence and objective
ordering; it does not render the interface or emulate a controller.

The adapters do not reproduce Roblox scheduling, physics, pathfinding, rendering or the live
DataStore service. Passing them does not replace [Studio regression checks](PLAYTEST_CHECKLIST.md)
or the [device and multiplayer test plan](TEST_PLAN.md). Record the exact candidate commit and
device for every runtime result.
