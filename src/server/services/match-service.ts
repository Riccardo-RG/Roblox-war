import { RunService, Workspace } from "@rbxts/services";
import {
  MATCH_PHASES,
  MATCH_RESTART_DELAY_SECONDS,
  type PhaseDefinition,
} from "shared/catalog/match-config";
import type { MatchPhase, MatchSnapshot } from "shared/types/game";

export class MatchService {
  private readonly studioTimings = RunService.IsStudio();
  private phase: MatchPhase = "Scavenge";
  private phaseEndsAt = 0;
  private matchEndsAt = 0;
  private phaseDefinition: PhaseDefinition = MATCH_PHASES[0]!;
  private onPhaseChanged: (() => void) | undefined;
  private onMatchCompleted: (() => void) | undefined;

  public start(onPhaseChanged: () => void, onMatchCompleted: () => void): void {
    this.onPhaseChanged = onPhaseChanged;
    this.onMatchCompleted = onMatchCompleted;
    task.spawn(() => this.runLoop());
  }

  public snapshot(): MatchSnapshot {
    return {
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      matchEndsAt: this.matchEndsAt,
      canBackfill: this.canBackfill(),
      studioTimings: this.studioTimings,
    };
  }

  public currentPhase(): MatchPhase {
    return this.phase;
  }

  public allowsPvp(): boolean {
    return this.phase === "Conflict" || this.phase === "Raid" || this.phase === "Extraction";
  }

  public allowsRaiding(): boolean {
    return this.phase === "Raid" || this.phase === "Extraction";
  }

  public canBackfill(): boolean {
    // Every active phase is playable: joining must not mean spectating for minutes.
    return this.phase !== "Complete";
  }

  public starterMultiplier(): number {
    if (this.phase === "Scavenge") {
      return 1;
    }
    return this.canBackfill() ? 2 : 0;
  }

  private runLoop(): void {
    while (true) {
      const now = Workspace.GetServerTimeNow();
      this.matchEndsAt = now + this.totalMatchDuration();

      for (const definition of MATCH_PHASES) {
        this.phaseDefinition = definition;
        this.phase = definition.phase;
        Workspace.SetAttribute("MatchPhase", this.phase);
        this.phaseEndsAt = Workspace.GetServerTimeNow() + this.durationFor(definition);
        this.onPhaseChanged?.();

        while (Workspace.GetServerTimeNow() < this.phaseEndsAt) {
          task.wait(1);
        }
      }

      this.phase = "Complete";
      Workspace.SetAttribute("MatchPhase", this.phase);
      this.phaseEndsAt = Workspace.GetServerTimeNow() + MATCH_RESTART_DELAY_SECONDS;
      this.matchEndsAt = this.phaseEndsAt;
      this.onPhaseChanged?.();
      // Results must be the final toast, not immediately replaced by a phase notice.
      this.onMatchCompleted?.();
      task.wait(MATCH_RESTART_DELAY_SECONDS);
    }
  }

  private totalMatchDuration(): number {
    return MATCH_PHASES.reduce((total, definition) => total + this.durationFor(definition), 0);
  }

  private durationFor(definition: PhaseDefinition): number {
    return this.studioTimings ? definition.studioSeconds : definition.productionSeconds;
  }
}
