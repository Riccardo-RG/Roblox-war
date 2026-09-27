import {
  GuiService,
  Players,
  RunService,
  TweenService,
  UserInputService,
  Workspace,
} from "@rbxts/services";
import { BUILD_PIECES, BUILD_PIECE_IDS, type BuildPieceId } from "shared/catalog/build-pieces";
import { type ItemId } from "shared/catalog/items";
import { RECIPES, RECIPE_IDS, type RecipeId } from "shared/catalog/recipes";
import {
  localized,
  type LocalizationKey,
  type LocalizedMessage,
} from "shared/localization/translations";
import type { ToastTone } from "shared/network/protocol";
import type { PlayerSnapshot } from "shared/types/game";
import { Localizer } from "client/localization/localizer";
import { nextOnboardingStep } from "client/ui/onboarding-policy";

export type ActionMode = "Harvest" | "Build" | "Blaster" | "Raid";
export type InputKind = "keyboard" | "gamepad" | "touch";
type MenuPage = "guide" | "craft" | "build" | "settings";
export interface UiActions {
  readonly selectMode: (mode: ActionMode) => void;
  readonly selectBuildPiece: (piece: BuildPieceId) => void;
  readonly craft: (recipe: RecipeId) => void;
  readonly useBandage: () => void;
  readonly performAction: () => void;
  readonly rotateBuild: () => void;
  readonly menuVisibilityChanged: (visible: boolean) => void;
}

const COLORS = {
  background: Color3.fromRGB(19, 27, 33),
  panel: Color3.fromRGB(33, 45, 52),
  text: Color3.fromRGB(241, 244, 240),
  muted: Color3.fromRGB(183, 197, 199),
  accent: Color3.fromRGB(114, 210, 204),
  success: Color3.fromRGB(157, 212, 143),
  warning: Color3.fromRGB(240, 202, 133),
  danger: Color3.fromRGB(246, 137, 123),
};
const MODES: ReadonlyArray<ActionMode> = ["Harvest", "Build", "Blaster", "Raid"];
const MODE_KEYS: Record<ActionMode, LocalizationKey> = {
  Harvest: "ui.mode.harvest",
  Build: "ui.mode.build",
  Blaster: "ui.mode.blaster",
  Raid: "ui.mode.raid",
};
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
} as const;
const TUTORIAL_STEPS: ReadonlyArray<[LocalizationKey, LocalizationKey]> = [
  ["tutorial.step1.title", "tutorial.step1.body"],
  ["tutorial.step2.title", "tutorial.step2.body"],
  ["tutorial.step3.title", "tutorial.step3.body"],
  ["tutorial.step4.title", "tutorial.step4.body"],
  ["tutorial.step5.title", "tutorial.step5.body"],
];

function corner(parent: GuiObject, radius = 10): void {
  const value = new Instance("UICorner");
  value.CornerRadius = new UDim(0, radius);
  value.Parent = parent;
}
function panel(name: string, parent: Instance): Frame {
  const frame = new Instance("Frame");
  frame.Name = name;
  frame.BorderSizePixel = 0;
  frame.BackgroundColor3 = COLORS.background;
  frame.BackgroundTransparency = 0.08;
  frame.Parent = parent;
  corner(frame);
  return frame;
}
function text(name: string, parent: Instance, size = 14): TextLabel {
  const label = new Instance("TextLabel");
  label.Name = name;
  label.BackgroundTransparency = 1;
  label.Font = Enum.Font.GothamMedium;
  label.TextColor3 = COLORS.text;
  label.TextSize = size;
  label.TextWrapped = true;
  label.TextXAlignment = Enum.TextXAlignment.Left;
  label.Text = "";
  label.Parent = parent;
  return label;
}
function button(name: string, parent: Instance, activate: () => void): TextButton {
  const result = new Instance("TextButton");
  result.Name = name;
  result.AutoButtonColor = true;
  result.BackgroundColor3 = COLORS.panel;
  result.BorderSizePixel = 0;
  result.Font = Enum.Font.GothamBold;
  result.TextSize = 14;
  result.TextColor3 = COLORS.text;
  result.TextWrapped = true;
  result.Selectable = true;
  result.Activated.Connect(activate);
  result.Parent = parent;
  corner(result, 8);
  const outline = new Instance("UIStroke");
  outline.Color = COLORS.accent;
  outline.Thickness = 2;
  outline.Transparency = 1;
  outline.ApplyStrokeMode = Enum.ApplyStrokeMode.Border;
  outline.Parent = result;
  result.SelectionGained.Connect(() => {
    outline.Transparency = 0;
  });
  result.SelectionLost.Connect(() => {
    outline.Transparency = 1;
  });
  return result;
}

