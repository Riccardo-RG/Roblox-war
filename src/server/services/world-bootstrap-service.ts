import { CollectionService, Lighting, Workspace } from "@rbxts/services";
import { ITEMS, type ItemId } from "shared/catalog/items";

const RESOURCE_SEQUENCE: ReadonlyArray<ItemId> = ["wood", "stone", "scrap", "fiber"];

function createPart(
  name: string,
  size: Vector3,
  cframe: CFrame,
  color: Color3,
  material: Enum.Material,
  parent: Instance,
): Part {
  const part = new Instance("Part");
  part.Name = name;
  part.Anchored = true;
  part.Size = size;
  part.CFrame = cframe;
  part.Color = color;
  part.Material = material;
  part.TopSurface = Enum.SurfaceType.Smooth;
  part.BottomSurface = Enum.SurfaceType.Smooth;
  part.Parent = parent;
  return part;
}

export class WorldBootstrapService {
  public initialize(teams: ReadonlyArray<Team>): void {
    const world = Workspace.WaitForChild("World") as Folder;
    world.ClearAllChildren();
    Workspace.FindFirstChild("Baseplate")?.Destroy();

    const generated = new Instance("Folder");
    generated.Name = "GeneratedWorld";
    generated.Parent = world;

    const resources = new Instance("Folder");
    resources.Name = "Resources";
    resources.Parent = generated;

    const monuments = new Instance("Folder");
    monuments.Name = "Monuments";
    monuments.Parent = generated;

    const builds = new Instance("Folder");
    builds.Name = "Builds";
    builds.Parent = generated;

    const enemies = new Instance("Folder");
    enemies.Name = "Enemies";
    enemies.Parent = generated;

    this.createEnvironment(generated);
    this.createSpawns(generated, teams);
    this.createMonuments(monuments);
    this.createResourceField(resources);
    this.configureLighting();
  }

  private createEnvironment(parent: Instance): void {
    createPart(
      "Island",
      new Vector3(600, 8, 600),
      new CFrame(0, -4, 0),
      Color3.fromRGB(98, 143, 82),
      Enum.Material.Grass,
      parent,
    );

    const water = createPart(
      "Water",
      new Vector3(850, 4, 850),
      new CFrame(0, -10, 0),
      Color3.fromRGB(55, 145, 190),
      Enum.Material.Glass,
      parent,
    );
    water.Transparency = 0.35;
    water.CanCollide = false;
    water.CanQuery = false;

    const boundaryFolder = new Instance("Folder");
    boundaryFolder.Name = "Boundaries";
    boundaryFolder.Parent = parent;
    const boundaryData = [
      [new Vector3(620, 60, 4), new CFrame(0, 26, -302)],
      [new Vector3(620, 60, 4), new CFrame(0, 26, 302)],
      [new Vector3(4, 60, 620), new CFrame(-302, 26, 0)],
      [new Vector3(4, 60, 620), new CFrame(302, 26, 0)],
    ] as const;
    for (const [size, cframe] of boundaryData) {
      const wall = createPart(
        "WorldBoundary",
        size,
        cframe,
        Color3.fromRGB(255, 255, 255),
        Enum.Material.SmoothPlastic,
        boundaryFolder,
      );
      wall.Transparency = 1;
    }
  }

  private createSpawns(parent: Instance, teams: ReadonlyArray<Team>): void {
    const spawns = new Instance("Folder");
    spawns.Name = "Spawns";
    spawns.Parent = parent;

    assert(teams.size() > 0, "Teams must be initialized before the world is generated.");
    for (let index = 0; index < teams.size(); index += 1) {
      const team = teams[index]!;
      const angle = (index / teams.size()) * math.pi * 2;
      const position = new Vector3(math.cos(angle) * 205, 1, math.sin(angle) * 205);
      const spawn = new Instance("SpawnLocation");
      spawn.Name = `CampSpawn_${team.Name}`;
      spawn.Anchored = true;
      spawn.Size = new Vector3(12, 1, 12);
      spawn.Position = position;
      spawn.Neutral = false;
      spawn.TeamColor = team.TeamColor;
      spawn.AllowTeamChangeOnTouch = false;
      spawn.Duration = 5;
      spawn.Transparency = 0.25;
      spawn.Material = Enum.Material.Neon;
      spawn.Color = team.TeamColor.Color;
      spawn.Parent = spawns;
    }
  }

