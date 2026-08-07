export const ITEM_IDS = [
  "wood",
  "stone",
  "scrap",
  "fiber",
  "energy_core",
  "multi_tool",
  "survival_blaster",
  "bandage",
  "breach_charge",
] as const;

export type ItemId = (typeof ITEM_IDS)[number];
export type ItemCategory = "Resource" | "Objective" | "Tool" | "Weapon" | "Consumable";

export interface ItemDefinition {
  readonly id: ItemId;
  readonly displayName: string;
  readonly category: ItemCategory;
  readonly stackLimit: number;
  readonly color: Color3;
}

export const ITEMS: Readonly<Record<ItemId, ItemDefinition>> = {
  wood: {
    id: "wood",
    displayName: "Legno",
    category: "Resource",
    stackLimit: 999,
    color: Color3.fromRGB(151, 100, 62),
  },
  stone: {
    id: "stone",
    displayName: "Pietra",
    category: "Resource",
    stackLimit: 999,
    color: Color3.fromRGB(128, 138, 147),
  },
  scrap: {
    id: "scrap",
    displayName: "Rottami",
    category: "Resource",
    stackLimit: 999,
    color: Color3.fromRGB(232, 155, 66),
  },
  fiber: {
    id: "fiber",
    displayName: "Fibra",
    category: "Resource",
    stackLimit: 999,
    color: Color3.fromRGB(106, 181, 94),
  },
  energy_core: {
    id: "energy_core",
    displayName: "Nucleo energetico",
    category: "Objective",
    stackLimit: 20,
    color: Color3.fromRGB(72, 226, 255),
  },
  multi_tool: {
    id: "multi_tool",
    displayName: "Multi-attrezzo",
    category: "Tool",
    stackLimit: 1,
    color: Color3.fromRGB(245, 214, 91),
  },
  survival_blaster: {
    id: "survival_blaster",
    displayName: "Blaster da recupero",
    category: "Weapon",
    stackLimit: 1,
    color: Color3.fromRGB(105, 163, 255),
  },
  bandage: {
    id: "bandage",
    displayName: "Patch riparatrice",
    category: "Consumable",
    stackLimit: 5,
    color: Color3.fromRGB(255, 115, 130),
  },
  breach_charge: {
    id: "breach_charge",
    displayName: "Carica a impulsi",
    category: "Consumable",
    stackLimit: 5,
    color: Color3.fromRGB(235, 89, 72),
  },
};

export function isItemId(value: unknown): value is ItemId {
  return typeIs(value, "string") && ITEM_IDS.includes(value as ItemId);
}
