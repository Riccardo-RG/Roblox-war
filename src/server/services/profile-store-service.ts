import { DataStoreService, HttpService, RunService } from "@rbxts/services";
import type { PersistentProfile } from "shared/types/game";
import { canClaimProfileSession, canWriteProfileSession } from "shared/util/profile-session-policy";

const PROFILE_STORE_NAME = "WarWorld_PlayerProfile_v1";
const AUTOSAVE_SECONDS = 45;
const SESSION_LEASE_SECONDS = 180;
const MAX_ATTEMPTS = 4;
const RETRY_BASE_SECONDS = 0.75;

interface StoredProfile {
  readonly formatVersion: 2;
  readonly profile: PersistentProfile;
  readonly revision: number;
  readonly lastWriteId?: string;
  readonly session?: { readonly owner: string; readonly expiresAt: number };
}

interface ProfileSession {
  readonly owner: string;
  expiresAt: number;
  revision: number;
  temporary: boolean;
  released: boolean;
}

export type ProfileLoadFailure = "Unavailable" | "SessionInUse" | "UnsupportedData";

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

function readStoredProfile(value: unknown): StoredProfile | undefined {
  if (value === undefined) {
    return { formatVersion: 2, profile: defaultProfile(), revision: 0 };
  }
  if (!typeIs(value, "table")) {
    return undefined;
  }
  const raw = value as Partial<StoredProfile> & Partial<PersistentProfile>;
  if (raw.formatVersion === undefined && raw.schemaVersion === 1) {
    return { formatVersion: 2, profile: sanitizeProfile(value), revision: 0 };
  }
  if (raw.formatVersion !== 2 || !typeIs(raw.profile, "table") || raw.profile.schemaVersion !== 1) {
    return undefined;
  }
  let session: StoredProfile["session"];
  if (raw.session !== undefined) {
    if (
      !typeIs(raw.session, "table") ||
      !typeIs(raw.session.owner, "string") ||
      !typeIs(raw.session.expiresAt, "number") ||
      !(raw.session.expiresAt >= 0 && raw.session.expiresAt <= 1e12)
    ) {
      return undefined;
    }
    session = { owner: raw.session.owner, expiresAt: raw.session.expiresAt };
  }
  return {
    formatVersion: 2,
    profile: sanitizeProfile(raw.profile),
    revision: sanitizeNumber(raw.revision, 0),
    lastWriteId: typeIs(raw.lastWriteId, "string") ? raw.lastWriteId : undefined,
    session,
  };
}

export class ProfileStoreService {
  private readonly store: DataStore | undefined;
  private readonly sessions = new Map<Player, ProfileSession>();
  private readonly userQueues = new Map<number, { next: number; serving: number }>();
  private readonly loadFailures = new Map<Player, ProfileLoadFailure>();
  private shuttingDown = false;

  public constructor(private readonly onSessionLost?: (player: Player) => void) {
    const [success, result] = pcall(() => DataStoreService.GetDataStore(PROFILE_STORE_NAME));
    if (success) {
      this.store = result;
    } else {
      this.store = undefined;
      warn("[ProfileStore] DataStore unavailable. Persistent sessions cannot be opened.");
    }
  }

  public load(player: Player): PersistentProfile | undefined {
    this.acquireUserQueue(player.UserId);
    const [success, result] = pcall(() => this.loadExclusive(player));
    this.releaseUserQueue(player.UserId);
    if (success) {
      return result;
    }
    warn(`[ProfileStore] Unexpected load failure for ${player.UserId}.`, result);
    this.loadFailures.set(player, "Unavailable");
    return undefined;
  }

  public getLoadFailure(player: Player): ProfileLoadFailure | undefined {
    return this.loadFailures.get(player);
  }

  public forgetFailedLoad(player: Player): void {
    this.loadFailures.delete(player);
  }

  public isTemporary(player: Player): boolean {
    return this.sessions.get(player)?.temporary === true;
  }

