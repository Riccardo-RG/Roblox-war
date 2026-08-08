import { CollectionService, Lighting, Workspace } from "@rbxts/services";
import { ITEMS, type ItemId } from "shared/catalog/items";
import { createWorldPart, WorldArt } from "server/world/world-art";

const RESOURCE_SEQUENCE: ReadonlyArray<ItemId> = ["wood", "stone", "scrap", "fiber"];

export class WorldBootstrapService {
  private readonly art = new WorldArt();

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

    this.art.createEnvironment(generated);
    this.art.createSpawns(generated, teams);
    this.art.createMonuments(monuments);
    this.art.createScenery(generated);
    this.createResourceField(resources);
    this.configureLighting();
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
      new Vector3(-102, 0, -61),
      new Vector3(108, 0, -57),
      new Vector3(0, 0, 125),
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
    const centerHeight: Record<ItemId, number> = {
      wood: 6,
      stone: 2.6,
      scrap: 1.2,
      fiber: 1.25,
      energy_core: 3.5,
      multi_tool: 1,
      survival_blaster: 1,
      bandage: 1,
      breach_charge: 1,
    };
    const material =
      itemId === "wood"
        ? Enum.Material.Wood
        : itemId === "stone"
          ? Enum.Material.Rock
          : itemId === "energy_core"
            ? Enum.Material.Neon
            : itemId === "scrap"
              ? Enum.Material.CorrodedMetal
              : Enum.Material.LeafyGrass;
    const node = createWorldPart(
      `${definition.displayName}_${index}`,
      new Vector3(5, centerHeight[itemId] * 2, 5),
      new CFrame(groundPosition.add(new Vector3(0, centerHeight[itemId], 0))),
      definition.color,
      material,
      parent,
    );

    this.art.decorateResourceNode(node, itemId, new Random(index * 7919 + 211));
    node.SetAttribute("ResourceItemId", itemId);
    node.SetAttribute("Remaining", itemId === "energy_core" ? 100 : 60);
    node.SetAttribute("MaximumRemaining", itemId === "energy_core" ? 100 : 60);
    node.SetAttribute("YieldPerHit", itemId === "energy_core" ? 1 : 5);
    node.SetAttribute("RespawnSeconds", itemId === "energy_core" ? 90 : 24);
    CollectionService.AddTag(node, "ResourceNode");
  }

  private configureLighting(): void {
    Lighting.Ambient = Color3.fromRGB(70, 74, 82);
    Lighting.OutdoorAmbient = Color3.fromRGB(142, 150, 158);
    Lighting.Brightness = 2.05;
    Lighting.ClockTime = 15.2;
    Lighting.GeographicLatitude = 38;
    Lighting.EnvironmentDiffuseScale = 0.55;
    Lighting.EnvironmentSpecularScale = 0.4;
    Lighting.ExposureCompensation = -0.08;
    Lighting.GlobalShadows = true;
    Lighting.ShadowSoftness = 0.18;
    Lighting.ColorShift_Top = Color3.fromRGB(255, 252, 246);
    Lighting.ColorShift_Bottom = Color3.fromRGB(72, 76, 82);

    let atmosphere = Lighting.FindFirstChildOfClass("Atmosphere");
    if (atmosphere === undefined) {
      atmosphere = new Instance("Atmosphere");
      atmosphere.Parent = Lighting;
    }
    atmosphere.Density = 0.16;
    atmosphere.Offset = 0.05;
    atmosphere.Color = Color3.fromRGB(210, 224, 232);
    atmosphere.Decay = Color3.fromRGB(128, 143, 151);
    atmosphere.Glare = 0.015;
    atmosphere.Haze = 0.35;

    const existingColorGrade = Lighting.FindFirstChild("WarWorldColorGrade");
    let colorGrade: ColorCorrectionEffect;
    if (existingColorGrade?.IsA("ColorCorrectionEffect")) {
      colorGrade = existingColorGrade;
    } else {
      existingColorGrade?.Destroy();
      colorGrade = new Instance("ColorCorrectionEffect");
      colorGrade.Name = "WarWorldColorGrade";
      colorGrade.Parent = Lighting;
    }
    colorGrade.Brightness = 0.025;
    colorGrade.Contrast = 0.015;
    colorGrade.Saturation = -0.09;
    colorGrade.TintColor = Color3.fromRGB(255, 253, 249);

    const existingBloom = Lighting.FindFirstChild("WarWorldBloom");
    let bloom: BloomEffect;
    if (existingBloom?.IsA("BloomEffect")) {
      bloom = existingBloom;
    } else {
      existingBloom?.Destroy();
      bloom = new Instance("BloomEffect");
      bloom.Name = "WarWorldBloom";
      bloom.Parent = Lighting;
    }
    bloom.Intensity = 0.045;
    bloom.Size = 12;
    bloom.Threshold = 2;

    const existingSunRays = Lighting.FindFirstChild("WarWorldSunRays");
    let sunRays: SunRaysEffect;
    if (existingSunRays?.IsA("SunRaysEffect")) {
      sunRays = existingSunRays;
    } else {
      existingSunRays?.Destroy();
      sunRays = new Instance("SunRaysEffect");
      sunRays.Name = "WarWorldSunRays";
      sunRays.Parent = Lighting;
    }
    sunRays.Intensity = 0.015;
    sunRays.Spread = 0.55;

    let clouds = Workspace.Terrain.FindFirstChildOfClass("Clouds");
    if (clouds === undefined) {
      clouds = new Instance("Clouds");
      clouds.Parent = Workspace.Terrain;
    }
    clouds.Color = Color3.fromRGB(232, 235, 237);
    clouds.Cover = 0.24;
    clouds.Density = 0.2;
    clouds.Enabled = true;
  }
}
