import { Players } from "@rbxts/services";
import { isBuildPieceId } from "shared/catalog/build-pieces";
import { isRecipeId } from "shared/catalog/recipes";
import {
  localized,
  type LocalizationKey,
  type LocalizedMessage,
} from "shared/localization/translations";
import type { ServerEvent, ToastTone } from "shared/network/protocol";
import type { MatchPhase, PlayerSnapshot } from "shared/types/game";
import { BuildingService } from "server/services/building-service";
import { CombatService } from "server/services/combat-service";
import { CraftingService } from "server/services/crafting-service";
import { ExtractionService } from "server/services/extraction-service";
import { LootService } from "server/services/loot-service";
import { MatchService } from "server/services/match-service";
import { NetworkService } from "server/services/network-service";
import { NpcService } from "server/services/npc-service";
import { PlayerStateService } from "server/services/player-state-service";
import { ProfileStoreService } from "server/services/profile-store-service";
import { ReconnectService } from "server/services/reconnect-service";
import { ResourceService } from "server/services/resource-service";
import { RateLimiter } from "server/services/rate-limiter";
import { TeamService } from "server/services/team-service";
import { WorldBootstrapService } from "server/services/world-bootstrap-service";
import { WorldEventService } from "server/services/world-event-service";
import { runCatalogSmokeTests } from "server/tests/catalog-smoke-tests";
import { installLocalizationTable } from "server/localization/install-localization";

class WarWorldServer {
  private readonly network = new NetworkService();
  private readonly profiles = new ProfileStoreService();
  private readonly playerState = new PlayerStateService();
  private readonly teams = new TeamService();
  private readonly match = new MatchService();
  private readonly world = new WorldBootstrapService();
  private readonly resources: ResourceService;
  private readonly crafting: CraftingService;
  private readonly building: BuildingService;
  private readonly loot: LootService;
  private readonly npcs: NpcService;
  private readonly combat: CombatService;
  private readonly extraction: ExtractionService;
  private readonly worldEvents: WorldEventService;
  private readonly commandRateLimiter = new RateLimiter();
  private readonly reconnect = new ReconnectService();
  private previousPhase: MatchPhase = "Scavenge";

  public constructor(private readonly localizationTable: LocalizationTable) {
    this.teams.initialize();
    this.world.initialize(this.teams.all());

    const infoToast = (player: Player, message: LocalizedMessage) =>
      this.toast(player, message, "Info");
    this.resources = new ResourceService(this.playerState, infoToast);
    this.crafting = new CraftingService(this.playerState, infoToast);
    this.building = new BuildingService(
      this.playerState,
      this.teams,
      this.match,
      infoToast,
      this.localizationTable,
    );
    this.loot = new LootService(this.playerState, this.teams, infoToast, this.localizationTable);
    this.npcs = new NpcService(
      (player) => {
        this.playerState.awardProgress(player, 25, 5);
        this.teams.addScore(player, 10);
        this.toast(player, localized("toast.drone_neutralized"), "Success");
      },
      (player) => this.playerState.get(player)?.isSpectator === false,
    );
    this.combat = new CombatService(
      this.playerState,
      this.teams,
      this.match,
      this.npcs,
      (player, eliminated) => this.network.send(player, { kind: "HitConfirm", eliminated }),
      (player, origin, endpoint) =>
        this.network.sendAll({
          kind: "ShotEffect",
          origin,
          endpoint,
          shooterUserId: player.UserId,
        }),
      infoToast,
    );
    this.extraction = new ExtractionService(this.playerState, this.match, this.teams, infoToast);
    this.worldEvents = new WorldEventService((message) => this.broadcastToast(message, "Warning"));
  }

  public start(): void {
    runCatalogSmokeTests();
    this.playerState.changed.Event.Connect((value: unknown) => {
      if (typeIs(value, "Instance") && value.IsA("Player")) {
        this.sendSnapshot(value);
      }
    });
    this.teams.changed.Event.Connect(() => {
      for (const player of Players.GetPlayers()) {
        this.sendSnapshot(player);
      }
    });

    this.network.setCommandHandler((player, payload) => this.handleCommand(player, payload));
    this.match.start(
      () => this.onPhaseChanged(),
      () => this.onMatchCompleted(),
    );
    this.npcs.start();
    this.extraction.start();
    this.reconnect.startCleanup();

    Players.PlayerAdded.Connect((player) => task.spawn(() => this.onPlayerAdded(player)));
    Players.PlayerRemoving.Connect((player) => this.onPlayerRemoving(player));
    for (const player of Players.GetPlayers()) {
      task.spawn(() => this.onPlayerAdded(player));
    }

    this.profiles.startAutosave(
      () => Players.GetPlayers(),
      (player) => this.playerState.get(player)?.profile,
    );

    game.BindToClose(() => {
      this.profiles.beginShutdown();
      this.npcs.stop();
      let pendingSaves = 0;
      for (const player of Players.GetPlayers()) {
        const profile = this.playerState.get(player)?.profile;
        if (profile !== undefined) {
          pendingSaves += 1;
          task.spawn(() => {
            this.profiles.save(player, profile);
            pendingSaves -= 1;
          });
        }
      }
      const deadline = os.clock() + 25;
      while (pendingSaves > 0 && os.clock() < deadline) {
        task.wait(0.1);
      }
    });

    print("[WAR WORLD] Server vertical slice started.");
  }

