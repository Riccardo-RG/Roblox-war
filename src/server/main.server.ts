import { Debris, Players } from "@rbxts/services";
import { MIN_MATCH_REWARD_PARTICIPATION_SECONDS } from "shared/catalog/match-config";
import { isBuildPieceId } from "shared/catalog/build-pieces";
import { isRecipeId } from "shared/catalog/recipes";
import {
  localized,
  sourceFor,
  type LocalizationKey,
  type LocalizedMessage,
} from "shared/localization/translations";
import type { ServerEvent, ToastTone } from "shared/network/protocol";
import type { MatchPhase, PlayerSnapshot } from "shared/types/game";
import { BuildingService } from "server/services/building-service";
import { CombatService } from "server/services/combat-service";
import { CraftingService } from "server/services/crafting-service";
import { ExtractionService } from "server/services/extraction-service";
import { DepotService } from "server/services/depot-service";
import { getCampPosition } from "server/world/world-layout";
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

// Hold character creation until world generation and profile ownership are ready.
Players.CharacterAutoLoads = false;

class WarWorldServer {
  private readonly network = new NetworkService();
  private readonly profiles = new ProfileStoreService((player) =>
    this.kickForProfile(player, "error.profile_session"),
  );
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
  private readonly depots: DepotService;
  private readonly worldEvents: WorldEventService;
  private readonly commandRateLimiter = new RateLimiter();
  private readonly reconnect = new ReconnectService();
  private previousPhase: MatchPhase = "Scavenge";
  private readonly joining = new Set<Player>();
  private readonly characterConnections = new Map<Player, RBXScriptConnection>();
  private readonly deathConnections = new Map<Player, RBXScriptConnection>();
  private readonly pendingSnapshots = new Set<Player>();
  private shuttingDown = false;

