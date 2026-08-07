import { Players, RunService, TweenService, Workspace } from "@rbxts/services";
import { BUILD_PIECES, BUILD_PIECE_IDS, type BuildPieceId } from "shared/catalog/build-pieces";
import { ITEMS } from "shared/catalog/items";
import { RECIPES, RECIPE_IDS, type RecipeId } from "shared/catalog/recipes";
import type { ToastTone } from "shared/network/protocol";
import type { PlayerSnapshot } from "shared/types/game";

export type ActionMode = "Harvest" | "Build" | "Blaster" | "Raid";

export interface UiActions {
  readonly selectMode: (mode: ActionMode) => void;
  readonly selectBuildPiece: (pieceId: BuildPieceId) => void;
  readonly craft: (recipeId: RecipeId) => void;
  readonly useBandage: () => void;
  readonly performAction: () => void;
}

const COLORS = {
  background: Color3.fromRGB(19, 27, 39),
  panel: Color3.fromRGB(31, 43, 59),
  border: Color3.fromRGB(89, 220, 240),
  text: Color3.fromRGB(240, 246, 255),
  muted: Color3.fromRGB(165, 182, 201),
  accent: Color3.fromRGB(75, 211, 232),
  success: Color3.fromRGB(89, 220, 132),
  warning: Color3.fromRGB(245, 191, 73),
  danger: Color3.fromRGB(239, 91, 103),
};

function addCorner(parent: GuiObject, radius = 8): void {
  const corner = new Instance("UICorner");
  corner.CornerRadius = new UDim(0, radius);
  corner.Parent = parent;
}

function addStroke(parent: GuiObject, color = COLORS.border, transparency = 0.35): void {
  const stroke = new Instance("UIStroke");
  stroke.Color = color;
  stroke.Transparency = transparency;
  stroke.Thickness = 1;
  stroke.Parent = parent;
}

function textLabel(name: string, text: string, size: UDim2, parent: Instance): TextLabel {
  const label = new Instance("TextLabel");
  label.Name = name;
  label.BackgroundTransparency = 1;
  label.Size = size;
  label.Font = Enum.Font.GothamMedium;
  label.Text = text;
  label.TextColor3 = COLORS.text;
  label.TextSize = 16;
  label.TextWrapped = true;
  label.Parent = parent;
  return label;
}

function button(name: string, label: string, parent: Instance): TextButton {
  const result = new Instance("TextButton");
  result.Name = name;
  result.AutoButtonColor = true;
  result.BackgroundColor3 = COLORS.panel;
  result.Size = new UDim2(0, 132, 0, 42);
  result.Font = Enum.Font.GothamBold;
  result.Text = label;
  result.TextColor3 = COLORS.text;
  result.TextSize = 14;
  result.Parent = parent;
  addCorner(result, 7);
  addStroke(result);
  return result;
}

