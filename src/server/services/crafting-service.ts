import { CollectionService } from "@rbxts/services";
import { RECIPES, type RecipeId } from "shared/catalog/recipes";
import { horizontalDistance } from "shared/util/math";
import { PlayerStateService } from "server/services/player-state-service";
import { RateLimiter } from "server/services/rate-limiter";

export class CraftingService {
  private readonly rateLimiter = new RateLimiter();

  public constructor(
    private readonly playerState: PlayerStateService,
    private readonly toast: (player: Player, message: string) => void,
  ) {}

  public craft(player: Player, recipeId: RecipeId): void {
    const state = this.playerState.get(player);
    if (
      state === undefined ||
      state.isSpectator ||
      !this.rateLimiter.allow(player, "Craft", 0.35)
    ) {
      return;
    }

    const recipe = RECIPES[recipeId];
    if (recipe.requiresWorkbench && !this.isNearWorkbench(player)) {
      this.toast(player, "Serve un banco da lavoro vicino");
      return;
    }
    if (!this.playerState.canAfford(player, recipe.ingredients)) {
      this.toast(player, "Risorse insufficienti");
      return;
    }
    if (!this.playerState.canReceive(player, recipe.output.itemId, recipe.output.amount)) {
      this.toast(player, "Non puoi trasportarne altri");
      return;
    }

    if (!this.playerState.spend(player, recipe.ingredients)) {
      return;
    }
    this.playerState.add(player, recipe.output.itemId, recipe.output.amount);
    this.toast(player, `${recipe.displayName} creato`);
  }

  public removePlayer(player: Player): void {
    this.rateLimiter.removePlayer(player);
  }

  private isNearWorkbench(player: Player): boolean {
    const root = player.Character?.FindFirstChild("HumanoidRootPart");
    if (!root?.IsA("BasePart")) {
      return false;
    }

    for (const instance of CollectionService.GetTagged("Workbench")) {
      const position = instance.IsA("BasePart")
        ? instance.Position
        : instance.IsA("Model")
          ? instance.GetPivot().Position
          : undefined;
      if (position !== undefined && horizontalDistance(root.Position, position) <= 18) {
        return true;
      }
    }
    return false;
  }
}
