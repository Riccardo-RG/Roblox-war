import {
  Debris,
  CollectionService,
  ContextActionService,
  GuiService,
  Players,
  ProximityPromptService,
  ReplicatedStorage,
  RunService,
  UserInputService,
  Workspace,
} from "@rbxts/services";
import { BUILD_PIECES, type BuildPieceId } from "shared/catalog/build-pieces";
import { BUILD_RULES } from "shared/catalog/build-rules";
import { isItemId } from "shared/catalog/items";
import { localized, type LocalizedMessage } from "shared/localization/translations";
import type { PlayerSnapshot } from "shared/types/game";
import {
  COMMAND_REMOTE_NAME,
  EVENT_REMOTE_NAME,
  REMOTE_FOLDER_NAME,
  type ClientCommand,
  type ServerEvent,
} from "shared/network/protocol";
import { UiController, type ActionMode } from "client/ui/ui-controller";
import { inputContext } from "client/controllers/input-policy";

const ACTION_MODES: ReadonlyArray<ActionMode> = ["Harvest", "Build", "Blaster", "Raid"];

export class GameController {
  private readonly player = Players.LocalPlayer;
  private readonly command: RemoteEvent;
  private readonly event: RemoteEvent;
  private readonly ui: UiController;
  // Client-owned objects must survive replacement/destruction of CurrentCamera.
  private readonly presentationFolder = new Instance("Folder");
  private readonly buildPreview = new Instance("Part");
  private readonly blasterViewModel = new Instance("Model");
  private selectedMode: ActionMode = "Harvest";
  private selectedBuildPiece: BuildPieceId = "foundation";
  private buildRotation = 0;
  private sequence = 0;
  private hasBlaster = false;
  private recoil = 0;
  private menuVisible = true;
  private menuCursorHeld = false;
  private windowFocused = true;
  private systemMenuOpen = false;
  private textFocused = false;
  private actionHeld = false;
  private menuScrollAxis = 0;
  private lastActionAt = 0;
  private lastContextAt = 0;
  private lastPreviewCheckAt = 0;
  private snapshot: PlayerSnapshot | undefined;
  private previewValid = false;
  private previewMessage: LocalizedMessage = localized("ui.build_surface");
  private readonly resourceHighlight = new Instance("Highlight");
  private readonly harvestingViewModel = new Instance("Model");
  private readonly activePrompts = new Set<ProximityPrompt>();

  public constructor() {
    const folder = ReplicatedStorage.WaitForChild(REMOTE_FOLDER_NAME);
    this.command = folder.WaitForChild(COMMAND_REMOTE_NAME) as RemoteEvent;
    this.event = folder.WaitForChild(EVENT_REMOTE_NAME) as RemoteEvent;

    this.ui = new UiController({
      selectMode: (mode) => this.selectMode(mode),
      selectBuildPiece: (pieceId) => this.selectBuildPiece(pieceId),
      craft: (recipeId) => {
        if (this.alive()) this.send({ kind: "Craft", recipeId });
      },
      useBandage: () => {
        if (!this.gameplayBlocked()) this.send({ kind: "UseBandage" });
      },
      performAction: () => this.performAction(),
      rotateBuild: () => this.rotateBuild(),
      menuVisibilityChanged: (visible) => {
        this.menuVisible = visible;
        this.actionHeld = false;
        this.updateMouseMode();
        this.updateMovementCapture();
      },
    });

    this.presentationFolder.Name = "WarWorldLocalPresentation";
    this.presentationFolder.Parent = Workspace;
    this.configurePreview();
    this.configureBlasterViewModel();
    this.configureHarvestingViewModel();
    this.resourceHighlight.Name = "ResourceTarget";
    this.resourceHighlight.DepthMode = Enum.HighlightDepthMode.Occluded;
    this.resourceHighlight.FillTransparency = 0.9;
    this.resourceHighlight.OutlineTransparency = 0.15;
    this.resourceHighlight.OutlineColor = Color3.fromRGB(160, 211, 178);
    this.resourceHighlight.Enabled = false;
    this.resourceHighlight.Parent = this.presentationFolder;
  }

