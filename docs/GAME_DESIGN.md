# Game design

## Product promise

Build and defend a team outpost, steal exposed energy cores, then extract them during a compact
first-person PvPvE round. WAR WORLD combines readable blaster combat with a small survival loop;
it does not aim to reproduce Rust's graphic violence or persistent, week-long grind.

The target look is readable stylized realism: believable terrain, materials and silhouettes,
with restrained effects and clear objective colors. Darkness, bloom and visual clutter must not
make targets or resource types difficult to identify. PC, mobile and console are intended launch
platforms; support is not signed off until their controls and performance pass real-device tests.

## Round structure

| Phase      | Public duration | Studio duration | Main decisions                                                  |
| ---------- | --------------: | --------------: | --------------------------------------------------------------- |
| Scavenge   |       4 minutes |      90 seconds | Gather, craft a blaster, establish defenses and bank cores.     |
| Conflict   |       6 minutes |      90 seconds | Contest resource routes and public events; PvP is enabled.      |
| Raid       |       6 minutes |      90 seconds | Breach rival defenses and steal from exposed depots.            |
| Extraction |       4 minutes |      60 seconds | Withdraw cores, reach the center and defend an extraction hold. |

A public round lasts 20 minutes, followed by a 15-second intermission. Studio runs 5 minutes
30 seconds plus intermission. These values are a balance hypothesis, not evidence that the pace
is already enjoyable. Record first resource, first crafted item, first fight and idle time in tests.

New players can enter in every active phase with the applicable catch-up loadout. Players must
not spend most of a round immobilized merely because they joined late. Team size is four, across
six teams; a full server remains a capacity constraint. Reconnecting within three minutes to the
same server restores round state when possible. Automatic routing back to that server is not
implemented as a production matchmaking guarantee.

## Why build a base?

A shared energy depot gives each camp something tangible to defend. Each depot stores up to
24 cores; an individual carries at most three cores. A teammate deposits carried cores with
a one-second interaction before Extraction.
During Extraction, the same friendly interaction withdraws up to three cores per trip.

During Raid and Extraction, a rival can attempt a six-second steal. Each successful steal takes
up to two cores, leaving one protected reserve core in the depot. Moving away, losing visibility,
taking damage or being eliminated interrupts access. Cores are transferred, not duplicated.

Walls, foundations, team doors and workbenches support this loop. Limits are 36 existing
structures per player, 120 per team and 480 per server. Spawn, depot access, extraction and
monument clearances prevent critical paths from being sealed. Destroying a structure frees its
budget; the cap is not a lifetime construction counter.

## Extraction, scoring and loss

Extraction requires eight uninterrupted seconds inside the valid zone while alive and undamaged.
Leaving the zone or taking damage resets progress. Each extracted core leaves the inventory and
grants 100 team points, 100 XP and 25 credits. The successful-extractions profile counter increases
at most once per round, even if a player completes several deliveries.

| Action             | Team points |  XP | Credits |
| ------------------ | ----------: | --: | ------: |
| Neutralize a drone |           2 |  10 |       1 |
| Eliminate a rival  |          10 |  20 |       4 |
| Extract a core     |         100 | 100 |      25 |

Extraction is deliberately the main scoring objective. Killing respawning NPCs should support
resource control, not replace the objective. Equal top scores produce a tie. Account rewards
must not be farmed through repeated corpse hits, failed save recovery or idle round completion.

Eliminated players retain their basic tool and crafted blaster. They drop all carried cores and
half their resources/consumables in a recovery cache. Their team has seven seconds of priority
before rivals may collect it. Account progression survives a round reset; current-round supplies
and player-built defenses do not.

## First-time experience

The first minute should teach one action at a time: find a marked resource, gather it, craft a
blaster, place a useful defense and locate the team depot. The tutorial is dismissible and
reopenable. Objective guidance should refer to visible landmarks and world markers rather than
requiring players to interpret raw coordinates. Menus must be operable without a mouse on touch
and controller, while aiming remains first person.

## Scope and open balance questions

The initial content set is intentionally small. Prioritize dependable controls, meaningful base
defense, clear feedback and a full enjoyable round before expanding the item catalog. The asset
budget is zero: create original procedural art or verify any free resource before importing it.
The four original environment models were uploaded and their colors verified in the Studio editor.
Their appearance and behavior in the playable game, private-staging asset delivery and real-device
performance remain acceptance work.

Vehicles, agriculture, electrical simulation, trading, clans and persistent weekly worlds are
outside the current release scope. Party matchmaking, cross-server reconnection, cosmetics and
more content are later decisions informed by tests. Measure whether 20 minutes is still too long,
whether late entrants can contribute, and whether depot theft creates recoverable setbacks rather
than unavoidable defeat.
