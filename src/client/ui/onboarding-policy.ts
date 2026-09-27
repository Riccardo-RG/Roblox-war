/** Pure, ordered objectives: final-phase extraction always takes precedence over crafting. */
export interface OnboardingFacts {
  readonly phase: "Scavenge" | "Conflict" | "Raid" | "Extraction" | "Complete";
  readonly spectator: boolean;
  readonly cores: number;
  readonly storedCores: number;
  readonly extractionProgress: number;
  readonly hasBlaster: boolean;
  readonly wood: number;
  readonly scrap: number;
  readonly structuresBuilt: number;
}

export type OnboardingStep =
  | "spectator"
  | "complete"
  | "extracting"
  | "extract"
  | "withdraw"
  | "deposit"
  | "craft"
  | "gather"
  | "build"
  | "recover";

export function nextOnboardingStep(facts: OnboardingFacts): OnboardingStep {
  if (facts.spectator) return "spectator";
  if (facts.phase === "Complete") return "complete";
  if (facts.phase === "Extraction") {
    if (facts.extractionProgress > 0) return "extracting";
    if (facts.cores > 0) return "extract";
    if (facts.storedCores > 0) return "withdraw";
    return "recover";
  }
  if (facts.cores > 0) return "deposit";
  if (!facts.hasBlaster) return facts.wood >= 20 && facts.scrap >= 15 ? "craft" : "gather";
  if (facts.phase === "Scavenge" && facts.structuresBuilt === 0) return "build";
  return "recover";
}
