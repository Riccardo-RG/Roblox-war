import type { ItemId } from "shared/catalog/items";

export const BUILD_PIECE_IDS = ["foundation", "wall", "doorway", "workbench"] as const;
export type BuildPieceId = (typeof BUILD_PIECE_IDS)[number];

export interface BuildCost {
  readonly itemId: ItemId;
  readonly amount: number;
}

export interface BuildPieceDefinition {
  readonly id: BuildPieceId;
  readonly displayName: string;
  readonly size: Vector3;
  readonly color: Color3;
  readonly material: Enum.Material;
  readonly maxHealth: number;
  readonly costs: ReadonlyArray<BuildCost>;
}

export const BUILD_PIECES: Readonly<Record<BuildPieceId, BuildPieceDefinition>> = {
  foundation: {
    id: "foundation",
    displayName: "Fondazione",
    size: new Vector3(12, 1, 12),
    color: Color3.fromRGB(116, 88, 68),
    material: Enum.Material.WoodPlanks,
    maxHealth: 250,
    costs: [{ itemId: "wood", amount: 20 }],
  },
  wall: {
    id: "wall",
    displayName: "Muro",
    size: new Vector3(12, 8, 1),
    color: Color3.fromRGB(130, 97, 72),
    material: Enum.Material.WoodPlanks,
    maxHealth: 200,
    costs: [{ itemId: "wood", amount: 12 }],
  },
  doorway: {
    id: "doorway",
    displayName: "Ingresso",
    size: new Vector3(12, 8, 1),
    color: Color3.fromRGB(111, 82, 63),
    material: Enum.Material.WoodPlanks,
    maxHealth: 175,
    costs: [
      { itemId: "wood", amount: 16 },
      { itemId: "stone", amount: 4 },
    ],
  },
  workbench: {
    id: "workbench",
    displayName: "Banco da lavoro",
    size: new Vector3(6, 3, 3),
    color: Color3.fromRGB(91, 116, 133),
    material: Enum.Material.Metal,
    maxHealth: 150,
    costs: [
      { itemId: "wood", amount: 30 },
      { itemId: "scrap", amount: 15 },
    ],
  },
};

export function isBuildPieceId(value: unknown): value is BuildPieceId {
  return typeIs(value, "string") && BUILD_PIECE_IDS.includes(value as BuildPieceId);
}
