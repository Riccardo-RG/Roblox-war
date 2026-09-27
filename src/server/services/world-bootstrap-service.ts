import { CollectionService, Lighting, Workspace } from "@rbxts/services";
import { ITEMS, type ItemId } from "shared/catalog/items";
import { createWorldPart, WorldArt } from "server/world/world-art";
import {
  getCampPosition,
  horizontalDistance,
  isProtectedWorldPosition,
  surfacePositionAt,
  WORLD_ART_BUDGET,
} from "server/world/world-layout";

const RESOURCE_SEQUENCE: ReadonlyArray<ItemId> = ["wood", "stone", "scrap", "fiber"];

export class WorldBootstrapService {
  private readonly art = new WorldArt();

  public initialize(teams: ReadonlyArray<Team>): void {
    const world = Workspace.WaitForChild("World") as Folder;
    // GeneratedWorld is disposable gameplay state. Environment and AuthoredEnvironment belong to the artist.
    world.FindFirstChild("GeneratedWorld")?.Destroy();
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

    let environment = world.FindFirstChild("Environment");
    const needsEnvironment = environment === undefined || environment.GetChildren().isEmpty();
    if (environment === undefined) {
      environment = new Instance("Folder");
      environment.Name = "Environment";
      environment.Parent = world;
    }
    if (needsEnvironment) {
      const authoredTerrain =
        world.FindFirstChild("AuthoredEnvironment")?.GetAttribute("UseAuthoredTerrain") === true;
      this.art.createEnvironment(environment, authoredTerrain);
      this.art.createMonuments(environment);
      environment.SetAttribute("ArtVersion", 2);
    }
    this.art.createSpawns(generated, teams);
    this.art.createExtractionRing(monuments);
    this.createResourceField(resources);
    if (needsEnvironment) {
      this.art.createScenery(environment);
    }
    const count = environment
      .GetDescendants()
      .filter((instance) => instance.IsA("BasePart"))
      .size();
    environment.SetAttribute("BasePartCount", count);
    environment.SetAttribute("BasePartBudget", WORLD_ART_BUDGET.environmentBaseParts);
    if (count > WORLD_ART_BUDGET.environmentBaseParts) {
      warn(
        `[WAR WORLD] Environment contains ${count} BaseParts; art budget is ${WORLD_ART_BUDGET.environmentBaseParts}.`,
      );
    }
    this.configureLighting();
  }

  private createResourceField(parent: Instance): void {
    const random = new Random(9071987);
    const occupied = new Array<Vector3>();
    for (let campIndex = 0; campIndex < 6; campIndex += 1) {
      const camp = getCampPosition(campIndex);
      const inward = camp.mul(-1).Unit;
      const side = new Vector3(-inward.Z, 0, inward.X);
      // Every squad gets the same four immediately discoverable resource types near its camp.
      for (let localIndex = 0; localIndex < WORLD_ART_BUDGET.resourceNodes / 6; localIndex += 1) {
        const itemId = RESOURCE_SEQUENCE[localIndex % RESOURCE_SEQUENCE.size()]!;
        let placed = false;
        for (let attempt = 0; attempt < 80; attempt += 1) {
          const starter = localIndex < 4;
          const angle = (campIndex / 6) * math.pi * 2 + random.NextNumber(-0.49, 0.49);
          const radius = random.NextNumber(68, 243);
          const candidate = starter
            ? camp
                .add(
                  inward.mul(
                    attempt === 0 ? (localIndex < 2 ? 37 : 52) : random.NextNumber(32, 55),
                  ),
                )
                .add(
                  side.mul(
                    attempt === 0 ? (localIndex % 2 === 0 ? -17 : 17) : random.NextNumber(-35, 35),
                  ),
                )
            : new Vector3(math.cos(angle) * radius, 0, math.sin(angle) * radius);
          if (
            isProtectedWorldPosition(candidate, 2) ||
            occupied.some((other) => horizontalDistance(other, candidate) < 12)
          ) {
            continue;
          }
          const ground = surfacePositionAt(candidate, Workspace.Terrain);
          if (!this.resourceFootprintIsFree(ground)) {
            continue;
          }
          this.createResourceNode(parent, itemId, ground, occupied.size() + 1);
          occupied.push(ground);
          placed = true;
          break;
        }
        if (!placed) {
          warn(
            `[WAR WORLD] Could not place ${itemId} in camp sector ${campIndex + 1}; authored geometry occupies its resource sites.`,
          );
        }
      }
    }

    const corePositions = [
      new Vector3(-102, 2, -61),
      new Vector3(108, 2, -57),
      // Leave nine studs from the front cooling stack so the pickup is not occluded.
      new Vector3(0, 2, 149),
    ];
    for (let index = 0; index < corePositions.size(); index += 1) {
      this.createResourceNode(parent, "energy_core", corePositions[index]!, 1000 + index);
    }
  }

  private resourceFootprintIsFree(position: Vector3): boolean {
    const parameters = new OverlapParams();
    parameters.FilterType = Enum.RaycastFilterType.Include;
    parameters.FilterDescendantsInstances = [Workspace.WaitForChild("World")];
    parameters.MaxParts = 1;
    return Workspace.GetPartBoundsInBox(
      new CFrame(position.add(new Vector3(0, 3.2, 0))),
      new Vector3(9, 6, 9),
      parameters,
    ).isEmpty();
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
    node.SetAttribute("Remaining", itemId === "energy_core" ? 1 : 60);
    node.SetAttribute("MaximumRemaining", itemId === "energy_core" ? 1 : 60);
    node.SetAttribute("YieldPerHit", itemId === "energy_core" ? 1 : 5);
    node.SetAttribute("HarvestDamage", itemId === "energy_core" ? 1 : 20);
    node.SetAttribute("RespawnSeconds", itemId === "energy_core" ? 90 : 24);
    CollectionService.AddTag(node, "ResourceNode");
  }

  private configureLighting(): void {
    Lighting.Ambient = Color3.fromRGB(112, 116, 120);
    Lighting.OutdoorAmbient = Color3.fromRGB(148, 154, 159);
    Lighting.Brightness = 2;
    Lighting.ClockTime = 14.1;
    Lighting.GeographicLatitude = 38;
    Lighting.EnvironmentDiffuseScale = 0.65;
    Lighting.EnvironmentSpecularScale = 0.3;
    Lighting.ExposureCompensation = 0;
    Lighting.GlobalShadows = true;
    Lighting.ShadowSoftness = 0.3;
    Lighting.ColorShift_Top = Color3.fromRGB(0, 0, 0);
    Lighting.ColorShift_Bottom = Color3.fromRGB(0, 0, 0);

    let atmosphere = Lighting.FindFirstChildOfClass("Atmosphere");
    if (atmosphere === undefined) {
      atmosphere = new Instance("Atmosphere");
      atmosphere.Parent = Lighting;
    }
    atmosphere.Density = 0.12;
    atmosphere.Offset = 0.05;
    atmosphere.Color = Color3.fromRGB(210, 224, 232);
    atmosphere.Decay = Color3.fromRGB(128, 143, 151);
    atmosphere.Glare = 0;
    atmosphere.Haze = 0.25;

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
    colorGrade.Brightness = 0;
    colorGrade.Contrast = 0;
    colorGrade.Saturation = -0.03;
    colorGrade.TintColor = Color3.fromRGB(255, 255, 255);

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
    bloom.Enabled = false;

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
    sunRays.Enabled = false;

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
