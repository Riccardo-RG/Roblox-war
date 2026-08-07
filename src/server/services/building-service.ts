import { CollectionService, TweenService, Workspace } from "@rbxts/services";
import { BUILD_PIECES, type BuildPieceId } from "shared/catalog/build-pieces";
import { MAX_BUILD_PARTS_PER_PLAYER, WORLD_HALF_EXTENT } from "shared/catalog/match-config";
import {
  horizontalDistance,
  isFiniteVector3,
  sanitizeRightAngleYaw,
  snapNumber,
} from "shared/util/math";
import { MatchService } from "server/services/match-service";
import { PlayerStateService } from "server/services/player-state-service";
import { RateLimiter } from "server/services/rate-limiter";
import { TeamService } from "server/services/team-service";

export class BuildingService {
  private readonly rateLimiter = new RateLimiter();
  private readonly buildsFolder: Folder;

  public constructor(
    private readonly playerState: PlayerStateService,
    private readonly teams: TeamService,
    private readonly match: MatchService,
    private readonly toast: (player: Player, message: string) => void,
  ) {
    this.buildsFolder = Workspace.WaitForChild("World")
      .WaitForChild("GeneratedWorld")
      .WaitForChild("Builds") as Folder;
  }

  public place(player: Player, pieceId: BuildPieceId, requestedCFrame: CFrame): void {
    const state = this.playerState.get(player);
    if (state === undefined || state.isSpectator || this.match.currentPhase() === "Complete") {
      return;
    }
    if (!this.rateLimiter.allow(player, "PlaceBuild", 0.22)) {
      return;
    }
    if (state.buildPartCount >= MAX_BUILD_PARTS_PER_PLAYER) {
      this.toast(player, "Limite costruzioni raggiunto");
      return;
    }

    const definition = BUILD_PIECES[pieceId];
    const root = player.Character?.FindFirstChild("HumanoidRootPart");
    if (!root?.IsA("BasePart")) {
      return;
    }

    if (!isFiniteVector3(requestedCFrame.Position)) {
      return;
    }
    const snappedPosition = new Vector3(
      snapNumber(requestedCFrame.Position.X, 1),
      snapNumber(requestedCFrame.Position.Y, 0.5),
      snapNumber(requestedCFrame.Position.Z, 1),
    );
    if (
      math.abs(snappedPosition.X) > WORLD_HALF_EXTENT ||
      math.abs(snappedPosition.Z) > WORLD_HALF_EXTENT ||
      snappedPosition.Y < 0 ||
      snappedPosition.Y > 80 ||
      horizontalDistance(root.Position, snappedPosition) > 35
    ) {
      return;
    }

    const yaw = sanitizeRightAngleYaw(requestedCFrame);
    const sanitizedCFrame = new CFrame(snappedPosition).mul(CFrame.Angles(0, yaw, 0));
    if (!this.hasSupport(player, sanitizedCFrame, definition.size)) {
      this.toast(player, "La costruzione deve poggiare sul terreno o su una base");
      return;
    }
    if (this.overlapsExistingBuild(sanitizedCFrame, definition.size)) {
      this.toast(player, "Spazio occupato");
      return;
    }
    if (!this.playerState.canAfford(player, definition.costs)) {
      this.toast(player, "Risorse insufficienti");
      return;
    }
    if (!this.playerState.spend(player, definition.costs)) {
      return;
    }

    if (pieceId === "doorway") {
      this.createDoorway(player, sanitizedCFrame, state.buildPartCount + 1);
    } else {
      const part = this.createBuildPart(
        `${pieceId}_${player.UserId}_${state.buildPartCount + 1}`,
        definition.size,
        sanitizedCFrame,
        definition.color,
        definition.material,
      );
      this.configureBuildRoot(part, player, pieceId);
      part.Parent = this.buildsFolder;
      CollectionService.AddTag(part, "PlayerBuild");
      if (pieceId === "workbench") {
        CollectionService.AddTag(part, "Workbench");
      }
    }

    this.playerState.incrementBuildCount(player);
  }