  public start(): void {
    this.enforceFirstPerson();
    this.menuVisible = this.ui.isMenuOpen();
    this.systemMenuOpen = GuiService.MenuIsOpen;
    this.textFocused = UserInputService.GetFocusedTextBox() !== undefined;
    this.updateMouseMode();
    this.player.CharacterAdded.Connect(() =>
      task.defer(() => {
        this.enforceFirstPerson();
        this.actionHeld = false;
      }),
    );
    this.player.GetPropertyChangedSignal("CameraMode").Connect(() => this.enforceFirstPerson());
    this.event.OnClientEvent.Connect((payload: unknown) => this.onServerEvent(payload));
    UserInputService.InputBegan.Connect((input, processed) => {
      if (this.systemMenuOpen || this.textFocused || !this.windowFocused) return;
      if (!processed || this.ui.isMenuOpen()) this.onInput(input);
    });
    UserInputService.InputEnded.Connect((input) => {
      if (input.KeyCode === Enum.KeyCode.Thumbstick2) this.menuScrollAxis = 0;
      if (input.KeyCode === Enum.KeyCode.LeftAlt || input.KeyCode === Enum.KeyCode.RightAlt) {
        this.menuCursorHeld = false;
        this.updateMouseMode();
      }
      if (
        input.UserInputType === Enum.UserInputType.MouseButton1 ||
        input.KeyCode === Enum.KeyCode.F ||
        input.KeyCode === Enum.KeyCode.ButtonR2
      )
        this.actionHeld = false;
    });
    UserInputService.InputChanged.Connect((input) => {
      if (input.KeyCode === Enum.KeyCode.Thumbstick2)
        this.menuScrollAxis = math.abs(input.Position.Y) > 0.15 ? -input.Position.Y : 0;
    });
    UserInputService.WindowFocusReleased.Connect(() => {
      this.windowFocused = false;
      this.menuCursorHeld = false;
      this.actionHeld = false;
      this.menuScrollAxis = 0;
      this.releasePointer();
    });
    UserInputService.WindowFocused.Connect(() => {
      this.windowFocused = true;
      this.updateMouseMode();
    });
    UserInputService.TextBoxFocused.Connect(() => {
      this.textFocused = true;
      this.actionHeld = false;
      this.releasePointer();
    });
    UserInputService.TextBoxFocusReleased.Connect(() => {
      this.textFocused = false;
      this.updateMouseMode();
    });
    GuiService.MenuOpened.Connect(() => {
      this.systemMenuOpen = true;
      this.menuCursorHeld = false;
      this.actionHeld = false;
      this.releasePointer();
    });
    GuiService.MenuClosed.Connect(() => {
      this.systemMenuOpen = false;
      this.updateMouseMode();
      this.ui.restoreSelection();
    });
    UserInputService.GetPropertyChangedSignal("PreferredInput").Connect(() =>
      this.updateInputKind(),
    );
    this.updateInputKind();
    this.ui.localizer.changed.Event.Connect(() => this.refreshDepotPrompts());
    ProximityPromptService.PromptShown.Connect((prompt) => {
      this.activePrompts.add(prompt);
      if (prompt.Name === "DepotPrompt") {
        this.refreshDepotPrompts();
      }
    });
    ProximityPromptService.PromptHidden.Connect((prompt) => {
      this.activePrompts.delete(prompt);
    });
    RunService.BindToRenderStep(
      "WarWorldPresentation",
      Enum.RenderPriority.Camera.Value + 1,
      (deltaTime) => {
        if (this.menuVisible && !this.systemMenuOpen && this.windowFocused)
          this.ui.scrollMenu(this.menuScrollAxis * deltaTime * 420);
        this.updateMouseMode();
        this.updateBuildPreview();
        this.updateBlasterViewModel(deltaTime);
        this.updateHarvestingViewModel(deltaTime);
        const canPlay = !this.gameplayBlocked();
        if (!canPlay) this.activePrompts.clear();
        this.ui.setAimVisible(canPlay);
        if (ProximityPromptService.Enabled !== canPlay) ProximityPromptService.Enabled = canPlay;
        if (this.actionHeld && (this.selectedMode === "Harvest" || this.selectedMode === "Blaster"))
          this.performAction();
        if (os.clock() - this.lastContextAt > 0.12) {
          this.lastContextAt = os.clock();
          this.updateContext();
        }
      },
    );
    this.send({ kind: "Ready" });
    print("[WAR WORLD] Client controller started.");
  }