  public constructor(private readonly localizationTable: LocalizationTable) {
    this.teams.initialize();
    this.world.initialize(this.teams.all());

    const infoToast = (player: Player, message: LocalizedMessage) =>
      this.toast(player, message, "Info");
    this.resources = new ResourceService(
      this.playerState,
      infoToast,
      () => this.match.currentPhase() !== "Complete",
    );
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
        this.playerState.awardProgress(player, 10, 1);
        this.teams.addScore(player, 2);
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
      (player, origin, endpoint) => {
        for (const recipient of Players.GetPlayers()) {
          const root = recipient.Character?.FindFirstChild("HumanoidRootPart");
          if (
            recipient === player ||
            (root?.IsA("BasePart") &&
              math.min(
                root.Position.sub(origin).Magnitude,
                root.Position.sub(endpoint).Magnitude,
              ) <= 230)
          ) {
            this.network.send(recipient, {
              kind: "ShotEffect",
              origin,
              endpoint,
              shooterUserId: player.UserId,
            });
          }
        }
      },
      infoToast,
    );
    this.extraction = new ExtractionService(
      this.playerState,
      this.match,
      this.teams,
      infoToast,
      (player) => this.queueSnapshot(player),
    );
    this.depots = new DepotService(
      this.playerState,
      this.teams,
      this.match,
      infoToast,
      () => {
        for (const player of Players.GetPlayers()) this.queueSnapshot(player);
      },
      this.localizationTable,
    );
    this.worldEvents = new WorldEventService((message) => this.broadcastToast(message, "Warning"));
  }

  public start(): void {
    Players.CharacterAutoLoads = false;
    runCatalogSmokeTests();
    this.playerState.changed.Event.Connect((value: unknown) => {
      if (typeIs(value, "Instance") && value.IsA("Player")) {
        this.queueSnapshot(value);
      }
    });
    this.teams.changed.Event.Connect(() => {
      for (const player of Players.GetPlayers()) {
        this.queueSnapshot(player);
      }
    });

    this.network.setCommandHandler((player, payload) => this.handleCommand(player, payload));
    this.match.start(
      () => this.onPhaseChanged(),
      () => this.onMatchCompleted(),
    );
    this.npcs.start();
    this.extraction.start();
    this.depots.start();
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
      this.shuttingDown = true;
      this.profiles.beginShutdown();
      this.npcs.stop();
      let pendingSaves = 0;
      for (const player of Players.GetPlayers()) {
        const profile = this.playerState.get(player)?.profile;
        if (profile !== undefined) {
          pendingSaves += 1;
          task.spawn(() => {
            this.profiles.release(player, profile);
            pendingSaves -= 1;
          });
        }
      }
      const deadline = os.clock() + 25;
      while (
        (pendingSaves > 0 || this.profiles.hasPendingOperations() || !this.joining.isEmpty()) &&
        os.clock() < deadline
      ) {
        task.wait(0.1);
      }
    });

    print("[WAR WORLD] Release-candidate server started; runtime validation is required.");
  }

  private onPlayerAdded(player: Player): void {
    if (
      this.shuttingDown ||
      this.playerState.get(player) !== undefined ||
      this.joining.has(player)
    ) {
      return;
    }
    this.joining.add(player);
    const profile = this.profiles.load(player);
    this.joining.delete(player);
    if (profile === undefined) {
      if (player.Parent)
        this.kickForProfile(
          player,
          this.profiles.getLoadFailure(player) === "SessionInUse"
            ? "error.profile_locked"
            : "error.profile_load",
        );
      this.profiles.forgetFailedLoad(player);
      return;
    }
    if (!player.Parent || this.shuttingDown) {
      this.profiles.release(player, profile);
      return;
    }
    const reconnect = this.reconnect.take(player.UserId);
    if (reconnect !== undefined) {
      const assignedTeam = this.teams.assignNamed(player, reconnect.teamName);
      const restoredState = this.playerState.restoreFromReconnect(player, {
        ...reconnect.state,
        profile,
      });
      if (assignedTeam === undefined) {
        restoredState.isSpectator = true;
      }
      this.playerState.setBuildCount(player, this.building.countBuilds(player.UserId));
      this.bindCharacter(player);
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
    const isSpectator = assignedTeam === undefined || !this.match.canBackfill();
    this.playerState.initialize(
      player,
      profile,
      math.max(1, this.match.starterMultiplier()),
      isSpectator,
    );

    if (!isSpectator && this.match.currentPhase() !== "Scavenge")
      this.playerState.add(player, "survival_blaster", 1);
    this.bindCharacter(player);

    if (assignedTeam === undefined) {
      this.toast(player, localized("toast.teams_full"), "Warning");
    } else if (isSpectator) {
      this.toast(player, localized("toast.late_spectator"), "Warning");
    } else if (this.match.currentPhase() !== "Scavenge") {
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
        this.teams.reserve(player, 180);
      }
    }
    this.resources.removePlayer(player);
    this.crafting.removePlayer(player);
    this.building.removePlayer(player);
    this.combat.removePlayer(player);
    this.extraction.removePlayer(player);
    this.depots.removePlayer(player);
    this.characterConnections.get(player)?.Disconnect();
    this.deathConnections.get(player)?.Disconnect();
    this.characterConnections.delete(player);
    this.deathConnections.delete(player);
    this.pendingSnapshots.delete(player);
    this.commandRateLimiter.removePlayer(player);
    this.playerState.remove(player);
    if (state !== undefined) this.profiles.release(player, state.profile);
  }

  private bindCharacter(player: Player): void {
    this.characterConnections.get(player)?.Disconnect();
    this.characterConnections.set(
      player,
      player.CharacterAdded.Connect((character) => this.configureCharacter(player, character)),
    );
    task.spawn(() => {
      if (player.Parent && !this.shuttingDown) player.LoadCharacter();
    });
  }

  private configureCharacter(player: Player, character: Model): void {
    task.defer(() => {
      const state = this.playerState.get(player);
      const humanoidInstance = character.WaitForChild("Humanoid", 10);
      const root = character.WaitForChild("HumanoidRootPart", 10);
      const humanoid = humanoidInstance?.IsA("Humanoid") ? humanoidInstance : undefined;
      if (!player.Parent || player.Character !== character) return;
      if (root?.IsA("BasePart")) {
        const teamIndex = math.max(0, this.teams.all().indexOf(player.Team!));
        character.PivotTo(
          new CFrame(getCampPosition(teamIndex, this.teams.all().size()).add(new Vector3(0, 6, 0))),
        );
        root.Anchored = false;
      }
      if (state?.isSpectator && humanoid !== undefined && root?.IsA("BasePart")) {
        humanoid.WalkSpeed = 18;
        humanoid.AutoRotate = true;
      }
      if (
        humanoid !== undefined &&
        root?.IsA("BasePart") &&
        character.GetAttribute("EliminationHooked") !== true
      ) {
        character.SetAttribute("EliminationHooked", true);
        const shield = new Instance("ForceField");
        shield.Visible = false;
        shield.Parent = character;
        Debris.AddItem(shield, 3);
        this.deathConnections.get(player)?.Disconnect();
        this.deathConnections.set(
          player,
          humanoid.Died.Connect(() => {
            const latestState = this.playerState.get(player);
            if (latestState !== undefined && !latestState.isSpectator) {
              this.loot.dropFromElimination(player, root.Position);
              this.toast(player, localized("toast.eliminated_drop"), "Warning");
            }
            task.delay(4, () => {
              if (player.Parent && !this.shuttingDown && player.Character === character)
                player.LoadCharacter();
            });
          }),
        );
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
      this.depots.resetAll();
      this.teams.resetScores();
      for (const player of Players.GetPlayers()) {
        // An in-flight profile load owns initialization and the first character spawn.
        if (this.playerState.get(player) === undefined) continue;
        if (player.Team === undefined) {
          this.teams.assign(player);
        }
        this.playerState.resetForMatch(player, 1, player.Team === undefined);
        task.spawn(() => {
          if (player.Parent && !this.shuttingDown) player.LoadCharacter();
        });
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
      if (
        state === undefined ||
        state.isSpectator ||
        os.clock() - state.joinedAt < MIN_MATCH_REWARD_PARTICIPATION_SECONDS
      ) {
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
      buildCount: state.buildPartCount,
      progress: { ...state.progress },
      teamDepot: this.depots.snapshot(player),
      extractionProgress: this.extraction.progressFor(player),
    };
  }

  private sendSnapshot(player: Player): void {
    const snapshot = this.createSnapshot(player);
    if (snapshot !== undefined && player.Parent) {
      this.network.send(player, { kind: "Snapshot", snapshot });
    }
  }

  private queueSnapshot(player: Player): void {
    if (this.pendingSnapshots.has(player)) return;
    this.pendingSnapshots.add(player);
    task.defer(() => {
      this.pendingSnapshots.delete(player);
      if (player.Parent) this.sendSnapshot(player);
    });
  }

  private kickForProfile(player: Player, key: LocalizationKey): void {
    const [success, message] = pcall(() =>
      this.localizationTable.GetTranslator(player.LocaleId).FormatByKey(key, {}),
    );
    player.Kick(success && typeIs(message, "string") ? message : sourceFor(key));
  }

  private toast(player: Player, message: LocalizedMessage, tone: ToastTone): void {
    this.network.send(player, { kind: "Toast", message, tone });
  }

  private broadcastToast(message: LocalizedMessage, tone: ToastTone): void {
    this.network.sendAll({ kind: "Toast", message, tone });
  }
}

new WarWorldServer(installLocalizationTable()).start();