  public breach(player: Player, target: Instance): void {
    const state = this.playerState.get(player);
    if (
      state === undefined ||
      state.isSpectator ||
      !this.match.allowsRaiding() ||
      !target.IsA("BasePart") ||
      !CollectionService.HasTag(target, "PlayerBuild")
    ) {
      return;
    }
    if (!this.rateLimiter.allow(player, "UseBreach", 0.8)) {
      return;
    }

    const root = player.Character?.FindFirstChild("HumanoidRootPart");
    if (!root?.IsA("BasePart") || horizontalDistance(root.Position, target.Position) > 14) {
      return;
    }
    const buildRoot = this.resolveBuildRoot(target);
    if (buildRoot === undefined) {
      return;
    }
    const ownerTeam = buildRoot.GetAttribute("OwnerTeam");
    if (typeIs(ownerTeam, "string") && ownerTeam === this.teams.nameFor(player)) {
      this.toast(player, "Non puoi danneggiare la base della squadra");
      return;
    }
    if (!this.playerState.consume(player, "breach_charge", 1)) {
      this.toast(player, "Serve una Carica a impulsi");
      return;
    }

    const health = buildRoot.GetAttribute("Health");
    if (!typeIs(health, "number")) {
      return;
    }
    const nextHealth = health - 125;
    buildRoot.SetAttribute("Health", nextHealth);
    if (nextHealth <= 0) {
      buildRoot.Destroy();
      this.playerState.awardProgress(player, 20, 5);
      this.toast(player, "Difesa distrutta");
    } else {
      this.toast(player, `Integrità struttura: ${math.max(0, math.floor(nextHealth))}`);
    }
  }

  public removePlayer(player: Player): void {
    this.rateLimiter.removePlayer(player);
  }

  public resetAll(): void {
    this.buildsFolder.ClearAllChildren();
  }

  private overlapsExistingBuild(cframe: CFrame, size: Vector3): boolean {
    const parameters = new OverlapParams();
    parameters.FilterType = Enum.RaycastFilterType.Include;
    parameters.FilterDescendantsInstances = [this.buildsFolder];
    const shrunken = new Vector3(size.X * 0.88, size.Y * 0.88, size.Z * 0.88);
    return Workspace.GetPartBoundsInBox(cframe, shrunken, parameters).size() > 0;
  }

  private hasSupport(player: Player, cframe: CFrame, size: Vector3): boolean {
    const parameters = new RaycastParams();
    parameters.FilterType = Enum.RaycastFilterType.Exclude;
    parameters.FilterDescendantsInstances =
      player.Character !== undefined ? [player.Character] : [];
    parameters.IgnoreWater = true;

    const rayLength = size.Y / 2 + 2.5;
    const result = Workspace.Raycast(
      cframe.Position.add(new Vector3(0, 0.5, 0)),
      new Vector3(0, -rayLength, 0),
      parameters,
    );
    if (result === undefined || CollectionService.HasTag(result.Instance, "ResourceNode")) {
      return false;
    }
    return result.Instance.Name !== "Water" && result.Instance.Name !== "WorldBoundary";
  }

