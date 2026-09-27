import { CollectionService, Players, TweenService, Workspace } from "@rbxts/services";
import { BUILD_PIECES, type BuildPieceId } from "shared/catalog/build-pieces";
import {
  MAX_BUILD_PARTS_PER_PLAYER,
  MAX_BUILD_STRUCTURES_PER_TEAM,
  MAX_BUILD_STRUCTURES_PER_SERVER,
} from "shared/catalog/match-config";
import { BUILD_RULES } from "shared/catalog/build-rules";
import {
  getCampPosition,
  MONUMENT_POSITIONS,
  isPlayableIslandPosition,
} from "server/world/world-layout";
import { canInteract, livingRoot } from "server/services/interaction-guard";
import { localized, sourceFor, type LocalizedMessage } from "shared/localization/translations";
import {
  isFiniteCFrame,
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
  private readonly noBuildZones = new Array<BasePart>();

  public constructor(
    private readonly playerState: PlayerStateService,
    private readonly teams: TeamService,
    private readonly match: MatchService,
    private readonly toast: (player: Player, message: LocalizedMessage) => void,
    private readonly localizationTable: LocalizationTable,
  ) {
    this.buildsFolder = Workspace.WaitForChild("World")
      .WaitForChild("GeneratedWorld")
      .WaitForChild("Builds") as Folder;
    const zones = new Instance("Folder");
    zones.Name = "ProtectedBuildZones";
    zones.Parent = this.buildsFolder.Parent;
    const addZone = (name: string, position: Vector3, radius: number) => {
      const zone = new Instance("Part");
      zone.Name = name;
      zone.Anchored = true;
      zone.Transparency = 1;
      zone.CanCollide = false;
      zone.CanQuery = false;
      zone.CanTouch = false;
      zone.Size = new Vector3(radius * 2, 160, radius * 2);
      zone.CFrame = new CFrame(position);
      zone.Parent = zones;
      CollectionService.AddTag(zone, "NoBuildZone");
      this.noBuildZones.push(zone);
    };
    addZone("ExtractionClearance", Vector3.zero, BUILD_RULES.extractionClearance);
    for (const position of MONUMENT_POSITIONS)
      addZone("MonumentClearance", position, BUILD_RULES.monumentClearance);
    for (let index = 0; index < this.teams.all().size(); index += 1) {
      const camp = getCampPosition(index, this.teams.all().size());
      addZone("SpawnClearance", camp, BUILD_RULES.spawnClearance);
      addZone("DepotClearance", camp.add(new Vector3(12, 0, 0)), BUILD_RULES.depotClearance);
    }
  }

  public place(player: Player, pieceId: BuildPieceId, requestedCFrame: CFrame): void {
    const state = this.playerState.get(player);
    if (state === undefined || state.isSpectator || this.match.currentPhase() === "Complete") {
      return;
    }
    if (!this.rateLimiter.allow(player, "PlaceBuild", 0.22)) {
      return;
    }
    const ownedCount = this.countBuilds(player.UserId);
    if (ownedCount >= MAX_BUILD_PARTS_PER_PLAYER) {
      this.toast(player, localized("toast.build_limit"));
      return;
    }
    if (
      this.buildsFolder.GetChildren().size() >= MAX_BUILD_STRUCTURES_PER_SERVER ||
      this.countTeamBuilds(this.teams.nameFor(player)) >= MAX_BUILD_STRUCTURES_PER_TEAM
    ) {
      this.toast(player, localized("toast.build_budget"));
      return;
    }

    const definition = BUILD_PIECES[pieceId];
    const root = livingRoot(player);
    if (root === undefined) {
      return;
    }

    if (!isFiniteCFrame(requestedCFrame) || !isFiniteVector3(requestedCFrame.Position)) {
      return;
    }
    const snappedPosition = new Vector3(
      snapNumber(requestedCFrame.Position.X, BUILD_RULES.grid),
      snapNumber(requestedCFrame.Position.Y, BUILD_RULES.heightGrid),
      snapNumber(requestedCFrame.Position.Z, BUILD_RULES.grid),
    );
    if (
      !isPlayableIslandPosition(snappedPosition) ||
      snappedPosition.Y < BUILD_RULES.minHeight ||
      snappedPosition.Y > BUILD_RULES.maxHeight ||
      root.Position.sub(snappedPosition).Magnitude > BUILD_RULES.maxDistance
    ) {
      this.toast(player, localized("toast.build_out_of_range"));
      return;
    }

    const yaw = sanitizeRightAngleYaw(requestedCFrame);
    const sanitizedCFrame = new CFrame(snappedPosition).mul(CFrame.Angles(0, yaw, 0));
    const sight = new RaycastParams();
    sight.FilterType = Enum.RaycastFilterType.Exclude;
    sight.FilterDescendantsInstances = player.Character !== undefined ? [player.Character] : [];
    sight.IgnoreWater = true;
    const head = player.Character?.FindFirstChild("Head");
    const origin = head?.IsA("BasePart") ? head.Position : root.Position;
    const obstruction = Workspace.Raycast(origin, snappedPosition.sub(origin), sight);
    if (obstruction !== undefined && obstruction.Position.sub(snappedPosition).Magnitude > 0.75) {
      this.toast(player, localized("toast.space_occupied"));
      return;
    }
    const [, rotation] = sanitizedCFrame.ToEulerAnglesYXZ();
    const swapAxes = math.abs(math.sin(rotation)) > 0.5;
    const halfX = (swapAxes ? definition.size.Z : definition.size.X) / 2;
    const halfZ = (swapAxes ? definition.size.X : definition.size.Z) / 2;
    if (
      this.noBuildZones.some(
        (zone) =>
          math.abs(snappedPosition.X - zone.Position.X) < zone.Size.X / 2 + halfX &&
          math.abs(snappedPosition.Z - zone.Position.Z) < zone.Size.Z / 2 + halfZ,
      )
    ) {
      this.toast(player, localized("toast.build_protected"));
      return;
    }
    if (!this.hasSupport(player, sanitizedCFrame, definition.size)) {
      this.toast(player, localized("toast.build_support"));
      return;
    }
    if (this.overlapsExistingBuild(player, sanitizedCFrame, definition.size)) {
      this.toast(player, localized("toast.space_occupied"));
      return;
    }
    if (!this.playerState.canAfford(player, definition.costs)) {
      this.toast(player, localized("toast.insufficient_resources"));
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
      this.decorateBuildPart(part, pieceId);
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

    if (!canInteract(player, target, 14)) {
      return;
    }
    const buildRoot = this.resolveBuildRoot(target);
    if (buildRoot === undefined) {
      return;
    }
    const ownerTeam = buildRoot.GetAttribute("OwnerTeam");
    if (typeIs(ownerTeam, "string") && ownerTeam === this.teams.nameFor(player)) {
      this.toast(player, localized("toast.friendly_base"));
      return;
    }
    const health = buildRoot.GetAttribute("Health");
    if (!typeIs(health, "number") || health <= 0) {
      return;
    }
    if (!this.playerState.consume(player, "breach_charge", 1)) {
      this.toast(player, localized("toast.need_charge"));
      return;
    }
    const nextHealth = health - 125;
    buildRoot.SetAttribute("Health", nextHealth);
    if (nextHealth <= 0) {
      buildRoot.Destroy();
      this.playerState.awardProgress(player, 20, 5);
      this.toast(player, localized("toast.defense_destroyed"));
    } else {
      this.toast(
        player,
        localized("toast.structure_integrity", { value: math.max(0, math.floor(nextHealth)) }),
      );
    }
  }

  public removePlayer(player: Player): void {
    this.rateLimiter.removePlayer(player);
  }

  public resetAll(): void {
    this.buildsFolder.ClearAllChildren();
  }

  public countBuilds(userId: number): number {
    return this.buildsFolder
      .GetChildren()
      .filter((root) => root.GetAttribute("OwnerUserId") === userId)
      .size();
  }

  private countTeamBuilds(teamName: string): number {
    return this.buildsFolder
      .GetChildren()
      .filter((root) => root.GetAttribute("OwnerTeam") === teamName)
      .size();
  }

  private overlapsExistingBuild(player: Player, cframe: CFrame, size: Vector3): boolean {
    const parameters = new OverlapParams();
    parameters.FilterType = Enum.RaycastFilterType.Exclude;
    parameters.FilterDescendantsInstances = [];
    const shrunken = new Vector3(
      math.max(0.1, size.X - 0.3),
      math.max(0.1, size.Y - 0.3),
      math.max(0.1, size.Z - 0.3),
    );
    return Workspace.GetPartBoundsInBox(cframe, shrunken, parameters).some(
      (part) => part.CanCollide,
    );
  }

  private hasSupport(player: Player, cframe: CFrame, size: Vector3): boolean {
    const parameters = new RaycastParams();
    parameters.FilterType = Enum.RaycastFilterType.Exclude;
    parameters.FilterDescendantsInstances =
      player.Character !== undefined ? [player.Character] : [];
    parameters.IgnoreWater = true;

    const samples = [
      new Vector3(0, 0, 0),
      new Vector3(-0.4, 0, -0.4),
      new Vector3(-0.4, 0, 0.4),
      new Vector3(0.4, 0, -0.4),
      new Vector3(0.4, 0, 0.4),
    ];
    for (const sample of samples) {
      const origin = cframe.PointToWorldSpace(
        new Vector3(sample.X * size.X, -size.Y / 2 + 0.35, sample.Z * size.Z),
      );
      const result = Workspace.Raycast(origin, new Vector3(0, -1.55, 0), parameters);
      if (
        result === undefined ||
        CollectionService.HasTag(result.Instance, "ResourceNode") ||
        result.Normal.Y < 0.6 ||
        result.Material === Enum.Material.Water ||
        result.Instance.Name === "WorldBoundary"
      )
        return false;
      if (CollectionService.HasTag(result.Instance, "PlayerBuild")) {
        const support = this.resolveBuildRoot(result.Instance);
        if (support?.GetAttribute("OwnerTeam") !== this.teams.nameFor(player)) return false;
      } else if (
        result.Instance !== Workspace.Terrain &&
        result.Instance.GetAttribute("BuildableSurface") !== true
      )
        return false;
    }
    return true;
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
    prompt.ActionText = sourceFor("prompt.open");
    prompt.ObjectText = sourceFor("prompt.team_entrance");
    prompt.AutoLocalize = true;
    prompt.RootLocalizationTable = this.localizationTable;
    prompt.KeyboardKeyCode = Enum.KeyCode.E;
    prompt.GamepadKeyCode = Enum.KeyCode.ButtonX;
    prompt.MaxActivationDistance = 12;
    prompt.RequiresLineOfSight = true;
    prompt.HoldDuration = 0;
    prompt.Parent = door;
    prompt.Triggered.Connect((activator) => this.toggleDoor(activator, model, door, prompt));
  }

  private toggleDoor(player: Player, model: Model, door: BasePart, prompt: ProximityPrompt): void {
    if (
      !model.Parent ||
      !door.Parent ||
      model.GetAttribute("DoorMoving") === true ||
      this.playerState.get(player)?.isSpectator !== false ||
      !canInteract(player, door, 13)
    ) {
      return;
    }
    const ownerTeam = model.GetAttribute("OwnerTeam");
    if (!typeIs(ownerTeam, "string") || ownerTeam !== this.teams.nameFor(player)) {
      this.toast(player, localized("toast.enemy_door"));
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
      prompt.ActionText = sourceFor(nowOpen ? "prompt.close" : "prompt.open");
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

  private decorateBuildPart(root: Part, pieceId: BuildPieceId): void {
    if (pieceId === "foundation") {
      for (const offset of [-4, 0, 4]) {
        const seam = this.createBuildDetail(
          "PlankSeam",
          new Vector3(0.12, 0.08, 11.6),
          root.CFrame.mul(new CFrame(offset, root.Size.Y / 2 + 0.05, 0)),
          Color3.fromRGB(72, 52, 40),
          Enum.Material.Wood,
        );
        seam.Parent = root;
      }
      for (const x of [-5.35, 5.35]) {
        for (const z of [-5.35, 5.35]) {
          const brace = this.createBuildDetail(
            "CornerBrace",
            new Vector3(0.8, 0.18, 0.8),
            root.CFrame.mul(new CFrame(x, root.Size.Y / 2 + 0.12, z)),
            Color3.fromRGB(73, 79, 81),
            Enum.Material.Metal,
          );
          brace.Parent = root;
        }
      }
      return;
    }

    if (pieceId === "wall") {
      for (const x of [-5.35, 0, 5.35]) {
        const post = this.createBuildDetail(
          "WallPost",
          new Vector3(0.7, 8.35, 1.35),
          root.CFrame.mul(new CFrame(x, 0, 0)),
          Color3.fromRGB(91, 65, 48),
          Enum.Material.Wood,
        );
        post.Parent = root;
      }
      for (const y of [-3.2, 3.2]) {
        const rail = this.createBuildDetail(
          "WallRail",
          new Vector3(11.4, 0.5, 1.28),
          root.CFrame.mul(new CFrame(0, y, 0)),
          Color3.fromRGB(83, 59, 44),
          Enum.Material.Wood,
        );
        rail.Parent = root;
      }
      return;
    }

    if (pieceId === "workbench") {
      root.Transparency = 1;
      const top = this.createBuildDetail(
        "WorkbenchTop",
        new Vector3(6, 0.55, 3),
        root.CFrame.mul(new CFrame(0, 1.2, 0)),
        Color3.fromRGB(82, 94, 100),
        Enum.Material.DiamondPlate,
      );
      top.Parent = root;
      for (const x of [-2.35, 2.35]) {
        for (const z of [-1.05, 1.05]) {
          const leg = this.createBuildDetail(
            "WorkbenchLeg",
            new Vector3(0.45, 2.7, 0.45),
            root.CFrame.mul(new CFrame(x, -0.15, z)),
            Color3.fromRGB(57, 63, 66),
            Enum.Material.Metal,
          );
          leg.Parent = root;
        }
      }
      const toolbox = this.createBuildDetail(
        "Toolbox",
        new Vector3(2.1, 0.9, 1.15),
        root.CFrame.mul(new CFrame(1.35, 1.95, 0)),
        Color3.fromRGB(183, 111, 52),
        Enum.Material.Metal,
      );
      toolbox.Parent = root;
    }
  }

  private createBuildDetail(
    name: string,
    size: Vector3,
    cframe: CFrame,
    color: Color3,
    material: Enum.Material,
  ): Part {
    const detail = this.createBuildPart(name, size, cframe, color, material);
    detail.CanCollide = false;
    detail.CanQuery = false;
    detail.CanTouch = false;
    detail.CastShadow = false;
    return detail;
  }

  private configureBuildRoot(root: Instance, player: Player, pieceId: BuildPieceId): void {
    const definition = BUILD_PIECES[pieceId];
    root.SetAttribute("BuildPieceId", pieceId);
    root.SetAttribute("OwnerUserId", player.UserId);
    root.SetAttribute("OwnerTeam", this.teams.nameFor(player));
    root.SetAttribute("Health", definition.maxHealth);
    root.SetAttribute("MaxHealth", definition.maxHealth);
    const ownerId = player.UserId;
    root.Destroying.Connect(() =>
      task.defer(() => {
        const owner = Players.GetPlayerByUserId(ownerId);
        if (owner !== undefined) this.playerState.setBuildCount(owner, this.countBuilds(ownerId));
      }),
    );
  }

  private resolveBuildRoot(target: BasePart): Instance | undefined {
    if (target.Parent === this.buildsFolder) {
      return target;
    }
    const model = target.FindFirstAncestorOfClass("Model");
    return model?.Parent === this.buildsFolder ? model : undefined;
  }
}
