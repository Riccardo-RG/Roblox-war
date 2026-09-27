import { CollectionService, Players, Workspace } from "@rbxts/services";
import {
  DEPOT_CAPACITY,
  DEPOT_PROTECTED_RESERVE,
  DEPOT_STEAL_LIMIT,
  DEPOT_WITHDRAW_LIMIT,
} from "shared/catalog/match-config";
import { localized, sourceFor, type LocalizedMessage } from "shared/localization/translations";
import type { TeamDepotSnapshot } from "shared/types/game";
import { getCampPosition } from "server/world/world-layout";
import { canInteract, livingRoot } from "server/services/interaction-guard";
import { MatchService } from "server/services/match-service";
import { PlayerStateService } from "server/services/player-state-service";
import { TeamService } from "server/services/team-service";

interface Depot {
  readonly part: Part;
  readonly label: TextLabel;
  cores: number;
}
interface DepotHold {
  readonly depot: Depot;
  readonly startedAt: number;
  readonly health: number;
  readonly character: Model;
  readonly requiredSeconds: number;
  readonly damageConnection: RBXScriptConnection;
  endedAt?: number;
}

/** Finite, round-scoped shared storage. Transfers are atomic and never yield. */
export class DepotService {
  private readonly depots = new Map<string, Depot>();
  private readonly holds = new Map<Player, DepotHold>();

  public constructor(
    private readonly state: PlayerStateService,
    private readonly teams: TeamService,
    private readonly match: MatchService,
    private readonly toast: (player: Player, message: LocalizedMessage) => void,
    private readonly changed: () => void,
    private readonly localization: LocalizationTable,
  ) {}

  public start(): void {
    const folder = new Instance("Folder");
    folder.Name = "TeamDepots";
    folder.Parent = Workspace.WaitForChild("World").WaitForChild("GeneratedWorld");
    for (let index = 0; index < this.teams.all().size(); index += 1) {
      const team = this.teams.all()[index]!;
      const camp = getCampPosition(index, this.teams.all().size());
      const position = camp.add(new Vector3(12, 3, 0));
      const part = new Instance("Part");
      part.Name = `Depot_${team.Name}`;
      part.Size = new Vector3(6, 6, 5);
      part.CFrame = new CFrame(position);
      part.Anchored = true;
      part.Material = Enum.Material.Metal;
      part.Color = Color3.fromRGB(49, 61, 64);
      part.SetAttribute("OwnerTeam", team.Name);
      part.SetAttribute("Capacity", DEPOT_CAPACITY);
      part.Parent = folder;
      CollectionService.AddTag(part, "TeamDepot");
      const stripe = new Instance("Part");
      stripe.Name = "TeamStripe";
      stripe.Size = new Vector3(6.04, 0.5, 5.04);
      stripe.CFrame = part.CFrame;
      stripe.Anchored = true;
      stripe.CanCollide = false;
      stripe.CanQuery = false;
      stripe.CanTouch = false;
      stripe.Color = team.TeamColor.Color;
      stripe.Material = Enum.Material.SmoothPlastic;
      stripe.Parent = part;

      const display = new Instance("BillboardGui");
      display.Name = "DepotStatus";
      display.Size = UDim2.fromOffset(170, 42);
      display.StudsOffset = new Vector3(0, 4.4, 0);
      display.MaxDistance = 70;
      display.AlwaysOnTop = false;
      display.Parent = part;
      const label = new Instance("TextLabel");
      label.Size = UDim2.fromScale(1, 1);
      label.BackgroundColor3 = Color3.fromRGB(19, 28, 32);
      label.BackgroundTransparency = 0.12;
      label.TextColor3 = Color3.fromRGB(239, 244, 239);
      label.Font = Enum.Font.GothamMedium;
      label.TextSize = 16;
      label.Parent = display;
      const depot: Depot = { part, label, cores: 0 };
      this.depots.set(team.Name, depot);
      this.update(depot);

      const prompt = new Instance("ProximityPrompt");
      prompt.Name = "DepotPrompt";
      prompt.ActionText = sourceFor("prompt.depot_access");
      prompt.ObjectText = sourceFor("prompt.team_depot");
      prompt.RootLocalizationTable = this.localization;
      prompt.AutoLocalize = true;
      prompt.KeyboardKeyCode = Enum.KeyCode.E;
      prompt.GamepadKeyCode = Enum.KeyCode.ButtonX;
      prompt.RequiresLineOfSight = true;
      prompt.MaxActivationDistance = 10;
      prompt.HoldDuration = 6;
      prompt.Parent = part;
      prompt.PromptButtonHoldBegan.Connect((player) => {
        this.cancelHold(player);
        const humanoid = player.Character?.FindFirstChildOfClass("Humanoid");
        const character = player.Character;
        if (humanoid !== undefined && character !== undefined && this.eligible(player, depot)) {
          let health = humanoid.Health;
          const damageConnection = humanoid.HealthChanged.Connect((nextHealth) => {
            if (nextHealth < health) this.cancelHold(player);
            health = nextHealth;
          });
          this.holds.set(player, {
            depot,
            startedAt: os.clock(),
            health: humanoid.Health,
            character,
            damageConnection,
            requiredSeconds:
              depot.part.GetAttribute("OwnerTeam") === this.teams.nameFor(player) ? 1 : 6,
          });
        }
      });
      prompt.PromptButtonHoldEnded.Connect((player) => {
        const hold = this.holds.get(player);
        if (hold?.depot !== depot) return;
        if (os.clock() - hold.startedAt < hold.requiredSeconds - 0.1) this.cancelHold(player);
        else hold.endedAt = os.clock(); // Short grace permits either success-event ordering.
      });
      prompt.Triggered.Connect((player) => this.access(player, depot));
    }
    task.spawn(() => {
      while (folder.Parent !== undefined) {
        task.wait(0.2);
        for (const [player, hold] of this.holds) {
          const health = player.Character?.FindFirstChildOfClass("Humanoid")?.Health ?? 0;
          if (
            !this.eligible(player, hold.depot) ||
            player.Character !== hold.character ||
            health < hold.health ||
            os.clock() - hold.startedAt > 12 ||
            (hold.endedAt !== undefined && os.clock() - hold.endedAt > 0.75)
          ) {
            this.cancelHold(player);
          }
        }
      }
    });
  }

