import type { ItemId } from "shared/catalog/items";

export type MatchPhase = "Scavenge" | "Conflict" | "Raid" | "Extraction" | "Complete";

export interface InventoryEntry {
  readonly itemId: ItemId;
  readonly amount: number;
}

export interface PublicProfile {
  readonly level: number;
  readonly xp: number;
  readonly credits: number;
  readonly matchesPlayed: number;
  readonly successfulExtractions: number;
}

export interface MatchSnapshot {
  readonly phase: MatchPhase;
  readonly phaseEndsAt: number;
  readonly matchEndsAt: number;
  readonly canBackfill: boolean;
  readonly studioTimings: boolean;
}

export interface TeamScore {
  readonly teamName: string;
  readonly score: number;
}

export interface PlayerSnapshot {
  readonly inventory: ReadonlyArray<InventoryEntry>;
  readonly profile: PublicProfile;
  readonly teamName: string;
  readonly isSpectator: boolean;
  readonly match: MatchSnapshot;
  readonly teamScores: ReadonlyArray<TeamScore>;
  readonly buildCount?: number;
  readonly progress?: TutorialProgress;
  readonly teamDepot?: TeamDepotSnapshot;
  readonly extractionProgress?: number;
}

export interface TutorialProgress {
  harvested: number;
  crafted: number;
  built: number;
  deposited: number;
  extracted: number;
}

export interface TeamDepotSnapshot {
  readonly storedCores: number;
  readonly capacity: number;
  readonly position: Vector3;
}

export interface PersistentProfile {
  readonly schemaVersion: 1;
  xp: number;
  level: number;
  credits: number;
  matchesPlayed: number;
  successfulExtractions: number;
  lastSavedAt: number;
}
