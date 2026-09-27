import { CollectionService, Workspace } from "@rbxts/services";
import type { ItemId } from "shared/catalog/items";
import { cloneOriginalArt } from "server/world/original-art-library";
import { generateIslandTerrain } from "server/world/terrain-generator";
import {
  getCampPosition,
  horizontalDistance,
  isProtectedWorldPosition,
  islandRoutes,
  MONUMENT_POSITIONS,
  surfacePositionAt,
  WORLD_ART_BUDGET,
} from "server/world/world-layout";

interface PartOptions {
  readonly canCollide?: boolean;
  readonly canQuery?: boolean;
  readonly transparency?: number;
  readonly castShadow?: boolean;
}

export function createWorldPart(
  name: string,
  size: Vector3,
  cframe: CFrame,
  color: Color3,
  material: Enum.Material,
  parent: Instance,
  options?: PartOptions,
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
  part.CanCollide = options?.canCollide ?? true;
  part.CanQuery = options?.canQuery ?? true;
  part.CanTouch = false;
  part.Transparency = options?.transparency ?? 0;
  part.CastShadow = options?.castShadow ?? true;
  part.Parent = parent;
  return part;
}

function createWedge(
  name: string,
  size: Vector3,
  cframe: CFrame,
  color: Color3,
  material: Enum.Material,
  parent: Instance,
  options?: PartOptions,
): WedgePart {
  const part = new Instance("WedgePart");
  part.Name = name;
  part.Anchored = true;
  part.Size = size;
  part.CFrame = cframe;
  part.Color = color;
  part.Material = material;
  part.TopSurface = Enum.SurfaceType.Smooth;
  part.BottomSurface = Enum.SurfaceType.Smooth;
  part.CanCollide = options?.canCollide ?? true;
  part.CanQuery = options?.canQuery ?? true;
  part.CanTouch = false;
  part.Transparency = options?.transparency ?? 0;
  part.CastShadow = options?.castShadow ?? true;
  part.Parent = parent;
  return part;
}

function verticalCylinder(
  name: string,
  position: Vector3,
  height: number,
  diameter: number,
  color: Color3,
  material: Enum.Material,
  parent: Instance,
  options?: PartOptions,
): Part {
  const cylinder = createWorldPart(
    name,
    new Vector3(height, diameter, diameter),
    new CFrame(position).mul(CFrame.Angles(0, 0, math.pi / 2)),
    color,
    material,
    parent,
    options,
  );
  cylinder.Shape = Enum.PartType.Cylinder;
  return cylinder;
}

function beamBetween(
  name: string,
  start: Vector3,
  finish: Vector3,
  thickness: number,
  color: Color3,
  material: Enum.Material,
  parent: Instance,
  options?: PartOptions,
): Part {
  const direction = finish.sub(start);
  const beam = createWorldPart(
    name,
    new Vector3(direction.Magnitude, thickness, thickness),
    CFrame.lookAt(start.Lerp(finish, 0.5), finish).mul(CFrame.Angles(0, math.pi / 2, 0)),
    color,
    material,
    parent,
    options,
  );
  beam.Shape = Enum.PartType.Cylinder;
  return beam;
}

export class WorldArt {
  public createEnvironment(parent: Instance, authoredTerrain = false): void {
    if (!authoredTerrain) {
      generateIslandTerrain();
    }

    const boundaries = new Instance("Folder");
    boundaries.Name = "Boundaries";
    boundaries.Parent = parent;
    const boundaryData = [
      [new Vector3(620, 60, 4), new CFrame(0, 26, -302)],
      [new Vector3(620, 60, 4), new CFrame(0, 26, 302)],
      [new Vector3(4, 60, 620), new CFrame(-302, 26, 0)],
      [new Vector3(4, 60, 620), new CFrame(302, 26, 0)],
    ] as const;
    for (const [size, cframe] of boundaryData) {
      createWorldPart(
        "WorldBoundary",
        size,
        cframe,
        Color3.fromRGB(255, 255, 255),
        Enum.Material.SmoothPlastic,
        boundaries,
        { transparency: 1, castShadow: false },
      );
    }

    this.createCoastline(parent);
  }

  public createSpawns(parent: Instance, teams: ReadonlyArray<Team>): void {
    const spawns = new Instance("Folder");
    spawns.Name = "Spawns";
    spawns.Parent = parent;
    assert(teams.size() > 0, "Teams must be initialized before the world is generated.");

    for (let index = 0; index < teams.size(); index += 1) {
      const team = teams[index]!;
      const angle = (index / teams.size()) * math.pi * 2;
      const position = getCampPosition(index, teams.size());
      this.createTeamCamp(spawns, team, position, angle);
    }
  }

  public createMonuments(parent: Instance): void {
    this.createDepot(parent, MONUMENT_POSITIONS[0]);
    this.createLaboratory(parent, MONUMENT_POSITIONS[1]);
    this.createPowerStation(parent, MONUMENT_POSITIONS[2]);
  }