/** HUD anchors remain in viewport coordinates; only the menu content scrolls on small screens. */
export class UiController {
  public readonly localizer = new Localizer();
  private readonly screenGui = new Instance("ScreenGui");
  private readonly aimGui = new Instance("ScreenGui");
  private readonly root = new Instance("Frame");
  private readonly menuOverlay: Frame;
  private readonly menuCard: Frame;
  private readonly matchPanel: Frame;
  private readonly taskPanel: Frame;
  private readonly actionBar = new Instance("Frame");
  private readonly modeButtons = new Map<ActionMode, TextButton>();
  private readonly tabButtons = new Map<MenuPage, TextButton>();
  private readonly pageFrames = new Map<MenuPage, ScrollingFrame>();
  private readonly craftButtons = new Map<RecipeId, TextButton>();
  private readonly buildButtons = new Map<BuildPieceId, TextButton>();
  private readonly pageSelections = new Map<MenuPage, Array<TextButton>>();
  private readonly guideLabels = new Array<[TextLabel, LocalizationKey]>();
  private readonly phaseLabel: TextLabel;
  private readonly timerLabel: TextLabel;
  private readonly playerLabel: TextLabel;
  private readonly taskLabel: TextLabel;
  private readonly resourcesLabel: TextLabel;
  private readonly inputHint: TextLabel;
  private readonly targetHint: TextLabel;
  private readonly healthLabel: TextLabel;
  private readonly toastLabel: TextLabel;
  private readonly crosshair: TextLabel;
  private readonly hitMarker: TextLabel;
  private readonly kitButton: TextButton;
  private readonly helpButton: TextButton;
  private readonly actionButton: TextButton;
  private readonly rotateButton: TextButton;
  private readonly patchButton: TextButton;
  private readonly closeButton: TextButton;
  private readonly motionButton: TextButton;
  private readonly guideStart: TextButton;
  private readonly guideControls: TextLabel;
  private readonly guideGoal: TextLabel;
  private readonly inventoryLabel: TextLabel;
  private readonly menuHint: TextLabel;
  private readonly settingsHelp: TextLabel;
  private currentSnapshot: PlayerSnapshot | undefined;
  private selectedMode: ActionMode = "Harvest";
  private selectedBuild: BuildPieceId = "foundation";
  private menuPage: MenuPage = "guide";
  private inputKind: InputKind = "keyboard";
  private tutorialMatchId: number | undefined;
  private toastVersion = 0;
  private toastMessage: LocalizedMessage | undefined;
  private targetMessage: LocalizedMessage | undefined;
  private motionEnabled = true;
  private lastClock = "";
  private lastUiTick = 0;
  private cameraConnection: RBXScriptConnection | undefined;

