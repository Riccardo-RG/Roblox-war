import { CollectionService, Workspace } from "@rbxts/services";
import { isItemId } from "shared/catalog/items";
import { horizontalDistance } from "shared/util/math";
import { PlayerStateService } from "server/services/player-state-service";
import { RateLimiter } from "server/services/rate-limiter";

export class ResourceService {
  private readonly rateLimiter = new RateLimiter();

  public constructor(
    private readonly playerState: PlayerStateService,
    private readonly toast: (player: Player, message: string) => void,
  ) {}

  public harvest(player: Player, target: Instance): void {
    const state = this.playerState.get(player);
    if (state === undefined || state.isSpectator || !target.IsA("BasePart")) {
      return;
    }
    if (!target.IsDescendantOf(Workspace) || !CollectionService.HasTag(target, "ResourceNode")) {
      return;
    }
    if (!this.rateLimiter.allow(player, "Harvest", 0.42)) {
      return;
    }

    const root = player.Character?.FindFirstChild("HumanoidRootPart");
    if (!root?.IsA("BasePart") || horizontalDistance(root.Position, target.Position) > 16) {
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
      this.toast(player, "Inventario pieno");
      return;
    }

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
    for (const instance of CollectionService.GetTagged("ResourceNode")) {
      if (!instance.IsA("BasePart") || !instance.IsDescendantOf(Workspace)) {
        continue;
      }
      const maximum = instance.GetAttribute("MaximumRemaining");
      instance.SetAttribute("Remaining", typeIs(maximum, "number") ? maximum : 60);
      instance.Transparency = 0;
      instance.CanCollide = true;
      instance.CanQuery = true;
    }
  }

  private deplete(node: BasePart): void {
    node.Transparency = 1;
    node.CanCollide = false;
    node.CanQuery = false;
    const respawnSeconds = node.GetAttribute("RespawnSeconds");
    const maximum = node.GetAttribute("MaximumRemaining");
    const delaySeconds = typeIs(respawnSeconds, "number") ? respawnSeconds : 25;
    const maximumRemaining = typeIs(maximum, "number") ? maximum : 60;

    task.delay(delaySeconds, () => {
      if (!node.Parent) {
        return;
      }
      node.SetAttribute("Remaining", maximumRemaining);
      node.Transparency = 0;
      node.CanCollide = true;
      node.CanQuery = true;
    });
  }
}