  private onPlayerAdded(player: Player): void {
    if (this.playerState.get(player) !== undefined) {
      return;
    }

    const reconnect = this.reconnect.take(player.UserId);
    if (reconnect !== undefined) {
      const assignedTeam = this.teams.assignNamed(player, reconnect.teamName);
      const restoredState = this.playerState.restoreFromReconnect(player, reconnect.state);
      if (assignedTeam === undefined) {
        restoredState.isSpectator = true;
      }
      player.CharacterAdded.Connect((character) => this.configureCharacter(player, character));
      if (player.Character !== undefined) {
        this.configureCharacter(player, player.Character);
      }
      if (assignedTeam === undefined) {
        this.toast(player, localized("toast.reconnect_teams_full"), "Warning");
      } else if (assignedTeam.Name !== reconnect.teamName) {
        this.toast(
          player,
          localized("toast.reconnect_new_team", { team: assignedTeam.Name }),
          "Warning",
        );
      } else {
        this.toast(player, localized("toast.reconnect_success"), "Success");
      }
      this.sendSnapshot(player);
      return;
    }

    const assignedTeam = this.teams.assign(player);
    const profile = this.profiles.load(player);
    if (!player.Parent) {
      return;
    }

    const isSpectator = assignedTeam === undefined || !this.match.canBackfill();
    this.playerState.initialize(
      player,
      profile,
      math.max(1, this.match.starterMultiplier()),
      isSpectator,
    );

    player.CharacterAdded.Connect((character) => this.configureCharacter(player, character));
    if (player.Character !== undefined) {
      this.configureCharacter(player, player.Character);
    }

    if (assignedTeam === undefined) {
      this.toast(player, localized("toast.teams_full"), "Warning");
    } else if (isSpectator) {
      this.toast(player, localized("toast.late_spectator"), "Warning");
    } else if (this.match.currentPhase() === "Conflict") {
      this.toast(player, localized("toast.backfill"), "Success");
    } else {
      this.toast(player, localized("toast.welcome"), "Info");
    }
    this.sendSnapshot(player);
  }

  private onPlayerRemoving(player: Player): void {
    const state = this.playerState.get(player);
    if (state !== undefined) {
      const reconnectState = this.playerState.captureForReconnect(player);
      if (reconnectState !== undefined) {
        this.reconnect.remember(player.UserId, this.teams.nameFor(player), reconnectState);
      }
      this.profiles.save(player, state.profile);
    }
    this.resources.removePlayer(player);
    this.crafting.removePlayer(player);
    this.building.removePlayer(player);
    this.combat.removePlayer(player);
    this.extraction.removePlayer(player);
    this.commandRateLimiter.removePlayer(player);
    this.playerState.remove(player);
  }

  private configureCharacter(player: Player, character: Model): void {
    task.defer(() => {
      const state = this.playerState.get(player);
      const humanoidInstance = character.WaitForChild("Humanoid", 10);
      const root = character.WaitForChild("HumanoidRootPart", 10);
      const humanoid = humanoidInstance?.IsA("Humanoid") ? humanoidInstance : undefined;
      if (state?.isSpectator && humanoid !== undefined && root?.IsA("BasePart")) {
        root.CFrame = new CFrame(0, 85, 0);
        root.Anchored = true;
        humanoid.WalkSpeed = 0;
        humanoid.AutoRotate = false;
      }
      if (
        humanoid !== undefined &&
        root?.IsA("BasePart") &&
        character.GetAttribute("EliminationHooked") !== true
      ) {
        character.SetAttribute("EliminationHooked", true);
        humanoid.Died.Connect(() => {
          const latestState = this.playerState.get(player);
          if (latestState !== undefined && !latestState.isSpectator) {
            this.loot.dropFromElimination(player, root.Position);
            this.toast(player, localized("toast.eliminated_drop"), "Warning");
          }
        });
      }
    });
  }

