import { CollectionService } from "@rbxts/services";
import { RECIPES, type RecipeId } from "shared/catalog/recipes";
import {
  localized,
  type LocalizationKey,
  type LocalizedMessage,
} from "shared/localization/translations";
import { horizontalDistance } from "shared/util/math";
import { PlayerStateService } from "server/services/player-state-service";
import { RateLimiter } from "server/services/rate-limiter";

export class CraftingService {
  private readonly rateLimiter = new RateLimiter();

  public constructor(
    private readonly playerState: PlayerStateService,
    private readonly toast: (player: Player, message: LocalizedMessage) => void,
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
      this.toast(player, localized("toast.need_workbench"));
      return;
    }
    if (!this.playerState.canAfford(player, recipe.ingredients)) {
      this.toast(player, localized("toast.insufficient_resources"));
      return;
    }
    if (!this.playerState.canReceive(player, recipe.output.itemId, recipe.output.amount)) {
      this.toast(player, localized("toast.carry_limit"));
      return;
    }

    if (!this.playerState.spend(player, recipe.ingredients)) {
      return;
    }
    this.playerState.add(player, recipe.output.itemId, recipe.output.amount);
    const craftedMessages: Record<RecipeId, LocalizationKey> = {
      survival_blaster: "toast.crafted_blaster",
      bandage: "toast.crafted_bandage",
      breach_charge: "toast.crafted_charge",
    };
    this.toast(player, localized(craftedMessages[recipeId]));
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
