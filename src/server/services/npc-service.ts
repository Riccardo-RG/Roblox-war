import { CollectionService, Players, Workspace } from "@rbxts/services";
import { horizontalDistance } from "shared/util/math";

const DRONE_SPAWNS = [
  new Vector3(-130, 5, -78),
  new Vector3(-100, 5, -55),
  new Vector3(105, 5, -78),
  new Vector3(135, 5, -52),
  new Vector3(-15, 5, 112),
  new Vector3(18, 5, 138),
];

export class NpcService {
  private readonly enemiesFolder: Folder;
  private readonly drones = new Set<Model>();
  private readonly lastAttacks = new Map<Model, number>();
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
    if (model === undefined || !CollectionService.HasTag(model, "EnemyNPC")) {
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
    core.Size = new Vector3(5, 5, 5);
    core.Color = Color3.fromRGB(235, 88, 112);
    core.Material = Enum.Material.Neon;
    core.CFrame = new CFrame(position);
    core.Parent = model;
    model.PrimaryPart = core;

    const eye = new Instance("PointLight");
    eye.Color = Color3.fromRGB(255, 95, 95);
    eye.Range = 14;
    eye.Brightness = 1.5;
    eye.Parent = core;

    CollectionService.AddTag(model, "EnemyNPC");
    this.drones.add(model);
  }

  private updateLoop(): void {
    while (this.running) {
      for (const drone of this.drones) {
        if (!drone.Parent || drone.PrimaryPart === undefined) {
          this.drones.delete(drone);
          continue;
        }

        const target = this.findNearestTarget(drone.PrimaryPart.Position);
        if (target === undefined) {
          continue;
        }
        const root = target.Character?.FindFirstChild("HumanoidRootPart");
        const humanoid = target.Character?.FindFirstChildOfClass("Humanoid");
        if (!root?.IsA("BasePart") || humanoid === undefined || humanoid.Health <= 0) {
          continue;
        }

        const dronePosition = drone.PrimaryPart.Position;
        const distance = horizontalDistance(dronePosition, root.Position);
        if (distance > 6) {
          const direction = new Vector3(
            root.Position.X - dronePosition.X,
            0,
            root.Position.Z - dronePosition.Z,
          );
          if (direction.Magnitude > 0.1) {
            const nextPosition = dronePosition.add(direction.Unit.mul(math.min(2.2, distance - 5)));
            drone.PivotTo(CFrame.lookAt(nextPosition, root.Position));
          }
        } else {
          const now = os.clock();
          const previous = this.lastAttacks.get(drone) ?? 0;
          if (now - previous >= 1.25) {
            this.lastAttacks.set(drone, now);
            humanoid.TakeDamage(10);
          }
        }
      }
      task.wait(0.2);
    }
  }

  private findNearestTarget(position: Vector3): Player | undefined {
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
      const distance = horizontalDistance(position, root.Position);
      if (distance < nearestDistance) {
        nearest = player;
        nearestDistance = distance;
      }
    }
    return nearest;
  }
}
