import { Players, Workspace } from "@rbxts/services";
import { EXTRACTION_HOLD_SECONDS } from "shared/catalog/match-config";
import { localized, type LocalizedMessage } from "shared/localization/translations";
import { livingRoot } from "server/services/interaction-guard";
import { MatchService } from "server/services/match-service";
import { PlayerStateService } from "server/services/player-state-service";
import { TeamService } from "server/services/team-service";

interface ExtractionHold {
  readonly startedAt: number;
  readonly character: Model;
  readonly damageConnection: RBXScriptConnection;
  lastReportedSecond: number;
}

/** Server-timed extraction: remain inside the zone, alive and undamaged. */
export class ExtractionService {
  private readonly holds = new Map<Player, ExtractionHold>();
  private readonly cooldowns = new Map<Player, number>();
  private zone: BasePart | undefined;

  public constructor(
    private readonly playerState: PlayerStateService,
    private readonly match: MatchService,
    private readonly teams: TeamService,
    private readonly toast: (player: Player, message: LocalizedMessage) => void,
    private readonly changed: (player: Player) => void,
  ) {}

  public start(): void {
    const zone = Workspace.WaitForChild("World")
      .WaitForChild("GeneratedWorld")
      .WaitForChild("Monuments")
      .WaitForChild("ExtractionZone");
    assert(zone.IsA("BasePart"), "ExtractionZone must be a BasePart.");
    this.zone = zone;
    task.spawn(() => {
      while (zone.Parent !== undefined) {
        task.wait(0.2);
        for (const player of Players.GetPlayers()) this.update(player);
      }
    });
  }

  public progressFor(player: Player): number {
    const hold = this.holds.get(player);
    return hold !== undefined
      ? math.clamp((os.clock() - hold.startedAt) / EXTRACTION_HOLD_SECONDS, 0, 1)
      : 0;
  }

  public removePlayer(player: Player): void {
    this.cancel(player, false);
    this.cooldowns.delete(player);
  }

  private eligible(player: Player): boolean {
    const root = livingRoot(player);
    const zone = this.zone;
    if (
      root === undefined ||
      zone === undefined ||
      this.playerState.get(player)?.isSpectator !== false ||
      this.match.currentPhase() !== "Extraction" ||
      this.playerState.amount(player, "energy_core") === 0
    )
      return false;
    const localPosition = zone.CFrame.PointToObjectSpace(root.Position);
    return (
      math.abs(localPosition.X) <= zone.Size.X / 2 &&
      math.abs(localPosition.Z) <= zone.Size.Z / 2 &&
      localPosition.Y >= -1 &&
      localPosition.Y <= zone.Size.Y / 2 + 6
    );
  }

  private update(player: Player): void {
    if (!this.eligible(player)) {
      this.cancel(player, true);
      return;
    }
    const character = player.Character;
    const humanoid = character?.FindFirstChildOfClass("Humanoid");
    if (character === undefined || humanoid === undefined) return;
    let hold = this.holds.get(player);
    if (hold !== undefined && hold.character !== character) {
      this.cancel(player, false);
      hold = undefined;
    }
    if (hold === undefined) {
      if ((this.cooldowns.get(player) ?? 0) > os.clock()) return;
      let previousHealth = humanoid.Health;
      const connection = humanoid.HealthChanged.Connect((health) => {
        if (health < previousHealth) {
          this.cancel(player, true);
          this.cooldowns.set(player, os.clock() + 1);
        }
        previousHealth = health;
      });
      this.holds.set(player, {
        startedAt: os.clock(),
        character,
        damageConnection: connection,
        lastReportedSecond: -1,
      });
      this.toast(
        player,
        localized("toast.extraction_started", { seconds: EXTRACTION_HOLD_SECONDS }),
      );
      this.changed(player);
      return;
    }
    const elapsed = os.clock() - hold.startedAt;
    const second = math.floor(elapsed);
    if (second !== hold.lastReportedSecond) {
      hold.lastReportedSecond = second;
      this.changed(player);
    }
    if (elapsed < EXTRACTION_HOLD_SECONDS) return;
    const cores = this.playerState.amount(player, "energy_core");
    this.cancel(player, false);
    if (cores <= 0 || !this.playerState.consume(player, "energy_core", cores)) return;
    this.playerState.awardProgress(player, cores * 100, cores * 25);
    this.playerState.recordExtraction(player);
    this.playerState.recordAction(player, "extracted", cores);
    this.teams.addScore(player, cores * 100);
    this.toast(player, localized("toast.cores_extracted", { count: cores }));
    this.cooldowns.set(player, os.clock() + 1);
  }

  private cancel(player: Player, announce: boolean): void {
    const hold = this.holds.get(player);
    if (hold === undefined) return;
    hold.damageConnection.Disconnect();
    this.holds.delete(player);
    this.changed(player);
    if (announce && player.Parent === Players)
      this.toast(player, localized("toast.extraction_interrupted"));
  }
}