  public createScenery(parent: Instance): void {
    const scenery = new Instance("Folder");
    scenery.Name = "Scenery";
    scenery.Parent = parent;

    const plaza = createWorldPart(
      "CentralPlaza",
      new Vector3(72, 0.35, 72),
      new CFrame(0, 0.1, 0),
      Color3.fromRGB(83, 87, 85),
      Enum.Material.Cobblestone,
      scenery,
    );
    plaza.CastShadow = false;

    for (const [start, finish] of islandRoutes()) {
      this.createRouteMarkers(scenery, start, finish);
    }

    const random = new Random(447921);
    const occupied = new Array<Vector3>();
    let treesCreated = 0;
    let attempts = 0;
    while (treesCreated < WORLD_ART_BUDGET.sceneryTrees && attempts < 420) {
      attempts += 1;
      const position = this.randomIslandPosition(random, 76, 251);
      if (
        !this.isSceneryPositionFree(position, 9) ||
        occupied.some((other) => horizontalDistance(other, position) < 16)
      ) {
        continue;
      }
      this.createTree(scenery, position, random, treesCreated);
      occupied.push(position);
      treesCreated += 1;
    }

    for (let index = 0; index < WORLD_ART_BUDGET.rockClusters; index += 1) {
      const position = this.randomIslandPosition(random, 52, 258);
      if (
        this.isSceneryPositionFree(position, 5) &&
        occupied.every((other) => horizontalDistance(other, position) > 10)
      ) {
        this.createRockCluster(scenery, position, random, index);
        occupied.push(position);
      }
    }

    for (let index = 0; index < WORLD_ART_BUDGET.grassTufts; index += 1) {
      const position = this.randomIslandPosition(random, 50, 256);
      if (this.isSceneryPositionFree(position, 2)) {
        this.createGrassTuft(scenery, position, random, index);
      }
    }

    for (let index = 0; index < WORLD_ART_BUDGET.abandonedProps; index += 1) {
      const position = this.randomIslandPosition(random, 60, 245);
      if (
        this.isSceneryPositionFree(position, 6) &&
        occupied.every((other) => horizontalDistance(other, position) > 10)
      ) {
        this.createAbandonedDebris(scenery, position, random, index);
      }
    }

    const count = scenery
      .GetDescendants()
      .filter((instance) => instance.IsA("BasePart"))
      .size();
    scenery.SetAttribute("BasePartCount", count);
    scenery.SetAttribute("BasePartBudget", WORLD_ART_BUDGET.sceneryBaseParts);
    assert(count <= WORLD_ART_BUDGET.sceneryBaseParts, "Scenery exceeds its declared part budget.");
  }

  public decorateResourceNode(node: Part, itemId: ItemId, random: Random): void {
    node.TopSurface = Enum.SurfaceType.Smooth;
    node.BottomSurface = Enum.SurfaceType.Smooth;

    if (itemId === "wood") {
      node.Shape = Enum.PartType.Cylinder;
      node.Size = new Vector3(12, 3.6, 3.6);
      node.CFrame = new CFrame(node.Position).mul(CFrame.Angles(0, 0, math.pi / 2));
      node.Color = Color3.fromRGB(104, 73, 50);
      node.Material = Enum.Material.Wood;
      const ground = node.Position.sub(new Vector3(0, 6, 0));
      if (
        cloneOriginalArt("CoastalPine", node, ground, 0.78, random.NextNumber(0, math.pi * 2)) !==
        undefined
      ) {
        node.Transparency = 1;
      } else {
        this.createBranchedCrown(node, ground, 17, random);
      }
      return;
    }

    if (itemId === "stone") {
      node.Shape = Enum.PartType.Block;
      node.Size = new Vector3(7.5, 5.2, 6.4);
      node.CFrame = new CFrame(node.Position).mul(
        CFrame.Angles(
          random.NextNumber(-0.2, 0.2),
          random.NextNumber(0, math.pi),
          random.NextNumber(-0.15, 0.15),
        ),
      );
      node.Color = Color3.fromRGB(104, 110, 112);
      node.Material = Enum.Material.Slate;
      if (
        cloneOriginalArt("CoastalRock", node, node.Position.sub(new Vector3(0, 2.6, 0)), 0.85) !==
        undefined
      ) {
        node.Transparency = 1;
        return;
      }
      for (let index = 0; index < 2; index += 1) {
        createWedge(
          `StoneFragment_${index}`,
          new Vector3(3.5 - index * 0.5, 2.8, 3.2),
          new CFrame(node.Position.add(new Vector3(index === 0 ? 3.2 : -3, -1, index * 1.8 - 1))),
          Color3.fromRGB(91 + index * 12, 99 + index * 9, 103 + index * 8),
          index === 0 ? Enum.Material.Slate : Enum.Material.Limestone,
          node,
          { canCollide: false, canQuery: false },
        );
      }
      return;
    }

    if (itemId === "fiber") {
      node.Shape = Enum.PartType.Ball;
      node.Size = new Vector3(4.5, 2.5, 4.5);
      node.Color = Color3.fromRGB(64, 121, 59);
      node.Material = Enum.Material.LeafyGrass;
      for (let index = 0; index < 4; index += 1) {
        const angle = (index / 4) * math.pi * 2;
        createWedge(
          `FiberLeaf_${index}`,
          new Vector3(0.45, random.NextNumber(2.8, 4.5), 1.1),
          new CFrame(
            node.Position.add(new Vector3(math.cos(angle) * 1.2, 1.3, math.sin(angle) * 1.2)),
          ).mul(
            CFrame.Angles(random.NextNumber(-0.15, 0.15), -angle, random.NextNumber(-0.4, 0.4)),
          ),
          Color3.fromRGB(71 + (index % 3) * 8, 139 + (index % 2) * 12, 67),
          Enum.Material.LeafyGrass,
          node,
          { canCollide: false, canQuery: false },
        );
      }
      return;
    }

    if (itemId === "scrap") {
      node.Shape = Enum.PartType.Block;
      node.Size = new Vector3(6.5, 2.4, 5.5);
      node.CFrame = new CFrame(node.Position).mul(
        CFrame.Angles(0, random.NextNumber(0, math.pi), random.NextNumber(-0.08, 0.08)),
      );
      node.Color = Color3.fromRGB(126, 88, 55);
      node.Material = Enum.Material.CorrodedMetal;
      if (
        cloneOriginalArt("ScrapPile", node, node.Position.sub(new Vector3(0, 1.2, 0)), 1.15) !==
        undefined
      ) {
        node.Transparency = 1;
        return;
      }
      for (let index = 0; index < 3; index += 1) {
        const pipe = verticalCylinder(
          `ScrapPipe_${index}`,
          node.Position.add(
            new Vector3(index * 1.5 - 1.5, 2 + index * 0.35, index % 2 === 0 ? 0.8 : -0.9),
          ),
          4.5 + index,
          0.65,
          Color3.fromRGB(78 + index * 14, 88 + index * 8, 92 + index * 5),
          Enum.Material.Metal,
          node,
          { canCollide: false, canQuery: false },
        );
        pipe.CFrame = pipe.CFrame.mul(
          CFrame.Angles(random.NextNumber(-0.45, 0.45), 0, random.NextNumber(-0.5, 0.5)),
        );
      }
      return;
    }

    node.Shape = Enum.PartType.Cylinder;
    node.Size = new Vector3(7, 3.4, 3.4);
    node.CFrame = new CFrame(node.Position).mul(CFrame.Angles(0, 0, math.pi / 2));
    node.Color = Color3.fromRGB(65, 213, 235);
    node.Material = Enum.Material.Neon;
    node.Transparency = 0.1;
    for (let index = 0; index < 3; index += 1) {
      const ring = verticalCylinder(
        `CoreRing_${index}`,
        node.Position.add(new Vector3(0, index * 2.2 - 2.2, 0)),
        0.42,
        5.1,
        Color3.fromRGB(58, 71, 82),
        Enum.Material.Metal,
        node,
        { canCollide: false, canQuery: false },
      );
      ring.Shape = Enum.PartType.Cylinder;
    }
    const light = new Instance("PointLight");
    light.Color = Color3.fromRGB(76, 223, 255);
    light.Brightness = 0.45;
    light.Range = 10;
    light.Shadows = false;
    light.Parent = node;
  }