function formatClock(seconds: number): string {
  const safeSeconds = math.max(0, math.floor(seconds));
  const minutes = math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${remainder < 10 ? "0" : ""}${remainder}`;
}

export class UiController {
  private readonly screenGui = new Instance("ScreenGui");
  private readonly root = new Instance("Frame");
  private readonly rootScale = new Instance("UIScale");
  private readonly phaseLabel: TextLabel;
  private readonly timerLabel: TextLabel;
  private readonly playerLabel: TextLabel;
  private readonly objectiveLabel: TextLabel;
  private readonly inventoryLabel: TextLabel;
  private readonly modeLabel: TextLabel;
  private readonly toastLabel: TextLabel;
  private readonly hitMarker: TextLabel;
  private readonly modeButtons = new Map<ActionMode, TextButton>();
  private readonly buildButtons = new Map<BuildPieceId, TextButton>();
  private selectedMode: ActionMode = "Harvest";
  private selectedBuild: BuildPieceId = "foundation";
  private currentSnapshot: PlayerSnapshot | undefined;
  private toastVersion = 0;

  public constructor(private readonly actions: UiActions) {
    this.screenGui.Name = "WarWorldHUD";
    this.screenGui.IgnoreGuiInset = false;
    this.screenGui.ResetOnSpawn = false;
    this.screenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
    this.screenGui.Parent = Players.LocalPlayer.WaitForChild("PlayerGui");

    this.root.Name = "ScaledRoot";
    this.root.BackgroundTransparency = 1;
    this.root.Size = UDim2.fromScale(1, 1);
    this.root.Parent = this.screenGui;
    this.rootScale.Parent = this.root;

    const topPanel = new Instance("Frame");
    topPanel.Name = "MatchPanel";
    topPanel.AnchorPoint = new Vector2(0.5, 0);
    topPanel.Position = new UDim2(0.5, 0, 0, 16);
    topPanel.Size = new UDim2(0, 520, 0, 102);
    topPanel.BackgroundColor3 = COLORS.background;
    topPanel.BackgroundTransparency = 0.08;
    topPanel.Parent = this.root;
    addCorner(topPanel, 10);
    addStroke(topPanel);

    this.phaseLabel = textLabel("Phase", "CARICAMENTO", new UDim2(0.7, 0, 0.55, 0), topPanel);
    this.phaseLabel.Position = new UDim2(0.03, 0, 0.02, 0);
    this.phaseLabel.TextXAlignment = Enum.TextXAlignment.Left;
    this.phaseLabel.Font = Enum.Font.GothamBlack;
    this.phaseLabel.TextSize = 22;

    this.timerLabel = textLabel("Timer", "--:--", new UDim2(0.25, 0, 0.55, 0), topPanel);
    this.timerLabel.Position = new UDim2(0.72, 0, 0.02, 0);
    this.timerLabel.Font = Enum.Font.GothamBlack;
    this.timerLabel.TextColor3 = COLORS.accent;
    this.timerLabel.TextSize = 22;

    this.playerLabel = textLabel("Player", "Squadra: --", new UDim2(0.94, 0, 0, 24), topPanel);
    this.playerLabel.Position = new UDim2(0.03, 0, 0, 48);
    this.playerLabel.TextXAlignment = Enum.TextXAlignment.Left;
    this.playerLabel.TextColor3 = COLORS.muted;
    this.playerLabel.TextSize = 13;

    this.objectiveLabel = textLabel(
      "Objective",
      "Raccogli risorse e costruisci un riparo",
      new UDim2(0.94, 0, 0, 22),
      topPanel,
    );
    this.objectiveLabel.Position = new UDim2(0.03, 0, 0, 73);
    this.objectiveLabel.TextXAlignment = Enum.TextXAlignment.Left;
    this.objectiveLabel.TextColor3 = COLORS.warning;
    this.objectiveLabel.TextSize = 12;

    const inventoryPanel = new Instance("Frame");
    inventoryPanel.Name = "InventoryPanel";
    inventoryPanel.AnchorPoint = new Vector2(1, 0.5);
    inventoryPanel.Position = new UDim2(1, -18, 0.5, 0);
    inventoryPanel.Size = new UDim2(0, 210, 0, 285);
    inventoryPanel.BackgroundColor3 = COLORS.background;
    inventoryPanel.BackgroundTransparency = 0.12;
    inventoryPanel.Parent = this.root;
    addCorner(inventoryPanel, 10);
    addStroke(inventoryPanel);

    const inventoryTitle = textLabel(
      "Title",
      "INVENTARIO",
      new UDim2(1, -20, 0, 36),
      inventoryPanel,
    );
    inventoryTitle.Position = new UDim2(0, 10, 0, 5);
    inventoryTitle.Font = Enum.Font.GothamBlack;
    inventoryTitle.TextColor3 = COLORS.accent;

    this.inventoryLabel = textLabel(
      "Contents",
      "In attesa del server...",
      new UDim2(1, -24, 1, -50),
      inventoryPanel,
    );
    this.inventoryLabel.Position = new UDim2(0, 12, 0, 42);
    this.inventoryLabel.TextXAlignment = Enum.TextXAlignment.Left;
    this.inventoryLabel.TextYAlignment = Enum.TextYAlignment.Top;
    this.inventoryLabel.TextSize = 14;

    this.modeLabel = textLabel("Mode", "RACCOGLI", new UDim2(0, 300, 0, 34), this.root);
    this.modeLabel.AnchorPoint = new Vector2(0.5, 1);
    this.modeLabel.Position = new UDim2(0.5, 0, 1, -72);
    this.modeLabel.Font = Enum.Font.GothamBlack;
    this.modeLabel.TextColor3 = COLORS.accent;
    this.modeLabel.TextSize = 18;

    this.createActionBar();
    this.createCraftPanel();
    this.createBuildPanel();

    const actionButton = button("MobileAction", "AZIONE", this.root);
    actionButton.AnchorPoint = new Vector2(1, 1);
    actionButton.Position = new UDim2(1, -32, 1, -32);
    actionButton.Size = new UDim2(0, 118, 0, 58);
    actionButton.BackgroundColor3 = COLORS.accent;
    actionButton.TextColor3 = COLORS.background;
    actionButton.Activated.Connect(() => this.actions.performAction());

    this.toastLabel = textLabel("Toast", "", new UDim2(0, 520, 0, 50), this.root);
    this.toastLabel.AnchorPoint = new Vector2(0.5, 0);
    this.toastLabel.Position = new UDim2(0.5, 0, 0, 132);
    this.toastLabel.BackgroundColor3 = COLORS.panel;
    this.toastLabel.BackgroundTransparency = 1;
    this.toastLabel.TextTransparency = 1;
    this.toastLabel.Font = Enum.Font.GothamBold;
    this.toastLabel.TextSize = 16;
    addCorner(this.toastLabel, 8);
    addStroke(this.toastLabel);

    this.hitMarker = textLabel("HitMarker", "×", new UDim2(0, 48, 0, 48), this.root);
    this.hitMarker.AnchorPoint = new Vector2(0.5, 0.5);
    this.hitMarker.Position = new UDim2(0.5, 0, 0.5, 0);
    this.hitMarker.Font = Enum.Font.GothamBlack;
    this.hitMarker.TextSize = 36;
    this.hitMarker.TextColor3 = COLORS.text;
    this.hitMarker.TextTransparency = 1;

    const crosshair = textLabel("Crosshair", "+", new UDim2(0, 30, 0, 30), this.root);
    crosshair.AnchorPoint = new Vector2(0.5, 0.5);
    crosshair.Position = new UDim2(0.5, 0, 0.5, 0);
    crosshair.Font = Enum.Font.GothamBold;
    crosshair.TextSize = 20;
    crosshair.TextColor3 = COLORS.text;

    this.updateScale();
    Workspace.CurrentCamera?.GetPropertyChangedSignal("ViewportSize").Connect(() =>
      this.updateScale(),
    );
    RunService.RenderStepped.Connect(() => this.updateClock());
    this.refreshButtonStates();
  }

  public setSnapshot(snapshot: PlayerSnapshot): void {
    this.currentSnapshot = snapshot;
    this.phaseLabel.Text = snapshot.isSpectator
      ? `SPETTATORE · ${string.upper(snapshot.match.phase)}`
      : string.upper(snapshot.match.phase);
    const ownScore = snapshot.teamScores.find((entry) => entry.teamName === snapshot.teamName);
    const leader = snapshot.teamScores[0];
    this.playerLabel.Text = `Squadra: ${snapshot.teamName} · ${ownScore?.score ?? 0} punti   |   Livello ${snapshot.profile.level} · ${snapshot.profile.credits} crediti`;
    const objectives: Record<string, string> = {
      Scavenge: "Raccogli risorse, crea un Blaster e costruisci il campo",
      Conflict: "Contendi la Cassa pubblica e guadagna punti squadra",
      Raid: "Usa le Cariche a impulsi contro le basi rivali",
      Extraction: "Porta i Nuclei energetici nell'anello centrale",
      Complete: "Campagna conclusa: preparazione della prossima partita",
    };
    this.objectiveLabel.Text = snapshot.isSpectator
      ? "Osserva la fase finale: entrerai nella prossima campagna"
      : `${objectives[snapshot.match.phase]}${leader !== undefined ? ` · Leader: ${leader.teamName} ${leader.score}` : ""}`;

    const rows = snapshot.inventory.map((entry) => {
      const definition = ITEMS[entry.itemId];
      return `${definition.displayName}:  ${entry.amount}`;
    });
    this.inventoryLabel.Text = rows.size() > 0 ? rows.join("\n") : "Inventario vuoto";
  }

  public setMode(mode: ActionMode): void {
    this.selectedMode = mode;
    const labels: Record<ActionMode, string> = {
      Harvest: "RACCOGLI",
      Build: `COSTRUISCI · ${BUILD_PIECES[this.selectedBuild].displayName}`,
      Blaster: "BLASTER",
      Raid: "CARICA RAID",
    };
    this.modeLabel.Text = labels[mode];
    this.refreshButtonStates();
  }

  public setBuildPiece(pieceId: BuildPieceId): void {
    this.selectedBuild = pieceId;
    if (this.selectedMode === "Build") {
      this.modeLabel.Text = `COSTRUISCI · ${BUILD_PIECES[pieceId].displayName}`;
    }
    this.refreshButtonStates();
  }

  public showToast(message: string, tone: ToastTone): void {
    this.toastVersion += 1;
    const version = this.toastVersion;
    const toneColor: Record<ToastTone, Color3> = {
      Info: COLORS.accent,
      Success: COLORS.success,
      Warning: COLORS.warning,
      Danger: COLORS.danger,
    };
    this.toastLabel.Text = message;
    this.toastLabel.TextColor3 = toneColor[tone];
    TweenService.Create(this.toastLabel, new TweenInfo(0.16), {
      BackgroundTransparency: 0.12,
      TextTransparency: 0,
    }).Play();

    task.delay(2.7, () => {
      if (version !== this.toastVersion) {
        return;
      }
      TweenService.Create(this.toastLabel, new TweenInfo(0.3), {
        BackgroundTransparency: 1,
        TextTransparency: 1,
      }).Play();
    });
  }

  public showHitConfirm(eliminated: boolean): void {
    this.hitMarker.TextColor3 = eliminated ? COLORS.danger : COLORS.text;
    this.hitMarker.TextTransparency = 0;
    this.hitMarker.Text = eliminated ? "✦" : "×";
    TweenService.Create(this.hitMarker, new TweenInfo(0.28), { TextTransparency: 1 }).Play();
  }

  private createActionBar(): void {
    const bar = new Instance("Frame");
    bar.Name = "ActionBar";
    bar.AnchorPoint = new Vector2(0.5, 1);
    bar.Position = new UDim2(0.5, 0, 1, -18);
    bar.Size = new UDim2(0, 590, 0, 48);
    bar.BackgroundTransparency = 1;
    bar.Parent = this.root;

    const layout = new Instance("UIListLayout");
    layout.FillDirection = Enum.FillDirection.Horizontal;
    layout.HorizontalAlignment = Enum.HorizontalAlignment.Center;
    layout.Padding = new UDim(0, 8);
    layout.Parent = bar;

    const definitions: ReadonlyArray<[ActionMode, string]> = [
      ["Harvest", "1 · RACCOGLI"],
      ["Build", "2 · COSTRUISCI"],
      ["Blaster", "3 · BLASTER"],
      ["Raid", "4 · RAID"],
    ];
    for (const [mode, label] of definitions) {
      const modeButton = button(mode, label, bar);
      modeButton.Activated.Connect(() => this.actions.selectMode(mode));
      this.modeButtons.set(mode, modeButton);
    }
  }

  private createCraftPanel(): void {
    const panel = new Instance("Frame");
    panel.Name = "CraftPanel";
    panel.Position = new UDim2(0, 18, 0.5, -160);
    panel.Size = new UDim2(0, 180, 0, 205);
    panel.BackgroundTransparency = 1;
    panel.Parent = this.root;

    const layout = new Instance("UIListLayout");
    layout.Padding = new UDim(0, 7);
    layout.Parent = panel;

    for (const recipeId of RECIPE_IDS) {
      const recipe = RECIPES[recipeId];
      const costs = recipe.ingredients
        .map((ingredient) => `${ingredient.amount} ${ITEMS[ingredient.itemId].displayName}`)
        .join(" + ");
      const craftButton = button(
        `Craft_${recipeId}`,
        `CREA · ${recipe.displayName}\n${costs}`,
        panel,
      );
      craftButton.Size = new UDim2(0, 180, 0, 48);
      craftButton.TextSize = 11;
      craftButton.Activated.Connect(() => this.actions.craft(recipeId));
    }

    const bandageButton = button("UseBandage", "B · USA PATCH", panel);
    bandageButton.Size = new UDim2(0, 180, 0, 42);
    bandageButton.Activated.Connect(() => this.actions.useBandage());
  }

  private createBuildPanel(): void {
    const panel = new Instance("Frame");
    panel.Name = "BuildPanel";
    panel.Position = new UDim2(0, 18, 0.5, 58);
    panel.Size = new UDim2(0, 180, 0, 200);
    panel.BackgroundTransparency = 1;
    panel.Parent = this.root;

    const layout = new Instance("UIListLayout");
    layout.Padding = new UDim(0, 6);
    layout.Parent = panel;

    for (const pieceId of BUILD_PIECE_IDS) {
      const costs = BUILD_PIECES[pieceId].costs
        .map((cost) => `${cost.amount} ${ITEMS[cost.itemId].displayName}`)
        .join(" + ");
      const pieceButton = button(
        `Build_${pieceId}`,
        `${string.upper(BUILD_PIECES[pieceId].displayName)}\n${costs}`,
        panel,
      );
      pieceButton.Size = new UDim2(0, 180, 0, 43);
      pieceButton.TextSize = 11;
      pieceButton.Activated.Connect(() => this.actions.selectBuildPiece(pieceId));
      this.buildButtons.set(pieceId, pieceButton);
    }
  }

  private refreshButtonStates(): void {
    for (const [mode, modeButton] of this.modeButtons) {
      modeButton.BackgroundColor3 = mode === this.selectedMode ? COLORS.accent : COLORS.panel;
      modeButton.TextColor3 = mode === this.selectedMode ? COLORS.background : COLORS.text;
    }
    for (const [pieceId, pieceButton] of this.buildButtons) {
      pieceButton.BackgroundColor3 = pieceId === this.selectedBuild ? COLORS.success : COLORS.panel;
      pieceButton.TextColor3 = pieceId === this.selectedBuild ? COLORS.background : COLORS.text;
    }
  }

  private updateClock(): void {
    const snapshot = this.currentSnapshot;
    if (snapshot === undefined) {
      return;
    }
    const remaining = snapshot.match.phaseEndsAt - Workspace.GetServerTimeNow();
    this.timerLabel.Text = formatClock(remaining);
  }

  private updateScale(): void {
    const viewport = Workspace.CurrentCamera?.ViewportSize ?? new Vector2(1280, 720);
    this.rootScale.Scale = math.clamp(viewport.X / 1280, 0.68, 1);
  }
}
