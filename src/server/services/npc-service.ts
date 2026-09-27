import { CollectionService, PathfindingService, Players, Workspace } from "@rbxts/services";

const DRONE_SPEED = 10;
const DRONE_ATTACK_RANGE = 6;
const DRONE_LEASH_RANGE = 85;
const NAVIGATION_INTERVAL = 1.5;

interface DroneNavigation {
  waypoints: Vector3[];
  nextWaypoint: number;
  lastComputedAt: number;
  computing: boolean;
  destination: Vector3;
}

const DRONE_SPAWNS = [
  new Vector3(-130, 5, -78),
  new Vector3(-100, 5, -55),
  new Vector3(105, 5, -78),
  new Vector3(135, 5, -52),
  new Vector3(-15, 5, 112),
  new Vector3(18, 5, 138),
];

function createDronePart(
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
  part.CanCollide = false;
  part.Size = size;
  part.CFrame = cframe;
  part.Color = color;
  part.Material = material;
  part.TopSurface = Enum.SurfaceType.Smooth;
  part.BottomSurface = Enum.SurfaceType.Smooth;
  part.Parent = parent;
  return part;
}

export class NpcService {
  private readonly enemiesFolder: Folder;
  private readonly drones = new Set<Model>();
  private readonly lastAttacks = new Map<Model, number>();
  private readonly navigation = new Map<Model, DroneNavigation>();
  private running = true;
  private respawnGeneration = 0;

  public constructor(
    private readonly onDefeated: (player: Player) => void,
    private readonly canTarget: (player: Player) => boolean,
  ) {
    this.enemiesFolder = Workspace.WaitForChild("World")
      .WaitForChild("GeneratedWorld")
      .WaitForChild("Enemies") as Folder;
  }

  public start(): void {
    for (const position of DRONE_SPAWNS) {
      this.spawnDrone(position);
    }
    task.spawn(() => this.updateLoop());
  }

  public damage(instance: Instance, amount: number, source: Player): boolean | undefined {
    const model = instance.IsA("Model") ? instance : instance.FindFirstAncestorOfClass("Model");
    if (
      model === undefined ||
      !this.drones.has(model) ||
      !CollectionService.HasTag(model, "EnemyNPC") ||
      !this.canTarget(source)
    ) {
      return undefined;
    }
    const shooter = source.Character?.FindFirstChildOfClass("Humanoid");
    if (shooter === undefined || shooter.Health <= 0) {
      return undefined;
    }

    const health = model.GetAttribute("Health");
    if (!typeIs(health, "number") || health <= 0) {
      return false;
    }

    const nextHealth = health - amount;
    model.SetAttribute("Health", nextHealth);
    if (nextHealth <= 0) {
      const spawnPosition = model.GetAttribute("SpawnPosition");
      this.drones.delete(model);
      this.lastAttacks.delete(model);
      this.navigation.delete(model);
      model.Destroy();
      this.onDefeated(source);
      if (typeIs(spawnPosition, "Vector3")) {
        const generation = this.respawnGeneration;
        task.delay(15, () => {
          if (generation === this.respawnGeneration) {
            this.spawnDrone(spawnPosition);
          }
        });
      }
      return true;
    }
    return false;
  }

  public stop(): void {
    this.running = false;
    this.respawnGeneration += 1;
  }

  public resetAll(): void {
    this.respawnGeneration += 1;
    for (const drone of this.drones) {
      drone.Destroy();
    }
    this.drones.clear();
    this.lastAttacks.clear();
    this.navigation.clear();
    for (const position of DRONE_SPAWNS) {
      this.spawnDrone(position);
    }
  }

  private spawnDrone(position: Vector3): void {
    if (!this.enemiesFolder.Parent) {
      return;
    }

    const model = new Instance("Model");
    model.Name = "GuardDrone";
    model.SetAttribute("Health", 75);
    model.SetAttribute("MaxHealth", 75);
    model.SetAttribute("SpawnPosition", position);
    model.Parent = this.enemiesFolder;

    const core = new Instance("Part");
    core.Name = "Core";
    core.Anchored = true;
    core.CanCollide = true;
    core.Shape = Enum.PartType.Ball;
    core.Size = new Vector3(4.2, 2.7, 4.2);
    core.Color = Color3.fromRGB(55, 62, 68);
    core.Material = Enum.Material.Metal;
    core.CFrame = new CFrame(position);
    core.Parent = model;
    model.PrimaryPart = core;

    const eye = createDronePart(
      "Optic",
      new Vector3(1.7, 0.75, 0.5),
      new CFrame(position.add(new Vector3(0, 0.05, -2.05))),
      Color3.fromRGB(242, 72, 91),
      Enum.Material.Neon,
      model,
    );
    eye.Shape = Enum.PartType.Ball;

    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * math.pi * 2 + math.pi / 4;
      const direction = new Vector3(math.cos(angle), 0, math.sin(angle));
      const armPosition = position.add(direction.mul(3.2));
      createDronePart(
        "RotorArm",
        new Vector3(5.2, 0.35, 0.45),
        new CFrame(position.add(direction.mul(2.4))).mul(CFrame.Angles(0, -angle, 0)),
        Color3.fromRGB(69, 77, 81),
        Enum.Material.Metal,
        model,
      );
      const motor = createDronePart(
        "RotorMotor",
        new Vector3(1.1, 0.8, 1.1),
        new CFrame(armPosition),
        Color3.fromRGB(39, 44, 47),
        Enum.Material.Metal,
        model,
      );
      motor.Shape = Enum.PartType.Ball;
      const rotor = createDronePart(
        "Rotor",
        new Vector3(0.15, 4.3, 4.3),
        new CFrame(armPosition.add(new Vector3(0, 0.55, 0))).mul(CFrame.Angles(0, 0, math.pi / 2)),
        Color3.fromRGB(36, 42, 45),
        Enum.Material.Metal,
        model,
      );
      rotor.Shape = Enum.PartType.Cylinder;
      rotor.Transparency = 0.2;
    }