  private createCoastline(parent: Instance): void {
    const coast = new Instance("Folder");
    coast.Name = "Coastline";
    coast.Parent = parent;
    const random = new Random(89341);
    for (let index = 0; index < 24; index += 1) {
      const angle = (index / 24) * math.pi * 2;
      const radius = random.NextNumber(270, 283);
      const position = new Vector3(
        math.cos(angle) * radius,
        random.NextNumber(-1.4, -0.3),
        math.sin(angle) * radius,
      );
      createWedge(
        `Cliff_${index}`,
        new Vector3(random.NextNumber(10, 18), random.NextNumber(5, 11), random.NextNumber(8, 15)),
        new CFrame(position).mul(
          CFrame.Angles(
            random.NextNumber(-0.2, 0.2),
            random.NextNumber(0, math.pi),
            random.NextNumber(-0.2, 0.2),
          ),
        ),
        Color3.fromRGB(
          random.NextInteger(76, 96),
          random.NextInteger(78, 94),
          random.NextInteger(75, 88),
        ),
        index % 3 === 0 ? Enum.Material.Slate : Enum.Material.Rock,
        coast,
      );
    }
  }

  private createTeamCamp(parent: Instance, team: Team, position: Vector3, angle: number): void {
    const camp = new Instance("Model");
    camp.Name = `Camp_${team.Name}`;
    camp.Parent = parent;
    const facing = CFrame.lookAt(position, Vector3.zero);

    createWorldPart(
      "LandingPad",
      new Vector3(24, 0.7, 24),
      new CFrame(position.add(new Vector3(0, 0.35, 0))),
      Color3.fromRGB(62, 68, 70),
      Enum.Material.DiamondPlate,
      camp,
    );
    for (let index = 0; index < 4; index += 1) {
      const stripAngle = (index / 4) * math.pi * 2;
      createWorldPart(
        "PadMarker",
        new Vector3(7, 0.12, 1.1),
        new CFrame(
          position.add(new Vector3(math.cos(stripAngle) * 7.5, 0.77, math.sin(stripAngle) * 7.5)),
        ).mul(CFrame.Angles(0, -stripAngle, 0)),
        team.TeamColor.Color,
        Enum.Material.Neon,
        camp,
        { canCollide: false },
      );
    }

    const spawn = new Instance("SpawnLocation");
    spawn.Name = `CampSpawn_${team.Name}`;
    spawn.Anchored = true;
    spawn.Size = new Vector3(10, 0.5, 10);
    spawn.CFrame = new CFrame(position.add(new Vector3(0, 1, 0)));
    spawn.Neutral = false;
    spawn.TeamColor = team.TeamColor;
    spawn.AllowTeamChangeOnTouch = false;
    spawn.Duration = 5;
    spawn.Transparency = 1;
    spawn.CanCollide = false;
    spawn.Parent = camp;

    const shelterOffset = facing.RightVector.mul(13).add(facing.LookVector.mul(-2));
    const shelterPosition = position.add(shelterOffset);
    createWorldPart(
      "ShelterFloor",
      new Vector3(14, 0.6, 10),
      new CFrame(shelterPosition.add(new Vector3(0, 0.5, 0))).mul(
        CFrame.Angles(0, angle + math.pi / 2, 0),
      ),
      Color3.fromRGB(94, 77, 58),
      Enum.Material.WoodPlanks,
      camp,
    );
    for (const side of [-1, 1]) {
      const base = shelterPosition.add(facing.RightVector.mul(side * 5));
      verticalCylinder(
        "ShelterPost",
        base.add(new Vector3(0, 3.5, 0)),
        7,
        0.6,
        Color3.fromRGB(78, 67, 55),
        Enum.Material.Wood,
        camp,
      );
    }
    createWedge(
      "ShelterRoofLeft",
      new Vector3(7, 1, 11),
      new CFrame(shelterPosition.add(new Vector3(-3.3, 7, 0))).mul(
        CFrame.Angles(0, angle, math.rad(-18)),
      ),
      team.TeamColor.Color.Lerp(Color3.fromRGB(70, 73, 74), 0.55),
      Enum.Material.Fabric,
      camp,
    );
    createWedge(
      "ShelterRoofRight",
      new Vector3(7, 1, 11),
      new CFrame(shelterPosition.add(new Vector3(3.3, 7, 0))).mul(
        CFrame.Angles(0, angle + math.pi, math.rad(-18)),
      ),
      team.TeamColor.Color.Lerp(Color3.fromRGB(70, 73, 74), 0.55),
      Enum.Material.Fabric,
      camp,
    );

    const lampPosition = position.add(facing.RightVector.mul(-12));
    verticalCylinder(
      "CampLampPost",
      lampPosition.add(new Vector3(0, 4, 0)),
      8,
      0.6,
      Color3.fromRGB(70, 76, 80),
      Enum.Material.Metal,
      camp,
    );
    const lamp = createWorldPart(
      "CampLamp",
      new Vector3(1.5, 1.1, 1.5),
      new CFrame(lampPosition.add(new Vector3(0, 8.2, 0))),
      team.TeamColor.Color,
      Enum.Material.Neon,
      camp,
      { canCollide: false },
    );
    const light = new Instance("PointLight");
    light.Color = Color3.fromRGB(250, 227, 184);
    light.Brightness = 0.4;
    light.Range = 12;
    light.Shadows = false;
    CollectionService.AddTag(light, "WorldAccentLight");
    light.Parent = lamp;
  }

