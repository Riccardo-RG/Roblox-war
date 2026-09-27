import { Players, Workspace } from "@rbxts/services";
import { localized, type LocalizedMessage } from "shared/localization/translations";
import { isFiniteVector3 } from "shared/util/math";
import { canAwardElimination, validShotSequence } from "shared/util/combat-policy";
import { MatchService } from "server/services/match-service";
import { NpcService } from "server/services/npc-service";
import { PlayerStateService } from "server/services/player-state-service";
import { RateLimiter } from "server/services/rate-limiter";
import { TeamService } from "server/services/team-service";

const BLASTER_DAMAGE = 25;
const BLASTER_RANGE = 350;

export class CombatService {
  private readonly rateLimiter = new RateLimiter();
  private readonly lastShotSequences = new Map<Player, number>();
  private readonly awardedEliminations = new Set<Humanoid>();

  public constructor(
    private readonly playerState: PlayerStateService,
    private readonly teams: TeamService,
    private readonly match: MatchService,
    private readonly npcs: NpcService,
    private readonly hitConfirm: (player: Player, eliminated: boolean) => void,
    private readonly shotEffect: (player: Player, origin: Vector3, endpoint: Vector3) => void,
    private readonly toast: (player: Player, message: LocalizedMessage) => void,
  ) {}

  public fire(player: Player, origin: Vector3, direction: Vector3, sequence: number): void {
    const state = this.playerState.get(player);
    const previousSequence = this.lastShotSequences.get(player) ?? 0;
    if (
      state === undefined ||
      state.isSpectator ||
      this.match.currentPhase() === "Complete" ||
      !this.playerState.has(player, "survival_blaster") ||
      !isFiniteVector3(origin) ||
      !isFiniteVector3(direction) ||
      !validShotSequence(sequence, previousSequence) ||
      !this.rateLimiter.allow(player, "FireWeapon", 0.26)
    ) {
      return;
    }

    const character = player.Character;
    const head = character?.FindFirstChild("Head");
    const shooterHumanoid = character?.FindFirstChildOfClass("Humanoid");
    if (
      !head?.IsA("BasePart") ||
      !isFiniteVector3(head.Position) ||
      shooterHumanoid === undefined ||
      shooterHumanoid.Health <= 0 ||
      origin.sub(head.Position).Magnitude > 9
    ) {
      return;
    }
    if (direction.Magnitude < 0.9 || direction.Magnitude > 1.1) {
      return;
    }
    this.lastShotSequences.set(player, sequence);

    const parameters = new RaycastParams();
    parameters.FilterType = Enum.RaycastFilterType.Exclude;
    parameters.FilterDescendantsInstances = character !== undefined ? [character] : [];
    parameters.IgnoreWater = true;

    // The client supplies aim only. Always trace from the server-observed head so an
    // origin on the far side of a nearby wall cannot bypass that wall.
    const authoritativeOrigin = head.Position;
    const result = Workspace.Raycast(
      authoritativeOrigin,
      direction.Unit.mul(BLASTER_RANGE),
      parameters,
    );
    const endpoint = result?.Position ?? authoritativeOrigin.add(direction.Unit.mul(BLASTER_RANGE));
    this.shotEffect(player, authoritativeOrigin, endpoint);
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
    if (
      humanoid === undefined ||
      humanoid.Health <= 0 ||
      targetPlayer === undefined ||
      targetPlayer === player ||
      this.playerState.get(targetPlayer)?.isSpectator !== false
    ) {
      return;
    }
    if (!this.match.allowsPvp() || this.teams.areFriendly(player, targetPlayer)) {
      return;
    }

    const previousHealth = humanoid.Health;
    humanoid.TakeDamage(BLASTER_DAMAGE);
    const eliminated = canAwardElimination(
      previousHealth,
      humanoid.Health,
      this.awardedEliminations.has(humanoid),
    );
    if (humanoid.Health < previousHealth) {
      this.hitConfirm(player, eliminated);
    }
    if (eliminated) {
      this.awardedEliminations.add(humanoid);
      humanoid.Destroying.Once(() => this.awardedEliminations.delete(humanoid));
      this.playerState.awardProgress(player, 20, 4);
      this.teams.addScore(player, 10);
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
      this.toast(player, localized("toast.no_patch"));
      return;
    }
    humanoid.Health = math.min(humanoid.MaxHealth, humanoid.Health + 35);
    this.toast(player, localized("toast.repaired"));
  }

  public removePlayer(player: Player): void {
    this.rateLimiter.removePlayer(player);
    this.lastShotSequences.delete(player);
  }
}
