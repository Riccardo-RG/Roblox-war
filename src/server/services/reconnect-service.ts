import type { MatchResumeState } from "server/services/player-state-service";

const RECONNECT_WINDOW_SECONDS = 180;

interface CachedReconnectState {
  readonly disconnectedAt: number;
  readonly teamName: string;
  readonly state: MatchResumeState;
}

export class ReconnectService {
  private readonly cache = new Map<number, CachedReconnectState>();

  public remember(userId: number, teamName: string, state: MatchResumeState): void {
    this.cache.set(userId, {
      disconnectedAt: os.clock(),
      teamName,
      state,
    });
  }

  public take(userId: number): CachedReconnectState | undefined {
    const cached = this.cache.get(userId);
    this.cache.delete(userId);
    if (cached === undefined || os.clock() - cached.disconnectedAt > RECONNECT_WINDOW_SECONDS) {
      return undefined;
    }
    return cached;
  }

  public clear(): void {
    this.cache.clear();
  }

  public startCleanup(): void {
    task.spawn(() => {
      while (true) {
        task.wait(30);
        const now = os.clock();
        for (const [userId, cached] of this.cache) {
          if (now - cached.disconnectedAt > RECONNECT_WINDOW_SECONDS) {
            this.cache.delete(userId);
          }
        }
      }
    });
  }
}