  public constructor(private readonly actions: UiActions) {
    this.screenGui.Name = "WarWorldHUD";
    this.screenGui.ResetOnSpawn = false;
    this.screenGui.IgnoreGuiInset = false;
    this.screenGui.AutoLocalize = false;
    this.screenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
    this.screenGui.DisplayOrder = 10;
    this.screenGui.Parent = Players.LocalPlayer.WaitForChild("PlayerGui");
    this.root.Name = "ResponsiveRoot";
    this.root.BackgroundTransparency = 1;
    this.root.Size = UDim2.fromScale(1, 1);
    this.root.Parent = this.screenGui;
    this.aimGui.Name = "WarWorldAim";
    this.aimGui.ResetOnSpawn = false;
    this.aimGui.IgnoreGuiInset = true;
    this.aimGui.ScreenInsets = Enum.ScreenInsets.None;
    this.aimGui.DisplayOrder = 9;
    this.aimGui.AutoLocalize = false;
    this.aimGui.Parent = this.screenGui.Parent;
    this.crosshair = text("Crosshair", this.aimGui, 22);
    this.crosshair.Text = "+";
    this.crosshair.TextXAlignment = Enum.TextXAlignment.Center;
    this.crosshair.Size = UDim2.fromOffset(30, 30);
    this.crosshair.AnchorPoint = new Vector2(0.5, 0.5);
    this.crosshair.Position = UDim2.fromScale(0.5, 0.5);
    this.crosshair.TextStrokeTransparency = 0.6;
    this.hitMarker = text("HitMarker", this.aimGui, 32);
    this.hitMarker.TextXAlignment = Enum.TextXAlignment.Center;
    this.hitMarker.Size = UDim2.fromOffset(48, 48);
    this.hitMarker.Position = UDim2.fromScale(0.5, 0.5);
    this.hitMarker.AnchorPoint = new Vector2(0.5, 0.5);
    this.hitMarker.TextTransparency = 1;

    this.matchPanel = panel("MatchPanel", this.root);
    this.phaseLabel = text("Phase", this.matchPanel, 18);
    this.phaseLabel.Font = Enum.Font.GothamBold;
    this.phaseLabel.TextScaled = true;
    const phaseTextSize = new Instance("UITextSizeConstraint");
    phaseTextSize.MinTextSize = 11;
    phaseTextSize.MaxTextSize = 18;
    phaseTextSize.Parent = this.phaseLabel;
    this.phaseLabel.Position = UDim2.fromOffset(14, 6);
    this.phaseLabel.Size = new UDim2(1, -90, 0, 26);
    this.timerLabel = text("Clock", this.matchPanel, 20);
    this.timerLabel.TextColor3 = COLORS.accent;
    this.timerLabel.Position = new UDim2(1, -74, 0, 5);
    this.timerLabel.Size = UDim2.fromOffset(62, 28);
    this.timerLabel.TextXAlignment = Enum.TextXAlignment.Right;
    this.playerLabel = text("Team", this.matchPanel, 12);
    this.playerLabel.TextColor3 = COLORS.muted;
    this.playerLabel.Position = UDim2.fromOffset(14, 34);
    this.playerLabel.Size = new UDim2(1, -28, 0, 24);
    this.taskPanel = panel("NextStep", this.root);
    this.taskLabel = text("Objective", this.taskPanel, 14);
    this.taskLabel.Position = UDim2.fromOffset(12, 5);
    this.taskLabel.Size = new UDim2(1, -24, 1, -10);
    this.taskLabel.TextColor3 = COLORS.warning;
    this.resourcesLabel = text("Resources", this.root, 12);
    this.resourcesLabel.TextColor3 = COLORS.muted;
    this.resourcesLabel.TextXAlignment = Enum.TextXAlignment.Center;
    this.healthLabel = text("Health", this.root, 13);
    this.healthLabel.TextColor3 = COLORS.text;
    this.kitButton = button("Kit", this.root, () => this.toggleMenu());
    this.helpButton = button("TutorialHelp", this.root, () => this.toggleTutorial());
    this.helpButton.Text = "?";
    this.inputHint = text("InputHint", this.root, 12);
    this.inputHint.TextXAlignment = Enum.TextXAlignment.Center;
    this.inputHint.TextColor3 = COLORS.muted;
    this.targetHint = text("TargetHint", this.root, 14);
    this.targetHint.TextXAlignment = Enum.TextXAlignment.Center;
    this.targetHint.TextStrokeTransparency = 0.4;
    this.actionBar.Name = "ActionBar";
    this.actionBar.BackgroundTransparency = 1;
    this.actionBar.Parent = this.root;
    const actionLayout = new Instance("UIListLayout");
    actionLayout.FillDirection = Enum.FillDirection.Horizontal;
    actionLayout.SortOrder = Enum.SortOrder.LayoutOrder;
    actionLayout.Padding = new UDim(0, 6);
    actionLayout.Parent = this.actionBar;
    MODES.forEach((mode, index) => {
      const value = button(mode, this.actionBar, () => this.actions.selectMode(mode));
      value.LayoutOrder = index;
      this.modeButtons.set(mode, value);
    });
    this.actionButton = button("MobileAction", this.root, () => this.actions.performAction());
    this.actionButton.BackgroundColor3 = COLORS.accent;
    this.actionButton.TextColor3 = COLORS.background;
    this.rotateButton = button("Rotate", this.root, () => this.actions.rotateBuild());
    this.patchButton = button("Patch", this.root, () => this.actions.useBandage());
    this.toastLabel = text("Toast", this.root, 14);
    this.toastLabel.BackgroundColor3 = COLORS.background;
    this.toastLabel.BackgroundTransparency = 0.12;
    this.toastLabel.TextXAlignment = Enum.TextXAlignment.Center;
    this.toastLabel.Visible = false;
    // Crafting feedback must remain readable above our menu overlay (ZIndex 30).
    this.toastLabel.ZIndex = 40;
    corner(this.toastLabel);

    this.menuOverlay = panel("TutorialOverlay", this.root);
    this.menuOverlay.Size = UDim2.fromScale(1, 1);
    this.menuOverlay.BackgroundTransparency = 0.18;
    this.menuOverlay.ZIndex = 30;
    this.menuOverlay.Active = true;
    this.menuCard = panel("KitMenu", this.menuOverlay);
    this.menuCard.AnchorPoint = new Vector2(0.5, 0.5);
    this.menuCard.Position = UDim2.fromScale(0.5, 0.5);
    this.menuCard.BackgroundTransparency = 0;
    this.menuCard.ZIndex = 31;
    this.closeButton = button("CloseMenu", this.menuCard, () => this.closeMenu());
    this.closeButton.Position = new UDim2(1, -100, 0, 12);
    this.closeButton.Size = UDim2.fromOffset(88, 38);
    this.closeButton.ZIndex = 32;
    const title = text("Brand", this.menuCard, 19);
    title.Text = "WAR WORLD";
    title.Font = Enum.Font.GothamBold;
    title.Position = UDim2.fromOffset(18, 12);
    title.Size = new UDim2(1, -138, 0, 36);
    title.ZIndex = 32;
    (["guide", "craft", "build", "settings"] as const).forEach((page, index) => {
      const tab = button(page, this.menuCard, () => this.openPage(page));
      tab.Position = new UDim2(index * 0.25, 12, 0, 62);
      tab.Size = new UDim2(0.25, -18, 0, 42);
      tab.ZIndex = 32;
      this.tabButtons.set(page, tab);
      const scroller = new Instance("ScrollingFrame");
      scroller.Name = `${page}Page`;
      scroller.Position = UDim2.fromOffset(16, 116);
      scroller.Size = new UDim2(1, -32, 1, -176);
      scroller.BackgroundTransparency = 1;
      scroller.BorderSizePixel = 0;
      scroller.AutomaticCanvasSize = Enum.AutomaticSize.Y;
      scroller.CanvasSize = new UDim2();
      scroller.ScrollBarThickness = 5;
      scroller.ScrollBarImageColor3 = COLORS.muted;
      scroller.ScrollingDirection = Enum.ScrollingDirection.Y;
      scroller.ZIndex = 32;
      scroller.Parent = this.menuCard;
      const list = new Instance("UIListLayout");
      list.Padding = new UDim(0, 10);
      list.SortOrder = Enum.SortOrder.LayoutOrder;
      list.Parent = scroller;
      this.pageFrames.set(page, scroller);
      this.pageSelections.set(page, []);
    });
    this.menuHint = text("MenuControls", this.menuCard, 12);
    this.menuHint.Position = new UDim2(0, 16, 1, -50);
    this.menuHint.Size = new UDim2(1, -32, 0, 44);
    this.menuHint.TextColor3 = COLORS.muted;
    this.menuHint.ZIndex = 32;
    const guide = this.pageFrames.get("guide")!;
    this.guideGoal = this.menuLabel("CurrentTask", guide, 62, 0, 16);
    this.guideGoal.TextColor3 = COLORS.warning;
    this.guideControls = this.menuLabel("Controls", guide, 90, 1, 14);
    TUTORIAL_STEPS.forEach(([heading, body], index) => {
      const header = this.menuLabel(`Heading${index}`, guide, 34, index * 2 + 2, 18);
      header.Font = Enum.Font.GothamBold;
      const description = this.menuLabel(`Body${index}`, guide, 90, index * 2 + 3, 14);
      description.TextColor3 = COLORS.muted;
      this.guideLabels.push([header, heading], [description, body]);
    });
    this.guideStart = this.menuButton("Start", "guide", 20, () => this.closeMenu());
    const craft = this.pageFrames.get("craft")!;
    this.inventoryLabel = this.menuLabel("Inventory", craft, 120, 0, 14);
    this.inventoryLabel.TextColor3 = COLORS.muted;
    this.inventoryLabel.Size = new UDim2(1, -12, 0, 0);
    this.inventoryLabel.AutomaticSize = Enum.AutomaticSize.Y;
    RECIPE_IDS.forEach((recipeId, index) => {
      const value = this.menuButton(`Craft_${recipeId}`, "craft", index + 1, () => {
        if (this.canAfford(RECIPES[recipeId].ingredients)) this.actions.craft(recipeId);
        else this.showToast(localized("toast.insufficient_resources"), "Warning");
      });
      this.craftButtons.set(recipeId, value);
    });
    BUILD_PIECE_IDS.forEach((pieceId, index) => {
      const value = this.menuButton(`Build_${pieceId}`, "build", index, () => {
        this.actions.selectBuildPiece(pieceId);
        this.closeMenu();
      });
      this.buildButtons.set(pieceId, value);
    });
    this.motionButton = this.menuButton("Motion", "settings", 0, () => {
      this.motionEnabled = !this.motionEnabled;
      this.refreshLocalization();
    });
    this.settingsHelp = this.menuLabel("MotionHelp", this.pageFrames.get("settings")!, 100, 1, 14);
    this.settingsHelp.TextColor3 = COLORS.muted;
    this.localizer.changed.Event.Connect(() => this.refreshLocalization());
    this.root.GetPropertyChangedSignal("AbsoluteSize").Connect(() => this.layout());
    Workspace.GetPropertyChangedSignal("CurrentCamera").Connect(() => this.watchCamera());
    this.watchCamera();
    this.refreshLocalization();
    this.setMenuVisible(true);
    this.openPage("guide");
    RunService.Heartbeat.Connect(() => {
      if (os.clock() - this.lastUiTick < 0.2) return;
      this.lastUiTick = os.clock();
      this.updateClockAndHealth();
    });
  }