  private createDoorway(player: Player, cframe: CFrame, sequence: number): void {
    const definition = BUILD_PIECES.doorway;
    const model = new Instance("Model");
    model.Name = `doorway_${player.UserId}_${sequence}`;
    this.configureBuildRoot(model, player, "doorway");
    model.Parent = this.buildsFolder;

    const componentData = [
      ["LeftFrame", new Vector3(2.25, 8, 1), new Vector3(-4.875, 0, 0)],
      ["RightFrame", new Vector3(2.25, 8, 1), new Vector3(4.875, 0, 0)],
      ["TopFrame", new Vector3(7.5, 1.5, 1), new Vector3(0, 3.25, 0)],
    ] as const;
    for (const [name, size, offset] of componentData) {
      const component = this.createBuildPart(
        name,
        size,
        cframe.mul(new CFrame(offset)),
        definition.color,
        definition.material,
      );
      component.Parent = model;
      CollectionService.AddTag(component, "PlayerBuild");
    }

    const door = this.createBuildPart(
      "TeamDoor",
      new Vector3(7.45, 6.45, 0.75),
      cframe.mul(new CFrame(0, -0.75, 0)),
      Color3.fromRGB(74, 108, 126),
      Enum.Material.Metal,
    );
    door.Parent = model;
    CollectionService.AddTag(door, "PlayerBuild");
    CollectionService.AddTag(door, "TeamDoor");
    model.SetAttribute("ClosedDoorCFrame", door.CFrame);
    model.SetAttribute("DoorOpen", false);
    model.SetAttribute("DoorMoving", false);

    const prompt = new Instance("ProximityPrompt");
    prompt.Name = "DoorPrompt";
    prompt.ActionText = "Apri";
    prompt.ObjectText = `Ingresso · ${this.teams.nameFor(player)}`;
    prompt.KeyboardKeyCode = Enum.KeyCode.E;
    prompt.MaxActivationDistance = 12;
    prompt.RequiresLineOfSight = false;
    prompt.HoldDuration = 0;
    prompt.Parent = door;
    prompt.Triggered.Connect((activator) => this.toggleDoor(activator, model, door, prompt));
  }

  private toggleDoor(player: Player, model: Model, door: BasePart, prompt: ProximityPrompt): void {
    if (!model.Parent || !door.Parent || model.GetAttribute("DoorMoving") === true) {
      return;
    }
    const ownerTeam = model.GetAttribute("OwnerTeam");
    if (!typeIs(ownerTeam, "string") || ownerTeam !== this.teams.nameFor(player)) {
      this.toast(player, "Ingresso bloccato: appartiene a un'altra squadra");
      return;
    }
    const closedCFrame = model.GetAttribute("ClosedDoorCFrame");
    if (!typeIs(closedCFrame, "CFrame")) {
      return;
    }

    const isOpen = model.GetAttribute("DoorOpen") === true;
    const targetCFrame = isOpen ? closedCFrame : closedCFrame.add(new Vector3(0, 6.7, 0));
    model.SetAttribute("DoorMoving", true);
    if (!isOpen) {
      door.CanCollide = false;
    }
    const tween = TweenService.Create(
      door,
      new TweenInfo(0.45, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
      { CFrame: targetCFrame },
    );
    tween.Completed.Connect(() => {
      if (!model.Parent || !door.Parent) {
        return;
      }
      const nowOpen = !isOpen;
      model.SetAttribute("DoorOpen", nowOpen);
      model.SetAttribute("DoorMoving", false);
      door.CanCollide = !nowOpen;
      prompt.ActionText = nowOpen ? "Chiudi" : "Apri";
    });
    tween.Play();
  }

  private createBuildPart(
    name: string,
    size: Vector3,
    cframe: CFrame,
    color: Color3,
    material: Enum.Material,
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
    return part;
  }

  private configureBuildRoot(root: Instance, player: Player, pieceId: BuildPieceId): void {
    const definition = BUILD_PIECES[pieceId];
    root.SetAttribute("BuildPieceId", pieceId);
    root.SetAttribute("OwnerUserId", player.UserId);
    root.SetAttribute("OwnerTeam", this.teams.nameFor(player));
    root.SetAttribute("Health", definition.maxHealth);
    root.SetAttribute("MaxHealth", definition.maxHealth);
  }

  private resolveBuildRoot(target: BasePart): Instance | undefined {
    if (target.Parent === this.buildsFolder) {
      return target;
    }
    const model = target.FindFirstAncestorOfClass("Model");
    return model?.Parent === this.buildsFolder ? model : undefined;
  }
}
