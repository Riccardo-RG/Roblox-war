import { CollectionService, Workspace } from "@rbxts/services";
import { isItemId } from "shared/catalog/items";
import { localized, type LocalizedMessage } from "shared/localization/translations";
import { isWithinActionRange } from "shared/util/combat-policy";
import { isFiniteVector3 } from "shared/util/math";
import { PlayerStateService } from "server/services/player-state-service";
import { RateLimiter } from "server/services/rate-limiter";

export class ResourceService {
  private readonly rateLimiter = new RateLimiter();
  private respawnGeneration = 0;

  public constructor(
    private readonly playerState: PlayerStateService,
    private readonly toast: (player: Player, message: LocalizedMessage) => void,
    private readonly canAct: () => boolean = () =>
      Workspace.GetAttribute("MatchPhase") !== "Complete",
  ) {}

  public harvest(player: Player, target: Instance): void {
    const state = this.playerState.get(player);
    if (state === undefined || state.isSpectator || !this.canAct() || !target.IsA("BasePart")) {
      return;
    }
    if (!target.IsDescendantOf(Workspace) || !CollectionService.HasTag(target, "ResourceNode")) {
      return;
    }
    if (!this.rateLimiter.allow(player, "Harvest", 0.42)) {
      return;
    }

    const root = player.Character?.FindFirstChild("HumanoidRootPart");
    const head = player.Character?.FindFirstChild("Head");
    const humanoid = player.Character?.FindFirstChildOfClass("Humanoid");
    if (
      !root?.IsA("BasePart") ||
      !head?.IsA("BasePart") ||
      !isFiniteVector3(head.Position) ||
      humanoid === undefined ||
      humanoid.Health <= 0 ||
      !isWithinActionRange(root.Position.sub(target.Position).Magnitude, 16)
    ) {
      return;
    }
    const raycastParams = new RaycastParams();
    raycastParams.FilterType = Enum.RaycastFilterType.Exclude;
    raycastParams.FilterDescendantsInstances =
      player.Character !== undefined ? [player.Character] : [];
    const obstruction = Workspace.Raycast(
      head.Position,
      target.Position.sub(head.Position),
      raycastParams,
    );
    if (
      obstruction !== undefined &&
      obstruction.Instance !== target &&
      !obstruction.Instance.IsDescendantOf(target)
    ) {
      return;
    }

    const itemId = target.GetAttribute("ResourceItemId");
    const remaining = target.GetAttribute("Remaining");
    const yieldPerHit = target.GetAttribute("YieldPerHit");
    if (!isItemId(itemId) || !typeIs(remaining, "number") || !typeIs(yieldPerHit, "number")) {
      return;
    }
    if (remaining <= 0) {
      return;
    }

    const accepted = this.playerState.add(player, itemId, yieldPerHit);
    if (accepted <= 0) {
      this.toast(player, localized("toast.inventory_full"));
      return;
    }
    this.playerState.recordAction(player, "harvested", accepted);

    const nextRemaining = math.max(0, remaining - 20);
    target.SetAttribute("Remaining", nextRemaining);
    if (nextRemaining <= 0) {
      this.deplete(target);
    }
  }

  public removePlayer(player: Player): void {
    this.rateLimiter.removePlayer(player);
  }

  public resetAll(): void {
    this.respawnGeneration += 1;
    for (const instance of CollectionService.GetTagged("ResourceNode")) {
      if (!instance.IsA("BasePart") || !instance.IsDescendantOf(Workspace)) {
        continue;
      }
      const maximum = instance.GetAttribute("MaximumRemaining");
      instance.SetAttribute("Remaining", typeIs(maximum, "number") ? maximum : 60);
      this.setNodeVisible(instance, true);
    }
  }

  private deplete(node: BasePart): void {
    this.setNodeVisible(node, false);
    const respawnSeconds = node.GetAttribute("RespawnSeconds");
    const maximum = node.GetAttribute("MaximumRemaining");
    const delaySeconds = typeIs(respawnSeconds, "number") ? respawnSeconds : 25;
    const maximumRemaining = typeIs(maximum, "number") ? maximum : 60;
    const generation = this.respawnGeneration;

    task.delay(delaySeconds, () => {
      if (!node.Parent || generation !== this.respawnGeneration) {
        return;
      }
      node.SetAttribute("Remaining", maximumRemaining);
      this.setNodeVisible(node, true);
    });
  }

  private setNodeVisible(node: BasePart, visible: boolean): void {
    const parts = [
      node,
      ...node
        .GetDescendants()
        .filter((descendant): descendant is BasePart => descendant.IsA("BasePart")),
    ];
    for (const part of parts) {
      const originalTransparency = part.GetAttribute("ResourceOriginalTransparency");
      const originalCanCollide = part.GetAttribute("ResourceOriginalCanCollide");
      const originalCanQuery = part.GetAttribute("ResourceOriginalCanQuery");
      if (!visible) {
        if (!typeIs(originalTransparency, "number")) {
          part.SetAttribute("ResourceOriginalTransparency", part.Transparency);
          part.SetAttribute("ResourceOriginalCanCollide", part.CanCollide);
          part.SetAttribute("ResourceOriginalCanQuery", part.CanQuery);
        }
        part.Transparency = 1;
        part.CanCollide = false;
        part.CanQuery = false;
      } else if (
        typeIs(originalTransparency, "number") &&
        typeIs(originalCanCollide, "boolean") &&
        typeIs(originalCanQuery, "boolean")
      ) {
        part.Transparency = originalTransparency;
        part.CanCollide = originalCanCollide;
        part.CanQuery = originalCanQuery;
      }
    }

    for (const descendant of node.GetDescendants()) {
      if (descendant.IsA("Light")) {
        descendant.Enabled = visible;
      }
    }
  }
}