  public setInputKind(kind: InputKind): void {
    if (kind === this.inputKind) return;
    this.inputKind = kind;
    this.refreshLocalization();
    this.layout();
    this.configureSelection();
  }
  public isMenuOpen(): boolean {
    return this.menuOverlay.Visible;
  }
  public isTutorialOpen(): boolean {
    return this.isMenuOpen() && this.menuPage === "guide";
  }
  public allowsWeaponMotion(): boolean {
    return this.motionEnabled;
  }
  public closeMenu(): void {
    this.setMenuVisible(false);
  }
  public toggleMenu(): void {
    if (this.isMenuOpen()) this.closeMenu();
    else this.openPage("craft");
  }
  public toggleTutorial(): void {
    if (this.isTutorialOpen()) this.closeMenu();
    else this.openPage("guide");
  }
  public restoreSelection(): void {
    this.configureSelection();
  }
  public scrollMenu(amount: number): void {
    if (!this.isMenuOpen() || amount === 0) return;
    const page = this.pageFrames.get(this.menuPage)!;
    page.CanvasPosition = new Vector2(
      0,
      math.clamp(
        page.CanvasPosition.Y + amount,
        0,
        math.max(0, page.AbsoluteCanvasSize.Y - page.AbsoluteWindowSize.Y),
      ),
    );
  }
  public setPointerMode(released: boolean): void {
    this.kitButton.Modal = released && !this.isMenuOpen();
  }
  public setAimVisible(visible: boolean): void {
    this.aimGui.Enabled = visible;
    this.targetHint.Visible = visible;
  }
  public itemName(item: ItemId): string {
    return this.localizer.text(ITEM_KEYS[item]);
  }
  public amount(item: ItemId): number {
    return this.currentSnapshot?.inventory.find((entry) => entry.itemId === item)?.amount ?? 0;
  }
  public canAfford(
    costs: ReadonlyArray<{ readonly itemId: ItemId; readonly amount: number }>,
  ): boolean {
    return costs.every((cost) => this.amount(cost.itemId) >= cost.amount);
  }