  private createMonuments(parent: Instance): void {
    const definitions = [
      {
        name: "Deposito",
        position: new Vector3(-115, 0, -70),
        color: Color3.fromRGB(232, 151, 65),
      },
      {
        name: "Laboratorio",
        position: new Vector3(120, 0, -65),
        color: Color3.fromRGB(82, 165, 232),
      },
      { name: "Centrale", position: new Vector3(0, 0, 125), color: Color3.fromRGB(178, 101, 226) },
    ] as const;

    for (const definition of definitions) {
      const model = new Instance("Model");
      model.Name = definition.name;
      model.Parent = parent;

      createPart(
        "Platform",
        new Vector3(62, 2, 50),
        new CFrame(definition.position.add(new Vector3(0, 1, 0))),
        Color3.fromRGB(92, 98, 105),
        Enum.Material.Concrete,
        model,
      );
      createPart(
        "Tower",
        new Vector3(16, 18, 16),
        new CFrame(definition.position.add(new Vector3(0, 10, 0))),
        definition.color,
        Enum.Material.Metal,
        model,
      );
      const beacon = createPart(
        "Beacon",
        new Vector3(4, 24, 4),
        new CFrame(definition.position.add(new Vector3(0, 22, 0))),
        Color3.fromRGB(94, 234, 255),
        Enum.Material.Neon,
        model,
      );
      beacon.CanCollide = false;

      const workbench = createPart(
        "PublicWorkbench",
        new Vector3(7, 3, 3),
        new CFrame(definition.position.add(new Vector3(18, 2.5, 8))),
        Color3.fromRGB(80, 106, 122),
        Enum.Material.Metal,
        model,
      );
      CollectionService.AddTag(workbench, "Workbench");
    }

    const extraction = createPart(
      "ExtractionZone",
      new Vector3(2, 34, 34),
      CFrame.Angles(0, 0, math.pi / 2).add(new Vector3(0, 1.1, 0)),
      Color3.fromRGB(70, 235, 255),
      Enum.Material.Neon,
      parent,
    );
    extraction.Shape = Enum.PartType.Cylinder;
    extraction.Transparency = 0.7;
    extraction.CanCollide = false;
    extraction.SetAttribute("ExtractionZone", true);
  }

  private createResourceField(parent: Instance): void {
    const random = new Random(9071987);
    for (let index = 0; index < 76; index += 1) {
      const itemId = RESOURCE_SEQUENCE[index % RESOURCE_SEQUENCE.size()]!;
      const radius = random.NextNumber(35, 265);
      const angle = random.NextNumber(0, math.pi * 2);
      const position = new Vector3(math.cos(angle) * radius, 0, math.sin(angle) * radius);
      this.createResourceNode(parent, itemId, position, index + 1);
    }

    const corePositions = [
      new Vector3(-115, 4, -70),
      new Vector3(120, 4, -65),
      new Vector3(0, 4, 125),
    ];
    for (let index = 0; index < corePositions.size(); index += 1) {
      this.createResourceNode(parent, "energy_core", corePositions[index]!, 1000 + index);
    }
  }

  private createResourceNode(
    parent: Instance,
    itemId: ItemId,
    groundPosition: Vector3,
    index: number,
  ): void {
    const definition = ITEMS[itemId];
    const size =
      itemId === "wood"
        ? new Vector3(4, 12, 4)
        : itemId === "fiber"
          ? new Vector3(5, 4, 5)
          : itemId === "energy_core"
            ? new Vector3(4, 7, 4)
            : new Vector3(6, 6, 6);
    const material =
      itemId === "wood"
        ? Enum.Material.Wood
        : itemId === "stone"
          ? Enum.Material.Slate
          : itemId === "energy_core"
            ? Enum.Material.Neon
            : Enum.Material.SmoothPlastic;
    const position = groundPosition.add(new Vector3(0, size.Y / 2, 0));
    const node = createPart(
      `${definition.displayName}_${index}`,
      size,
      new CFrame(position),
      definition.color,
      material,
      parent,
    );

    if (itemId === "stone" || itemId === "fiber") {
      node.Shape = Enum.PartType.Ball;
    }
    node.SetAttribute("ResourceItemId", itemId);
    node.SetAttribute("Remaining", itemId === "energy_core" ? 100 : 60);
    node.SetAttribute("MaximumRemaining", itemId === "energy_core" ? 100 : 60);
    node.SetAttribute("YieldPerHit", itemId === "energy_core" ? 1 : 5);
    node.SetAttribute("RespawnSeconds", itemId === "energy_core" ? 90 : 24);
    CollectionService.AddTag(node, "ResourceNode");
  }

  private configureLighting(): void {
    if (Lighting.FindFirstChildOfClass("Atmosphere") === undefined) {
      const atmosphere = new Instance("Atmosphere");
      atmosphere.Density = 0.28;
      atmosphere.Offset = 0.2;
      atmosphere.Color = Color3.fromRGB(196, 222, 255);
      atmosphere.Decay = Color3.fromRGB(105, 126, 155);
      atmosphere.Glare = 0.15;
      atmosphere.Haze = 1.2;
      atmosphere.Parent = Lighting;
    }
  }
}