  private onInput(input: InputObject): void {
    if (input.KeyCode === Enum.KeyCode.LeftAlt || input.KeyCode === Enum.KeyCode.RightAlt) {
      this.menuCursorHeld = true;
      this.updateMouseMode();
      return;
    }
    if (input.KeyCode === Enum.KeyCode.V || input.KeyCode === Enum.KeyCode.ButtonL3) {
      this.ui.toggleMenu();
      return;
    }
    if (input.KeyCode === Enum.KeyCode.T) {
      this.ui.toggleTutorial();
      return;
    }
    if (this.ui.isMenuOpen() && input.KeyCode === Enum.KeyCode.ButtonB) {
      this.ui.closeMenu();
      return;
    }
    if (this.gameplayBlocked()) {
      return;
    }
    if (input.UserInputType === Enum.UserInputType.MouseButton1) {
      this.actionHeld = true;
      this.performAction();
      return;
    }
    if (input.KeyCode === Enum.KeyCode.F) {
      this.actionHeld = true;
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
      this.rotateBuild();
    } else if (input.KeyCode === Enum.KeyCode.ButtonR2) {
      this.actionHeld = true;
      this.performAction();
    } else if (input.KeyCode === Enum.KeyCode.ButtonL1) {
      this.cycleMode(-1);
    } else if (input.KeyCode === Enum.KeyCode.ButtonR1) {
      this.cycleMode(1);
    } else if (input.KeyCode === Enum.KeyCode.DPadDown) {
      this.send({ kind: "UseBandage" });
    } else if (input.KeyCode === Enum.KeyCode.ButtonY && this.selectedMode === "Build") {
      this.rotateBuild();
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
    // Core menus and focused text own the pointer; never fight them every frame.
    if (this.systemMenuOpen || this.textFocused || !this.windowFocused) return;
    const cursorVisible = this.menuVisible || this.menuCursorHeld;
    if (this.ui !== undefined) this.ui.setPointerMode(this.menuCursorHeld);
    UserInputService.MouseIconEnabled = cursorVisible;
    UserInputService.MouseBehavior = cursorVisible
      ? Enum.MouseBehavior.Default
      : Enum.MouseBehavior.LockCenter;
  }

  private releasePointer(): void {
    UserInputService.MouseIconEnabled = true;
    UserInputService.MouseBehavior = Enum.MouseBehavior.Default;
    this.ui.setPointerMode(false);
  }

  private updateMovementCapture(): void {
    this.menuScrollAxis = 0;
    ContextActionService.UnbindAction("WarWorldMenuMovement");
    if (this.menuVisible)
      ContextActionService.BindActionAtPriority(
        "WarWorldMenuMovement",
        () => Enum.ContextActionResult.Sink,
        false,
        3000,
        Enum.PlayerActions.CharacterForward,
        Enum.PlayerActions.CharacterBackward,
        Enum.PlayerActions.CharacterLeft,
        Enum.PlayerActions.CharacterRight,
        Enum.PlayerActions.CharacterJump,
        Enum.KeyCode.Thumbstick2,
      );
  }

  private updateInputKind(): void {
    this.actionHeld = false;
    this.menuCursorHeld = false;
    const kind = UserInputService.PreferredInput;
    this.ui.setInputKind(
      kind === Enum.PreferredInput.Touch
        ? "touch"
        : kind === Enum.PreferredInput.Gamepad || kind === Enum.PreferredInput.MicroGamepad
          ? "gamepad"
          : "keyboard",
    );
  }

  private alive(): boolean {
    const humanoid = this.player.Character?.FindFirstChildOfClass("Humanoid");
    return (
      humanoid !== undefined &&
      humanoid.Health > 0 &&
      this.snapshot !== undefined &&
      !this.snapshot.isSpectator &&
      this.snapshot.match.phase !== "Complete"
    );
  }

  private gameplayBlocked(): boolean {
    return (
      inputContext({
        menuVisible: this.menuVisible,
        cursorHeld: this.menuCursorHeld,
        systemMenuOpen: this.systemMenuOpen,
        textFocused: this.textFocused,
        windowFocused: this.windowFocused,
        alive: this.alive(),
      }) !== "Gameplay"
    );
  }

  private rotateBuild(): void {
    if (this.gameplayBlocked() || this.selectedMode !== "Build") return;
    this.buildRotation = (this.buildRotation + math.pi / 2) % (math.pi * 2);
  }

  private selectMode(mode: ActionMode): void {
    this.actionHeld = false;
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
    if (this.gameplayBlocked()) return;
    const interval =
      this.selectedMode === "Blaster" ? 0.28 : this.selectedMode === "Harvest" ? 0.45 : 0.85;
    if (os.clock() - this.lastActionAt < interval) return;
    this.lastActionAt = os.clock();
    const aim = this.getAimResult();
    if (this.selectedMode === "Harvest") {
      if (aim !== undefined) {
        this.recoil = 1;
        this.send({ kind: "Harvest", target: aim.Instance });
      }
      return;
    }

    if (this.selectedMode === "Build") {
      if (aim !== undefined) {
        this.buildPreview.CFrame = this.buildCFrameFrom(aim.Position);
        this.previewValid = this.validateBuildPreview(aim);
      }
      if (aim === undefined || !this.previewValid) {
        this.ui.showToast(this.previewMessage, "Warning");
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
    const target = aim?.Position ?? ray.Origin.add(ray.Direction.mul(350));
    this.sequence += 1;
    this.recoil = 1;
    this.send({
      kind: "FireWeapon",
      weaponId: "survival_blaster",
      origin: head.Position,
      direction: target.sub(head.Position).Unit,
      sequence: this.sequence,
    });
  }

  private onServerEvent(payload: unknown): void {
    if (!typeIs(payload, "table")) {
      return;
    }
    const event = payload as ServerEvent;
    if (event.kind === "Snapshot" || event.kind === "PhaseChanged") {
      this.snapshot = event.snapshot;
      this.hasBlaster = event.snapshot.inventory.some(
        (entry) => entry.itemId === "survival_blaster" && entry.amount > 0,
      );
      this.ui.setSnapshot(event.snapshot);
      this.refreshDepotPrompts();
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
    const ray = camera.ViewportPointToRay(viewport.X / 2, viewport.Y / 2);
    const parameters = new RaycastParams();
    parameters.FilterType = Enum.RaycastFilterType.Exclude;
    parameters.FilterDescendantsInstances = [
      ...(this.player.Character !== undefined ? [this.player.Character] : []),
      this.presentationFolder,
    ];
    parameters.IgnoreWater = true;
    return Workspace.Raycast(ray.Origin, ray.Direction.Unit.mul(500), parameters);
  }

  private buildCFrameFrom(surfacePosition: Vector3): CFrame {
    const definition = BUILD_PIECES[this.selectedBuildPiece];
    const position = surfacePosition.add(new Vector3(0, definition.size.Y / 2, 0));
    const snapped = new Vector3(
      math.round(position.X / BUILD_RULES.grid) * BUILD_RULES.grid,
      math.round(position.Y / BUILD_RULES.heightGrid) * BUILD_RULES.heightGrid,
      math.round(position.Z / BUILD_RULES.grid) * BUILD_RULES.grid,
    );
    return new CFrame(snapped).mul(CFrame.Angles(0, this.buildRotation, 0));
  }

  private configurePreview(): void {
    this.buildPreview.Name = "LocalBuildPreview";
    this.buildPreview.Anchored = true;
    this.buildPreview.CanCollide = false;
    this.buildPreview.CanQuery = false;
    this.buildPreview.CanTouch = false;
    this.buildPreview.Material = Enum.Material.ForceField;
    this.buildPreview.Transparency = 1;
    this.buildPreview.Parent = this.presentationFolder;
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
        name: "SupportGlove",
        size: new Vector3(0.38, 0.32, 0.46),
        cframe: new CFrame(-0.2, -0.4, -0.42).mul(CFrame.Angles(0, 0, math.rad(-12))),
        color: Color3.fromRGB(84, 95, 83),
        material: Enum.Material.Fabric,
      },
      {
        name: "TriggerGlove",
        size: new Vector3(0.38, 0.35, 0.42),
        cframe: new CFrame(0.13, -0.42, 0.35),
        color: Color3.fromRGB(84, 95, 83),
        material: Enum.Material.Fabric,
      },
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
      {
        name: "UpperRail",
        size: new Vector3(0.25, 0.07, 0.98),
        cframe: new CFrame(0, 0.3, -0.25),
        color: Color3.fromRGB(109, 124, 123),
        material: Enum.Material.Metal,
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
      !this.gameplayBlocked();
    if (!shouldShow || camera === undefined) {
      this.blasterViewModel.Parent = undefined;
      return;
    }

    if (this.blasterViewModel.Parent !== this.presentationFolder) {
      this.blasterViewModel.Parent = this.presentationFolder;
    }
    const humanoid = this.player.Character?.FindFirstChildOfClass("Humanoid");
    const moving =
      this.ui.allowsWeaponMotion() &&
      humanoid !== undefined &&
      humanoid.MoveDirection.Magnitude > 0.05;
    const elapsed = os.clock();
    const bobX = moving ? math.sin(elapsed * 8) * 0.018 : 0;
    const bobY = moving ? math.abs(math.cos(elapsed * 8)) * 0.016 : 0;
    const recoilOffset = this.ui.allowsWeaponMotion() ? this.recoil * 0.12 : 0;
    const target = camera.CFrame.mul(
      new CFrame(0.62 + bobX, -0.58 + bobY, -1.1 + recoilOffset),
    ).mul(
      CFrame.Angles(math.rad(this.ui.allowsWeaponMotion() ? -4 * this.recoil : 0), math.rad(-2), 0),
    );
    this.blasterViewModel.PivotTo(target);
    this.recoil = math.max(0, this.recoil - deltaTime * 9);
  }

  private updateBuildPreview(): void {
    if (this.selectedMode !== "Build" || this.gameplayBlocked()) {
      this.buildPreview.Transparency = 1;
      return;
    }
    const aim = this.getAimResult();
    if (aim === undefined) {
      this.buildPreview.Transparency = 1;
      this.previewValid = false;
      this.previewMessage = localized("ui.build_surface");
      return;
    }
    this.buildPreview.Transparency = 0.55;
    this.buildPreview.CFrame = this.buildCFrameFrom(aim.Position);
    if (os.clock() - this.lastPreviewCheckAt >= 0.1) {
      this.lastPreviewCheckAt = os.clock();
      this.previewValid = this.validateBuildPreview(aim);
    }
    this.buildPreview.Color = this.previewValid
      ? Color3.fromRGB(136, 217, 171)
      : Color3.fromRGB(238, 156, 114);
  }

  private validateBuildPreview(aim: RaycastResult): boolean {
    const root = this.player.Character?.FindFirstChild("HumanoidRootPart");
    const definition = BUILD_PIECES[this.selectedBuildPiece];
    const position = this.buildPreview.Position;
    if (
      !root?.IsA("BasePart") ||
      root.Position.sub(position).Magnitude > BUILD_RULES.maxDistance ||
      position.Y < BUILD_RULES.minHeight ||
      position.Y > BUILD_RULES.maxHeight
    ) {
      this.previewMessage = localized("toast.build_out_of_range");
      return false;
    }
    if (aim.Normal.Y < 0.6) {
      this.previewMessage = localized("ui.build_surface");
      return false;
    }
    if (!this.ui.canAfford(definition.costs)) {
      this.previewMessage = localized("toast.insufficient_resources");
      return false;
    }
    for (const zone of CollectionService.GetTagged("NoBuildZone")) {
      if (!zone.IsA("BasePart")) continue;
      const zonePosition = zone.CFrame.PointToObjectSpace(position);
      const rotated = math.abs(math.sin(this.buildRotation)) > 0.5;
      const extentX = (rotated ? definition.size.Z : definition.size.X) / 2;
      const extentZ = (rotated ? definition.size.X : definition.size.Z) / 2;
      if (
        math.abs(zonePosition.X) < zone.Size.X / 2 + extentX &&
        math.abs(zonePosition.Z) < zone.Size.Z / 2 + extentZ &&
        math.abs(zonePosition.Y) < zone.Size.Y / 2 + definition.size.Y / 2
      ) {
        this.previewMessage = localized("ui.build_protected");
        return false;
      }
    }
    const supportParams = new RaycastParams();
    supportParams.FilterType = Enum.RaycastFilterType.Exclude;
    supportParams.FilterDescendantsInstances =
      this.player.Character !== undefined ? [this.player.Character] : [];
    supportParams.IgnoreWater = true;
    const samples = [
      Vector3.zero,
      new Vector3(-0.4, 0, -0.4),
      new Vector3(-0.4, 0, 0.4),
      new Vector3(0.4, 0, -0.4),
      new Vector3(0.4, 0, 0.4),
    ];
    for (const sample of samples) {
      const origin = this.buildPreview.CFrame.PointToWorldSpace(
        new Vector3(
          sample.X * definition.size.X,
          -definition.size.Y / 2 + 0.35,
          sample.Z * definition.size.Z,
        ),
      );
      const support = Workspace.Raycast(origin, new Vector3(0, -1.55, 0), supportParams);
      if (
        support === undefined ||
        support.Normal.Y < 0.6 ||
        support.Material === Enum.Material.Water ||
        CollectionService.HasTag(support.Instance, "ResourceNode")
      ) {
        this.previewMessage = localized("ui.build_surface");
        return false;
      }
      if (CollectionService.HasTag(support.Instance, "PlayerBuild")) {
        const owner =
          support.Instance.GetAttribute("OwnerTeam") ??
          support.Instance.Parent?.GetAttribute("OwnerTeam");
        if (owner !== this.snapshot?.teamName) {
          this.previewMessage = localized("ui.build_surface");
          return false;
        }
      } else if (
        support.Instance !== Workspace.Terrain &&
        support.Instance.GetAttribute("BuildableSurface") !== true
      ) {
        this.previewMessage = localized("ui.build_surface");
        return false;
      }
    }
    const head = this.player.Character?.FindFirstChild("Head");
    if (head?.IsA("BasePart")) {
      const obstruction = Workspace.Raycast(
        head.Position,
        position.sub(head.Position),
        supportParams,
      );
      if (obstruction !== undefined && obstruction.Position.sub(position).Magnitude > 0.75) {
        this.previewMessage = localized("ui.build_blocked");
        return false;
      }
    }
    const overlap = new OverlapParams();
    overlap.FilterType = Enum.RaycastFilterType.Exclude;
    overlap.FilterDescendantsInstances = [this.buildPreview];
    const shrunken = new Vector3(
      math.max(0.1, definition.size.X - 0.3),
      math.max(0.1, definition.size.Y - 0.3),
      math.max(0.1, definition.size.Z - 0.3),
    );
    const blockers = Workspace.GetPartBoundsInBox(this.buildPreview.CFrame, shrunken, overlap);
    if (blockers.some((part) => part.CanCollide)) {
      this.previewMessage = localized("ui.build_blocked");
      return false;
    }
    this.previewMessage = localized("ui.build_valid");
    return true;
  }

  private updateContext(): void {
    this.resourceHighlight.Enabled = false;
    this.resourceHighlight.Adornee = undefined;
    this.prunePrompts();
    if (this.gameplayBlocked()) {
      this.ui.setTargetHint(undefined);
      return;
    }
    if (this.selectedMode === "Build") {
      this.ui.setTargetHint(this.previewMessage, this.previewValid);
      return;
    }
    if (this.activePrompts.size() > 0) {
      this.ui.setTargetHint(undefined);
      return;
    }
    const aim = this.getAimResult();
    if (this.selectedMode === "Harvest") {
      if (aim !== undefined && CollectionService.HasTag(aim.Instance, "ResourceNode")) {
        const root = this.player.Character?.FindFirstChild("HumanoidRootPart");
        const distance = root?.IsA("BasePart")
          ? root.Position.sub(aim.Instance.Position).Magnitude
          : math.huge;
        const itemId = aim.Instance.GetAttribute("ResourceItemId");
        const inRange = distance <= 16;
        this.resourceHighlight.Adornee = aim.Instance;
        this.resourceHighlight.Enabled = inRange;
        this.ui.setTargetHint(
          inRange && isItemId(itemId)
            ? localized("ui.target_resource", { item: this.ui.itemName(itemId) })
            : localized("ui.move_closer"),
          inRange,
        );
      } else this.ui.setTargetHint(localized("ui.aim_resource"));
    } else if (this.selectedMode === "Raid") {
      const phase = this.snapshot?.match.phase;
      this.ui.setTargetHint(
        localized(phase !== "Raid" && phase !== "Extraction" ? "ui.raid_phase" : "ui.raid_target"),
        phase === "Raid" || phase === "Extraction",
      );
    } else
      this.ui.setTargetHint(
        this.hasBlaster ? undefined : localized("toast.need_blaster"),
        this.hasBlaster,
      );
  }

  private refreshDepotPrompts(): void {
    this.prunePrompts();
    for (const prompt of this.activePrompts) {
      if (prompt.Name !== "DepotPrompt") continue;
      const depot = prompt.Parent;
      const own = depot?.GetAttribute("OwnerTeam") === this.snapshot?.teamName;
      prompt.HoldDuration = own ? 1 : 6;
      prompt.ActionText = this.ui.localizer.text(
        own
          ? this.snapshot?.match.phase === "Extraction"
            ? "prompt.depot_withdraw"
            : "prompt.depot_deposit"
          : "prompt.depot_steal",
      );
      prompt.ObjectText = this.ui.localizer.text("prompt.team_depot");
      prompt.AutoLocalize = false;
    }
  }

  private prunePrompts(): void {
    // A streamed-out/destroyed prompt need not reach us in the same frame as
    // PromptHidden. A set also makes duplicate visibility notifications harmless.
    for (const prompt of this.activePrompts) {
      if (!prompt.Enabled || !prompt.IsDescendantOf(Workspace)) this.activePrompts.delete(prompt);
    }
  }

  private configureHarvestingViewModel(): void {
    this.harvestingViewModel.Name = "FirstPersonMultiTool";
    const handle = this.createViewModelPart(
      "Handle",
      new Vector3(0.18, 1.5, 0.2),
      new CFrame(),
      Color3.fromRGB(91, 77, 57),
      Enum.Material.Wood,
    );
    handle.Parent = this.harvestingViewModel;
    this.harvestingViewModel.PrimaryPart = handle;
    const head = this.createViewModelPart(
      "ToolHead",
      new Vector3(0.85, 0.45, 0.23),
      new CFrame(-0.2, 0.62, 0),
      Color3.fromRGB(120, 139, 143),
      Enum.Material.Metal,
    );
    head.Parent = this.harvestingViewModel;
    const grip = this.createViewModelPart(
      "Grip",
      new Vector3(0.22, 0.55, 0.24),
      new CFrame(0, -0.42, 0),
      Color3.fromRGB(48, 60, 58),
      Enum.Material.Fabric,
    );
    grip.Parent = this.harvestingViewModel;
    const glove = this.createViewModelPart(
      "Glove",
      new Vector3(0.38, 0.34, 0.4),
      new CFrame(0, -0.42, 0.08),
      Color3.fromRGB(84, 95, 83),
      Enum.Material.Fabric,
    );
    glove.Parent = this.harvestingViewModel;
  }

  private updateHarvestingViewModel(deltaTime: number): void {
    const camera = Workspace.CurrentCamera;
    if (camera === undefined || this.selectedMode !== "Harvest" || this.gameplayBlocked()) {
      this.harvestingViewModel.Parent = undefined;
    } else {
      this.harvestingViewModel.Parent = this.presentationFolder;
      const swing = this.ui.allowsWeaponMotion() ? math.sin(this.recoil * math.pi) : 0;
      const target = camera.CFrame.mul(
        new CFrame(0.7 - swing * 0.12, -0.66, -1.1 - swing * 0.25),
      ).mul(CFrame.Angles(math.rad(-15 - 28 * swing), 0, math.rad(-20)));
      this.harvestingViewModel.PivotTo(target);
    }
    if (this.selectedMode !== "Blaster") this.recoil = math.max(0, this.recoil - deltaTime * 3.8);
  }

  private send(command: ClientCommand): void {
    this.command.FireServer(command);
  }
}
