import { Workspace } from "@rbxts/services";
import type { ItemId } from "shared/catalog/items";
import { localized, sourceFor, type LocalizedMessage } from "shared/localization/translations";
import { PlayerStateService } from "server/services/player-state-service";
import { TeamService } from "server/services/team-service";
import { canInteract } from "server/services/interaction-guard";

const TEAM_PRIORITY_SECONDS = 7;
const LOOT_LIFETIME_SECONDS = 120;

export class LootService {
  private readonly folder: Folder;

  public constructor(
    private readonly playerState: PlayerStateService,
    private readonly teams: TeamService,
    private readonly toast: (player: Player, message: LocalizedMessage) => void,
    private readonly localizationTable: LocalizationTable,
  ) {
    this.folder = new Instance("Folder");
    this.folder.Name = "Loot";
    this.folder.Parent = Workspace.WaitForChild("World").WaitForChild("GeneratedWorld");
  }

  public dropFromElimination(player: Player, position: Vector3): void {
    const entries = this.playerState.takeEliminationLoot(player);
    if (entries.size() === 0) {
      return;
    }

    const remaining = new Map<ItemId, number>();
    for (const entry of entries) {
      remaining.set(entry.itemId, entry.amount);
    }

    const safePosition = new Vector3(
      math.clamp(position.X, -280, 280),
      math.clamp(position.Y, 1, 70),
      math.clamp(position.Z, -280, 280),
    );
    const crate = new Instance("Part");
    crate.Name = `CassaRecupero_${player.UserId}`;
    crate.Anchored = true;
    crate.CanCollide = true;
    crate.Size = new Vector3(4.5, 3.2, 4.5);
    crate.CFrame = new CFrame(safePosition.add(new Vector3(0, 2.1, 0))).mul(
      CFrame.Angles(0, math.rad(45), 0),
    );
    crate.Color = Color3.fromRGB(68, 91, 112);
    crate.Material = Enum.Material.Metal;
    crate.SetAttribute("OwnerTeam", this.teams.nameFor(player));
    crate.Parent = this.folder;

    const light = new Instance("PointLight");
    light.Color = Color3.fromRGB(89, 220, 240);
    light.Brightness = 1.4;
    light.Range = 12;
    light.Parent = crate;

    const prompt = new Instance("ProximityPrompt");
    prompt.Name = "LootPrompt";
    prompt.ActionText = sourceFor("prompt.recover");
    prompt.ObjectText = sourceFor("prompt.recovery_cache");
    prompt.AutoLocalize = true;
    prompt.RootLocalizationTable = this.localizationTable;
    prompt.KeyboardKeyCode = Enum.KeyCode.E;
    prompt.GamepadKeyCode = Enum.KeyCode.ButtonX;
    prompt.MaxActivationDistance = 11;
    prompt.RequiresLineOfSight = true;
    prompt.HoldDuration = 0.35;
    prompt.Parent = crate;

    const ownerTeam = this.teams.nameFor(player);
    const teamPriorityEndsAt = Workspace.GetServerTimeNow() + TEAM_PRIORITY_SECONDS;
    let beingCollected = false;
    prompt.Triggered.Connect((collector) => {
      if (beingCollected || !crate.Parent) {
        return;
      }
      const state = this.playerState.get(collector);
      if (
        state === undefined ||
        state.isSpectator ||
        Workspace.GetAttribute("MatchPhase") === "Complete" ||
        !canInteract(collector, crate, 12)
      ) {
        return;
      }
      if (
        Workspace.GetServerTimeNow() < teamPriorityEndsAt &&
        this.teams.nameFor(collector) !== ownerTeam
      ) {
        this.toast(collector, localized("toast.loot_priority"));
        return;
      }

      beingCollected = true;
      let collected = 0;
      for (const [itemId, amount] of remaining) {
        const accepted = this.playerState.add(collector, itemId, amount);
        if (accepted > 0) {
          collected += accepted;
          const leftover = amount - accepted;
          if (leftover <= 0) {
            remaining.delete(itemId);
          } else {
            remaining.set(itemId, leftover);
          }
        }
      }
      beingCollected = false;

      if (collected <= 0) {
        this.toast(collector, localized("toast.inventory_full"));
        return;
      }
      this.toast(collector, localized("toast.items_recovered", { count: collected }));
      if (remaining.size() === 0) {
        crate.Destroy();
      }
    });

    task.delay(LOOT_LIFETIME_SECONDS, () => {
      if (crate.Parent) {
        crate.Destroy();
      }
    });
  }

  public resetAll(): void {
    this.folder.ClearAllChildren();
  }
}