  private handleCommand(player: Player, payload: unknown): void {
    if (!this.commandRateLimiter.allow(player, "AnyCommand", 0.015)) {
      return;
    }
    if (!typeIs(payload, "table")) {
      return;
    }
    const command = payload as Record<string, unknown>;
    const kind = command.kind;
    if (!typeIs(kind, "string")) {
      return;
    }

    switch (kind) {
      case "Ready":
        if (this.commandRateLimiter.allow(player, "Ready", 1)) {
          this.sendSnapshot(player);
        }
        break;
      case "Harvest": {
        const target = command.target;
        if (typeIs(target, "Instance")) {
          this.resources.harvest(player, target);
        }
        break;
      }
      case "Craft": {
        const recipeId = command.recipeId;
        if (isRecipeId(recipeId)) {
          this.crafting.craft(player, recipeId);
        }
        break;
      }
      case "PlaceBuild": {
        const pieceId = command.pieceId;
        const cframe = command.cframe;
        if (isBuildPieceId(pieceId) && typeIs(cframe, "CFrame")) {
          this.building.place(player, pieceId, cframe);
        }
        break;
      }
      case "FireWeapon": {
        const weaponId = command.weaponId;
        const origin = command.origin;
        const direction = command.direction;
        const sequence = command.sequence;
        if (
          weaponId === "survival_blaster" &&
          typeIs(origin, "Vector3") &&
          typeIs(direction, "Vector3") &&
          typeIs(sequence, "number") &&
          sequence === sequence
        ) {
          this.combat.fire(player, origin, direction, sequence);
        }
        break;
      }
      case "UseBreach": {
        const target = command.target;
        if (typeIs(target, "Instance")) {
          this.building.breach(player, target);
        }
        break;
      }
      case "UseBandage":
        this.combat.useBandage(player);
        break;
      default:
        break;
    }
  }

  private onPhaseChanged(): void {
    const current = this.match.currentPhase();
    this.worldEvents.onPhaseChanged(current);
    if (current === "Scavenge" && this.previousPhase === "Complete") {
      this.reconnect.clear();
      this.building.resetAll();
      this.loot.resetAll();
      this.resources.resetAll();
      this.npcs.resetAll();
      this.teams.resetScores();
      for (const player of Players.GetPlayers()) {
        if (player.Team === undefined) {
          this.teams.assign(player);
        }
        this.playerState.resetForMatch(player, 1, player.Team === undefined);
        player.LoadCharacter();
      }
    }
    this.previousPhase = current;

    for (const player of Players.GetPlayers()) {
      const snapshot = this.createSnapshot(player);
      if (snapshot !== undefined) {
        const event: ServerEvent = { kind: "PhaseChanged", snapshot };
        this.network.send(player, event);
      }
    }

    const phaseMessage: Record<MatchPhase, LocalizationKey> = {
      Scavenge: "toast.phase.scavenge",
      Conflict: "toast.phase.conflict",
      Raid: "toast.phase.raid",
      Extraction: "toast.phase.extraction",
      Complete: "toast.phase.complete",
    };
    this.broadcastToast(localized(phaseMessage[current]), current === "Raid" ? "Danger" : "Info");
  }

  private onMatchCompleted(): void {
    for (const player of Players.GetPlayers()) {
      const state = this.playerState.get(player);
      if (state === undefined || state.isSpectator) {
        continue;
      }
      this.playerState.recordMatchCompleted(player);
      this.playerState.awardProgress(player, 100, 25);
    }
    const standings = this.teams.scoreSnapshot();
    const winner = standings[0];
    if (winner !== undefined && winner.score > 0) {
      const tiedTeams = standings.filter((entry) => entry.score === winner.score);
      if (tiedTeams.size() > 1) {
        this.broadcastToast(
          localized("toast.tie", {
            teams: tiedTeams.map((entry) => entry.teamName).join(", "),
            score: winner.score,
          }),
          "Success",
        );
      } else {
        this.broadcastToast(
          localized("toast.winner", { team: winner.teamName, score: winner.score }),
          "Success",
        );
      }
    } else {
      this.broadcastToast(localized("toast.no_extraction"), "Info");
    }
  }

  private createSnapshot(player: Player): PlayerSnapshot | undefined {
    const state = this.playerState.get(player);
    const profile = this.playerState.publicProfile(player);
    if (state === undefined || profile === undefined) {
      return undefined;
    }

    return {
      inventory: this.playerState.inventorySnapshot(player),
      profile,
      teamName: this.teams.nameFor(player),
      isSpectator: state.isSpectator,
      match: this.match.snapshot(),
      teamScores: this.teams.scoreSnapshot(),
    };
  }

  private sendSnapshot(player: Player): void {
    const snapshot = this.createSnapshot(player);
    if (snapshot !== undefined && player.Parent) {
      this.network.send(player, { kind: "Snapshot", snapshot });
    }
  }

  private toast(player: Player, message: LocalizedMessage, tone: ToastTone): void {
    this.network.send(player, { kind: "Toast", message, tone });
  }

  private broadcastToast(message: LocalizedMessage, tone: ToastTone): void {
    this.network.sendAll({ kind: "Toast", message, tone });
  }
}

new WarWorldServer(installLocalizationTable()).start();
