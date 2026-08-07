import { ITEMS, type ItemId } from "shared/catalog/items";
import type { Ingredient } from "shared/catalog/recipes";
import type { InventoryEntry, PersistentProfile, PublicProfile } from "shared/types/game";

export interface RuntimePlayerState {
  readonly inventory: Map<ItemId, number>;
  readonly profile: PersistentProfile;
  isSpectator: boolean;
  buildPartCount: number;
  extractedThisMatch: boolean;
}

export interface MatchResumeState {
  readonly inventory: ReadonlyArray<InventoryEntry>;
  readonly profile: PersistentProfile;
  readonly isSpectator: boolean;
  readonly buildPartCount: number;
  readonly extractedThisMatch: boolean;
}

export class PlayerStateService {
  public readonly changed = new Instance("BindableEvent");
  private readonly states = new Map<Player, RuntimePlayerState>();

  public initialize(
    player: Player,
    profile: PersistentProfile,
    starterMultiplier: number,
    isSpectator: boolean,
  ): RuntimePlayerState {
    const inventory = new Map<ItemId, number>();
    inventory.set("multi_tool", 1);

    if (!isSpectator) {
      inventory.set("wood", 40 * starterMultiplier);
      inventory.set("stone", 20 * starterMultiplier);
      inventory.set("scrap", 10 * starterMultiplier);
      inventory.set("fiber", 8 * starterMultiplier);
    }

    const state: RuntimePlayerState = {
      inventory,
      profile,
      isSpectator,
      buildPartCount: 0,
      extractedThisMatch: false,
    };
    this.states.set(player, state);
    this.changed.Fire(player);
    return state;
  }

  public resetForMatch(player: Player, starterMultiplier = 1, isSpectator = false): void {
    const state = this.states.get(player);
    if (state === undefined) {
      return;
    }

    state.inventory.clear();
    state.inventory.set("multi_tool", 1);
    if (!isSpectator) {
      state.inventory.set("wood", 40 * starterMultiplier);
      state.inventory.set("stone", 20 * starterMultiplier);
      state.inventory.set("scrap", 10 * starterMultiplier);
      state.inventory.set("fiber", 8 * starterMultiplier);
    }
    state.isSpectator = isSpectator;
    state.buildPartCount = 0;
    state.extractedThisMatch = false;
    this.changed.Fire(player);
  }

  public captureForReconnect(player: Player): MatchResumeState | undefined {
    const state = this.states.get(player);
    if (state === undefined) {
      return undefined;
    }
    return {
      inventory: this.inventorySnapshot(player),
      profile: state.profile,
      isSpectator: state.isSpectator,
      buildPartCount: state.buildPartCount,
      extractedThisMatch: state.extractedThisMatch,
    };
  }

  public restoreFromReconnect(player: Player, resume: MatchResumeState): RuntimePlayerState {
    const inventory = new Map<ItemId, number>();
    for (const entry of resume.inventory) {
      inventory.set(entry.itemId, entry.amount);
    }
    const state: RuntimePlayerState = {
      inventory,
      profile: resume.profile,
      isSpectator: resume.isSpectator,
      buildPartCount: resume.buildPartCount,
      extractedThisMatch: resume.extractedThisMatch,
    };
    this.states.set(player, state);
    this.changed.Fire(player);
    return state;
  }

  public get(player: Player): RuntimePlayerState | undefined {
    return this.states.get(player);
  }

  public remove(player: Player): RuntimePlayerState | undefined {
    const state = this.states.get(player);
    this.states.delete(player);
    return state;
  }

  public amount(player: Player, itemId: ItemId): number {
    return this.states.get(player)?.inventory.get(itemId) ?? 0;
  }

  public has(player: Player, itemId: ItemId, amount = 1): boolean {
    return this.amount(player, itemId) >= amount;
  }

  public canReceive(player: Player, itemId: ItemId, amount: number): boolean {
    return amount > 0 && this.amount(player, itemId) + amount <= ITEMS[itemId].stackLimit;
  }

  public canAfford(player: Player, costs: ReadonlyArray<Ingredient>): boolean {
    return costs.every((cost) => this.has(player, cost.itemId, cost.amount));
  }