  private loadExclusive(player: Player): PersistentProfile | undefined {
    const store = this.store;
    const owner = `${game.JobId}:${HttpService.GenerateGUID(false)}`;
    const key = this.keyFor(player);
    let failure: ProfileLoadFailure = "Unavailable";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (store === undefined || this.shuttingDown || player.Parent === undefined) {
        break;
      }
      let rejected: ProfileLoadFailure | undefined;
      const [success, result] = pcall(() => {
        const [value] = store.UpdateAsync(key, (current: unknown) => {
          const stored = readStoredProfile(current);
          if (stored === undefined) {
            rejected = "UnsupportedData";
            return $tuple(undefined);
          }
          const now = os.time();
          if (
            !canClaimProfileSession(
              stored.session?.owner,
              stored.session?.expiresAt ?? 0,
              owner,
              now,
            )
          ) {
            rejected = "SessionInUse";
            return $tuple(undefined);
          }
          rejected = undefined;
          return $tuple({
            ...stored,
            session: { owner, expiresAt: now + SESSION_LEASE_SECONDS },
          } satisfies StoredProfile);
        });
        return value;
      });
      if (success) {
        const claimed = readStoredProfile(result);
        if (rejected === undefined && claimed?.session?.owner === owner) {
          this.sessions.set(player, {
            owner,
            expiresAt: claimed.session.expiresAt,
            revision: claimed.revision,
            temporary: false,
            released: false,
          });
          this.loadFailures.delete(player);
          return claimed.profile;
        }
        failure = rejected ?? "Unavailable";
        if (failure === "UnsupportedData") {
          break;
        }
      } else {
        failure = "Unavailable";
        warn(`[ProfileStore] Load attempt ${attempt} failed for ${player.UserId}.`, result);
      }
      if (attempt < MAX_ATTEMPTS) {
        task.wait(RETRY_BASE_SECONDS * attempt);
      }
    }
    this.loadFailures.set(player, failure);
    // Studio must be playable without API access. These profiles can NEVER enter
    // the persistent save path, even if API access recovers later in the session.
    if (RunService.IsStudio() && failure === "Unavailable" && !this.shuttingDown) {
      this.sessions.set(player, {
        owner,
        expiresAt: 0,
        revision: 0,
        temporary: true,
        released: false,
      });
      warn(`[ProfileStore] Temporary Studio-only profile for ${player.UserId}.`);
      return defaultProfile();
    }
    return undefined;
  }

  public save(player: Player, profile: PersistentProfile): boolean {
    return this.writeQueued(player, profile, false);
  }

  public release(player: Player, profile: PersistentProfile): boolean {
    return this.writeQueued(player, profile, true);
  }

  private writeQueued(player: Player, profile: PersistentProfile, release: boolean): boolean {
    this.acquireUserQueue(player.UserId);
    const [success, result] = pcall(() => this.writeExclusive(player, profile, release));
    this.releaseUserQueue(player.UserId);
    if (release) {
      this.sessions.delete(player);
      this.loadFailures.delete(player);
    }
    if (!success) {
      warn(`[ProfileStore] Unexpected save failure for ${player.UserId}.`, result);
      return false;
    }
    return result;
  }

  private writeExclusive(player: Player, profile: PersistentProfile, release: boolean): boolean {
    const store = this.store;
    const session = this.sessions.get(player);
    if (session === undefined || session.released) {
      return false;
    }
    if (session.temporary) {
      if (release) {
        session.released = true;
        this.sessions.delete(player);
        this.loadFailures.delete(player);
      }
      return true;
    }
    if (store === undefined) {
      return false;
    }
    profile.lastSavedAt = os.time();
    // Snapshot after acquiring the queue: an older request cannot carry a stale
    // snapshot past a newer save from this server.
    const payload = sanitizeProfile(profile);
    const writeId = HttpService.GenerateGUID(false);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let ownershipLost = false;
      let alreadySaved = false;
      const [success, result] = pcall(() => {
        const [value] = store.UpdateAsync(this.keyFor(player), (current: unknown) => {
          const stored = readStoredProfile(current);
          const now = os.time();
          // UpdateAsync can commit yet fail to return to this server. A retry
          // must recognize that exact write, especially after releasing a lock.
          if (stored?.lastWriteId === writeId) {
            alreadySaved = true;
            ownershipLost = false;
            return $tuple(undefined);
          }
          alreadySaved = false;
          if (
            stored === undefined ||
            !canWriteProfileSession(
              stored.session?.owner,
              stored.session?.expiresAt ?? 0,
              session.owner,
              now,
            )
          ) {
            ownershipLost = true;
            return $tuple(undefined);
          }
          ownershipLost = false;
          return $tuple({
            formatVersion: 2,
            profile: payload,
            revision: stored.revision + 1,
            lastWriteId: writeId,
            session: release
              ? undefined
              : { owner: session.owner, expiresAt: now + SESSION_LEASE_SECONDS },
          } satisfies StoredProfile);
        });
        return value;
      });
      if (success && !ownershipLost && (result !== undefined || alreadySaved)) {
        const updated = readStoredProfile(result);
        // For an acknowledged retry the original lease still expires on its
        // original deadline; do not invent a fresh lease locally.
        session.expiresAt = updated?.session?.expiresAt ?? session.expiresAt;
        session.revision = updated?.revision ?? session.revision;
        if (release) {
          session.released = true;
          this.sessions.delete(player);
          this.loadFailures.delete(player);
        }
        return true;
      }
      if (ownershipLost) {
        session.released = true;
        warn(`[ProfileStore] Stale ownership rejected for ${player.UserId}; no data overwritten.`);
        if (player.Parent !== undefined) {
          this.closeUnsafeSession(player);
        }
        return false;
      }
      warn(`[ProfileStore] Save attempt ${attempt} failed for ${player.UserId}.`, result);
      if (attempt < MAX_ATTEMPTS) {
        task.wait(RETRY_BASE_SECONDS * attempt);
      }
    }
    if (os.time() >= session.expiresAt && player.Parent !== undefined) {
      session.released = true;
      this.closeUnsafeSession(player);
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
        if (this.shuttingDown) {
          break;
        }
        for (const player of players()) {
          const profile = profileFor(player);
          if (profile !== undefined) {
            // Players have independent queues; a throttled save must not starve
            // every later player's lease renewal.
            task.spawn(() => this.save(player, profile));
          }
        }
      }
    });
  }

  public beginShutdown(): void {
    this.shuttingDown = true;
  }

  /** Includes departed players whose load/save/release is still yielding or queued. */
  public hasPendingOperations(): boolean {
    return !this.userQueues.isEmpty();
  }

  public isStudioFallbackExpected(): boolean {
    return RunService.IsStudio();
  }

  private acquireUserQueue(userId: number): void {
    let queue = this.userQueues.get(userId);
    if (queue === undefined) {
      queue = { next: 0, serving: 0 };
      this.userQueues.set(userId, queue);
    }
    const ticket = queue.next;
    queue.next += 1;
    while (queue.serving !== ticket) {
      task.wait(0.05);
    }
  }

  private closeUnsafeSession(player: Player): void {
    if (this.onSessionLost !== undefined) {
      this.onSessionLost(player);
    } else {
      player.Kick("Your data session could not be saved safely. Please reconnect shortly.");
    }
  }

  private releaseUserQueue(userId: number): void {
    const queue = this.userQueues.get(userId);
    if (queue === undefined) {
      return;
    }
    queue.serving += 1;
    if (queue.serving === queue.next) {
      this.userQueues.delete(userId);
    }
  }

  private keyFor(player: Player): string {
    return `player_${player.UserId}`;
  }
}