  private createDepot(parent: Instance, position: Vector3): void {
    const model = this.createMonumentBase(
      parent,
      "Deposito",
      position,
      Color3.fromRGB(183, 113, 53),
    );
    const rust = Color3.fromRGB(111, 75, 48);
    const metal = Color3.fromRGB(72, 79, 80);

    createWorldPart(
      "WarehouseFloor",
      new Vector3(42, 1, 34),
      new CFrame(position.add(new Vector3(0, 2, 0))),
      metal,
      Enum.Material.DiamondPlate,
      model,
    );
    createWorldPart(
      "BackWall",
      new Vector3(42, 15, 1.2),
      new CFrame(position.add(new Vector3(0, 9.5, -16.5))),
      rust,
      Enum.Material.CorrodedMetal,
      model,
    );
    createWorldPart(
      "LeftWall",
      new Vector3(1.2, 15, 34),
      new CFrame(position.add(new Vector3(-20.5, 9.5, 0))),
      rust,
      Enum.Material.CorrodedMetal,
      model,
    );
    createWorldPart(
      "RightWall",
      new Vector3(1.2, 15, 34),
      new CFrame(position.add(new Vector3(20.5, 9.5, 0))),
      rust,
      Enum.Material.CorrodedMetal,
      model,
    );
    for (const side of [-1, 1]) {
      createWorldPart(
        "PitchedWarehouseRoof",
        new Vector3(23, 0.75, 38),
        new CFrame(position.add(new Vector3(side * 10.7, 20, 0))).mul(
          CFrame.Angles(0, 0, side * math.rad(-14)),
        ),
        Color3.fromRGB(86, 100, 99),
        Enum.Material.Metal,
        model,
      );
      createWorldPart(
        "EntranceColumn",
        new Vector3(1.1, 17, 1.1),
        new CFrame(position.add(new Vector3(side * 17, 10, 17))),
        Color3.fromRGB(119, 122, 107),
        Enum.Material.Metal,
        model,
      );
    }
    createWorldPart(
      "LoadingCanopy",
      new Vector3(36, 0.65, 8),
      new CFrame(position.add(new Vector3(0, 15.4, 20))),
      Color3.fromRGB(109, 113, 93),
      Enum.Material.Metal,
      model,
    );

    for (let index = 0; index < 3; index += 1) {
      const x = -12 + index * 12;
      createWorldPart(
        "WarehouseSkylight",
        new Vector3(4.5, 0.18, 9),
        new CFrame(position.add(new Vector3(x, 22 - math.abs(x) * 0.24, -3))).mul(
          CFrame.Angles(0, 0, x < 0 ? math.rad(14) : x > 0 ? math.rad(-14) : 0),
        ),
        Color3.fromRGB(154, 180, 173),
        Enum.Material.SmoothPlastic,
        model,
        { canCollide: false, canQuery: false, castShadow: false },
      );
    }

    this.createCargoContainer(
      model,
      position.add(new Vector3(-10, 5, 5)),
      Color3.fromRGB(153, 87, 45),
    );
    this.createCargoContainer(
      model,
      position.add(new Vector3(10, 5, -3)),
      Color3.fromRGB(61, 103, 119),
    );
    this.createIndustrialBeacon(
      model,
      position.add(new Vector3(26, 0, -17)),
      Color3.fromRGB(245, 172, 78),
    );
    this.createWorkbench(model, position.add(new Vector3(25, 0, 12)), math.rad(-90));
    this.createCoverSet(model, position);
  }

