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
  private selectedMode: ActionMode = "Harvest";
  private selectedBuildPiece: BuildPieceId = "foundation";
  private buildRotation = 0;
  private sequence = 0;

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
    });

    this.configurePreview();
  }

  public start(): void {
    this.player.CameraMode = Enum.CameraMode.LockFirstPerson;
    this.player.CameraMinZoomDistance = 0.5;
    this.player.CameraMaxZoomDistance = 0.5;
    this.event.OnClientEvent.Connect((payload: unknown) => this.onServerEvent(payload));
    UserInputService.InputBegan.Connect((input, processed) => {
      if (!processed) {
        this.onInput(input);
      }
    });
    RunService.RenderStepped.Connect(() => this.updateBuildPreview());
    this.send({ kind: "Ready" });
    print("[WAR WORLD] Client controller started.");
  }

  private onInput(input: InputObject): void {
    if (input.UserInputType === Enum.UserInputType.MouseButton1) {
      this.performAction();
      return;
    }
    if (input.KeyCode === Enum.KeyCode.One) {
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

    const camera = Workspace.CurrentCamera;
    const head = this.player.Character?.FindFirstChild("Head");
    if (camera === undefined || !head?.IsA("BasePart")) {
      return;
    }
    const viewport = camera.ViewportSize;
    const ray = camera.ViewportPointToRay(viewport.X / 2, viewport.Y / 2);
    this.sequence += 1;
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
