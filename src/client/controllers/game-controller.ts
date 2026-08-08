import {
  Debris,
  Players,
  ReplicatedStorage,
  RunService,
  UserInputService,
  Workspace,
} from "@rbxts/services";
import { BUILD_PIECES, type BuildPieceId } from "shared/catalog/build-pieces";
import type { RecipeId } from "shared/catalog/recipes";
import { localized } from "shared/localization/translations";
import {
  COMMAND_REMOTE_NAME,
  EVENT_REMOTE_NAME,
  REMOTE_FOLDER_NAME,
  type ClientCommand,
  type ServerEvent,
} from "shared/network/protocol";
import { UiController, type ActionMode } from "client/ui/ui-controller";

const ACTION_MODES: ReadonlyArray<ActionMode> = ["Harvest", "Build", "Blaster", "Raid"];

export class GameController {
  private readonly player = Players.LocalPlayer;
  private readonly command: RemoteEvent;
  private readonly event: RemoteEvent;
  private readonly ui: UiController;
  private readonly buildPreview = new Instance("Part");
  private readonly blasterViewModel = new Instance("Model");
  private selectedMode: ActionMode = "Harvest";
  private selectedBuildPiece: BuildPieceId = "foundation";
  private buildRotation = 0;
  private sequence = 0;
  private hasBlaster = false;
  private recoil = 0;
  private tutorialVisible = true;
  private menuCursorHeld = false;

  public constructor() {
    const folder = ReplicatedStorage.WaitForChild(REMOTE_FOLDER_NAME);
    this.command = folder.WaitForChild(COMMAND_REMOTE_NAME) as RemoteEvent;
    this.event = folder.WaitForChild(EVENT_REMOTE_NAME) as RemoteEvent;

    this.ui = new UiController({
      selectMode: (mode) => this.selectMode(mode),
      selectBuildPiece: (pieceId) => this.selectBuildPiece(pieceId),
      craft: (recipeId) => this.send({ kind: "Craft", recipeId }),
      useBandage: () => this.send({ kind: "UseBandage" }),
      performAction: () => this.performAction(),
      tutorialVisibilityChanged: (visible) => {
        this.tutorialVisible = visible;
        this.updateMouseMode();
      },
    });

    this.configurePreview();
    this.configureBlasterViewModel();
  }

  public start(): void {
    this.enforceFirstPerson();
    this.tutorialVisible = this.ui.isTutorialOpen();
    this.updateMouseMode();
    this.player.CharacterAdded.Connect(() => task.defer(() => this.enforceFirstPerson()));
    this.event.OnClientEvent.Connect((payload: unknown) => this.onServerEvent(payload));
    UserInputService.InputBegan.Connect((input, processed) => {
      if (!processed) {
        this.onInput(input);
      }
    });
    UserInputService.InputEnded.Connect((input) => {
      if (input.KeyCode === Enum.KeyCode.LeftAlt || input.KeyCode === Enum.KeyCode.RightAlt) {
        this.menuCursorHeld = false;
        this.updateMouseMode();
      }
    });
    RunService.RenderStepped.Connect((deltaTime) => {
      this.enforceFirstPerson();
      this.updateMouseMode();
      this.updateBuildPreview();
      this.updateBlasterViewModel(deltaTime);
    });
    this.send({ kind: "Ready" });
    print("[WAR WORLD] Client controller started.");
  }

