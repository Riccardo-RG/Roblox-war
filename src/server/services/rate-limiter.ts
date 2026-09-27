export class RateLimiter {
  private readonly lastActions = new Map<Player, Map<string, number>>();

  public allow(player: Player, action: string, minimumIntervalSeconds: number): boolean {
    let actions = this.lastActions.get(player);
    if (actions === undefined) {
      actions = new Map<string, number>();
      this.lastActions.set(player, actions);
    }
    const now = os.clock();
    const previous = actions.get(action);

    if (previous !== undefined && now - previous < minimumIntervalSeconds) {
      return false;
    }

    actions.set(action, now);
    return true;
  }

  public removePlayer(player: Player): void {
    this.lastActions.delete(player);
  }
}