  public setSnapshot(snapshot: PlayerSnapshot): void {
    const previous = this.currentSnapshot;
    this.currentSnapshot = snapshot;
    const newMatch =
      this.tutorialMatchId !== undefined &&
      math.abs(snapshot.match.matchEndsAt - this.tutorialMatchId) > 1;
    if (this.tutorialMatchId === undefined || newMatch) {
      this.tutorialMatchId = snapshot.match.matchEndsAt;
      if (snapshot.match.phase === "Scavenge") this.openPage("guide");
    }
    if (previous !== undefined && !newMatch) {
      const gained = snapshot.inventory.find(
        (entry) =>
          entry.itemId !== "multi_tool" &&
          entry.amount >
            (previous.inventory.find((old) => old.itemId === entry.itemId)?.amount ?? 0),
      );
      if (gained !== undefined) {
        const before =
          previous.inventory.find((entry) => entry.itemId === gained.itemId)?.amount ?? 0;
        this.showToast(
          localized("ui.resource_gain", {
            amount: gained.amount - before,
            item: this.itemName(gained.itemId),
          }),
          "Success",
        );
      }
    }
    this.refreshSnapshotText();
    this.refreshCosts();
    this.updateClockAndHealth();
  }
  public setMode(mode: ActionMode): void {
    this.selectedMode = mode;
    this.refreshModeButtons();
    this.layout();
  }
  public setBuildPiece(piece: BuildPieceId): void {
    this.selectedBuild = piece;
    this.refreshCosts();
  }
  public setTargetHint(message: LocalizedMessage | undefined, valid = true): void {
    this.targetMessage = message;
    this.targetHint.Text = message === undefined ? "" : this.localizer.message(message);
    this.targetHint.TextColor3 = valid ? COLORS.text : COLORS.warning;
    this.crosshair.TextColor3 = valid ? COLORS.text : COLORS.warning;
  }
  public showToast(message: LocalizedMessage, tone: ToastTone): void {
    this.toastMessage = message;
    this.toastVersion += 1;
    const version = this.toastVersion;
    this.toastLabel.Text = this.localizer.message(message);
    this.toastLabel.Visible = true;
    this.toastLabel.TextColor3 =
      tone === "Danger"
        ? COLORS.danger
        : tone === "Warning"
          ? COLORS.warning
          : tone === "Success"
            ? COLORS.success
            : COLORS.text;
    task.delay(3.2, () => {
      if (this.toastVersion === version) {
        this.toastLabel.Visible = false;
        this.toastMessage = undefined;
      }
    });
  }
  public showHitConfirm(eliminated: boolean): void {
    this.hitMarker.Text = eliminated ? "✦" : "×";
    this.hitMarker.TextTransparency = 0;
    this.hitMarker.TextColor3 = eliminated ? COLORS.warning : COLORS.text;
    TweenService.Create(this.hitMarker, new TweenInfo(0.3), { TextTransparency: 1 }).Play();
  }

