export class RateLimiter {
  private readonly lastActions = new Map<string, number>();

  public allow(player: Player, action: string, minimumIntervalSeconds: number): boolean {
    const key = `${player.UserId}:${action}`;
    const now = os.clock();
    const previous = this.lastActions.get(key);

    if (previous !== undefined && now - previous < minimumIntervalSeconds) {
      return false;
    }

    this.lastActions.set(key, now);
    return true;
  }

  public removePlayer(player: Player): void {
    const prefix = `${player.UserId}:`;
    for (const [key] of this.lastActions) {
      if (key.sub(1, prefix.size()) === prefix) {
        this.lastActions.delete(key);
      }
    }
  }
}
