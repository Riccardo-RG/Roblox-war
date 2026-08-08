import { CollectionService, Workspace } from "@rbxts/services";
import { ITEMS, type ItemId } from "shared/catalog/items";
import { localized, type LocalizedMessage } from "shared/localization/translations";
import type { MatchPhase } from "shared/types/game";

const EVENT_POSITIONS = [
  new Vector3(-72, 4, 42),
  new Vector3(78, 4, 35),
  new Vector3(-48, 4, -132),
  new Vector3(62, 4, -142),
];

export class WorldEventService {
  private readonly eventFolder: Folder;
  private readonly random = new Random(66204);

  public constructor(private readonly announce: (message: LocalizedMessage) => void) {
    this.eventFolder = new Instance("Folder");
    this.eventFolder.Name = "PublicEvents";
    this.eventFolder.Parent = Workspace.WaitForChild("World").WaitForChild("GeneratedWorld");
  }

  public onPhaseChanged(phase: MatchPhase): void {
    this.eventFolder.ClearAllChildren();
    if (phase === "Conflict") {
      const position = this.randomPosition();
      this.spawnCache("Cassa di recupero", "scrap", position, 120, 12);
      this.announce(localized("toast.event_cache", { coordinates: this.coordinates(position) }));
    } else if (phase === "Raid") {
      const position = this.randomPosition();
      this.spawnCache("Nucleo instabile", "energy_core", position, 100, 1);
      this.announce(localized("toast.event_core", { coordinates: this.coordinates(position) }));
    }
  }

  private spawnCache(
    name: string,
    itemId: ItemId,
    position: Vector3,
    remaining: number,
    yieldPerHit: number,
  ): void {
    const container = new Instance("Model");
    container.Name = name;
    container.Parent = this.eventFolder;

    const pad = new Instance("Part");
    pad.Name = "EventPad";
    pad.Anchored = true;
    pad.CanCollide = true;
    pad.Size = new Vector3(18, 1, 18);
    pad.CFrame = new CFrame(position.sub(new Vector3(0, 3.5, 0)));
    pad.Color = Color3.fromRGB(46, 57, 72);
    pad.Material = Enum.Material.Metal;
    pad.Parent = container;

    const cache = new Instance("Part");
    cache.Name = "EventCache";
    cache.Anchored = true;
    cache.CanCollide = true;
    cache.Size = itemId === "energy_core" ? new Vector3(6, 8, 6) : new Vector3(9, 6, 7);
    cache.CFrame = new CFrame(position);
    cache.Color = ITEMS[itemId].color;
    cache.Material = itemId === "energy_core" ? Enum.Material.Neon : Enum.Material.DiamondPlate;
    cache.SetAttribute("ResourceItemId", itemId);
    cache.SetAttribute("Remaining", remaining);
    cache.SetAttribute("MaximumRemaining", remaining);
    cache.SetAttribute("YieldPerHit", yieldPerHit);
    cache.SetAttribute("RespawnSeconds", 999);
    cache.Parent = container;
    CollectionService.AddTag(cache, "ResourceNode");

    const beacon = new Instance("Part");
    beacon.Name = "EventBeacon";
    beacon.Anchored = true;
    beacon.CanCollide = false;
    beacon.CanQuery = false;
    beacon.Size = new Vector3(2, 65, 2);
    beacon.CFrame = new CFrame(position.add(new Vector3(0, 35, 0)));
    beacon.Color = ITEMS[itemId].color;
    beacon.Material = Enum.Material.Neon;
    beacon.Transparency = 0.3;
    beacon.Parent = container;

    const light = new Instance("PointLight");
    light.Color = ITEMS[itemId].color;
    light.Range = 30;
    light.Brightness = 2;
    light.Parent = cache;
  }

  private randomPosition(): Vector3 {
    return EVENT_POSITIONS[this.random.NextInteger(1, EVENT_POSITIONS.size()) - 1]!;
  }

  private coordinates(position: Vector3): string {
    return `${math.floor(position.X)}, ${math.floor(position.Z)}`;
  }
}
