import { BUILD_PIECE_IDS, BUILD_PIECES } from "shared/catalog/build-pieces";
import { ITEM_IDS, ITEMS } from "shared/catalog/items";
import { MATCH_PHASES } from "shared/catalog/match-config";
import { RECIPE_IDS, RECIPES } from "shared/catalog/recipes";
import { validateLocalizationCatalog } from "shared/localization/translations";

export function runCatalogSmokeTests(): void {
  validateLocalizationCatalog();
  for (const itemId of ITEM_IDS) {
    const item = ITEMS[itemId];
    assert(item.id === itemId, `Item catalog key mismatch: ${itemId}`);
    assert(item.stackLimit > 0, `Item stack limit must be positive: ${itemId}`);
  }

  for (const recipeId of RECIPE_IDS) {
    const recipe = RECIPES[recipeId];
    assert(recipe.id === recipeId, `Recipe catalog key mismatch: ${recipeId}`);
    assert(recipe.output.amount > 0, `Recipe output must be positive: ${recipeId}`);
    assert(recipe.ingredients.size() > 0, `Recipe must have ingredients: ${recipeId}`);
    for (const ingredient of recipe.ingredients) {
      assert(ingredient.amount > 0, `Recipe ingredient must be positive: ${recipeId}`);
      assert(ITEMS[ingredient.itemId] !== undefined, `Recipe item is not registered: ${recipeId}`);
    }
  }

  for (const pieceId of BUILD_PIECE_IDS) {
    const piece = BUILD_PIECES[pieceId];
    assert(piece.id === pieceId, `Build catalog key mismatch: ${pieceId}`);
    assert(piece.size.X > 0 && piece.size.Y > 0 && piece.size.Z > 0, `Invalid size: ${pieceId}`);
    assert(piece.maxHealth > 0, `Build health must be positive: ${pieceId}`);
    assert(piece.costs.size() > 0, `Build piece must have a cost: ${pieceId}`);
    for (const cost of piece.costs) {
      assert(cost.amount > 0, `Build cost must be positive: ${pieceId}`);
      assert(ITEMS[cost.itemId] !== undefined, `Build cost item is not registered: ${pieceId}`);
    }
  }

  const seenPhases = new Set<string>();
  let productionDuration = 0;
  for (const phase of MATCH_PHASES) {
    assert(!seenPhases.has(phase.phase), `Duplicate match phase: ${phase.phase}`);
    assert(phase.productionSeconds > 0 && phase.studioSeconds > 0, `Invalid phase: ${phase.phase}`);
    seenPhases.add(phase.phase);
    productionDuration += phase.productionSeconds;
  }
  assert(MATCH_PHASES.size() === 4, "The vertical slice must contain four active match phases.");
  assert(productionDuration === 20 * 60, "The production match must remain 20 minutes long.");

  print("[WAR WORLD] Catalog smoke tests passed.");
}