  public add(player: Player, itemId: ItemId, amount: number): number {
    const state = this.states.get(player);
    if (state === undefined || amount <= 0) {
      return 0;
    }

    const definition = ITEMS[itemId];
    const current = state.inventory.get(itemId) ?? 0;
    const accepted = math.min(math.floor(amount), definition.stackLimit - current);
    if (accepted <= 0) {
      return 0;
    }

    state.inventory.set(itemId, current + accepted);
    this.changed.Fire(player);
    return accepted;
  }

  public consume(player: Player, itemId: ItemId, amount: number): boolean {
    const state = this.states.get(player);
    if (state === undefined || amount <= 0) {
      return false;
    }

    const current = state.inventory.get(itemId) ?? 0;
    if (current < amount) {
      return false;
    }

    const nextAmount = current - amount;
    if (nextAmount === 0) {
      state.inventory.delete(itemId);
    } else {
      state.inventory.set(itemId, nextAmount);
    }
    this.changed.Fire(player);
    return true;
  }

  public spend(player: Player, costs: ReadonlyArray<Ingredient>): boolean {
    if (!this.canAfford(player, costs)) {
      return false;
    }

    const state = this.states.get(player);
    if (state === undefined) {
      return false;
    }

    for (const cost of costs) {
      const current = state.inventory.get(cost.itemId) ?? 0;
      const nextAmount = current - cost.amount;
      if (nextAmount <= 0) {
        state.inventory.delete(cost.itemId);
      } else {
        state.inventory.set(cost.itemId, nextAmount);
      }
    }
    this.changed.Fire(player);
    return true;
  }

  public takeEliminationLoot(player: Player): ReadonlyArray<InventoryEntry> {
    const state = this.states.get(player);
    if (state === undefined) {
      return [];
    }

    const dropped = new Array<InventoryEntry>();
    for (const [itemId, amount] of state.inventory) {
      const category = ITEMS[itemId].category;
      if (category !== "Resource" && category !== "Objective" && category !== "Consumable") {
        continue;
      }
      const loss = category === "Objective" ? amount : math.floor(amount * 0.5);
      if (loss <= 0) {
        continue;
      }
      const remaining = amount - loss;
      if (remaining <= 0) {
        state.inventory.delete(itemId);
      } else {
        state.inventory.set(itemId, remaining);
      }
      dropped.push({ itemId, amount: loss });
    }

    if (dropped.size() > 0) {
      this.changed.Fire(player);
    }
    return dropped;
  }

  public awardProgress(player: Player, xp: number, credits: number): void {
    const state = this.states.get(player);
    if (state === undefined) {
      return;
    }

    state.profile.xp += math.max(0, math.floor(xp));
    state.profile.credits += math.max(0, math.floor(credits));
    state.profile.level = math.max(1, math.floor(state.profile.xp / 500) + 1);
    this.changed.Fire(player);
  }

  public recordMatchCompleted(player: Player): void {
    const state = this.states.get(player);
    if (state === undefined || state.isSpectator) {
      return;
    }
    state.profile.matchesPlayed += 1;
    this.changed.Fire(player);
  }

  public recordExtraction(player: Player): void {
    const state = this.states.get(player);
    if (state === undefined || state.extractedThisMatch) {
      return;
    }
    state.extractedThisMatch = true;
    state.profile.successfulExtractions += 1;
    this.changed.Fire(player);
  }

  public incrementBuildCount(player: Player): void {
    const state = this.states.get(player);
    if (state !== undefined) {
      state.buildPartCount += 1;
    }
  }

  public inventorySnapshot(player: Player): ReadonlyArray<InventoryEntry> {
    const state = this.states.get(player);
    if (state === undefined) {
      return [];
    }

    const entries = new Array<InventoryEntry>();
    for (const [itemId, amount] of state.inventory) {
      entries.push({ itemId, amount });
    }
    entries.sort((a, b) => a.itemId < b.itemId);
    return entries;
  }

  public publicProfile(player: Player): PublicProfile | undefined {
    const profile = this.states.get(player)?.profile;
    if (profile === undefined) {
      return undefined;
    }
    return {
      level: profile.level,
      xp: profile.xp,
      credits: profile.credits,
      matchesPlayed: profile.matchesPlayed,
      successfulExtractions: profile.successfulExtractions,
    };
  }

  public destroy(): void {
    this.changed.Destroy();
    this.states.clear();
  }
}
