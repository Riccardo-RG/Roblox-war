import { Players, RunService, TweenService, Workspace } from "@rbxts/services";
import { BUILD_PIECES, BUILD_PIECE_IDS, type BuildPieceId } from "shared/catalog/build-pieces";
import type { ItemId } from "shared/catalog/items";
import { RECIPES, RECIPE_IDS, type RecipeId } from "shared/catalog/recipes";
import type { LocalizationKey, LocalizedMessage } from "shared/localization/translations";
import type { ToastTone } from "shared/network/protocol";
import type { PlayerSnapshot } from "shared/types/game";
import { Localizer } from "client/localization/localizer";

export type ActionMode = "Harvest" | "Build" | "Blaster" | "Raid";

export interface UiActions {
  readonly selectMode: (mode: ActionMode) => void;
  readonly selectBuildPiece: (pieceId: BuildPieceId) => void;
  readonly craft: (recipeId: RecipeId) => void;
  readonly useBandage: () => void;
  readonly performAction: () => void;
  readonly tutorialVisibilityChanged: (visible: boolean) => void;
}

const COLORS = {
  background: Color3.fromRGB(19, 27, 39),
  panel: Color3.fromRGB(31, 43, 59),
  border: Color3.fromRGB(88, 190, 207),
  text: Color3.fromRGB(240, 246, 255),
  muted: Color3.fromRGB(165, 182, 201),
  accent: Color3.fromRGB(82, 190, 210),
  success: Color3.fromRGB(89, 220, 132),
  warning: Color3.fromRGB(245, 191, 73),
  danger: Color3.fromRGB(239, 91, 103),
};

interface TutorialStep {
  readonly eyebrow: LocalizationKey;
  readonly title: LocalizationKey;
  readonly description: LocalizationKey;
  readonly objective: LocalizationKey;
  readonly controls: LocalizationKey;
}

const TUTORIAL_STEPS: ReadonlyArray<TutorialStep> = [
  {
    eyebrow: "tutorial.step1.eyebrow",
    title: "tutorial.step1.title",
    description: "tutorial.step1.body",
    objective: "tutorial.step1.objective",
    controls: "tutorial.step1.controls",
  },
  {
    eyebrow: "tutorial.step2.eyebrow",
    title: "tutorial.step2.title",
    description: "tutorial.step2.body",
    objective: "tutorial.step2.objective",
    controls: "tutorial.step2.controls",
  },
  {
    eyebrow: "tutorial.step3.eyebrow",
    title: "tutorial.step3.title",
    description: "tutorial.step3.body",
    objective: "tutorial.step3.objective",
    controls: "tutorial.step3.controls",
  },
  {
    eyebrow: "tutorial.step4.eyebrow",
    title: "tutorial.step4.title",
    description: "tutorial.step4.body",
    objective: "tutorial.step4.objective",
    controls: "tutorial.step4.controls",
  },
  {
    eyebrow: "tutorial.step5.eyebrow",
    title: "tutorial.step5.title",
    description: "tutorial.step5.body",
    objective: "tutorial.step5.objective",
    controls: "tutorial.step5.controls",
  },
];

const ITEM_KEYS: Record<ItemId, LocalizationKey> = {
  wood: "item.wood",
  stone: "item.stone",
  scrap: "item.scrap",
  fiber: "item.fiber",
  energy_core: "item.energy_core",
  multi_tool: "item.multi_tool",
  survival_blaster: "item.survival_blaster",
  bandage: "item.bandage",
  breach_charge: "item.breach_charge",
};

const BUILD_KEYS: Record<BuildPieceId, LocalizationKey> = {
  foundation: "build.foundation",
  wall: "build.wall",
  doorway: "build.doorway",
  workbench: "build.workbench",
};

const PHASE_KEYS = {
  Scavenge: "phase.scavenge",
  Conflict: "phase.conflict",
  Raid: "phase.raid",
  Extraction: "phase.extraction",
  Complete: "phase.complete",
} as const satisfies Record<PlayerSnapshot["match"]["phase"], LocalizationKey>;

