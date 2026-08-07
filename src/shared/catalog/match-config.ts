import type { MatchPhase } from "shared/types/game";

export interface PhaseDefinition {
  readonly phase: MatchPhase;
  readonly productionSeconds: number;
  readonly studioSeconds: number;
}

export const MATCH_PHASES: ReadonlyArray<PhaseDefinition> = [
  { phase: "Scavenge", productionSeconds: 8 * 60, studioSeconds: 45 },
  { phase: "Conflict", productionSeconds: 12 * 60, studioSeconds: 60 },
  { phase: "Raid", productionSeconds: 10 * 60, studioSeconds: 45 },
  { phase: "Extraction", productionSeconds: 5 * 60, studioSeconds: 30 },
];

export const MATCH_RESTART_DELAY_SECONDS = 15;
export const MAX_SQUAD_SIZE = 4;
export const MAX_BUILD_PARTS_PER_PLAYER = 80;
export const WORLD_HALF_EXTENT = 285;