    const lowerSensor = createDronePart(
      "LowerSensor",
      new Vector3(1.4, 1.4, 1.4),
      new CFrame(position.add(new Vector3(0, -1.7, 0))),
      Color3.fromRGB(83, 95, 102),
      Enum.Material.Metal,
      model,
    );
    lowerSensor.Shape = Enum.PartType.Ball;

    const eyeLight = new Instance("PointLight");
    eyeLight.Color = Color3.fromRGB(255, 77, 91);
    eyeLight.Range = 12;
    eyeLight.Brightness = 0.85;
    eyeLight.Shadows = true;
    eyeLight.Parent = eye;

    CollectionService.AddTag(model, "EnemyNPC");
    this.drones.add(model);
  }

  private updateLoop(): void {
    let previousUpdate = os.clock();
    while (this.running) {
      const now = os.clock();
      const deltaTime = math.clamp(now - previousUpdate, 0, 0.25);
      previousUpdate = now;
      for (const drone of this.drones) {
        if (!drone.Parent || drone.PrimaryPart === undefined) {
          this.drones.delete(drone);
          this.navigation.delete(drone);
          continue;
        }

        const spawnPosition = drone.GetAttribute("SpawnPosition");
        if (!typeIs(spawnPosition, "Vector3")) {
          continue;
        }
        const dronePosition = drone.PrimaryPart.Position;
        const target = this.findNearestTarget(dronePosition, spawnPosition);
        if (target === undefined) {
          if (dronePosition.sub(spawnPosition).Magnitude > 2) {
            this.moveDrone(drone, spawnPosition, deltaTime);
          }
          continue;
        }
        const root = target.Character?.FindFirstChild("HumanoidRootPart");
        const humanoid = target.Character?.FindFirstChildOfClass("Humanoid");
        if (!root?.IsA("BasePart") || humanoid === undefined || humanoid.Health <= 0) {
          continue;
        }

        const distance = dronePosition.sub(root.Position).Magnitude;
        const visible = this.hasLineOfSight(drone, root.Position, target.Character);
        if (distance > DRONE_ATTACK_RANGE || !visible) {
          // Navigation finds a route around buildings; every actual movement
          // remains swept against geometry, including newly placed player walls.
          this.moveDrone(
            drone,
            root.Position.add(new Vector3(0, 2, 0)),
            deltaTime,
            target.Character,
          );
        } else {
          const previous = this.lastAttacks.get(drone) ?? 0;
          if (now - previous >= 1.25) {
            this.lastAttacks.set(drone, now);
            this.beginAttack(drone, target);
          }
        }
      }
      task.wait(0.1);
    }
  }

  private findNearestTarget(position: Vector3, spawnPosition: Vector3): Player | undefined {
    let nearest: Player | undefined;
    let nearestDistance = 58;
    for (const player of Players.GetPlayers()) {
      if (!this.canTarget(player)) {
        continue;
      }
      const root = player.Character?.FindFirstChild("HumanoidRootPart");
      const humanoid = player.Character?.FindFirstChildOfClass("Humanoid");
      if (!root?.IsA("BasePart") || humanoid === undefined || humanoid.Health <= 0) {
        continue;
      }
      if (root.Position.sub(spawnPosition).Magnitude > DRONE_LEASH_RANGE) {
        continue;
      }
      const distance = position.sub(root.Position).Magnitude;
      if (distance < nearestDistance) {
        nearest = player;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private hasLineOfSight(drone: Model, destination: Vector3, target?: Model): boolean {
    const origin = drone.PrimaryPart?.Position;
    if (origin === undefined) {
      return false;
    }
    const parameters = this.movementParameters(drone);
    const hit = Workspace.Raycast(origin, destination.sub(origin), parameters);
    return hit === undefined || (target !== undefined && hit.Instance.IsDescendantOf(target));
  }

  private beginAttack(drone: Model, target: Player): void {
    const generation = this.respawnGeneration;
    const optic = drone.FindFirstChild("Optic");
    if (optic?.IsA("BasePart")) {
      optic.Color = Color3.fromRGB(255, 191, 70);
    }
    drone.SetAttribute("AttackWindupUntil", Workspace.GetServerTimeNow() + 0.4);
    task.delay(0.4, () => {
      if (!this.running || generation !== this.respawnGeneration || !this.drones.has(drone)) {
        return;
      }
      if (optic?.IsA("BasePart")) {
        optic.Color = Color3.fromRGB(242, 72, 91);
      }
      const character = target.Character;
      const root = character?.FindFirstChild("HumanoidRootPart");
      const humanoid = character?.FindFirstChildOfClass("Humanoid");
      const dronePosition = drone.PrimaryPart?.Position;
      if (
        this.canTarget(target) &&
        root?.IsA("BasePart") &&
        humanoid !== undefined &&
        humanoid.Health > 0 &&
        dronePosition !== undefined &&
        root.Position.sub(dronePosition).Magnitude <= DRONE_ATTACK_RANGE &&
        this.hasLineOfSight(drone, root.Position, character)
      ) {
        humanoid.TakeDamage(10);
      }
    });
  }

  private movementParameters(drone: Model): RaycastParams {
    const parameters = new RaycastParams();
    parameters.FilterType = Enum.RaycastFilterType.Exclude;
    parameters.FilterDescendantsInstances = [drone];
    parameters.RespectCanCollide = true;
    parameters.IgnoreWater = true;
    return parameters;
  }

  private moveDrone(
    drone: Model,
    destination: Vector3,
    deltaTime: number,
    targetCharacter?: Model,
  ): void {
    const origin = drone.PrimaryPart?.Position;
    if (origin === undefined) {
      return;
    }
    const parameters = this.movementParameters(drone);
    const direct = destination.sub(origin);
    if (direct.Magnitude <= 0.2) {
      return;
    }
    const routeParameters = this.movementParameters(drone);
    if (targetCharacter !== undefined) {
      routeParameters.FilterDescendantsInstances = [drone, targetCharacter];
    }
    const directObstacle = Workspace.Spherecast(origin, 2, direct, routeParameters);
    let waypoint = destination;
    if (directObstacle !== undefined) {
      let route = this.navigation.get(drone);
      if (route === undefined) {
        route = {
          waypoints: [],
          nextWaypoint: 0,
          lastComputedAt: -NAVIGATION_INTERVAL,
          computing: false,
          destination,
        };
        this.navigation.set(drone, route);
      }
      if (!route.computing && os.clock() - route.lastComputedAt >= NAVIGATION_INTERVAL) {
        this.computeRoute(drone, route, destination);
      }
      let nextWaypointPosition = route.waypoints[route.nextWaypoint];
      while (nextWaypointPosition !== undefined && nextWaypointPosition.sub(origin).Magnitude < 2) {
        route.nextWaypoint += 1;
        nextWaypointPosition = route.waypoints[route.nextWaypoint];
      }
      if (nextWaypointPosition === undefined) {
        return;
      }
      waypoint = nextWaypointPosition;
    } else {
      this.navigation.delete(drone);
    }

    const direction = waypoint.sub(origin);
    if (direction.Magnitude <= 0.1) {
      return;
    }
    const step = direction.Unit.mul(math.min(DRONE_SPEED * deltaTime, direction.Magnitude));
    const obstacle = Workspace.Spherecast(origin, 2, step, parameters);
    if (obstacle !== undefined) {
      return;
    }
    const position = origin.add(step);
    const lookAt = new Vector3(destination.X, position.Y, destination.Z);
    drone.PivotTo(
      position.sub(lookAt).Magnitude > 0.1 ? CFrame.lookAt(position, lookAt) : new CFrame(position),
    );
  }

  private computeRoute(drone: Model, route: DroneNavigation, destination: Vector3): void {
    const origin = drone.PrimaryPart?.Position;
    if (origin === undefined) {
      return;
    }
    route.computing = true;
    route.lastComputedAt = os.clock();
    route.destination = destination;
    const generation = this.respawnGeneration;
    task.spawn(() => {
      const path = PathfindingService.CreatePath({
        AgentRadius: 2.5,
        AgentHeight: 6,
        AgentCanJump: false,
        WaypointSpacing: 4,
      });
      const [success] = pcall(() =>
        path.ComputeAsync(origin.sub(new Vector3(0, 3, 0)), destination.sub(new Vector3(0, 3, 0))),
      );
      if (
        this.running &&
        generation === this.respawnGeneration &&
        drone.Parent !== undefined &&
        this.navigation.get(drone) === route
      ) {
        route.computing = false;
        if (success && path.Status === Enum.PathStatus.Success) {
          route.waypoints = path
            .GetWaypoints()
            .map((point) => point.Position.add(new Vector3(0, 4, 0)));
          route.nextWaypoint = 0;
        } else {
          route.waypoints = [];
        }
      }
      path.Destroy();
    });
  }
}
