import type { ItemId } from "shared/catalog/items";

export const RECIPE_IDS = ["survival_blaster", "bandage", "breach_charge"] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];

export interface Ingredient {
  readonly itemId: ItemId;
  readonly amount: number;
}

export interface RecipeDefinition {
  readonly id: RecipeId;
  readonly displayName: string;
  readonly output: Ingredient;
  readonly ingredients: ReadonlyArray<Ingredient>;
  readonly requiresWorkbench: boolean;
}

export const RECIPES: Readonly<Record<RecipeId, RecipeDefinition>> = {
  survival_blaster: {
    id: "survival_blaster",
    displayName: "Blaster da recupero",
    output: { itemId: "survival_blaster", amount: 1 },
    ingredients: [
      { itemId: "wood", amount: 20 },
      { itemId: "scrap", amount: 15 },
    ],
    requiresWorkbench: false,
  },
  bandage: {
    id: "bandage",
    displayName: "Patch riparatrice",
    output: { itemId: "bandage", amount: 1 },
    ingredients: [{ itemId: "fiber", amount: 8 }],
    requiresWorkbench: false,
  },
  breach_charge: {
    id: "breach_charge",
    displayName: "Carica a impulsi",
    output: { itemId: "breach_charge", amount: 1 },
    ingredients: [
      { itemId: "stone", amount: 20 },
      { itemId: "scrap", amount: 40 },
    ],
    requiresWorkbench: true,
  },
};

export function isRecipeId(value: unknown): value is RecipeId {
  return typeIs(value, "string") && RECIPE_IDS.includes(value as RecipeId);
}