  private onInput(input: InputObject): void {
    if (input.KeyCode === Enum.KeyCode.LeftAlt || input.KeyCode === Enum.KeyCode.RightAlt) {
      this.menuCursorHeld = true;
      this.updateMouseMode();
      return;
    }
    if (input.KeyCode === Enum.KeyCode.T) {
      this.ui.toggleTutorial();
      return;
    }
    if (this.ui.isTutorialOpen() || this.menuCursorHeld) {
      return;
    }
    if (input.UserInputType === Enum.UserInputType.MouseButton1) {
      this.performAction();
      return;
    }
    if (input.KeyCode === Enum.KeyCode.F) {
      this.performAction();
    } else if (input.KeyCode === Enum.KeyCode.One) {
      this.selectMode("Harvest");
    } else if (input.KeyCode === Enum.KeyCode.Two) {
      this.selectMode("Build");
    } else if (input.KeyCode === Enum.KeyCode.Three) {
      this.selectMode("Blaster");
    } else if (input.KeyCode === Enum.KeyCode.Four) {
      this.selectMode("Raid");
    } else if (input.KeyCode === Enum.KeyCode.B) {
      this.send({ kind: "UseBandage" });
    } else if (input.KeyCode === Enum.KeyCode.R && this.selectedMode === "Build") {
      this.buildRotation += math.pi / 2;
    } else if (input.KeyCode === Enum.KeyCode.ButtonR2) {
      this.performAction();
    } else if (input.KeyCode === Enum.KeyCode.ButtonL1) {
      this.cycleMode(-1);
    } else if (input.KeyCode === Enum.KeyCode.ButtonR1) {
      this.cycleMode(1);
    } else if (input.KeyCode === Enum.KeyCode.ButtonX) {
      this.send({ kind: "UseBandage" });
    } else if (input.KeyCode === Enum.KeyCode.ButtonY && this.selectedMode === "Build") {
      this.buildRotation += math.pi / 2;
    }
  }

  private cycleMode(direction: number): void {
    const currentIndex = ACTION_MODES.indexOf(this.selectedMode);
    const nextIndex = (currentIndex + direction + ACTION_MODES.size()) % ACTION_MODES.size();
    this.selectMode(ACTION_MODES[nextIndex]!);
  }

  private enforceFirstPerson(): void {
    if (this.player.CameraMode !== Enum.CameraMode.LockFirstPerson) {
      this.player.CameraMode = Enum.CameraMode.LockFirstPerson;
    }
    if (this.player.CameraMinZoomDistance !== 0.5) {
      this.player.CameraMinZoomDistance = 0.5;
    }
    if (this.player.CameraMaxZoomDistance !== 0.5) {
      this.player.CameraMaxZoomDistance = 0.5;
    }
  }

  private updateMouseMode(): void {
    const cursorVisible = this.tutorialVisible || this.menuCursorHeld;
    UserInputService.MouseIconEnabled = cursorVisible;
    UserInputService.MouseBehavior = cursorVisible
      ? Enum.MouseBehavior.Default
      : Enum.MouseBehavior.LockCenter;
    if (!cursorVisible) {
      this.enforceFirstPerson();
    }
  }

  private selectMode(mode: ActionMode): void {
    this.selectedMode = mode;
    this.ui.setMode(mode);
    this.buildPreview.Transparency = mode === "Build" ? 0.55 : 1;
  }

  private selectBuildPiece(pieceId: BuildPieceId): void {
    this.selectedBuildPiece = pieceId;
    this.selectMode("Build");
    this.ui.setBuildPiece(pieceId);
    this.refreshPreviewAppearance();
  }

  private performAction(): void {
    const aim = this.getAimResult();
    if (this.selectedMode === "Harvest") {
      if (aim !== undefined) {
        this.send({ kind: "Harvest", target: aim.Instance });
      }
      return;
    }

    if (this.selectedMode === "Build") {
      if (aim === undefined) {
        return;
      }
      const cframe = this.buildCFrameFrom(aim.Position);
      this.send({ kind: "PlaceBuild", pieceId: this.selectedBuildPiece, cframe });
      return;
    }

    if (this.selectedMode === "Raid") {
      if (aim !== undefined) {
        this.send({ kind: "UseBreach", target: aim.Instance });
      }
      return;
    }

    if (!this.hasBlaster) {
      this.ui.showToast(localized("toast.need_blaster"), "Warning");
      return;
    }

    const camera = Workspace.CurrentCamera;
    const head = this.player.Character?.FindFirstChild("Head");
    if (camera === undefined || !head?.IsA("BasePart")) {
      return;
    }
    const viewport = camera.ViewportSize;
    const ray = camera.ViewportPointToRay(viewport.X / 2, viewport.Y / 2);
    this.sequence += 1;
    this.recoil = 1;
    this.send({
      kind: "FireWeapon",
      weaponId: "survival_blaster",
      origin: head.Position,
      direction: ray.Direction.Unit,
      sequence: this.sequence,
    });
  }