  private createLaboratory(parent: Instance, position: Vector3): void {
    const model = this.createMonumentBase(
      parent,
      "Laboratorio",
      position,
      Color3.fromRGB(67, 139, 190),
    );
    const metal = Color3.fromRGB(66, 78, 88);
    const white = Color3.fromRGB(173, 184, 186);

    createWorldPart(
      "LabFloor",
      new Vector3(44, 1.1, 34),
      new CFrame(position.add(new Vector3(0, 2, 0))),
      metal,
      Enum.Material.DiamondPlate,
      model,
    );
    createWorldPart(
      "LabBack",
      new Vector3(44, 13, 1),
      new CFrame(position.add(new Vector3(0, 8.5, -16.5))),
      white,
      Enum.Material.Metal,
      model,
    );
    createWorldPart(
      "LabLeft",
      new Vector3(1, 13, 34),
      new CFrame(position.add(new Vector3(-21.5, 8.5, 0))),
      white,
      Enum.Material.Metal,
      model,
    );
    createWorldPart(
      "LabRight",
      new Vector3(1, 13, 34),
      new CFrame(position.add(new Vector3(21.5, 8.5, 0))),
      white,
      Enum.Material.Metal,
      model,
    );
    createWorldPart(
      "LabRoof",
      new Vector3(46, 1, 36),
      new CFrame(position.add(new Vector3(0, 15.4, 0))),
      Color3.fromRGB(70, 82, 90),
      Enum.Material.Metal,
      model,
    );

    for (const x of [-14, -5, 5, 14]) {
      const window = createWorldPart(
        "LabWindow",
        new Vector3(7.5, 6.2, 0.35),
        new CFrame(position.add(new Vector3(x, 9, 16.45))),
        Color3.fromRGB(92, 198, 220),
        Enum.Material.Glass,
        model,
        { transparency: 0.28 },
      );
      const surfaceLight = new Instance("SurfaceLight");
      surfaceLight.Face = Enum.NormalId.Front;
      surfaceLight.Color = Color3.fromRGB(119, 215, 235);
      surfaceLight.Brightness = 0.4;
      surfaceLight.Range = 9;
      surfaceLight.Parent = window;
    }

    for (const x of [-12, 0, 12]) {
      const tank = verticalCylinder(
        "ResearchTank",
        position.add(new Vector3(x, 6, -5)),
        8,
        5.5,
        Color3.fromRGB(69, 154, 171),
        Enum.Material.Glass,
        model,
        { transparency: 0.25 },
      );
      const tankLight = new Instance("PointLight");
      tankLight.Color = Color3.fromRGB(78, 214, 235);
      tankLight.Brightness = 0.45;
      tankLight.Range = 8;
      tankLight.Parent = tank;
    }

    this.createIndustrialBeacon(
      model,
      position.add(new Vector3(-27, 0, -17)),
      Color3.fromRGB(88, 213, 239),
    );
    this.createWorkbench(model, position.add(new Vector3(25, 0, 12)), math.rad(-90));
    // A recognisable research silhouette, readable above the tree line without a neon tower.
    verticalCylinder(
      "AntennaMast",
      position.add(new Vector3(-12, 25, -8)),
      21,
      0.7,
      Color3.fromRGB(144, 154, 151),
      Enum.Material.Metal,
      model,
    );
    const dish = createWorldPart(
      "ResearchDish",
      new Vector3(10, 1.1, 10),
      new CFrame(position.add(new Vector3(-12, 35, -8))).mul(
        CFrame.Angles(math.rad(25), 0, math.rad(12)),
      ),
      Color3.fromRGB(192, 199, 183),
      Enum.Material.SmoothPlastic,
      model,
      { canCollide: false },
    );
    dish.Shape = Enum.PartType.Ball;
    beamBetween(
      "DishFeed",
      position.add(new Vector3(-12, 35, -8)),
      position.add(new Vector3(-12, 39, -8)),
      0.3,
      Color3.fromRGB(107, 119, 116),
      Enum.Material.Metal,
      model,
      { canCollide: false, canQuery: false },
    );
    this.createCoverSet(model, position);
  }

  private createPowerStation(parent: Instance, position: Vector3): void {
    const model = this.createMonumentBase(
      parent,
      "Centrale",
      position,
      Color3.fromRGB(126, 83, 158),
    );
    const darkMetal = Color3.fromRGB(53, 60, 65);
    createWorldPart(
      "GeneratorFloor",
      new Vector3(48, 1, 42),
      new CFrame(position.add(new Vector3(0, 2, 0))),
      darkMetal,
      Enum.Material.DiamondPlate,
      model,
    );

    const reactor = verticalCylinder(
      "ReactorCore",
      position.add(new Vector3(0, 11, 0)),
      18,
      12,
      Color3.fromRGB(79, 91, 98),
      Enum.Material.Metal,
      model,
    );
    for (let index = 0; index < 4; index += 1) {
      verticalCylinder(
        "ReactorBand",
        position.add(new Vector3(0, 5 + index * 4.1, 0)),
        0.65,
        13,
        index === 2 ? Color3.fromRGB(176, 93, 214) : Color3.fromRGB(37, 43, 48),
        index === 2 ? Enum.Material.Neon : Enum.Material.Metal,
        model,
      );
    }
    const coreLight = new Instance("PointLight");
    coreLight.Color = Color3.fromRGB(177, 103, 232);
    coreLight.Brightness = 0.4;
    coreLight.Range = 16;
    coreLight.Shadows = false;
    CollectionService.AddTag(coreLight, "WorldAccentLight");
    coreLight.Parent = reactor;

    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * math.pi * 2;
      const base = position.add(new Vector3(math.cos(angle) * 18, 0, math.sin(angle) * 15));
      verticalCylinder(
        "CoolingStack",
        base.add(new Vector3(0, index % 2 === 0 ? 14 : 10, 0)),
        index % 2 === 0 ? 26 : 18,
        4.5,
        Color3.fromRGB(83, 89, 91),
        Enum.Material.Metal,
        model,
      );
      beamBetween(
        "ReactorPipe",
        base.add(new Vector3(0, 4.5, 0)),
        position.add(new Vector3(math.cos(angle) * 6, 6.5, math.sin(angle) * 6)),
        1.1,
        Color3.fromRGB(112, 82, 58),
        Enum.Material.CorrodedMetal,
        model,
      );
    }

