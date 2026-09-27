import { Teams } from "@rbxts/services";
import { MAX_SQUAD_SIZE } from "shared/catalog/match-config";
import type { TeamScore } from "shared/types/game";

const TEAM_DEFINITIONS = [
  { name: "Comete", color: new BrickColor("Bright blue") },
  { name: "Volpi", color: new BrickColor("Bright orange") },
  { name: "Giada", color: new BrickColor("Lime green") },
  { name: "Nebula", color: new BrickColor("Royal purple") },
  { name: "Coralli", color: new BrickColor("Hot pink") },
  { name: "Solari", color: new BrickColor("New Yeller") },
] as const;

export class TeamService {
  public readonly changed = new Instance("BindableEvent");
  private readonly managedTeams = new Array<Team>();
  private readonly scores = new Map<string, number>();
  private readonly reservations = new Map<number, { teamName: string; until: number }>();

  public initialize(): void {
    for (const definition of TEAM_DEFINITIONS) {
      let team = Teams.FindFirstChild(definition.name) as Team | undefined;
      if (team === undefined) {
        team = new Instance("Team");
        team.Name = definition.name;
        team.Parent = Teams;
      }
      team.AutoAssignable = false;
      team.TeamColor = definition.color;
      this.managedTeams.push(team);
      this.scores.set(team.Name, 0);
    }
  }

  public assign(player: Player): Team | undefined {
    let selected: Team | undefined;
    for (const team of this.managedTeams) {
      if (this.occupancy(team, player.UserId) >= MAX_SQUAD_SIZE) {
        continue;
      }
      if (
        selected === undefined ||
        this.occupancy(team, player.UserId) < this.occupancy(selected, player.UserId)
      ) {
        selected = team;
      }
    }

    // A soft reconnect reservation must not strand a new arrival in spectator mode.
    // Preserve reservations when capacity allows, otherwise use a genuinely vacant seat.
    if (selected === undefined) {
      for (const team of this.managedTeams) {
        if (
          team.GetPlayers().size() < MAX_SQUAD_SIZE &&
          (selected === undefined || team.GetPlayers().size() < selected.GetPlayers().size())
        )
          selected = team;
      }
    }
    if (selected === undefined) {
      player.Team = undefined;
      player.Neutral = true;
      return undefined;
    }
    player.Team = selected;
    player.Neutral = false;
    this.reservations.delete(player.UserId);
    return selected;
  }

  public assignNamed(player: Player, teamName: string): Team | undefined {
    const requested = this.managedTeams.find((team) => team.Name === teamName);
    if (requested !== undefined) {
      if (this.occupancy(requested, player.UserId) < MAX_SQUAD_SIZE) {
        player.Team = requested;
        player.Neutral = false;
        this.reservations.delete(player.UserId);
        return requested;
      }
      return this.assign(player);
    }
    return this.assign(player);
  }

  public areFriendly(first: Player, second: Player): boolean {
    return first.Team !== undefined && first.Team === second.Team;
  }

  public nameFor(player: Player): string {
    return player.Team?.Name ?? "Unassigned";
  }

  public all(): ReadonlyArray<Team> {
    return this.managedTeams;
  }

  public addScore(player: Player, amount: number): void {
    const teamName = this.nameFor(player);
    if (amount <= 0 || !this.scores.has(teamName)) {
      return;
    }
    this.scores.set(teamName, (this.scores.get(teamName) ?? 0) + math.floor(amount));
    this.changed.Fire();
  }

  public scoreSnapshot(): ReadonlyArray<TeamScore> {
    const result = new Array<TeamScore>();
    for (const team of this.managedTeams) {
      result.push({ teamName: team.Name, score: this.scores.get(team.Name) ?? 0 });
    }
    result.sort((a, b) => (a.score === b.score ? a.teamName < b.teamName : a.score > b.score));
    return result;
  }

  public winner(): TeamScore | undefined {
    return this.scoreSnapshot()[0];
  }

  public resetScores(): void {
    this.reservations.clear();
    for (const team of this.managedTeams) {
      this.scores.set(team.Name, 0);
    }
    this.changed.Fire();
  }

  public reserve(player: Player, seconds: number): void {
    if (player.Team !== undefined)
      this.reservations.set(player.UserId, {
        teamName: player.Team.Name,
        until: os.clock() + seconds,
      });
  }

  private occupancy(team: Team, joiningUserId: number): number {
    let count = team
      .GetPlayers()
      .filter((player) => player.UserId !== joiningUserId)
      .size();
    for (const [userId, reservation] of this.reservations) {
      if (reservation.until <= os.clock()) {
        this.reservations.delete(userId);
        continue;
      }
      if (
        userId !== joiningUserId &&
        reservation.teamName === team.Name &&
        !team.GetPlayers().some((player) => player.UserId === userId)
      )
        count += 1;
    }
    return count;
  }
}