  public snapshot(player: Player): TeamDepotSnapshot | undefined {
    const depot = this.depots.get(this.teams.nameFor(player));
    return depot !== undefined
      ? { storedCores: depot.cores, capacity: DEPOT_CAPACITY, position: depot.part.Position }
      : undefined;
  }

  public resetAll(): void {
    for (const [player] of this.holds) this.cancelHold(player);
    for (const [, depot] of this.depots) {
      depot.cores = 0;
      this.update(depot);
    }
    this.changed();
  }

  public removePlayer(player: Player): void {
    this.cancelHold(player);
  }

  private cancelHold(player: Player): void {
    this.holds.get(player)?.damageConnection.Disconnect();
    this.holds.delete(player);
  }

  private eligible(player: Player, depot: Depot): boolean {
    return (
      player.Parent === Players &&
      this.state.get(player)?.isSpectator === false &&
      this.match.currentPhase() !== "Complete" &&
      livingRoot(player) !== undefined &&
      canInteract(player, depot.part, 11)
    );
  }

  private access(player: Player, depot: Depot): void {
    const hold = this.holds.get(player);
    this.cancelHold(player);
    const own = depot.part.GetAttribute("OwnerTeam") === this.teams.nameFor(player);
    if (
      !this.eligible(player, depot) ||
      hold?.depot !== depot ||
      player.Character !== hold.character ||
      (player.Character?.FindFirstChildOfClass("Humanoid")?.Health ?? 0) < hold.health ||
      os.clock() - hold.startedAt < hold.requiredSeconds - 0.1 ||
      (hold.endedAt !== undefined && os.clock() - hold.endedAt > 0.75)
    )
      return;
    if (!own && !this.match.allowsRaiding()) {
      this.toast(player, localized("toast.depot_locked"));
      return;
    }
    if (own && this.match.currentPhase() !== "Extraction") {
      const carried = this.state.amount(player, "energy_core");
      const count = math.min(carried, DEPOT_CAPACITY - depot.cores);
      if (count <= 0) {
        this.toast(player, localized(carried === 0 ? "toast.depot_no_cores" : "toast.depot_full"));
        return;
      }
      if (!this.state.consume(player, "energy_core", count)) return;
      depot.cores += count;
      this.state.recordAction(player, "deposited", count);
      this.toast(player, localized("toast.depot_deposited", { count }));
    } else {
      const available = own ? depot.cores : math.max(0, depot.cores - DEPOT_PROTECTED_RESERVE);
      const count = math.min(available, own ? DEPOT_WITHDRAW_LIMIT : DEPOT_STEAL_LIMIT);
      if (count === 0) {
        this.toast(player, localized("toast.depot_empty"));
        return;
      }
      const accepted = this.state.add(player, "energy_core", count);
      if (accepted === 0) {
        this.toast(player, localized("toast.inventory_full"));
        return;
      }
      depot.cores -= accepted;
      this.toast(
        player,
        localized(own ? "toast.depot_withdrawn" : "toast.depot_stolen", { count: accepted }),
      );
    }
    this.update(depot);
    this.changed();
  }

  private update(depot: Depot): void {
    depot.part.SetAttribute("StoredCores", depot.cores);
    depot.label.Text = `${depot.part.GetAttribute("OwnerTeam")}  ·  ${depot.cores}/${DEPOT_CAPACITY}`;
  }
}
