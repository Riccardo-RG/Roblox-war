import { Players, Workspace } from "@rbxts/services";
import { MatchService } from "server/services/match-service";
import { PlayerStateService } from "server/services/player-state-service";
import { RateLimiter } from "server/services/rate-limiter";
import { TeamService } from "server/services/team-service";

export class ExtractionService {
  private readonly rateLimiter = new RateLimiter();

  public constructor(
    private readonly playerState: PlayerStateService,
    private readonly match: MatchService,
    private readonly teams: TeamService,
    private readonly toast: (player: Player, message: string) => void,
  ) {}

  public start(): void {
    const zone = Workspace.WaitForChild("World")
      .WaitForChild("GeneratedWorld")
      .WaitForChild("Monuments")
      .WaitForChild("ExtractionZone");
    assert(zone.IsA("BasePart"), "ExtractionZone must be a BasePart.");

    zone.Touched.Connect((touchedPart) => {
      const character = touchedPart.FindFirstAncestorOfClass("Model");
      const player =
        character !== undefined ? Players.GetPlayerFromCharacter(character) : undefined;
      if (player !== undefined) {
        this.tryExtract(player);
      }
    });
  }

  public removePlayer(player: Player): void {
    this.rateLimiter.removePlayer(player);
  }

  private tryExtract(player: Player): void {
    const state = this.playerState.get(player);
    if (
      state === undefined ||
      state.isSpectator ||
      this.match.currentPhase() !== "Extraction" ||
      !this.rateLimiter.allow(player, "Extraction", 2)
    ) {
      return;
    }

    const cores = this.playerState.amount(player, "energy_core");
    if (cores <= 0) {
      this.toast(player, "Porta qui un Nucleo energetico durante l'Estrazione");
      return;
    }

    if (!this.playerState.consume(player, "energy_core", cores)) {
      return;
    }
    this.playerState.awardProgress(player, cores * 100, cores * 25);
    this.playerState.recordExtraction(player);
    this.teams.addScore(player, cores * 100);
    this.toast(player, `${cores} Nuclei estratti: ricompensa assicurata`);
  }
}