  private menuLabel(
    name: string,
    parent: Instance,
    height: number,
    order: number,
    fontSize: number,
  ): TextLabel {
    const value = text(name, parent, fontSize);
    value.Size = new UDim2(1, -12, 0, height);
    value.AutomaticSize = Enum.AutomaticSize.Y;
    value.LayoutOrder = order;
    value.TextYAlignment = Enum.TextYAlignment.Center;
    value.ZIndex = 33;
    return value;
  }
  private menuButton(name: string, page: MenuPage, order: number, action: () => void): TextButton {
    const value = button(name, this.pageFrames.get(page)!, action);
    value.Size = new UDim2(1, -12, 0, 78);
    value.LayoutOrder = order;
    value.ZIndex = 33;
    this.pageSelections.get(page)!.push(value);
    return value;
  }
  private openPage(page: MenuPage): void {
    this.menuPage = page;
    this.pageFrames.get(page)!.CanvasPosition = Vector2.zero;
    for (const [key, frame] of this.pageFrames) frame.Visible = key === page;
    for (const [key, value] of this.tabButtons) {
      value.BackgroundColor3 = key === page ? COLORS.accent : COLORS.panel;
      value.TextColor3 = key === page ? COLORS.background : COLORS.text;
    }
    // GuiService cannot focus a button under the previous/hidden page.
    this.setMenuVisible(true);
  }
  private setMenuVisible(visible: boolean): void {
    this.menuOverlay.Visible = visible;
    this.closeButton.Modal = visible;
    this.actions.menuVisibilityChanged(visible);
    if (!visible && GuiService.SelectedObject?.IsDescendantOf(this.menuCard))
      GuiService.SelectedObject = undefined;
    this.configureSelection();
  }
  private configureSelection(): void {
    const values = [
      this.closeButton,
      ...[...this.tabButtons].map(([, value]) => value),
      ...(this.pageSelections.get(this.menuPage) ?? []),
    ];
    values.forEach((value, index) => {
      const before = values[(index + values.size() - 1) % values.size()]!;
      const after = values[(index + 1) % values.size()]!;
      value.NextSelectionUp = before;
      value.NextSelectionLeft = before;
      value.NextSelectionDown = after;
      value.NextSelectionRight = after;
    });
    if (this.inputKind === "gamepad" && this.isMenuOpen())
      GuiService.SelectedObject =
        this.menuPage === "guide"
          ? this.tabButtons.get("guide")
          : (this.pageSelections.get(this.menuPage)?.[0] ?? this.closeButton);
  }
  private refreshModeButtons(): void {
    MODES.forEach((mode, index) => {
      const value = this.modeButtons.get(mode)!;
      const prefix = this.inputKind === "keyboard" ? `${index + 1} · ` : "";
      value.Text = `${prefix}${this.localizer.text(MODE_KEYS[mode])}`;
      value.BackgroundColor3 = mode === this.selectedMode ? COLORS.accent : COLORS.panel;
      value.TextColor3 = mode === this.selectedMode ? COLORS.background : COLORS.text;
    });
  }
  private refreshLocalization(): void {
    this.kitButton.Text =
      this.inputKind === "keyboard"
        ? `V · ${this.localizer.text("ui.kit")}`
        : this.localizer.text("ui.kit");
    this.closeButton.Text = this.localizer.text("ui.close");
    this.actionButton.Text = this.localizer.text("ui.action");
    this.rotateButton.Text = this.localizer.text("ui.rotate");
    this.patchButton.Text = this.localizer.text("item.bandage");
    this.inputHint.Text = this.localizer.text(
      this.inputKind === "touch"
        ? "ui.hint.touch"
        : this.inputKind === "gamepad"
          ? "ui.hint.gamepad"
          : "ui.hint.keyboard",
    );
    this.guideControls.Text = this.localizer.text(
      this.inputKind === "touch"
        ? "ui.guide.touch"
        : this.inputKind === "gamepad"
          ? "ui.guide.gamepad"
          : "ui.guide.keyboard",
      {
        jump: this.gamepadKey(Enum.KeyCode.ButtonA, "A / ✕"),
        rotate: this.gamepadKey(Enum.KeyCode.ButtonY, "Y / △"),
        back: this.gamepadKey(Enum.KeyCode.ButtonB, "B / ○"),
      },
    );
    this.menuHint.Text =
      this.inputKind === "gamepad"
        ? this.localizer.text("ui.menu.gamepad", {
            confirm: this.gamepadKey(Enum.KeyCode.ButtonA, "A / ✕"),
            back: this.gamepadKey(Enum.KeyCode.ButtonB, "B / ○"),
          })
        : this.localizer.text("ui.next_task");
    this.guideStart.Text = this.localizer.text("tutorial.start");
    const tabs: Record<MenuPage, LocalizationKey> = {
      guide: "tutorial.guide",
      craft: "ui.crafting",
      build: "ui.building",
      settings: "ui.settings",
    };
    for (const [page, value] of this.tabButtons) value.Text = this.localizer.text(tabs[page]);
    for (const [label, key] of this.guideLabels) label.Text = this.localizer.text(key);
    this.motionButton.Text = this.localizer.text(
      this.motionEnabled ? "ui.motion_on" : "ui.motion_off",
    );
    this.settingsHelp.Text = this.localizer.text("ui.motion_help");
    this.refreshModeButtons();
    this.refreshSnapshotText();
    this.refreshCosts();
    if (this.toastMessage !== undefined)
      this.toastLabel.Text = this.localizer.message(this.toastMessage);
    if (this.targetMessage !== undefined)
      this.targetHint.Text = this.localizer.message(this.targetMessage);
  }
  private refreshSnapshotText(): void {
    const snapshot = this.currentSnapshot;
    if (snapshot === undefined) {
      this.phaseLabel.Text = this.localizer.text("ui.loading");
      this.taskLabel.Text = this.localizer.text("ui.waiting_server");
      return;
    }
    this.phaseLabel.Text = this.localizer.text(PHASE_KEYS[snapshot.match.phase]);
    const score =
      snapshot.teamScores.find((value) => value.teamName === snapshot.teamName)?.score ?? 0;
    this.playerLabel.Text = `${snapshot.teamName === "Unassigned" ? this.localizer.text("team.unassigned") : snapshot.teamName} · ${score} ${this.localizer.text("ui.points")} · ${this.localizer.text("ui.level")} ${snapshot.profile.level}`;
    this.taskLabel.Text = this.localizer.message(this.nextTask(snapshot));
    this.guideGoal.Text = this.taskLabel.Text;
    this.inventoryLabel.Text = `${this.localizer.text("ui.inventory")}\n${snapshot.inventory.map((entry) => `${this.itemName(entry.itemId)}: ${entry.amount}`).join(" · ")}`;
    this.resourcesLabel.Text = (["wood", "stone", "scrap", "energy_core"] as const)
      .map((item) => `${this.itemName(item)} ${this.amount(item)}`)
      .join("  ·  ");
    if (snapshot.teamDepot !== undefined)
      this.inventoryLabel.Text += `\n${this.localizer.text("ui.depot_status", { count: snapshot.teamDepot.storedCores, capacity: snapshot.teamDepot.capacity })}`;
  }
  private gamepadKey(key: Enum.KeyCode, fallback: string): string {
    const [success, result] = pcall(() => UserInputService.GetStringForKeyCode(key));
    if (!success || !typeIs(result, "string") || result === "") return fallback;
    const names: Record<string, string> = {
      ButtonA: "A",
      ButtonB: "B",
      ButtonY: "Y",
      ButtonCross: "✕",
      ButtonCircle: "○",
      ButtonSquare: "□",
      ButtonTriangle: "△",
    };
    return names[result] ?? result;
  }
  private nextTask(snapshot: PlayerSnapshot): LocalizedMessage {
    const step = nextOnboardingStep({
      phase: snapshot.match.phase,
      spectator: snapshot.isSpectator,
      cores: this.amount("energy_core"),
      storedCores: snapshot.teamDepot?.storedCores ?? 0,
      extractionProgress: snapshot.extractionProgress ?? 0,
      hasBlaster: this.amount("survival_blaster") > 0,
      wood: this.amount("wood"),
      scrap: this.amount("scrap"),
      structuresBuilt: snapshot.progress?.built ?? snapshot.buildCount ?? 0,
    });
    if (step === "extracting")
      return localized("ui.extraction_hold", {
        percent: math.floor((snapshot.extractionProgress ?? 0) * 100),
      });
    if (step === "extract")
      return localized("ui.task_extract", { count: this.amount("energy_core") });
    if (step === "gather")
      return localized("ui.task_resources", {
        wood: math.min(20, this.amount("wood")),
        scrap: math.min(15, this.amount("scrap")),
      });
    const keys = {
      spectator: "objective.spectator",
      complete: "objective.complete",
      withdraw: "ui.task_withdraw",
      deposit: "ui.task_deposit",
      craft: "ui.task_craft",
      build: "ui.task_build",
      recover: "ui.task_core",
    } as const;
    return localized(keys[step]);
  }
  private refreshCosts(): void {
    for (const [recipeId, value] of this.craftButtons) {
      const recipe = RECIPES[recipeId];
      const costs = recipe.ingredients
        .map(
          (cost) =>
            `${math.min(this.amount(cost.itemId), cost.amount)}/${cost.amount} ${this.itemName(cost.itemId)}`,
        )
        .join(" · ");
      value.Text = `${this.itemName(recipe.output.itemId)}\n${costs}${recipe.requiresWorkbench ? `\n${this.localizer.text("ui.need_workbench")}` : ""}`;
      value.TextColor3 = this.canAfford(recipe.ingredients) ? COLORS.text : COLORS.muted;
    }
    for (const [pieceId, value] of this.buildButtons) {
      const costs = BUILD_PIECES[pieceId].costs
        .map(
          (cost) =>
            `${math.min(this.amount(cost.itemId), cost.amount)}/${cost.amount} ${this.itemName(cost.itemId)}`,
        )
        .join(" · ");
      value.Text = `${this.localizer.text(BUILD_KEYS[pieceId])}\n${costs}`;
      value.BackgroundColor3 =
        this.selectedBuild === pieceId ? Color3.fromRGB(47, 71, 69) : COLORS.panel;
      value.TextColor3 = this.canAfford(BUILD_PIECES[pieceId].costs) ? COLORS.text : COLORS.muted;
    }
  }
  private updateClockAndHealth(): void {
    const snapshot = this.currentSnapshot;
    if (snapshot !== undefined) {
      const seconds = math.max(
        0,
        math.floor(snapshot.match.phaseEndsAt - Workspace.GetServerTimeNow()),
      );
      const clock = `${math.floor(seconds / 60)}:${seconds % 60 < 10 ? "0" : ""}${seconds % 60}`;
      if (clock !== this.lastClock) {
        this.timerLabel.Text = clock;
        this.lastClock = clock;
      }
    }
    const humanoid = Players.LocalPlayer.Character?.FindFirstChildOfClass("Humanoid");
    this.healthLabel.Text = this.localizer.text("ui.health", {
      value: math.ceil(humanoid?.Health ?? 0),
    });
    this.healthLabel.TextColor3 = (humanoid?.Health ?? 0) < 35 ? COLORS.warning : COLORS.text;
  }
  private watchCamera(): void {
    this.cameraConnection?.Disconnect();
    this.cameraConnection = Workspace.CurrentCamera?.GetPropertyChangedSignal(
      "ViewportSize",
    ).Connect(() => this.layout());
    this.layout();
  }
  private layout(): void {
    const size = this.root.AbsoluteSize;
    const width = math.max(280, size.X);
    const height = math.max(240, size.Y);
    const compact = width < 760 || height < 500;
    const touch = this.inputKind === "touch";
    const panelWidth = math.min(compact ? width - 132 : 460, 460);
    this.matchPanel.Position = UDim2.fromOffset(12, 8);
    this.matchPanel.Size = UDim2.fromOffset(panelWidth, compact ? 54 : 64);
    this.phaseLabel.TextSize = compact ? 15 : 18;
    this.playerLabel.TextSize = compact ? 11 : 12;
    this.playerLabel.Position = UDim2.fromOffset(14, compact ? 28 : 34);
    this.kitButton.Position = new UDim2(1, -102, 0, 8);
    this.kitButton.Size = UDim2.fromOffset(90, 42);
    this.helpButton.Position = new UDim2(1, -52, 0, 58);
    this.helpButton.Size = UDim2.fromOffset(40, 38);
    this.taskPanel.Position = UDim2.fromOffset(12, compact ? 70 : 80);
    this.taskPanel.Size = UDim2.fromOffset(
      math.min(width - 86, compact ? 360 : 460),
      width < 450 ? 64 : compact ? 50 : 58,
    );
    this.taskLabel.TextSize = compact ? 13 : 14;
    this.resourcesLabel.Position = UDim2.fromOffset(12, compact ? 124 : 142);
    this.resourcesLabel.Size = UDim2.fromOffset(math.min(width - 24, 460), 30);
    this.resourcesLabel.Visible = !compact;
    this.healthLabel.Position = UDim2.fromOffset(12, width < 450 ? 139 : compact ? 123 : 172);
    this.healthLabel.Size = UDim2.fromOffset(160, 24);
    const barWidth = math.min(width - 24, compact ? 328 : 464);
    this.actionBar.AnchorPoint = new Vector2(0.5, 1);
    this.actionBar.Position = new UDim2(0.5, 0, 1, touch ? -8 : -16);
    this.actionBar.Size = UDim2.fromOffset(barWidth, compact ? 46 : 48);
    for (const [, value] of this.modeButtons) {
      value.Size = UDim2.fromOffset((barWidth - 18) / 4, compact ? 46 : 48);
      value.TextSize = compact ? 11 : 13;
    }
    this.inputHint.AnchorPoint = new Vector2(0.5, 1);
    this.inputHint.Position = new UDim2(0.5, 0, 1, compact ? -58 : -70);
    this.inputHint.Size = UDim2.fromOffset(math.min(width - 24, 620), 30);
    this.inputHint.Visible = !touch || !compact;
    this.targetHint.AnchorPoint = new Vector2(0.5, 0);
    this.targetHint.Position = UDim2.fromScale(0.5, 0.55);
    this.targetHint.Size = UDim2.fromOffset(math.min(width - 36, 420), 42);
    this.targetHint.TextSize = compact ? 13 : 14;
    this.actionButton.Visible = touch;
    this.actionButton.Size = UDim2.fromOffset(82, 56);
    this.actionButton.AnchorPoint = new Vector2(1, 1);
    this.actionButton.Position = new UDim2(1, -18, 1, -144);
    this.rotateButton.Visible = touch && this.selectedMode === "Build";
    this.rotateButton.Size = UDim2.fromOffset(76, 44);
    this.rotateButton.AnchorPoint = new Vector2(1, 1);
    this.rotateButton.Position = new UDim2(1, -20, 1, -210);
    this.patchButton.Visible = touch;
    this.patchButton.Size = UDim2.fromOffset(76, 44);
    this.patchButton.AnchorPoint = new Vector2(1, 1);
    this.patchButton.Position = new UDim2(1, -108, 1, -144);
    this.toastLabel.AnchorPoint = new Vector2(0.5, 0);
    this.toastLabel.Position = UDim2.fromScale(0.5, 0.72);
    this.toastLabel.Size = UDim2.fromOffset(math.min(width - 30, 520), 44);
    this.menuCard.Size = UDim2.fromOffset(math.min(width - 20, 700), math.min(height - 16, 620));
    for (const [, value] of this.tabButtons) value.TextSize = width < 450 ? 11 : 14;
  }
}