  private onServerEvent(payload: unknown): void {
    if (!typeIs(payload, "table")) {
      return;
    }
    const event = payload as ServerEvent;
    if (event.kind === "Snapshot" || event.kind === "PhaseChanged") {
      this.hasBlaster = event.snapshot.inventory.some(
        (entry) => entry.itemId === "survival_blaster" && entry.amount > 0,
      );
      this.ui.setSnapshot(event.snapshot);
    } else if (event.kind === "Toast") {
      this.ui.showToast(event.message, event.tone);
    } else if (event.kind === "HitConfirm") {
      this.ui.showHitConfirm(event.eliminated);
    } else if (event.kind === "ShotEffect") {
      this.showShotEffect(event.origin, event.endpoint, event.shooterUserId);
    }
  }

  private showShotEffect(origin: Vector3, endpoint: Vector3, shooterUserId: number): void {
    const distance = endpoint.sub(origin).Magnitude;
    if (distance <= 0.05 || distance > 360) {
      return;
    }
    const tracer = new Instance("Part");
    tracer.Name = "BlasterTracer";
    tracer.Anchored = true;
    tracer.CanCollide = false;
    tracer.CanQuery = false;
    tracer.CanTouch = false;
    tracer.CastShadow = false;
    tracer.Material = Enum.Material.Neon;
    tracer.Color =
      shooterUserId === this.player.UserId
        ? Color3.fromRGB(89, 220, 240)
        : Color3.fromRGB(255, 174, 76);
    tracer.Size = new Vector3(0.12, 0.12, distance);
    tracer.CFrame = CFrame.lookAt(origin.Lerp(endpoint, 0.5), endpoint);
    tracer.Parent = Workspace;
    Debris.AddItem(tracer, 0.09);
  }

  private getAimResult(): RaycastResult | undefined {
    const camera = Workspace.CurrentCamera;
    if (camera === undefined) {
      return undefined;
    }

    const viewport = camera.ViewportSize;
    const pointer = UserInputService.GetMouseLocation();
    const useCenter = UserInputService.TouchEnabled && !UserInputService.MouseEnabled;
    const x = useCenter ? viewport.X / 2 : pointer.X;
    const y = useCenter ? viewport.Y / 2 : pointer.Y;
    const ray = camera.ViewportPointToRay(x, y);
    const parameters = new RaycastParams();
    parameters.FilterType = Enum.RaycastFilterType.Exclude;
    parameters.FilterDescendantsInstances = [
      ...(this.player.Character !== undefined ? [this.player.Character] : []),
      this.buildPreview,
    ];
    parameters.IgnoreWater = true;
    return Workspace.Raycast(ray.Origin, ray.Direction.Unit.mul(500), parameters);
  }

  private buildCFrameFrom(surfacePosition: Vector3): CFrame {
    const definition = BUILD_PIECES[this.selectedBuildPiece];
    const position = surfacePosition.add(new Vector3(0, definition.size.Y / 2, 0));
    return new CFrame(position).mul(CFrame.Angles(0, this.buildRotation, 0));
  }

  private configurePreview(): void {
    this.buildPreview.Name = "LocalBuildPreview";
    this.buildPreview.Anchored = true;
    this.buildPreview.CanCollide = false;
    this.buildPreview.CanQuery = false;
    this.buildPreview.CanTouch = false;
    this.buildPreview.Material = Enum.Material.ForceField;
    this.buildPreview.Transparency = 1;
    this.buildPreview.Parent = Workspace;
    this.refreshPreviewAppearance();
  }

  private refreshPreviewAppearance(): void {
    const definition = BUILD_PIECES[this.selectedBuildPiece];
    this.buildPreview.Size = definition.size;
    this.buildPreview.Color = definition.color;
  }

