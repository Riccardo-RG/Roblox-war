import { DataStoreService, RunService } from "@rbxts/services";
import type { PersistentProfile } from "shared/types/game";

const PROFILE_STORE_NAME = "WarWorld_PlayerProfile_v1";
const AUTOSAVE_SECONDS = 120;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_SECONDS = 0.4;

function defaultProfile(): PersistentProfile {
  return {
    schemaVersion: 1,
    xp: 0,
    level: 1,
    credits: 0,
    matchesPlayed: 0,
    successfulExtractions: 0,
    lastSavedAt: os.time(),
  };
}

function sanitizeNumber(value: unknown, fallback: number, minimum = 0, maximum = 1e12): number {
  if (
    !typeIs(value, "number") ||
    value !== value ||
    math.abs(value) >= math.huge ||
    value < minimum ||
    value > maximum
  ) {
    return fallback;
  }
  return math.floor(value);
}

function sanitizeProfile(value: unknown): PersistentProfile {
  const fallback = defaultProfile();
  if (!typeIs(value, "table")) {
    return fallback;
  }

  const raw = value as Partial<PersistentProfile>;
  const xp = sanitizeNumber(raw.xp, fallback.xp);
  return {
    schemaVersion: 1,
    xp,
    level: math.max(1, math.floor(xp / 500) + 1),
    credits: sanitizeNumber(raw.credits, fallback.credits),
    matchesPlayed: sanitizeNumber(raw.matchesPlayed, fallback.matchesPlayed),
    successfulExtractions: sanitizeNumber(
      raw.successfulExtractions,
      fallback.successfulExtractions,
    ),
    lastSavedAt: sanitizeNumber(raw.lastSavedAt, fallback.lastSavedAt),
  };
}

export class ProfileStoreService {
  private readonly store: DataStore | undefined;
  private readonly unsafeToSave = new Set<number>();
  private shuttingDown = false;

  public constructor() {
    const [success, result] = pcall(() => DataStoreService.GetDataStore(PROFILE_STORE_NAME));
    if (success) {
      this.store = result;
    } else {
      this.store = undefined;
      warn("[ProfileStore] DataStore non disponibile: uso profili temporanei per questa sessione.");
    }
  }

  public load(player: Player): PersistentProfile {
    const store = this.store;
    if (store === undefined) {
      return defaultProfile();
    }
    const key = this.keyFor(player);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const [success, result] = pcall(() => {
        const [value] = store.GetAsync(key);
        return value;
      });
      if (success) {
        this.unsafeToSave.delete(player.UserId);
        return sanitizeProfile(result);
      }
      warn(`[ProfileStore] Load attempt ${attempt} failed for ${player.Name}.`, result);
      if (attempt < MAX_ATTEMPTS) {
        task.wait(RETRY_BASE_SECONDS * attempt);
      }
    }
    this.unsafeToSave.add(player.UserId);
    warn(`[ProfileStore] Using a temporary session profile for ${player.Name}.`);
    return defaultProfile();
  }

  public save(player: Player, profile: PersistentProfile): boolean {
    const store = this.store;
    if (store === undefined) {
      return false;
    }
    if (this.unsafeToSave.has(player.UserId)) {
      warn(
        `[ProfileStore] Save skipped for ${player.Name}: this server could not safely load the stored profile.`,
      );
      return false;
    }
    profile.lastSavedAt = os.time();
    const payload = { ...profile };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const [success, result] = pcall(() => {
        store.UpdateAsync(this.keyFor(player), () => $tuple(payload));
      });
      if (success) {
        return true;
      }
      warn(`[ProfileStore] Save attempt ${attempt} failed for ${player.Name}.`, result);
      if (attempt < MAX_ATTEMPTS) {
        task.wait(RETRY_BASE_SECONDS * attempt);
      }
    }
    return false;
  }

  public startAutosave(
    players: () => ReadonlyArray<Player>,
    profileFor: (player: Player) => PersistentProfile | undefined,
  ): void {
    task.spawn(() => {
      while (!this.shuttingDown) {
        task.wait(AUTOSAVE_SECONDS);
        for (const player of players()) {
          const profile = profileFor(player);
          if (profile !== undefined) {
            this.save(player, profile);
          }
        }
      }
    });
  }

  public beginShutdown(): void {
    this.shuttingDown = true;
  }

  public isStudioFallbackExpected(): boolean {
    return RunService.IsStudio();
  }

  private keyFor(player: Player): string {
    return `player_${player.UserId}`;
  }
}
