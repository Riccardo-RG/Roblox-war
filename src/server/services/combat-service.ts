import { Players, Workspace } from "@rbxts/services";
import { MatchService } from "server/services/match-service";
import { NpcService } from "server/services/npc-service";
import { PlayerStateService } from "server/services/player-state-service";
import { RateLimiter } from "server/services/rate-limiter";
import { TeamService } from "server/services/team-service";

const BLASTER_DAMAGE = 25;
const BLASTER_RANGE = 350;

export class CombatService {
  private readonly rateLimiter = new RateLimiter();

  public constructor(
    private readonly playerState: PlayerStateService,
    private readonly teams: TeamService,
    private readonly match: MatchService,
    private readonly npcs: NpcService,
    private readonly hitConfirm: (player: Player, eliminated: boolean) => void,
    private readonly shotEffect: (player: Player, origin: Vector3, endpoint: Vector3) => void,
    private readonly toast: (player: Player, message: string) => void,
  ) {}

  public fire(player: Player, origin: Vector3, direction: Vector3, _sequence: number): void {
    const state = this.playerState.get(player);
    if (
      state === undefined ||
      state.isSpectator ||
      !this.playerState.has(player, "survival_blaster") ||
      !this.rateLimiter.allow(player, "FireWeapon", 0.26)
    ) {
      return;
    }

    const character = player.Character;
    const head = character?.FindFirstChild("Head");
    if (!head?.IsA("BasePart") || origin.sub(head.Position).Magnitude > 9) {
      return;
    }
    if (direction.Magnitude < 0.9 || direction.Magnitude > 1.1) {
      return;
    }

    const parameters = new RaycastParams();
    parameters.FilterType = Enum.RaycastFilterType.Exclude;
    parameters.FilterDescendantsInstances = character !== undefined ? [character] : [];
    parameters.IgnoreWater = true;

    const result = Workspace.Raycast(origin, direction.Unit.mul(BLASTER_RANGE), parameters);
    const endpoint = result?.Position ?? origin.add(direction.Unit.mul(BLASTER_RANGE));
    this.shotEffect(player, origin, endpoint);
    if (result === undefined) {
      return;
    }

    const npcResult = this.npcs.damage(result.Instance, BLASTER_DAMAGE, player);
    if (npcResult !== undefined) {
      this.hitConfirm(player, npcResult);
      return;
    }

    const model = result.Instance.FindFirstAncestorOfClass("Model");
    const humanoid = model?.FindFirstChildOfClass("Humanoid");
    const targetPlayer = model !== undefined ? Players.GetPlayerFromCharacter(model) : undefined;
    if (humanoid === undefined || targetPlayer === undefined || targetPlayer === player) {
      return;
    }
    if (!this.match.allowsPvp() || this.teams.areFriendly(player, targetPlayer)) {
      return;
    }

    humanoid.TakeDamage(BLASTER_DAMAGE);
    const eliminated = humanoid.Health <= 0;
    this.hitConfirm(player, eliminated);
    if (eliminated) {
      this.playerState.awardProgress(player, 50, 10);
      this.teams.addScore(player, 25);
    }
  }

  public useBandage(player: Player): void {
    const state = this.playerState.get(player);
    if (state === undefined || state.isSpectator || !this.rateLimiter.allow(player, "Bandage", 1)) {
      return;
    }
    const humanoid = player.Character?.FindFirstChildOfClass("Humanoid");
    if (humanoid === undefined || humanoid.Health <= 0 || humanoid.Health >= humanoid.MaxHealth) {
      return;
    }
    if (!this.playerState.consume(player, "bandage", 1)) {
      this.toast(player, "Nessuna Patch riparatrice");
      return;
    }
    humanoid.Health = math.min(humanoid.MaxHealth, humanoid.Health + 35);
    this.toast(player, "Integrità ripristinata");
  }

  public removePlayer(player: Player): void {
    this.rateLimiter.removePlayer(player);
  }
}