    this.createIndustrialBeacon(
      model,
      position.add(new Vector3(28, 0, -19)),
      Color3.fromRGB(188, 105, 235),
    );
    this.createWorkbench(model, position.add(new Vector3(25, 0, 13)), math.rad(-90));
    this.createCoverSet(model, position);
  }

  private createMonumentBase(
    parent: Instance,
    name: string,
    position: Vector3,
    accent: Color3,
  ): Model {
    const model = new Instance("Model");
    model.Name = name;
    model.ModelStreamingMode = Enum.ModelStreamingMode.Atomic;
    model.Parent = parent;
    createWorldPart(
      "Platform",
      new Vector3(66, 2, 56),
      new CFrame(position.add(new Vector3(0, 1, 0))),
      Color3.fromRGB(76, 80, 79),
      Enum.Material.Concrete,
      model,
    );
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * math.pi * 2;
      createWorldPart(
        "SafetyMarker",
        new Vector3(5, 0.15, 1),
        new CFrame(position.add(new Vector3(math.cos(angle) * 29, 2.05, math.sin(angle) * 24))).mul(
          CFrame.Angles(0, -angle, 0),
        ),
        index % 2 === 0 ? accent : Color3.fromRGB(35, 39, 40),
        Enum.Material.SmoothPlastic,
        model,
        { canCollide: false },
      );
    }
    return model;
  }

  private createIndustrialBeacon(parent: Instance, position: Vector3, color: Color3): void {
    for (const x of [-2.2, 2.2]) {
      for (const z of [-2.2, 2.2]) {
        verticalCylinder(
          "BeaconLeg",
          position.add(new Vector3(x, 9, z)),
          18,
          0.55,
          Color3.fromRGB(58, 64, 66),
          Enum.Material.Metal,
          parent,
        );
      }
    }
    for (let level = 0; level < 4; level += 1) {
      const y = 3 + level * 4.5;
      beamBetween(
        "BeaconBrace",
        position.add(new Vector3(-2.2, y, -2.2)),
        position.add(new Vector3(2.2, y + 2, -2.2)),
        0.35,
        Color3.fromRGB(81, 87, 88),
        Enum.Material.Metal,
        parent,
        { canCollide: false },
      );
      beamBetween(
        "BeaconBrace",
        position.add(new Vector3(-2.2, y + 2, 2.2)),
        position.add(new Vector3(2.2, y, 2.2)),
        0.35,
        Color3.fromRGB(81, 87, 88),
        Enum.Material.Metal,
        parent,
        { canCollide: false },
      );
    }
    const lamp = createWorldPart(
      "BeaconLamp",
      new Vector3(3.2, 3.2, 3.2),
      new CFrame(position.add(new Vector3(0, 20, 0))),
      color,
      Enum.Material.Neon,
      parent,
      { canCollide: false },
    );
    const light = new Instance("PointLight");
    light.Color = color;
    light.Brightness = 0.45;
    light.Range = 14;
    light.Shadows = false;
    CollectionService.AddTag(light, "WorldAccentLight");
    light.Parent = lamp;
  }

  private createCargoContainer(parent: Instance, position: Vector3, color: Color3): void {
    createWorldPart(
      "CargoBody",
      new Vector3(16, 7, 8),
      new CFrame(position),
      color,
      Enum.Material.CorrodedMetal,
      parent,
    );
    for (let index = -3; index <= 3; index += 1) {
      createWorldPart(
        "CargoRib",
        new Vector3(0.35, 7.2, 8.2),
        new CFrame(position.add(new Vector3(index * 2.2, 0, 0))),
        Color3.fromRGB(65, 68, 66),
        Enum.Material.Metal,
        parent,
        { canCollide: false },
      );
    }
  }

  private createCoverSet(parent: Instance, position: Vector3): void {
    for (let index = 0; index < 3; index += 1) {
      const offset =
        index === 0
          ? new Vector3(-25, 2.05, 19)
          : index === 1
            ? new Vector3(21, 2.05, 22)
            : new Vector3(-26, 2.05, -16);
      const ground = position.add(offset);
      if (
        cloneOriginalArt(
          "SupplyCrate",
          parent,
          ground,
          index === 1 ? 1.2 : 1.0,
          (index * math.pi) / 2,
          true,
        ) !== undefined
      ) {
        continue;
      }
      createWorldPart(
        "SupplyCrate",
        new Vector3(5, 3.8, 3.8),
        new CFrame(ground.add(new Vector3(0, 1.9, 0))),
        Color3.fromRGB(147, 117, 78),
        Enum.Material.WoodPlanks,
        parent,
      );
      createWorldPart(
        "CrateBrace",
        new Vector3(5.15, 0.35, 4),
        new CFrame(ground.add(new Vector3(0, 2.9, 0))),
        Color3.fromRGB(91, 104, 104),
        Enum.Material.Metal,
        parent,
        { canCollide: false, canQuery: false },
      );
    }
  }

  private createWorkbench(parent: Instance, position: Vector3, yaw: number): void {
    const workbenchOrigin = new CFrame(position.add(new Vector3(0, 2, 0))).mul(
      CFrame.Angles(0, yaw, 0),
    );
    const root = createWorldPart(
      "PublicWorkbench",
      new Vector3(7, 0.8, 3.5),
      workbenchOrigin.mul(new CFrame(0, 3.2, 0)),
      Color3.fromRGB(84, 96, 102),
      Enum.Material.DiamondPlate,
      parent,
    );
    for (const x of [-2.5, 2.5]) {
      for (const z of [-1, 1]) {
        createWorldPart(
          "WorkbenchLeg",
          new Vector3(0.45, 3, 0.45),
          workbenchOrigin.mul(new CFrame(x, 1.5, z)),
          Color3.fromRGB(58, 63, 65),
          Enum.Material.Metal,
          root,
        );
      }
    }
    createWorldPart(
      "Toolbox",
      new Vector3(2.4, 1.2, 1.4),
      workbenchOrigin.mul(new CFrame(1.4, 4.1, 0)),
      Color3.fromRGB(181, 110, 53),
      Enum.Material.Metal,
      root,
      { canCollide: false },
    );
    CollectionService.AddTag(root, "Workbench");
  }

  public createExtractionRing(parent: Instance): void {
    const trigger = createWorldPart(
      "ExtractionZone",
      new Vector3(34, 1, 34),
      new CFrame(0, 0.5, 0),
      Color3.fromRGB(70, 235, 255),
      Enum.Material.ForceField,
      parent,
      { canCollide: false, canQuery: false, transparency: 1, castShadow: false },
    );
    trigger.SetAttribute("ExtractionZone", true);

    for (let index = 0; index < 20; index += 1) {
      const angle = (index / 20) * math.pi * 2;
      const position = new Vector3(math.cos(angle) * 17, 0.45, math.sin(angle) * 17);
      createWorldPart(
        "ExtractionRingSegment",
        new Vector3(5.4, 0.38, 1.1),
        new CFrame(position).mul(CFrame.Angles(0, -angle, 0)),
        index % 2 === 0 ? Color3.fromRGB(73, 220, 239) : Color3.fromRGB(38, 72, 81),
        index % 2 === 0 ? Enum.Material.Neon : Enum.Material.Metal,
        parent,
        { canCollide: false, canQuery: false },
      );
    }

    const centerLamp = createWorldPart(
      "ExtractionBeacon",
      new Vector3(2, 22, 2),
      new CFrame(0, 11, 0),
      Color3.fromRGB(81, 223, 240),
      Enum.Material.Neon,
      parent,
      { canCollide: false, canQuery: false, transparency: 0.45 },
    );
    const light = new Instance("PointLight");
    light.Color = Color3.fromRGB(81, 223, 240);
    light.Brightness = 0.75;
    light.Range = 18;
    light.Parent = centerLamp;
  }

  private createRouteMarkers(parent: Instance, start: Vector3, finish: Vector3): void {
    const direction = finish.sub(start).Unit;
    const side = new Vector3(-direction.Z, 0, direction.X);
    for (const progress of [0.3, 0.65]) {
      const point = start.Lerp(finish, progress).add(side.mul(7.5));
      const post = createWorldPart(
        "RoutePost",
        new Vector3(0.55, 2.8, 0.55),
        new CFrame(point.add(new Vector3(0, 1.4, 0))),
        Color3.fromRGB(91, 88, 74),
        Enum.Material.Wood,
        parent,
        { canCollide: false, canQuery: false, castShadow: false },
      );
      createWorldPart(
        "RouteReflector",
        new Vector3(0.68, 0.3, 0.68),
        post.CFrame.add(new Vector3(0, 0.8, 0)),
        Color3.fromRGB(193, 185, 129),
        Enum.Material.SmoothPlastic,
        parent,
        { canCollide: false, canQuery: false, castShadow: false },
      );
    }
  }

  private createTree(parent: Instance, position: Vector3, random: Random, index: number): void {
    const ground = surfacePositionAt(position, Workspace.Terrain);
    const scale = random.NextNumber(0.85, 1.2);
    const imported = cloneOriginalArt(
      "CoastalPine",
      parent,
      ground,
      scale,
      random.NextNumber(0, math.pi * 2),
    );
    if (imported !== undefined) {
      const trunk = verticalCylinder(
        "TreeCollider",
        ground.add(new Vector3(0, 5, 0)),
        10,
        1.7 * scale,
        Color3.fromRGB(92, 74, 54),
        Enum.Material.Wood,
        imported,
        { transparency: 1, castShadow: false },
      );
      trunk.CanQuery = true;
      return;
    }
    const tree = new Instance("Model");
    tree.Name = `Pine_${index}`;
    tree.ModelStreamingMode = Enum.ModelStreamingMode.Atomic;
    tree.Parent = parent;
    const height = 19 * scale;
    verticalCylinder(
      "Trunk",
      ground.add(new Vector3(0, height * 0.36, 0)),
      height * 0.72,
      1.7 * scale,
      Color3.fromRGB(100, 80, 57),
      Enum.Material.Wood,
      tree,
    );
    this.createBranchedCrown(tree, ground, height, random);
  }

  private createBranchedCrown(
    parent: Instance,
    ground: Vector3,
    height: number,
    random: Random,
  ): void {
    const rotation = random.NextNumber(0, math.pi * 2);
    for (let index = 0; index < 3; index += 1) {
      const angle = rotation + index * 2.4;
      const extent = height * (0.21 - index * 0.025);
      const branchTip = ground.add(
        new Vector3(
          math.cos(angle) * extent,
          height * (0.57 + index * 0.12),
          math.sin(angle) * extent,
        ),
      );
      beamBetween(
        "Branch",
        ground.add(new Vector3(0, height * (0.35 + index * 0.13), 0)),
        branchTip,
        0.7 - index * 0.12,
        Color3.fromRGB(95, 75, 53),
        Enum.Material.Wood,
        parent,
        { canCollide: false, canQuery: false },
      );
      const foliage = createWorldPart(
        "Foliage",
        new Vector3(height * 0.47, height * 0.34, height * 0.35),
        new CFrame(branchTip.add(new Vector3(0, height * 0.09, 0))).mul(
          CFrame.Angles(0.15, -angle, -0.12),
        ),
        Color3.fromRGB(64 + index * 9, 100 + index * 11, 59 + index * 3),
        Enum.Material.Grass,
        parent,
        { canCollide: false, canQuery: false },
      );
      foliage.Shape = Enum.PartType.Ball;
    }
    const top = createWorldPart(
      "Treetop",
      new Vector3(height * 0.29, height * 0.35, height * 0.27),
      new CFrame(ground.add(new Vector3(-0.5, height * 0.91, 0.6))),
      Color3.fromRGB(87, 127, 67),
      Enum.Material.Grass,
      parent,
      { canCollide: false, canQuery: false },
    );
    top.Shape = Enum.PartType.Ball;
  }

  private createRockCluster(
    parent: Instance,
    position: Vector3,
    random: Random,
    index: number,
  ): void {
    const ground = surfacePositionAt(position, Workspace.Terrain);
    if (
      cloneOriginalArt(
        "CoastalRock",
        parent,
        ground,
        random.NextNumber(0.8, 1.3),
        random.NextNumber(0, math.pi * 2),
        true,
      ) !== undefined
    ) {
      return;
    }
    const cluster = new Instance("Model");
    cluster.Name = `RockCluster_${index}`;
    cluster.Parent = parent;
    cluster.ModelStreamingMode = Enum.ModelStreamingMode.Atomic;
    for (let fragment = 0; fragment < 2; fragment += 1) {
      const size = random.NextNumber(2.5, 6);
      createWedge(
        "Rock",
        new Vector3(size, size * random.NextNumber(0.55, 0.85), size * random.NextNumber(0.8, 1.2)),
        new CFrame(
          ground.add(
            new Vector3(random.NextNumber(-2.5, 2.5), size * 0.25, random.NextNumber(-2.5, 2.5)),
          ),
        ).mul(
          CFrame.Angles(
            random.NextNumber(-0.25, 0.25),
            random.NextNumber(0, math.pi),
            random.NextNumber(-0.2, 0.2),
          ),
        ),
        Color3.fromRGB(
          random.NextInteger(82, 111),
          random.NextInteger(88, 112),
          random.NextInteger(86, 108),
        ),
        fragment % 2 === 0 ? Enum.Material.Rock : Enum.Material.Slate,
        cluster,
      );
    }
  }

  private createGrassTuft(
    parent: Instance,
    position: Vector3,
    random: Random,
    index: number,
  ): void {
    const ground = surfacePositionAt(position, Workspace.Terrain);
    const tuft = new Instance("Model");
    tuft.Name = `WildGrass_${index}`;
    tuft.Parent = parent;
    CollectionService.AddTag(tuft, "OptionalWorldDetail");
    for (let blade = 0; blade < 2; blade += 1) {
      const angle = (blade / 2) * math.pi * 2 + random.NextNumber(-0.3, 0.3);
      createWedge(
        "Blade",
        new Vector3(0.25, random.NextNumber(1.5, 3.2), random.NextNumber(0.5, 0.9)),
        new CFrame(ground.add(new Vector3(math.cos(angle) * 0.5, 0.8, math.sin(angle) * 0.5))).mul(
          CFrame.Angles(random.NextNumber(-0.25, 0.25), -angle, random.NextNumber(-0.2, 0.2)),
        ),
        Color3.fromRGB(
          random.NextInteger(69, 91),
          random.NextInteger(119, 151),
          random.NextInteger(61, 79),
        ),
        Enum.Material.LeafyGrass,
        tuft,
        { canCollide: false, canQuery: false, castShadow: false },
      );
    }
  }

  private createAbandonedDebris(
    parent: Instance,
    position: Vector3,
    random: Random,
    index: number,
  ): void {
    const ground = surfacePositionAt(position, Workspace.Terrain);
    if (
      cloneOriginalArt(
        "SupplyCrate",
        parent,
        ground,
        random.NextNumber(0.7, 1.0),
        random.NextNumber(0, math.pi),
        true,
      ) !== undefined
    ) {
      return;
    }
    const debris = new Instance("Model");
    debris.Name = `AbandonedDebris_${index}`;
    debris.Parent = parent;
    const yaw = random.NextNumber(0, math.pi * 2);
    createWorldPart(
      "BrokenPanel",
      new Vector3(random.NextNumber(4, 7), 0.45, random.NextNumber(2, 4)),
      new CFrame(ground.add(new Vector3(0, 0.5, 0))).mul(
        CFrame.Angles(random.NextNumber(-0.2, 0.2), yaw, random.NextNumber(-0.3, 0.3)),
      ),
      Color3.fromRGB(
        random.NextInteger(91, 126),
        random.NextInteger(71, 91),
        random.NextInteger(51, 61),
      ),
      Enum.Material.CorrodedMetal,
      debris,
    );
    verticalCylinder(
      "BrokenPipe",
      ground.add(new Vector3(1.8, 1.1, -0.4)),
      random.NextNumber(3, 6),
      0.6,
      Color3.fromRGB(76, 82, 83),
      Enum.Material.Metal,
      debris,
      { canCollide: false, canQuery: false },
    );
  }

  private randomIslandPosition(
    random: Random,
    minimumRadius: number,
    maximumRadius: number,
  ): Vector3 {
    const radius = random.NextNumber(minimumRadius, maximumRadius);
    const angle = random.NextNumber(0, math.pi * 2);
    return new Vector3(math.cos(angle) * radius, 0, math.sin(angle) * radius);
  }

  private isSceneryPositionFree(position: Vector3, clearance: number): boolean {
    if (isProtectedWorldPosition(position, clearance)) {
      return false;
    }
    const world = Workspace.FindFirstChild("World");
    const resources = world?.FindFirstChild("GeneratedWorld")?.FindFirstChild("Resources");
    const authored = world?.FindFirstChild("AuthoredEnvironment");
    const avoid = new Array<Instance>();
    if (resources !== undefined) avoid.push(resources);
    if (authored !== undefined) avoid.push(authored);
    if (avoid.isEmpty()) return true;
    const parameters = new OverlapParams();
    parameters.FilterType = Enum.RaycastFilterType.Include;
    parameters.FilterDescendantsInstances = avoid;
    parameters.MaxParts = 1;
    const ground = surfacePositionAt(position, Workspace.Terrain);
    return Workspace.GetPartBoundsInBox(
      new CFrame(ground.add(new Vector3(0, 7, 0))),
      new Vector3(clearance * 2 + 8, 14, clearance * 2 + 8),
      parameters,
    ).isEmpty();
  }
}
