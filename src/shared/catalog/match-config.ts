import type { MatchPhase } from "shared/types/game";

export interface PhaseDefinition {
  readonly phase: MatchPhase;
  readonly productionSeconds: number;
  readonly studioSeconds: number;
}

export const MATCH_PHASES: ReadonlyArray<PhaseDefinition> = [
  { phase: "Scavenge", productionSeconds: 4 * 60, studioSeconds: 90 },
  { phase: "Conflict", productionSeconds: 6 * 60, studioSeconds: 90 },
  { phase: "Raid", productionSeconds: 6 * 60, studioSeconds: 90 },
  { phase: "Extraction", productionSeconds: 4 * 60, studioSeconds: 60 },
];

export const MATCH_RESTART_DELAY_SECONDS = 15;
export const MAX_SQUAD_SIZE = 4;
export const MAX_BUILD_PARTS_PER_PLAYER = 36;
export const MAX_BUILD_STRUCTURES_PER_TEAM = 120;
export const MAX_BUILD_STRUCTURES_PER_SERVER = 480;
export const WORLD_HALF_EXTENT = 285;
export const MIN_MATCH_REWARD_PARTICIPATION_SECONDS = 60;
export const DEPOT_CAPACITY = 24;
export const DEPOT_WITHDRAW_LIMIT = 3;
export const DEPOT_STEAL_LIMIT = 2;
export const DEPOT_PROTECTED_RESERVE = 1;
export const EXTRACTION_HOLD_SECONDS = 8;