const OBJECTIVE_KEYS = {
  Scavenge: "objective.scavenge",
  Conflict: "objective.conflict",
  Raid: "objective.raid",
  Extraction: "objective.extraction",
  Complete: "objective.complete",
} as const satisfies Record<PlayerSnapshot["match"]["phase"], LocalizationKey>;

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
  result.TextWrapped = true;
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
  private readonly localizer = new Localizer();
  private readonly screenGui = new Instance("ScreenGui");
  private readonly root = new Instance("Frame");
  private readonly rootScale = new Instance("UIScale");
  private readonly phaseLabel: TextLabel;
  private readonly timerLabel: TextLabel;
  private readonly playerLabel: TextLabel;
  private readonly objectiveLabel: TextLabel;
  private readonly inventoryTitle: TextLabel;
  private readonly inventoryLabel: TextLabel;
  private readonly modeLabel: TextLabel;
  private readonly inputHintLabel: TextLabel;
  private readonly toastLabel: TextLabel;
  private readonly hitMarker: TextLabel;
  private readonly craftPanel = new Instance("Frame");
  private readonly buildPanel = new Instance("Frame");
  private readonly tutorialOverlay = new Instance("Frame");
  private readonly tutorialStepLabel = new Instance("TextLabel");
  private readonly tutorialTitleLabel = new Instance("TextLabel");
  private readonly tutorialBodyLabel = new Instance("TextLabel");
  private readonly tutorialObjectiveLabel = new Instance("TextLabel");
  private readonly tutorialControlsLabel = new Instance("TextLabel");
  private tutorialGuideLabel!: TextLabel;
  private tutorialCloseButton!: TextButton;
  private readonly tutorialPreviousButton = new Instance("TextButton");
  private readonly tutorialNextButton = new Instance("TextButton");
  private readonly mobileActionButton: TextButton;
  private craftTitle!: TextLabel;
  private buildTitle!: TextLabel;
  private bandageButton!: TextButton;
  private readonly modeButtons = new Map<ActionMode, TextButton>();
  private readonly craftButtons = new Map<RecipeId, TextButton>();
  private readonly buildButtons = new Map<BuildPieceId, TextButton>();
  private selectedMode: ActionMode = "Harvest";
  private selectedBuild: BuildPieceId = "foundation";
  private currentSnapshot: PlayerSnapshot | undefined;
  private tutorialStep = 0;
  private lastMatchEndsAt: number | undefined;
  private toastVersion = 0;

  public constructor(private readonly actions: UiActions) {
    this.screenGui.Name = "WarWorldHUD";
    this.screenGui.IgnoreGuiInset = false;
    this.screenGui.ResetOnSpawn = false;
    this.screenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
    this.screenGui.AutoLocalize = false;
    this.screenGui.RootLocalizationTable = this.localizer.table;
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

    this.phaseLabel = textLabel(
      "Phase",
      this.localizer.text("ui.loading"),
      new UDim2(0.7, 0, 0.55, 0),
      topPanel,
    );
    this.phaseLabel.Position = new UDim2(0.03, 0, 0.02, 0);
    this.phaseLabel.TextXAlignment = Enum.TextXAlignment.Left;
    this.phaseLabel.Font = Enum.Font.GothamBlack;
    this.phaseLabel.TextSize = 22;

    this.timerLabel = textLabel("Timer", "--:--", new UDim2(0.25, 0, 0.55, 0), topPanel);
    this.timerLabel.Position = new UDim2(0.72, 0, 0.02, 0);
    this.timerLabel.Font = Enum.Font.GothamBlack;
    this.timerLabel.TextColor3 = COLORS.accent;
    this.timerLabel.TextSize = 22;

    this.playerLabel = textLabel(
      "Player",
      `${this.localizer.text("ui.team")}: --`,
      new UDim2(0.94, 0, 0, 24),
      topPanel,
    );
    this.playerLabel.Position = new UDim2(0.03, 0, 0, 48);
    this.playerLabel.TextXAlignment = Enum.TextXAlignment.Left;
    this.playerLabel.TextColor3 = COLORS.muted;
    this.playerLabel.TextSize = 13;

    this.objectiveLabel = textLabel(
      "Objective",
      this.localizer.text("objective.scavenge"),
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

    this.inventoryTitle = textLabel(
      "Title",
      this.localizer.text("ui.inventory"),
      new UDim2(1, -20, 0, 36),
      inventoryPanel,
    );
    this.inventoryTitle.Position = new UDim2(0, 10, 0, 5);
    this.inventoryTitle.Font = Enum.Font.GothamBlack;
    this.inventoryTitle.TextColor3 = COLORS.accent;

    this.inventoryLabel = textLabel(
      "Contents",
      this.localizer.text("ui.waiting_server"),
      new UDim2(1, -24, 1, -50),
      inventoryPanel,
    );
    this.inventoryLabel.Position = new UDim2(0, 12, 0, 42);
    this.inventoryLabel.TextXAlignment = Enum.TextXAlignment.Left;
    this.inventoryLabel.TextYAlignment = Enum.TextYAlignment.Top;
    this.inventoryLabel.TextSize = 14;

    this.modeLabel = textLabel(
      "Mode",
      this.localizer.text("ui.mode.harvest"),
      new UDim2(0, 300, 0, 34),
      this.root,
    );
    this.modeLabel.AnchorPoint = new Vector2(0.5, 1);
    this.modeLabel.Position = new UDim2(0.5, 0, 1, -90);
    this.modeLabel.Font = Enum.Font.GothamBlack;
    this.modeLabel.TextColor3 = COLORS.accent;
    this.modeLabel.TextSize = 18;

    this.inputHintLabel = textLabel(
      "InputHint",
      this.localizer.text("ui.input_hint"),
      new UDim2(0, 500, 0, 18),
      this.root,
    );
    this.inputHintLabel.AnchorPoint = new Vector2(0.5, 1);
    this.inputHintLabel.Position = new UDim2(0.5, 0, 1, -69);
    this.inputHintLabel.Font = Enum.Font.GothamBold;
    this.inputHintLabel.TextColor3 = COLORS.muted;
    this.inputHintLabel.TextSize = 11;

    this.createActionBar();
    this.createCraftPanel();
    this.createBuildPanel();
    this.createTutorial();

    this.mobileActionButton = button("MobileAction", this.localizer.text("ui.action"), this.root);
    this.mobileActionButton.AnchorPoint = new Vector2(1, 1);
    this.mobileActionButton.Position = new UDim2(1, -32, 1, -32);
    this.mobileActionButton.Size = new UDim2(0, 118, 0, 58);
    this.mobileActionButton.BackgroundColor3 = COLORS.accent;
    this.mobileActionButton.TextColor3 = COLORS.background;
    this.mobileActionButton.Activated.Connect(() => this.actions.performAction());

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
    this.localizer.changed.Event.Connect(() => this.refreshLocalization());
    this.refreshButtonStates();
  }

  public setSnapshot(snapshot: PlayerSnapshot): void {
    this.currentSnapshot = snapshot;
    if (
      snapshot.match.phase === "Scavenge" &&
      (this.lastMatchEndsAt === undefined ||
        math.abs(snapshot.match.matchEndsAt - this.lastMatchEndsAt) > 1)
    ) {
      this.tutorialStep = 0;
      this.renderTutorialStep();
      this.setTutorialVisible(true);
    }
    this.lastMatchEndsAt = snapshot.match.matchEndsAt;
    const phaseName = this.localizer.text(PHASE_KEYS[snapshot.match.phase]);
    this.phaseLabel.Text = snapshot.isSpectator
      ? `${this.localizer.text("ui.spectator")} · ${phaseName}`
      : phaseName;
    const ownScore = snapshot.teamScores.find((entry) => entry.teamName === snapshot.teamName);
    const leader = snapshot.teamScores[0];
    this.playerLabel.Text = `${this.localizer.text("ui.team")}: ${this.teamName(snapshot.teamName)} · ${ownScore?.score ?? 0} ${this.localizer.text("ui.points")}   |   ${this.localizer.text("ui.level")} ${snapshot.profile.level} · ${snapshot.profile.credits} ${this.localizer.text("ui.credits")}`;
    this.objectiveLabel.Text = snapshot.isSpectator
      ? this.localizer.text("objective.spectator")
      : `${this.localizer.text(OBJECTIVE_KEYS[snapshot.match.phase])}${leader !== undefined ? ` · ${this.localizer.text("ui.leader")}: ${leader.teamName} ${leader.score}` : ""}`;

    const rows = snapshot.inventory.map((entry) => {
      return `${this.itemName(entry.itemId)}:  ${entry.amount}`;
    });
    this.inventoryLabel.Text =
      rows.size() > 0 ? rows.join("\n") : this.localizer.text("ui.empty_inventory");
  }

  public setMode(mode: ActionMode): void {
    this.selectedMode = mode;
    const labels: Record<ActionMode, string> = {
      Harvest: this.localizer.text("ui.mode.harvest"),
      Build: `${this.localizer.text("ui.mode.build")} · ${this.buildName(this.selectedBuild)}`,
      Blaster: this.localizer.text("ui.mode.blaster"),
      Raid: this.localizer.text("ui.mode.raid"),
    };
    this.modeLabel.Text = labels[mode];
    this.refreshButtonStates();
  }

  public setBuildPiece(pieceId: BuildPieceId): void {
    this.selectedBuild = pieceId;
    if (this.selectedMode === "Build") {
      this.modeLabel.Text = `${this.localizer.text("ui.mode.build")} · ${this.buildName(pieceId)}`;
    }
    this.refreshButtonStates();
  }

  public showToast(message: LocalizedMessage, tone: ToastTone): void {
    this.toastVersion += 1;
    const version = this.toastVersion;
    const toneColor: Record<ToastTone, Color3> = {
      Info: COLORS.accent,
      Success: COLORS.success,
      Warning: COLORS.warning,
      Danger: COLORS.danger,
    };
    this.toastLabel.Text = this.localizer.message(message);
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

  public toggleTutorial(): void {
    const visible = !this.tutorialOverlay.Visible;
    this.setTutorialVisible(visible);
    if (visible) {
      this.renderTutorialStep();
    }
  }

  public isTutorialOpen(): boolean {
    return this.tutorialOverlay.Visible;
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
    layout.SortOrder = Enum.SortOrder.LayoutOrder;
    layout.Padding = new UDim(0, 8);
    layout.Parent = bar;

    const definitions: ReadonlyArray<[ActionMode, LocalizationKey]> = [
      ["Harvest", "ui.action.harvest"],
      ["Build", "ui.action.build"],
      ["Blaster", "ui.action.blaster"],
      ["Raid", "ui.action.raid"],
    ];
    for (let index = 0; index < definitions.size(); index += 1) {
      const [mode, labelKey] = definitions[index]!;
      const modeButton = button(mode, this.localizer.text(labelKey), bar);
      modeButton.LayoutOrder = index;
      modeButton.Activated.Connect(() => this.actions.selectMode(mode));
      this.modeButtons.set(mode, modeButton);
    }
  }

  private createCraftPanel(): void {
    const panel = this.craftPanel;
    panel.Name = "CraftPanel";
    panel.Position = new UDim2(0, 18, 0.5, -132);
    panel.Size = new UDim2(0, 196, 0, 240);
    panel.BackgroundColor3 = COLORS.background;
    panel.BackgroundTransparency = 0.12;
    panel.Parent = this.root;
    addCorner(panel, 10);
    addStroke(panel);

    const padding = new Instance("UIPadding");
    padding.PaddingTop = new UDim(0, 10);
    padding.PaddingLeft = new UDim(0, 8);
    padding.Parent = panel;

    const layout = new Instance("UIListLayout");
    layout.Padding = new UDim(0, 7);
    layout.SortOrder = Enum.SortOrder.LayoutOrder;
    layout.Parent = panel;

    this.craftTitle = textLabel(
      "CraftTitle",
      this.localizer.text("ui.crafting"),
      new UDim2(0, 180, 0, 25),
      panel,
    );
    this.craftTitle.LayoutOrder = 0;
    this.craftTitle.TextXAlignment = Enum.TextXAlignment.Left;
    this.craftTitle.Font = Enum.Font.GothamBlack;
    this.craftTitle.TextSize = 13;
    this.craftTitle.TextColor3 = COLORS.accent;

    for (let index = 0; index < RECIPE_IDS.size(); index += 1) {
      const recipeId = RECIPE_IDS[index]!;
      const recipe = RECIPES[recipeId];
      const costs = recipe.ingredients
        .map((ingredient) => `${ingredient.amount} ${this.itemName(ingredient.itemId)}`)
        .join(" + ");
      const craftButton = button(
        `Craft_${recipeId}`,
        `${this.localizer.text("ui.craft")} · ${this.itemName(recipe.output.itemId)}\n${costs}`,
        panel,
      );
      craftButton.Size = new UDim2(0, 180, 0, 48);
      craftButton.LayoutOrder = index + 1;
      craftButton.TextSize = 11;
      craftButton.Activated.Connect(() => this.actions.craft(recipeId));
      this.craftButtons.set(recipeId, craftButton);
    }

    this.bandageButton = button("UseBandage", this.localizer.text("ui.use_patch"), panel);
    this.bandageButton.Size = new UDim2(0, 180, 0, 42);
    this.bandageButton.LayoutOrder = RECIPE_IDS.size() + 1;
    this.bandageButton.Activated.Connect(() => this.actions.useBandage());
  }

  private createBuildPanel(): void {
    const panel = this.buildPanel;
    panel.Name = "BuildPanel";
    panel.Position = new UDim2(0, 18, 0.5, -132);
    panel.Size = new UDim2(0, 196, 0, 246);
    panel.BackgroundColor3 = COLORS.background;
    panel.BackgroundTransparency = 0.12;
    panel.Visible = false;
    panel.Parent = this.root;
    addCorner(panel, 10);
    addStroke(panel);

    const padding = new Instance("UIPadding");
    padding.PaddingTop = new UDim(0, 10);
    padding.PaddingLeft = new UDim(0, 8);
    padding.Parent = panel;

    const layout = new Instance("UIListLayout");
    layout.Padding = new UDim(0, 6);
    layout.SortOrder = Enum.SortOrder.LayoutOrder;
    layout.Parent = panel;

    this.buildTitle = textLabel(
      "BuildTitle",
      this.localizer.text("ui.building"),
      new UDim2(0, 180, 0, 25),
      panel,
    );
    this.buildTitle.LayoutOrder = 0;
    this.buildTitle.TextXAlignment = Enum.TextXAlignment.Left;
    this.buildTitle.Font = Enum.Font.GothamBlack;
    this.buildTitle.TextSize = 13;
    this.buildTitle.TextColor3 = COLORS.success;

    for (let index = 0; index < BUILD_PIECE_IDS.size(); index += 1) {
      const pieceId = BUILD_PIECE_IDS[index]!;
      const costs = BUILD_PIECES[pieceId].costs
        .map((cost) => `${cost.amount} ${this.itemName(cost.itemId)}`)
        .join(" + ");
      const pieceButton = button(
        `Build_${pieceId}`,
        `${string.upper(this.buildName(pieceId))}\n${costs}`,
        panel,
      );
      pieceButton.Size = new UDim2(0, 180, 0, 43);
      pieceButton.LayoutOrder = index + 1;
      pieceButton.TextSize = 11;
      pieceButton.Activated.Connect(() => this.actions.selectBuildPiece(pieceId));
      this.buildButtons.set(pieceId, pieceButton);
    }
  }

  private createTutorial(): void {
    const helpButton = button("TutorialHelp", "?", this.root);
    helpButton.Position = new UDim2(0, 316, 0, 18);
    helpButton.Size = new UDim2(0, 38, 0, 38);
    helpButton.BackgroundColor3 = COLORS.background;
    helpButton.TextColor3 = COLORS.accent;
    helpButton.TextSize = 20;
    helpButton.ZIndex = 12;
    helpButton.Activated.Connect(() => {
      this.renderTutorialStep();
      this.setTutorialVisible(true);
    });

    const overlay = this.tutorialOverlay;
    overlay.Name = "TutorialOverlay";
    overlay.Active = true;
    overlay.BackgroundColor3 = Color3.fromRGB(5, 9, 15);
    overlay.BackgroundTransparency = 0.28;
    overlay.Size = UDim2.fromScale(1, 1);
    overlay.ZIndex = 30;
    overlay.Parent = this.root;

    const card = new Instance("Frame");
    card.Name = "TutorialCard";
    card.AnchorPoint = new Vector2(0.5, 0.5);
    card.Position = UDim2.fromScale(0.5, 0.5);
    card.Size = new UDim2(0, 660, 0, 420);
    card.BackgroundColor3 = COLORS.background;
    card.BackgroundTransparency = 0.03;
    card.ZIndex = 31;
    card.Parent = overlay;
    addCorner(card, 14);
    addStroke(card, COLORS.accent, 0.12);

    const accentBar = new Instance("Frame");
    accentBar.Name = "AccentBar";
    accentBar.Size = new UDim2(0, 7, 1, 0);
    accentBar.BackgroundColor3 = COLORS.accent;
    accentBar.BorderSizePixel = 0;
    accentBar.ZIndex = 32;
    accentBar.Parent = card;
    addCorner(accentBar, 14);

    this.tutorialGuideLabel = textLabel(
      "Guide",
      this.localizer.text("tutorial.guide"),
      new UDim2(0, 500, 0, 28),
      card,
    );
    this.tutorialGuideLabel.Position = new UDim2(0, 34, 0, 24);
    this.tutorialGuideLabel.TextXAlignment = Enum.TextXAlignment.Left;
    this.tutorialGuideLabel.Font = Enum.Font.GothamBlack;
    this.tutorialGuideLabel.TextColor3 = COLORS.accent;
    this.tutorialGuideLabel.TextSize = 13;
    this.tutorialGuideLabel.ZIndex = 32;

    this.tutorialCloseButton = button("CloseTutorial", "×", card);
    this.tutorialCloseButton.AnchorPoint = new Vector2(1, 0);
    this.tutorialCloseButton.Position = new UDim2(1, -20, 0, 18);
    this.tutorialCloseButton.Size = new UDim2(0, 38, 0, 38);
    this.tutorialCloseButton.TextSize = 24;
    this.tutorialCloseButton.ZIndex = 32;
    this.tutorialCloseButton.Activated.Connect(() => this.setTutorialVisible(false));

    this.configureTutorialLabel(
      this.tutorialStepLabel,
      "",
      new UDim2(0, 580, 0, 24),
      new UDim2(0, 34, 0, 70),
      card,
      12,
      COLORS.warning,
      Enum.Font.GothamBold,
    );
    this.configureTutorialLabel(
      this.tutorialTitleLabel,
      "",
      new UDim2(0, 580, 0, 48),
      new UDim2(0, 34, 0, 98),
      card,
      28,
      COLORS.text,
      Enum.Font.GothamBlack,
    );
    this.configureTutorialLabel(
      this.tutorialBodyLabel,
      "",
      new UDim2(0, 580, 0, 82),
      new UDim2(0, 34, 0, 154),
      card,
      16,
      COLORS.muted,
      Enum.Font.GothamMedium,
    );

    const objectivePanel = new Instance("Frame");
    objectivePanel.Name = "ObjectivePanel";
    objectivePanel.Position = new UDim2(0, 34, 0, 244);
    objectivePanel.Size = new UDim2(0, 590, 0, 54);
    objectivePanel.BackgroundColor3 = COLORS.panel;
    objectivePanel.ZIndex = 32;
    objectivePanel.Parent = card;
    addCorner(objectivePanel, 8);
    addStroke(objectivePanel, COLORS.warning, 0.45);
    this.configureTutorialLabel(
      this.tutorialObjectiveLabel,
      "",
      new UDim2(1, -24, 1, 0),
      new UDim2(0, 12, 0, 0),
      objectivePanel,
      14,
      COLORS.warning,
      Enum.Font.GothamBold,
    );

    this.configureTutorialLabel(
      this.tutorialControlsLabel,
      "",
      new UDim2(0, 590, 0, 38),
      new UDim2(0, 34, 0, 310),
      card,
      13,
      COLORS.muted,
      Enum.Font.Code,
    );

    this.configureTutorialButton(
      this.tutorialPreviousButton,
      this.localizer.text("tutorial.back"),
      card,
    );
    this.tutorialPreviousButton.Position = new UDim2(0, 34, 1, -62);
    this.tutorialPreviousButton.Activated.Connect(() => {
      this.tutorialStep = math.max(0, this.tutorialStep - 1);
      this.renderTutorialStep();
    });

    this.configureTutorialButton(
      this.tutorialNextButton,
      this.localizer.text("tutorial.next"),
      card,
    );
    this.tutorialNextButton.AnchorPoint = new Vector2(1, 0);
    this.tutorialNextButton.Position = new UDim2(1, -36, 1, -62);
    this.tutorialNextButton.BackgroundColor3 = COLORS.accent;
    this.tutorialNextButton.TextColor3 = COLORS.background;
    this.tutorialNextButton.Activated.Connect(() => {
      if (this.tutorialStep >= TUTORIAL_STEPS.size() - 1) {
        this.setTutorialVisible(false);
        return;
      }
      this.tutorialStep += 1;
      this.renderTutorialStep();
    });

    this.renderTutorialStep();
    this.setTutorialVisible(true);
  }

  private configureTutorialLabel(
    label: TextLabel,
    labelText: string,
    size: UDim2,
    position: UDim2,
    parent: Instance,
    textSize: number,
    color: Color3,
    font: Enum.Font,
  ): void {
    label.BackgroundTransparency = 1;
    label.Position = position;
    label.Size = size;
    label.Font = font;
    label.Text = labelText;
    label.TextColor3 = color;
    label.TextSize = textSize;
    label.TextWrapped = true;
    label.TextXAlignment = Enum.TextXAlignment.Left;
    label.TextYAlignment = Enum.TextYAlignment.Center;
    label.ZIndex = 33;
    label.Parent = parent;
  }

  private configureTutorialButton(result: TextButton, label: string, parent: Instance): void {
    result.AutoButtonColor = true;
    result.BackgroundColor3 = COLORS.panel;
    result.Size = new UDim2(0, 132, 0, 42);
    result.Font = Enum.Font.GothamBold;
    result.Text = label;
    result.TextColor3 = COLORS.text;
    result.TextSize = 13;
    result.ZIndex = 33;
    result.Modal = false;
    result.Parent = parent;
    addCorner(result, 7);
    addStroke(result);
  }

  private renderTutorialStep(): void {
    const step = TUTORIAL_STEPS[this.tutorialStep]!;
    this.tutorialStepLabel.Text = `${this.localizer.text(step.eyebrow)}   ·   ${this.tutorialStep + 1}/${TUTORIAL_STEPS.size()}`;
    this.tutorialTitleLabel.Text = this.localizer.text(step.title);
    this.tutorialBodyLabel.Text = this.localizer.text(step.description);
    this.tutorialObjectiveLabel.Text = this.localizer.text(step.objective);
    this.tutorialControlsLabel.Text = this.localizer.text(step.controls);
    this.tutorialPreviousButton.Visible = this.tutorialStep > 0;
    this.tutorialNextButton.Text =
      this.tutorialStep === TUTORIAL_STEPS.size() - 1
        ? this.localizer.text("tutorial.start")
        : this.localizer.text("tutorial.next");
  }

  private setTutorialVisible(visible: boolean): void {
    this.tutorialOverlay.Visible = visible;
    this.tutorialCloseButton.Modal = visible;
    this.tutorialPreviousButton.Modal = visible;
    this.tutorialNextButton.Modal = visible;
    this.actions.tutorialVisibilityChanged(visible);
  }

  private refreshLocalization(): void {
    this.inventoryTitle.Text = this.localizer.text("ui.inventory");
    this.inputHintLabel.Text = this.localizer.text("ui.input_hint");
    this.mobileActionButton.Text = this.localizer.text("ui.action");
    this.craftTitle.Text = this.localizer.text("ui.crafting");
    this.buildTitle.Text = this.localizer.text("ui.building");
    this.bandageButton.Text = this.localizer.text("ui.use_patch");
    this.tutorialGuideLabel.Text = this.localizer.text("tutorial.guide");
    this.tutorialPreviousButton.Text = this.localizer.text("tutorial.back");

    const actionKeys: Record<ActionMode, LocalizationKey> = {
      Harvest: "ui.action.harvest",
      Build: "ui.action.build",
      Blaster: "ui.action.blaster",
      Raid: "ui.action.raid",
    };
    for (const [mode, modeButton] of this.modeButtons) {
      modeButton.Text = this.localizer.text(actionKeys[mode]);
    }
    for (const [recipeId, craftButton] of this.craftButtons) {
      const recipe = RECIPES[recipeId];
      const costs = recipe.ingredients
        .map((ingredient) => `${ingredient.amount} ${this.itemName(ingredient.itemId)}`)
        .join(" + ");
      craftButton.Text = `${this.localizer.text("ui.craft")} · ${this.itemName(recipe.output.itemId)}\n${costs}`;
    }
    for (const [pieceId, pieceButton] of this.buildButtons) {
      const costs = BUILD_PIECES[pieceId].costs
        .map((cost) => `${cost.amount} ${this.itemName(cost.itemId)}`)
        .join(" + ");
      pieceButton.Text = `${string.upper(this.buildName(pieceId))}\n${costs}`;
    }

    this.renderTutorialStep();
    if (this.currentSnapshot !== undefined) {
      this.setSnapshot(this.currentSnapshot);
    } else {
      this.phaseLabel.Text = this.localizer.text("ui.loading");
      this.playerLabel.Text = `${this.localizer.text("ui.team")}: --`;
      this.objectiveLabel.Text = this.localizer.text("objective.scavenge");
      this.inventoryLabel.Text = this.localizer.text("ui.waiting_server");
      this.setMode(this.selectedMode);
    }
  }

  private itemName(itemId: ItemId): string {
    return this.localizer.text(ITEM_KEYS[itemId]);
  }

  private buildName(pieceId: BuildPieceId): string {
    return this.localizer.text(BUILD_KEYS[pieceId]);
  }

  private teamName(teamName: string): string {
    return teamName === "Unassigned" ? this.localizer.text("team.unassigned") : teamName;
  }

  private refreshButtonStates(): void {
    this.craftPanel.Visible = this.selectedMode !== "Build";
    this.buildPanel.Visible = this.selectedMode === "Build";
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
    const widthScale = viewport.X / 1280;
    const heightScale = viewport.Y / 720;
    this.rootScale.Scale = math.clamp(math.min(widthScale, heightScale), 0.45, 1);
  }
}
