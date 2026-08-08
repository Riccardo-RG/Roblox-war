import { CollectionService, Workspace } from "@rbxts/services";
import type { ItemId } from "shared/catalog/items";

const MONUMENT_POSITIONS = [
  new Vector3(-115, 0, -70),
  new Vector3(120, 0, -65),
  new Vector3(0, 0, 125),
] as const;

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

function horizontalDistance(a: Vector3, b: Vector3): number {
  return new Vector2(a.X - b.X, a.Z - b.Z).Magnitude;
}

export class WorldArt {
  public createEnvironment(parent: Instance): void {
    const terrain = Workspace.Terrain;
    terrain.Clear();
    terrain.FillBlock(new CFrame(0, -16, 0), new Vector3(880, 28, 880), Enum.Material.Water);

    createWorldPart(
      "IslandSoil",
      new Vector3(600, 14, 600),
      new CFrame(0, -7, 0),
      Color3.fromRGB(92, 83, 67),
      Enum.Material.Ground,
      parent,
    );
    createWorldPart(
      "IslandMeadow",
      new Vector3(596, 1.2, 596),
      new CFrame(0, -0.6, 0),
      Color3.fromRGB(92, 125, 78),
      Enum.Material.LeafyGrass,
      parent,
    );

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
        { transparency: 1 },
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
      const position = new Vector3(math.cos(angle) * 205, 0, math.sin(angle) * 205);
      this.createTeamCamp(spawns, team, position, angle);
    }
  }

  public createMonuments(parent: Instance): void {
    this.createDepot(parent, MONUMENT_POSITIONS[0]);
    this.createLaboratory(parent, MONUMENT_POSITIONS[1]);
    this.createPowerStation(parent, MONUMENT_POSITIONS[2]);
    this.createExtractionRing(parent);
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

    for (const monumentPosition of MONUMENT_POSITIONS) {
      this.createPath(scenery, Vector3.zero, monumentPosition, 10);
    }
    const campPositions = [
      new Vector3(205, 0, 0),
      new Vector3(0, 0, 205),
      new Vector3(-205, 0, 0),
      new Vector3(0, 0, -205),
    ];
    for (const campPosition of campPositions) {
      this.createPath(scenery, campPosition.mul(0.82), campPosition.mul(0.96), 7);
    }

    const random = new Random(447921);
    let treesCreated = 0;
    let attempts = 0;
    while (treesCreated < 34 && attempts < 240) {
      attempts += 1;
      const position = this.randomIslandPosition(random, 72, 278);
      if (!this.isSceneryPositionFree(position, 35)) {
        continue;
      }
      this.createTree(scenery, position, random, treesCreated);
      treesCreated += 1;
    }

    for (let index = 0; index < 48; index += 1) {
      const position = this.randomIslandPosition(random, 45, 284);
      if (this.isSceneryPositionFree(position, 21)) {
        this.createRockCluster(scenery, position, random, index);
      }
    }

    for (let index = 0; index < 80; index += 1) {
      const position = this.randomIslandPosition(random, 35, 286);
      if (this.isSceneryPositionFree(position, 14)) {
        this.createGrassTuft(scenery, position, random, index);
      }
    }

    for (let index = 0; index < 18; index += 1) {
      const position = this.randomIslandPosition(random, 55, 260);
      if (this.isSceneryPositionFree(position, 26)) {
        this.createAbandonedDebris(scenery, position, random, index);
      }
    }
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
      for (let index = 0; index < 4; index += 1) {
        const angle = (index / 4) * math.pi * 2 + random.NextNumber(-0.25, 0.25);
        const leaf = createWorldPart(
          `Crown_${index}`,
          new Vector3(
            random.NextNumber(5.5, 7.5),
            random.NextNumber(4, 6),
            random.NextNumber(5.5, 7.5),
          ),
          new CFrame(
            node.Position.add(
              new Vector3(
                math.cos(angle) * 2.3,
                random.NextNumber(4.1, 6.2),
                math.sin(angle) * 2.3,
              ),
            ),
          ),
          Color3.fromRGB(67 + index * 4, 112 + index * 5, 55),
          Enum.Material.LeafyGrass,
          node,
          { canCollide: false, canQuery: false },
        );
        leaf.Shape = Enum.PartType.Ball;
      }
      return;
    }

    if (itemId === "stone") {
      node.Shape = Enum.PartType.Ball;
      node.Size = new Vector3(7.5, 5.2, 6.4);
      node.CFrame = new CFrame(node.Position).mul(
        CFrame.Angles(
          random.NextNumber(-0.2, 0.2),
          random.NextNumber(0, math.pi),
          random.NextNumber(-0.15, 0.15),
        ),
      );
      node.Color = Color3.fromRGB(104, 110, 112);
      node.Material = Enum.Material.Rock;
      for (let index = 0; index < 2; index += 1) {
        const fragment = createWorldPart(
          `StoneFragment_${index}`,
          new Vector3(3.5 - index * 0.5, 2.8, 3.2),
          new CFrame(node.Position.add(new Vector3(index === 0 ? 3.2 : -3, -1, index * 1.8 - 1))),
          Color3.fromRGB(91 + index * 12, 99 + index * 9, 103 + index * 8),
          index === 0 ? Enum.Material.Slate : Enum.Material.Limestone,
          node,
          { canCollide: false, canQuery: false },
        );
        fragment.Shape = Enum.PartType.Ball;
      }
      return;
    }

    if (itemId === "fiber") {
      node.Shape = Enum.PartType.Ball;
      node.Size = new Vector3(4.5, 2.5, 4.5);
      node.Color = Color3.fromRGB(64, 121, 59);
      node.Material = Enum.Material.LeafyGrass;
      for (let index = 0; index < 7; index += 1) {
        const angle = (index / 7) * math.pi * 2;
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
    light.Brightness = 1.1;
    light.Range = 13;
    light.Shadows = true;
    light.Parent = node;
  }

  private createCoastline(parent: Instance): void {
    const coast = new Instance("Folder");
    coast.Name = "Coastline";
    coast.Parent = parent;
    const random = new Random(89341);
    for (let index = 0; index < 56; index += 1) {
      const angle = (index / 56) * math.pi * 2;
      const radius = random.NextNumber(282, 297);
      const position = new Vector3(
        math.cos(angle) * radius,
        random.NextNumber(-1.4, -0.3),
        math.sin(angle) * radius,
      );
      const rock = createWorldPart(
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
      rock.Shape = Enum.PartType.Ball;
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
    light.Color = team.TeamColor.Color;
    light.Brightness = 0.8;
    light.Range = 18;
    light.Shadows = true;
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
    createWorldPart(
      "WarehouseRoof",
      new Vector3(44, 1.2, 36),
      new CFrame(position.add(new Vector3(0, 17.5, 0))),
      Color3.fromRGB(66, 72, 73),
      Enum.Material.Metal,
      model,
    );

    for (let index = 0; index < 5; index += 1) {
      const x = -16 + index * 8;
      createWorldPart(
        "RoofRib",
        new Vector3(0.5, 1, 36.5),
        new CFrame(position.add(new Vector3(x, 18.25, 0))),
        Color3.fromRGB(42, 48, 50),
        Enum.Material.Metal,
        model,
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
    coreLight.Brightness = 1;
    coreLight.Range = 24;
    coreLight.Shadows = true;
    coreLight.Parent = reactor;

    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * math.pi * 2;
      const base = position.add(new Vector3(math.cos(angle) * 18, 0, math.sin(angle) * 15));
      verticalCylinder(
        "CoolingStack",
        base.add(new Vector3(0, 7, 0)),
        12,
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
  }

  private createMonumentBase(
    parent: Instance,
    name: string,
    position: Vector3,
    accent: Color3,
  ): Model {
    const model = new Instance("Model");
    model.Name = name;
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
        Enum.Material.Neon,
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
    light.Brightness = 1.1;
    light.Range = 22;
    light.Shadows = true;
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

  private createWorkbench(parent: Instance, position: Vector3, yaw: number): void {
    const root = createWorldPart(
      "PublicWorkbench",
      new Vector3(7, 0.8, 3.5),
      new CFrame(position.add(new Vector3(0, 3.2, 0))).mul(CFrame.Angles(0, yaw, 0)),
      Color3.fromRGB(84, 96, 102),
      Enum.Material.DiamondPlate,
      parent,
    );
    for (const x of [-2.5, 2.5]) {
      for (const z of [-1, 1]) {
        createWorldPart(
          "WorkbenchLeg",
          new Vector3(0.45, 3, 0.45),
          new CFrame(position.add(new Vector3(x, 1.5, z))),
          Color3.fromRGB(58, 63, 65),
          Enum.Material.Metal,
          root,
        );
      }
    }
    createWorldPart(
      "Toolbox",
      new Vector3(2.4, 1.2, 1.4),
      new CFrame(position.add(new Vector3(1.4, 4.1, 0))),
      Color3.fromRGB(181, 110, 53),
      Enum.Material.Metal,
      root,
      { canCollide: false },
    );
    CollectionService.AddTag(root, "Workbench");
  }

  private createExtractionRing(parent: Instance): void {
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

  private createPath(parent: Instance, start: Vector3, finish: Vector3, width: number): void {
    const direction = finish.sub(start);
    const path = createWorldPart(
      "WeatheredPath",
      new Vector3(width, 0.28, direction.Magnitude),
      CFrame.lookAt(start.Lerp(finish, 0.5).add(new Vector3(0, 0.11, 0)), finish),
      Color3.fromRGB(113, 104, 87),
      Enum.Material.Ground,
      parent,
    );
    path.CastShadow = false;
  }

  private createTree(parent: Instance, position: Vector3, random: Random, index: number): void {
    const tree = new Instance("Model");
    tree.Name = `Pine_${index}`;
    tree.Parent = parent;
    const height = random.NextNumber(13, 20);
    const trunkColor = Color3.fromRGB(
      random.NextInteger(83, 104),
      random.NextInteger(62, 78),
      random.NextInteger(44, 56),
    );
    verticalCylinder(
      "Trunk",
      position.add(new Vector3(0, height / 2, 0)),
      height,
      random.NextNumber(1.7, 2.5),
      trunkColor,
      Enum.Material.Wood,
      tree,
    );

    const crownColor = Color3.fromRGB(
      random.NextInteger(43, 59),
      random.NextInteger(88, 112),
      random.NextInteger(46, 62),
    );
    for (let layer = 0; layer < 4; layer += 1) {
      const foliage = createWorldPart(
        "Foliage",
        new Vector3(9 - layer * 1.3, 5.5, 9 - layer * 1.3),
        new CFrame(
          position.add(
            new Vector3(
              random.NextNumber(-0.4, 0.4),
              height * 0.55 + layer * 2.2,
              random.NextNumber(-0.4, 0.4),
            ),
          ),
        ),
        crownColor.Lerp(Color3.fromRGB(78, 126, 62), layer * 0.08),
        Enum.Material.LeafyGrass,
        tree,
        { canCollide: false, canQuery: false },
      );
      foliage.Shape = Enum.PartType.Ball;
    }
  }

  private createRockCluster(
    parent: Instance,
    position: Vector3,
    random: Random,
    index: number,
  ): void {
    const cluster = new Instance("Model");
    cluster.Name = `RockCluster_${index}`;
    cluster.Parent = parent;
    const count = random.NextInteger(2, 4);
    for (let fragment = 0; fragment < count; fragment += 1) {
      const size = random.NextNumber(2.5, 6);
      const rock = createWorldPart(
        "Rock",
        new Vector3(size, size * random.NextNumber(0.55, 0.85), size * random.NextNumber(0.8, 1.2)),
        new CFrame(
          position.add(
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
      rock.Shape = Enum.PartType.Ball;
    }
  }

  private createGrassTuft(
    parent: Instance,
    position: Vector3,
    random: Random,
    index: number,
  ): void {
    const tuft = new Instance("Model");
    tuft.Name = `WildGrass_${index}`;
    tuft.Parent = parent;
    for (let blade = 0; blade < 4; blade += 1) {
      const angle = (blade / 4) * math.pi * 2 + random.NextNumber(-0.3, 0.3);
      createWedge(
        "Blade",
        new Vector3(0.25, random.NextNumber(1.5, 3.2), random.NextNumber(0.5, 0.9)),
        new CFrame(
          position.add(new Vector3(math.cos(angle) * 0.5, 0.8, math.sin(angle) * 0.5)),
        ).mul(CFrame.Angles(random.NextNumber(-0.25, 0.25), -angle, random.NextNumber(-0.2, 0.2))),
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
    const debris = new Instance("Model");
    debris.Name = `AbandonedDebris_${index}`;
    debris.Parent = parent;
    const yaw = random.NextNumber(0, math.pi * 2);
    createWorldPart(
      "BrokenPanel",
      new Vector3(random.NextNumber(4, 7), 0.45, random.NextNumber(2, 4)),
      new CFrame(position.add(new Vector3(0, 0.5, 0))).mul(
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
      position.add(new Vector3(1.8, 1.1, -0.4)),
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
    if (horizontalDistance(position, Vector3.zero) < clearance + 35) {
      return false;
    }
    for (const monument of MONUMENT_POSITIONS) {
      if (horizontalDistance(position, monument) < clearance + 35) {
        return false;
      }
    }
    const spawnPositions = [
      new Vector3(205, 0, 0),
      new Vector3(-205, 0, 0),
      new Vector3(0, 0, 205),
      new Vector3(0, 0, -205),
    ];
    for (const spawn of spawnPositions) {
      if (horizontalDistance(position, spawn) < clearance + 22) {
        return false;
      }
    }
    return true;
  }
}