  private configureBlasterViewModel(): void {
    this.blasterViewModel.Name = "FirstPersonBlaster";

    const body = this.createViewModelPart(
      "Receiver",
      new Vector3(0.55, 0.5, 1.35),
      new CFrame(0, 0, 0),
      Color3.fromRGB(49, 62, 72),
      Enum.Material.Metal,
    );
    body.Parent = this.blasterViewModel;
    this.blasterViewModel.PrimaryPart = body;

    const components = [
      {
        name: "Barrel",
        size: new Vector3(0.24, 0.24, 1.3),
        cframe: new CFrame(0, 0.04, -1.25),
        color: Color3.fromRGB(32, 38, 43),
        material: Enum.Material.Metal,
      },
      {
        name: "BarrelShroud",
        size: new Vector3(0.42, 0.36, 0.7),
        cframe: new CFrame(0, 0.03, -0.77),
        color: Color3.fromRGB(78, 96, 108),
        material: Enum.Material.DiamondPlate,
      },
      {
        name: "Grip",
        size: new Vector3(0.34, 0.8, 0.42),
        cframe: new CFrame(0, -0.56, 0.28).mul(CFrame.Angles(math.rad(-12), 0, 0)),
        color: Color3.fromRGB(37, 42, 46),
        material: Enum.Material.Metal,
      },
      {
        name: "EnergyCell",
        size: new Vector3(0.22, 0.4, 0.78),
        cframe: new CFrame(-0.39, -0.03, 0.18),
        color: Color3.fromRGB(75, 211, 232),
        material: Enum.Material.Neon,
      },
      {
        name: "RearBrace",
        size: new Vector3(0.42, 0.35, 0.75),
        cframe: new CFrame(0, -0.02, 0.85),
        color: Color3.fromRGB(69, 82, 91),
        material: Enum.Material.Metal,
      },
      {
        name: "Sight",
        size: new Vector3(0.13, 0.28, 0.42),
        cframe: new CFrame(0, 0.38, -0.25),
        color: Color3.fromRGB(89, 220, 240),
        material: Enum.Material.Neon,
      },
    ] as const;
    for (const component of components) {
      const part = this.createViewModelPart(
        component.name,
        component.size,
        component.cframe,
        component.color,
        component.material,
      );
      part.Parent = this.blasterViewModel;
    }
  }

  private createViewModelPart(
    name: string,
    size: Vector3,
    cframe: CFrame,
    color: Color3,
    material: Enum.Material,
  ): Part {
    const part = new Instance("Part");
    part.Name = name;
    part.Anchored = true;
    part.CanCollide = false;
    part.CanQuery = false;
    part.CanTouch = false;
    part.CastShadow = false;
    part.Size = size;
    part.CFrame = cframe;
    part.Color = color;
    part.Material = material;
    part.TopSurface = Enum.SurfaceType.Smooth;
    part.BottomSurface = Enum.SurfaceType.Smooth;
    return part;
  }

  private updateBlasterViewModel(deltaTime: number): void {
    const camera = Workspace.CurrentCamera;
    const shouldShow =
      camera !== undefined &&
      this.selectedMode === "Blaster" &&
      this.hasBlaster &&
      !this.ui.isTutorialOpen();
    if (!shouldShow || camera === undefined) {
      this.blasterViewModel.Parent = undefined;
      this.recoil = math.max(0, this.recoil - deltaTime * 9);
      return;
    }

    if (this.blasterViewModel.Parent !== camera) {
      this.blasterViewModel.Parent = camera;
    }
    const humanoid = this.player.Character?.FindFirstChildOfClass("Humanoid");
    const moving = humanoid !== undefined && humanoid.MoveDirection.Magnitude > 0.05;
    const elapsed = os.clock();
    const bobX = moving ? math.sin(elapsed * 8) * 0.018 : 0;
    const bobY = moving ? math.abs(math.cos(elapsed * 8)) * 0.016 : 0;
    const recoilOffset = this.recoil * 0.12;
    const target = camera.CFrame.mul(
      new CFrame(0.62 + bobX, -0.58 + bobY, -1.1 + recoilOffset),
    ).mul(CFrame.Angles(math.rad(-4 * this.recoil), math.rad(-2), 0));
    this.blasterViewModel.PivotTo(target);
    this.recoil = math.max(0, this.recoil - deltaTime * 9);
  }

  private updateBuildPreview(): void {
    if (this.selectedMode !== "Build") {
      return;
    }
    const aim = this.getAimResult();
    if (aim === undefined) {
      this.buildPreview.Transparency = 1;
      return;
    }
    this.buildPreview.Transparency = 0.55;
    this.buildPreview.CFrame = this.buildCFrameFrom(aim.Position);
  }

  private send(command: ClientCommand): void {
    this.command.FireServer(command);
  }
}
