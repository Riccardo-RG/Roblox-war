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
      this.setNodeVisible(instance, true);
    }
  }

  private deplete(node: BasePart): void {
    this.setNodeVisible(node, false);
    const respawnSeconds = node.GetAttribute("RespawnSeconds");
    const maximum = node.GetAttribute("MaximumRemaining");
    const delaySeconds = typeIs(respawnSeconds, "number") ? respawnSeconds : 25;
    const maximumRemaining = typeIs(maximum, "number") ? maximum : 60;

    task.delay(delaySeconds, () => {
      if (!node.Parent) {
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
