/**
 * Runs the actual TypeScript services with deterministic Roblox service adapters.
 * This exercises mutation/ownership policies, not Roblox physics, scheduling or
 * live DataStore guarantees. Studio multi-client and published test-place QA is
 * still required; see the release test plan.
 */
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let now = 1000;
let studio = false;
let guid = 0;
let beforeErrors = 0;
let afterErrors = 0;
let writes = 0;
let onWait;
let raycastResult;
let spherecastResult;
let lastRayOrigin;
let delayed = [];
let spawned = [];
let resourceNodes = [];
const records = new Map();
class RobloxMap extends Map {
  isEmpty() {
    return this.size === 0;
  }
}
class RobloxSet extends Set {
  isEmpty() {
    return this.size === 0;
  }
}
const datastore = {
  UpdateAsync(key, update) {
    if (beforeErrors > 0) {
      beforeErrors -= 1;
      throw new Error("Simulated service unavailable");
    }
    const result = update(structuredClone(records.get(key)));
    if (result[0] !== undefined) {
      records.set(key, structuredClone(result[0]));
      writes += 1;
    }
    if (afterErrors > 0) {
      afterErrors -= 1;
      throw new Error("Simulated committed write with lost acknowledgement");
    }
    return [structuredClone(result[0])];
  },
};

class Vector3 {
  constructor(X = 0, Y = 0, Z = 0) {
    Object.assign(this, { X, Y, Z });
  }
  sub(other) {
    return new Vector3(this.X - other.X, this.Y - other.Y, this.Z - other.Z);
  }
  add(other) {
    return new Vector3(this.X + other.X, this.Y + other.Y, this.Z + other.Z);
  }
  mul(amount) {
    return new Vector3(this.X * amount, this.Y * amount, this.Z * amount);
  }
  get Magnitude() {
    return Math.hypot(this.X, this.Y, this.Z);
  }
  get Unit() {
    return this.mul(1 / this.Magnitude);
  }
}

class Signal {
  listeners = new Set();
  Connect(callback) {
    this.listeners.add(callback);
    return { Disconnect: () => this.listeners.delete(callback) };
  }
  Once(callback) {
    const connection = this.Connect((...args) => {
      connection.Disconnect();
      callback(...args);
    });
    return connection;
  }
  Fire(...args) {
    for (const callback of [...this.listeners]) callback(...args);
  }
}

const instances = [];
class Instance {
  constructor(className) {
    this.ClassName = className;
    this.attributes = new Map();
    this.Event = new Signal();
    this.PromptButtonHoldBegan = new Signal();
    this.PromptButtonHoldEnded = new Signal();
    this.Triggered = new Signal();
    this.Destroying = new Signal();
    instances.push(this);
  }
  IsA(className) {
    return this.ClassName === className || (className === "BasePart" && this.ClassName === "Part");
  }
  GetAttribute(name) {
    return this.attributes.get(name);
  }
  SetAttribute(name, value) {
    this.attributes.set(name, value);
  }
  IsDescendantOf() {
    return true;
  }
  Fire(...values) {
    this.Event.Fire(...values);
  }
  get Position() {
    return this.CFrame?.Position ?? new Vector3();
  }
}

class CFrame {
  constructor(position = new Vector3()) {
    this.Position = position;
  }
  static lookAt(position) {
    return new CFrame(position);
  }
  PointToObjectSpace(point) {
    return point.sub(this.Position);
  }
}

const worldFolder = {
  WaitForChild() {
    return this;
  },
};
const services = {
  DataStoreService: { GetDataStore: () => datastore },
  HttpService: { GenerateGUID: () => `owner-${++guid}` },
  RunService: { IsStudio: () => studio },
  Players: { GetPlayerFromCharacter: (character) => character.player },
  CollectionService: { HasTag: () => true, GetTagged: () => resourceNodes, AddTag() {} },
  Workspace: {
    WaitForChild: () => worldFolder,
    GetServerTimeNow: () => now,
    GetAttribute: () => "Conflict",
    Raycast(origin) {
      lastRayOrigin = origin;
      return raycastResult;
    },
    Spherecast: () => spherecastResult,
  },
};
const moduleCache = new Map();
function load(relativePath) {
  if (moduleCache.has(relativePath)) return moduleCache.get(relativePath);
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      require(id) {
        if (id === "@rbxts/services") return services;
        if (id === "shared/localization/translations")
          return { localized: (key, args) => ({ key, args }), sourceFor: (key) => key };
        if (id === "server/world/world-layout") return { getCampPosition: () => new Vector3() };
        return load(`src/${id}.ts`);
      },
      Map: RobloxMap,
      Set,
      Vector3,
      Instance,
      RaycastParams: class {},
      Color3: { fromRGB: (...value) => value },
      CFrame,
      UDim2: { fromOffset: (...values) => values, fromScale: (...values) => values },
      Enum: {
        RaycastFilterType: { Exclude: "Exclude" },
        Material: { Metal: "Metal", SmoothPlastic: "SmoothPlastic" },
        Font: { GothamMedium: "GothamMedium" },
        KeyCode: { E: "E", ButtonX: "ButtonX" },
      },
      math: {
        floor: Math.floor,
        abs: Math.abs,
        max: Math.max,
        min: Math.min,
        huge: Infinity,
        clamp: (v, a, b) => Math.max(a, Math.min(v, b)),
      },
      os: { time: () => Math.floor(now), clock: () => now },
      game: { JobId: "simulated-server" },
      task: {
        wait(seconds) {
          now += seconds;
          const hook = onWait;
          onWait = undefined;
          hook?.();
        },
        delay(seconds, callback) {
          delayed.push(callback);
        },
        spawn(callback) {
          spawned.push(callback);
        },
      },
      warn() {},
      $tuple: (...values) => values,
      typeIs: (value, type) =>
        type === "table" ? typeof value === "object" && value !== null : typeof value === type,
      pcall(callback) {
        try {
          return [true, callback()];
        } catch (error) {
          return [false, error];
        }
      },
    },
    { filename: relativePath },
  );
  moduleCache.set(relativePath, module.exports);
  return module.exports;
}

const { ProfileStoreService } = load("src/server/services/profile-store-service.ts");
const { CombatService } = load("src/server/services/combat-service.ts");
const { NpcService } = load("src/server/services/npc-service.ts");
const { ResourceService } = load("src/server/services/resource-service.ts");
const { PlayerStateService } = load("src/server/services/player-state-service.ts");
const { DepotService } = load("src/server/services/depot-service.ts");
const { ExtractionService } = load("src/server/services/extraction-service.ts");
const { RateLimiter } = load("src/server/services/rate-limiter.ts");
const combatPolicy = load("src/shared/util/combat-policy.ts");
const sessionPolicy = load("src/shared/util/profile-session-policy.ts");
const { inputContext } = load("src/client/controllers/input-policy.ts");
const { nextOnboardingStep } = load("src/client/ui/onboarding-policy.ts");
const { RECIPES } = load("src/shared/catalog/recipes.ts");
function player(id) {
  return {
    UserId: id,
    Parent: services.Players,
    Kick(message) {
      this.kicked = message;
    },
  };
}
let tests = 0;
function test(name, run) {
  run();
  tests += 1;
  console.log(`PASS ${name}`);
}

test("fresh profile claims a lease and release saves progression", () => {
  const service = new ProfileStoreService();
  const p = player(1);
  const profile = service.load(p);
  assert.equal(profile.xp, 0);
  assert.equal(records.get("player_1").session.expiresAt, 1180);
  profile.xp = 500;
  assert.equal(service.release(p, profile), true);
  assert.equal(records.get("player_1").profile.xp, 500);
  assert.equal(records.get("player_1").session, undefined);
});

test("second active session cannot claim or overwrite profile", () => {
  const a = new ProfileStoreService(),
    b = new ProfileStoreService();
  const p = player(2),
    q = player(2);
  a.load(p);
  const owner = records.get("player_2").session.owner;
  assert.equal(b.load(q), undefined);
  assert.equal(b.getLoadFailure(q), "SessionInUse");
  assert.equal(b.save(q, { xp: 999 }), false);
  assert.equal(records.get("player_2").session.owner, owner);
});

test("stale owner cannot overwrite after expired-lease takeover", () => {
  const a = new ProfileStoreService(),
    b = new ProfileStoreService();
  const p = player(3),
    q = player(3);
  const pa = a.load(p);
  now += 181;
  const pb = b.load(q);
  pb.xp = 800;
  b.save(q, pb);
  pa.xp = 99;
  assert.equal(a.save(p, pa), false);
  assert.ok(p.kicked);
  assert.equal(records.get("player_3").profile.xp, 800);
});

test("failed production load never creates a savable fallback", () => {
  const a = new ProfileStoreService();
  const p = player(4);
  beforeErrors = 4;
  assert.equal(a.load(p), undefined);
  assert.equal(a.save(p, { xp: 999 }), false);
  assert.equal(records.has("player_4"), false);
});

test("Studio fallback stays temporary after API recovery", () => {
  studio = true;
  const a = new ProfileStoreService();
  const p = player(5);
  beforeErrors = 4;
  const profile = a.load(p);
  assert.ok(profile);
  assert.equal(a.isTemporary(p), true);
  profile.xp = 999;
  assert.equal(a.save(p, profile), true);
  assert.equal(records.has("player_5"), false);
  studio = false;
});

test("legacy schema 1 migrates without losing progression", () => {
  records.set("player_6", {
    schemaVersion: 1,
    xp: 600,
    level: 2,
    credits: 10,
    matchesPlayed: 3,
    successfulExtractions: 2,
    lastSavedAt: 950,
  });
  const a = new ProfileStoreService();
  const profile = a.load(player(6));
  assert.equal(profile.xp, 600);
  assert.equal(records.get("player_6").formatVersion, 2);
});

test("unknown stored schema is refused without overwrite", () => {
  records.set("player_7", { formatVersion: 50, precious: "data" });
  const a = new ProfileStoreService();
  const p = player(7);
  assert.equal(a.load(p), undefined);
  assert.equal(a.getLoadFailure(p), "UnsupportedData");
  assert.equal(records.get("player_7").precious, "data");
});

test("lost release acknowledgement retries idempotently", () => {
  const a = new ProfileStoreService();
  const p = player(8);
  const profile = a.load(p);
  profile.xp = 900;
  afterErrors = 1;
  assert.equal(a.release(p, profile), true);
  assert.equal(records.get("player_8").profile.xp, 900);
  assert.equal(records.get("player_8").session, undefined);
  assert.equal(p.kicked, undefined);
});

test("malformed lease metadata is refused", () => {
  records.set("player_9", {
    formatVersion: 2,
    profile: { schemaVersion: 1 },
    revision: 1,
    session: { owner: "bad", expiresAt: NaN },
  });
  const a = new ProfileStoreService();
  const p = player(9);
  assert.equal(a.load(p), undefined);
  assert.equal(a.getLoadFailure(p), "UnsupportedData");
});

test("save snapshots current progression only after queue acquisition", () => {
  const a = new ProfileStoreService();
  const p = player(10);
  const profile = a.load(p);
  profile.xp = 100;
  a.acquireUserQueue(p.UserId);
  onWait = () => {
    profile.xp = 200;
    a.releaseUserQueue(p.UserId);
  };
  assert.equal(a.save(p, profile), true);
  assert.equal(records.get("player_10").profile.xp, 200);
  assert.equal(a.userQueues.size, 0);
});

test("delayed old release cannot overwrite a new server save", () => {
  const a = new ProfileStoreService(),
    b = new ProfileStoreService();
  const p = player(11),
    q = player(11);
  const profile = a.load(p);
  profile.xp = 100;
  afterErrors = 1;
  onWait = () => {
    const current = b.load(q);
    current.xp = 700;
    b.save(q, current);
  };
  assert.equal(a.release(p, profile), false);
  assert.equal(records.get("player_11").profile.xp, 700);
});

test("combat numeric policies reject repeated kills and invalid packets", () => {
  assert.equal(combatPolicy.canAwardElimination(100, 0, false), true);
  assert.equal(combatPolicy.canAwardElimination(0, 0, false), false);
  assert.equal(combatPolicy.canAwardElimination(25, 0, true), false);
  assert.equal(combatPolicy.validShotSequence(1, 0), true);
  for (const sequence of [NaN, Infinity, -Infinity, -1, 1.5, 1_000_000_001])
    assert.equal(combatPolicy.validShotSequence(sequence, 0), false);
  assert.equal(combatPolicy.validShotSequence(3, 3), false);
  assert.equal(combatPolicy.isWithinActionRange(16, 16), true);
  assert.equal(combatPolicy.isWithinActionRange(NaN, 16), false);
  assert.equal(combatPolicy.isWithinActionRange(Infinity, 16), false);
});

test("session policy distinguishes expired claims from stale writes", () => {
  assert.equal(sessionPolicy.canClaimProfileSession("other", 999, "new", 1000), true);
  assert.equal(sessionPolicy.canClaimProfileSession("other", 1001, "new", 1000), false);
  assert.equal(sessionPolicy.canWriteProfileSession("own", 999, "own", 1000), false);
  assert.equal(sessionPolicy.canWriteProfileSession("own", 1001, "own", 1000), true);
});

function character(p, position, health = 100) {
  const humanoid = {
    Health: health,
    MaxHealth: 100,
    TakeDamage(amount) {
      this.Health = Math.max(0, this.Health - amount);
      this.HealthChanged.Fire(this.Health);
    },
    HealthChanged: new Signal(),
    Destroying: new Signal(),
  };
  const head = { Position: position, IsA: () => true };
  const model = { player: p, FindFirstChild: () => head, FindFirstChildOfClass: () => humanoid };
  p.Character = model;
  return { model, head, humanoid };
}

test("combat rewards an elimination once and uses server head origin", () => {
  const p = player(20),
    q = player(21);
  const shooter = character(p, new Vector3(0, 5, 0));
  const victim = character(q, new Vector3(10, 5, 0), 25);
  let rewards = 0,
    score = 0;
  const state = {
    get: () => ({ isSpectator: false }),
    has: () => true,
    awardProgress: () => rewards++,
  };
  const team = { areFriendly: () => false, addScore: (p, amount) => (score += amount) };
  const service = new CombatService(
    state,
    team,
    { currentPhase: () => "Conflict", allowsPvp: () => true },
    { damage: () => undefined },
    () => {},
    () => {},
    () => {},
  );
  raycastResult = {
    Instance: { FindFirstAncestorOfClass: () => victim.model },
    Position: victim.head.Position,
  };
  service.fire(p, new Vector3(1, 5, 0), new Vector3(1, 0, 0), 1);
  assert.equal(lastRayOrigin, shooter.head.Position);
  assert.equal(rewards, 1);
  assert.equal(score, 10);
  now += 0.3;
  service.fire(p, shooter.head.Position, new Vector3(1, 0, 0), 2);
  assert.equal(rewards, 1);
  shooter.humanoid.Health = 0;
  victim.humanoid.Health = 100;
  now += 0.3;
  service.fire(p, shooter.head.Position, new Vector3(1, 0, 0), 3);
  assert.equal(victim.humanoid.Health, 100);
});

test("removing old player session cannot reset new session rate limit", () => {
  const limiter = new RateLimiter();
  const oldPlayer = player(22),
    newPlayer = player(22);
  limiter.allow(oldPlayer, "Fire", 1);
  limiter.allow(newPlayer, "Fire", 1);
  limiter.removePlayer(oldPlayer);
  assert.equal(limiter.allow(newPlayer, "Fire", 1), false);
});

test("harvest requires 3D proximity and an unobstructed target", () => {
  const p = player(25);
  character(p, new Vector3(0, 5, 0));
  let collected = 0;
  const attributes = new Map([
    ["ResourceItemId", "energy_core"],
    ["Remaining", 40],
    ["YieldPerHit", 1],
  ]);
  const node = {
    Position: new Vector3(0, 30, 0),
    IsA: () => true,
    IsDescendantOf: () => true,
    GetAttribute: (name) => attributes.get(name),
    SetAttribute: (name, value) => attributes.set(name, value),
  };
  const state = {
    get: () => ({ isSpectator: false }),
    add: (player, item, amount) => {
      collected += amount;
      return amount;
    },
    recordAction() {},
  };
  const service = new ResourceService(
    state,
    () => {},
    () => true,
  );
  raycastResult = undefined;
  service.harvest(p, node);
  assert.equal(collected, 0);
  now += 0.5;
  node.Position = new Vector3(4, 5, 0);
  raycastResult = { Instance: { IsDescendantOf: () => false } };
  service.harvest(p, node);
  assert.equal(collected, 0);
  now += 0.5;
  raycastResult = undefined;
  service.harvest(p, node);
  assert.equal(collected, 1);
});

test("old resource respawn cannot refill a depleted node in a new round", () => {
  const p = player(26);
  character(p, new Vector3(0, 5, 0));
  const attributes = new Map([
    ["ResourceItemId", "energy_core"],
    ["Remaining", 20],
    ["MaximumRemaining", 20],
    ["YieldPerHit", 1],
    ["RespawnSeconds", 90],
  ]);
  const node = {
    Parent: {},
    Transparency: 0,
    CanCollide: true,
    CanQuery: true,
    Position: new Vector3(4, 5, 0),
    IsA: () => true,
    IsDescendantOf: () => true,
    GetDescendants: () => [],
    GetAttribute: (name) => attributes.get(name),
    SetAttribute: (name, value) => attributes.set(name, value),
  };
  const state = {
    get: () => ({ isSpectator: false }),
    add: (player, item, amount) => amount,
    recordAction() {},
  };
  const service = new ResourceService(
    state,
    () => {},
    () => true,
  );
  resourceNodes = [node];
  delayed = [];
  raycastResult = undefined;
  service.harvest(p, node);
  assert.equal(attributes.get("Remaining"), 0);
  service.resetAll();
  now += 0.5;
  service.harvest(p, node);
  assert.equal(attributes.get("Remaining"), 0);
  delayed.shift()();
  assert.equal(attributes.get("Remaining"), 0);
  delayed.shift()();
  assert.equal(attributes.get("Remaining"), 20);
  resourceNodes = [];
});

test("drone attack rechecks wall visibility after its windup", () => {
  const p = player(30);
  const victim = character(p, new Vector3(4, 5, 0));
  const drone = {
    Parent: {},
    PrimaryPart: { Position: new Vector3(0, 5, 0) },
    FindFirstChild: () => undefined,
    SetAttribute() {},
  };
  const service = new NpcService(
    () => {},
    () => true,
  );
  service.drones.add(drone);
  delayed = [];
  service.beginAttack(drone, p);
  assert.equal(victim.humanoid.Health, 100);
  raycastResult = { Instance: { IsDescendantOf: () => false } };
  delayed.shift()();
  assert.equal(victim.humanoid.Health, 100);
  service.beginAttack(drone, p);
  raycastResult = undefined;
  delayed.shift()();
  assert.equal(victim.humanoid.Health, 90);
});

test("drone movement does not teleport through a new blocking wall", () => {
  let pivots = 0;
  const drone = {
    Parent: {},
    PrimaryPart: { Position: new Vector3(0, 5, 0) },
    PivotTo() {
      pivots++;
    },
  };
  const service = new NpcService(
    () => {},
    () => true,
  );
  spherecastResult = { Instance: {} };
  spawned = [];
  service.moveDrone(drone, new Vector3(10, 5, 0), 0.1);
  assert.equal(pivots, 0);
  assert.equal(spawned.length, 1);
  // Another tick while ComputeAsync is pending must not enqueue another request.
  service.moveDrone(drone, new Vector3(10, 5, 0), 0.1);
  assert.equal(spawned.length, 1);
  spherecastResult = undefined;
});

function testProfile() {
  return {
    schemaVersion: 1,
    xp: 0,
    level: 1,
    credits: 0,
    matchesPlayed: 0,
    successfulExtractions: 0,
    lastSavedAt: 0,
  };
}

function depotFixture() {
  const state = new PlayerStateService();
  const p = player(100);
  p.team = "Alpha";
  const avatar = character(p, new Vector3(12, 5, 0));
  state.initialize(p, testProfile(), 1, false);
  const roster = [{ Name: "Alpha", TeamColor: { Color: [0, 1, 1] } }];
  roster.size = () => roster.length;
  let phase = "Scavenge";
  const teams = { all: () => roster, nameFor: (member) => member.team };
  const match = {
    currentPhase: () => phase,
    allowsRaiding: () => phase === "Raid" || phase === "Extraction",
  };
  const service = new DepotService(
    state,
    teams,
    match,
    () => {},
    () => {},
    {},
  );
  raycastResult = undefined;
  service.start();
  const depot = service.depots.get("Alpha");
  const prompt = instances.find(
    (instance) => instance.ClassName === "ProximityPrompt" && instance.Parent === depot.part,
  );
  assert.ok(prompt);
  return {
    state,
    p,
    avatar,
    service,
    depot,
    prompt,
    setPhase: (value) => {
      phase = value;
    },
  };
}

test("depot early release and duplicate completion never transfer extra cores", () => {
  const { state, p, depot, prompt } = depotFixture();
  state.add(p, "energy_core", 3);
  prompt.PromptButtonHoldBegan.Fire(p);
  now += 0.4;
  prompt.PromptButtonHoldEnded.Fire(p);
  now += 2;
  prompt.Triggered.Fire(p);
  assert.equal(depot.cores, 0);
  assert.equal(state.amount(p, "energy_core"), 3);
  prompt.PromptButtonHoldBegan.Fire(p);
  now += 1;
  prompt.PromptButtonHoldEnded.Fire(p);
  prompt.Triggered.Fire(p);
  assert.equal(depot.cores, 3);
  assert.equal(state.amount(p, "energy_core"), 0);
  prompt.Triggered.Fire(p);
  assert.equal(depot.cores, 3);
});

test("depot damage followed by healing still interrupts the hold", () => {
  const { state, p, avatar, depot, prompt } = depotFixture();
  state.add(p, "energy_core", 3);
  prompt.PromptButtonHoldBegan.Fire(p);
  now += 0.7;
  avatar.humanoid.TakeDamage(10);
  avatar.humanoid.Health = 100;
  avatar.humanoid.HealthChanged.Fire(100);
  now += 0.4;
  prompt.Triggered.Fire(p);
  assert.equal(depot.cores, 0);
  assert.equal(state.amount(p, "energy_core"), 3);
});

test("depot enforces enemy phase gate and preserves one reserve core", () => {
  const { state, p, depot, prompt, setPhase } = depotFixture();
  p.team = "Beta";
  depot.cores = 4;
  setPhase("Conflict");
  prompt.PromptButtonHoldBegan.Fire(p);
  now += 6;
  prompt.Triggered.Fire(p);
  assert.equal(depot.cores, 4);
  assert.equal(state.amount(p, "energy_core"), 0);
  setPhase("Raid");
  prompt.PromptButtonHoldBegan.Fire(p);
  now += 6;
  prompt.Triggered.Fire(p);
  assert.equal(depot.cores, 2);
  assert.equal(state.amount(p, "energy_core"), 2);
  prompt.PromptButtonHoldBegan.Fire(p);
  now += 6;
  prompt.Triggered.Fire(p);
  assert.equal(depot.cores, 1);
  assert.equal(state.amount(p, "energy_core"), 3);
  state.consume(p, "energy_core", 3);
  prompt.PromptButtonHoldBegan.Fire(p);
  now += 6;
  prompt.Triggered.Fire(p);
  assert.equal(depot.cores, 1);
  assert.equal(state.amount(p, "energy_core"), 0);
});

test("depot capacity and actual inventory carry cap conserve partial transfers", () => {
  const { state, p, depot, prompt, setPhase } = depotFixture();
  depot.cores = 23;
  assert.equal(state.add(p, "energy_core", 5), 3);
  prompt.PromptButtonHoldBegan.Fire(p);
  now += 1;
  prompt.Triggered.Fire(p);
  assert.equal(depot.cores, 24);
  assert.equal(state.amount(p, "energy_core"), 2);
  setPhase("Extraction");
  prompt.PromptButtonHoldBegan.Fire(p);
  now += 1;
  prompt.Triggered.Fire(p);
  assert.equal(depot.cores, 23);
  assert.equal(state.amount(p, "energy_core"), 3);
  prompt.PromptButtonHoldBegan.Fire(p);
  now += 1;
  prompt.Triggered.Fire(p);
  assert.equal(depot.cores, 23);
});

test("depot denies expired success grace and changed character", () => {
  const { state, p, depot, prompt } = depotFixture();
  state.add(p, "energy_core", 3);
  prompt.PromptButtonHoldBegan.Fire(p);
  now += 1;
  prompt.PromptButtonHoldEnded.Fire(p);
  now += 1;
  prompt.Triggered.Fire(p);
  assert.equal(depot.cores, 0);
  prompt.PromptButtonHoldBegan.Fire(p);
  character(p, new Vector3(12, 5, 0));
  now += 1;
  prompt.Triggered.Fire(p);
  assert.equal(depot.cores, 0);
});

function extractionFixture() {
  const state = new PlayerStateService();
  const p = player(200);
  const avatar = character(p, new Vector3(0, 3, 0));
  const runtimeState = state.initialize(p, testProfile(), 1, false);
  state.add(p, "energy_core", 3);
  let phase = "Extraction",
    score = 0;
  const service = new ExtractionService(
    state,
    { currentPhase: () => phase },
    {
      addScore: (player, amount) => {
        score += amount;
      },
    },
    () => {},
    () => {},
  );
  service.zone = { CFrame: new CFrame(), Size: new Vector3(20, 1, 20) };
  return {
    state,
    p,
    avatar,
    runtimeState,
    service,
    score: () => score,
    setPhase: (value) => {
      phase = value;
    },
  };
}

test("extraction requires eight seconds and consumes/rewards once", () => {
  const { state, p, runtimeState, service, score } = extractionFixture();
  service.update(p);
  now += 7.8;
  service.update(p);
  assert.equal(score(), 0);
  now += 0.3;
  service.update(p);
  assert.equal(state.amount(p, "energy_core"), 0);
  assert.equal(score(), 300);
  assert.equal(runtimeState.profile.xp, 300);
  assert.equal(runtimeState.profile.credits, 75);
  assert.equal(runtimeState.profile.successfulExtractions, 1);
  service.update(p);
  assert.equal(score(), 300);
  state.add(p, "energy_core", 1);
  now += 1.1;
  service.update(p);
  now += 8.1;
  service.update(p);
  assert.equal(score(), 400);
  assert.equal(runtimeState.profile.successfulExtractions, 1);
});

test("extraction damage and healing reset progress rather than resume it", () => {
  const { state, p, avatar, service, score } = extractionFixture();
  service.update(p);
  now += 6;
  avatar.humanoid.TakeDamage(1);
  avatar.humanoid.Health = 100;
  avatar.humanoid.HealthChanged.Fire(100);
  assert.equal(service.progressFor(p), 0);
  now += 1.1;
  service.update(p);
  now += 2;
  service.update(p);
  assert.equal(score(), 0);
  assert.equal(state.amount(p, "energy_core"), 3);
  now += 6.1;
  service.update(p);
  assert.equal(score(), 300);
});

test("extraction rejects dead spectators outside geometry and wrong phase", () => {
  const { p, avatar, runtimeState, service, score, setPhase } = extractionFixture();
  avatar.head.Position = new Vector3(0, 80, 0);
  service.update(p);
  assert.equal(service.holds.size, 0);
  avatar.head.Position = new Vector3(0, 3, 0);
  avatar.humanoid.Health = 0;
  service.update(p);
  assert.equal(service.holds.size, 0);
  avatar.humanoid.Health = 100;
  runtimeState.isSpectator = true;
  service.update(p);
  assert.equal(service.holds.size, 0);
  runtimeState.isSpectator = false;
  setPhase("Raid");
  service.update(p);
  assert.equal(service.holds.size, 0);
  setPhase("Extraction");
  service.update(p);
  now += 7;
  avatar.head.Position = new Vector3(80, 3, 0);
  service.update(p);
  assert.equal(service.holds.size, 0);
  now += 2;
  service.update(p);
  assert.equal(score(), 0);
});

test("chat system menus and window blur take priority over game input", () => {
  const available = {
    windowFocused: true,
    systemMenuOpen: false,
    textFocused: false,
    menuVisible: false,
    cursorHeld: false,
    alive: true,
  };
  assert.equal(inputContext(available), "Gameplay");
  assert.equal(
    inputContext({ ...available, windowFocused: false, menuVisible: true }),
    "ExternalUI",
  );
  assert.equal(
    inputContext({ ...available, systemMenuOpen: true, menuVisible: true }),
    "ExternalUI",
  );
  assert.equal(inputContext({ ...available, textFocused: true, cursorHeld: true }), "ExternalUI");
});

test("game menus and cursor mode cannot leak gameplay while dead or alive", () => {
  const available = {
    windowFocused: true,
    systemMenuOpen: false,
    textFocused: false,
    menuVisible: false,
    cursorHeld: false,
    alive: true,
  };
  assert.equal(inputContext({ ...available, menuVisible: true, cursorHeld: true }), "GameMenu");
  assert.equal(inputContext({ ...available, menuVisible: true, alive: false }), "GameMenu");
  assert.equal(inputContext({ ...available, cursorHeld: true }), "Cursor");
  assert.equal(inputContext({ ...available, alive: false }), "Unavailable");
});

function onboardingFacts() {
  return {
    phase: "Scavenge",
    spectator: false,
    cores: 0,
    storedCores: 0,
    extractionProgress: 0,
    hasBlaster: false,
    wood: 0,
    scrap: 0,
    structuresBuilt: 0,
  };
}

test("late extraction entry guides objectives before crafting or building", () => {
  const facts = { ...onboardingFacts(), phase: "Extraction" };
  assert.equal(nextOnboardingStep({ ...facts, cores: 2 }), "extract");
  assert.equal(nextOnboardingStep({ ...facts, cores: 2, extractionProgress: 0.5 }), "extracting");
  assert.equal(nextOnboardingStep({ ...facts, storedCores: 3 }), "withdraw");
  assert.equal(nextOnboardingStep(facts), "recover");
});

test("spectator and round completion never display active gameplay objectives", () => {
  const facts = { ...onboardingFacts(), cores: 3, extractionProgress: 0.5 };
  assert.equal(nextOnboardingStep({ ...facts, phase: "Extraction", spectator: true }), "spectator");
  assert.equal(nextOnboardingStep({ ...facts, phase: "Complete" }), "complete");
});

test("craft onboarding matches the actual blaster recipe costs", () => {
  const recipe = RECIPES.survival_blaster;
  const wood = recipe.ingredients.find((ingredient) => ingredient.itemId === "wood").amount;
  const scrap = recipe.ingredients.find((ingredient) => ingredient.itemId === "scrap").amount;
  const ready = { ...onboardingFacts(), wood, scrap };
  assert.equal(nextOnboardingStep(ready), "craft");
  assert.equal(nextOnboardingStep({ ...ready, wood: wood - 1 }), "gather");
  assert.equal(nextOnboardingStep({ ...ready, scrap: scrap - 1 }), "gather");
  assert.equal(nextOnboardingStep({ ...ready, cores: 1 }), "deposit");
});

test("foundation guidance is limited to the early setup phase", () => {
  const facts = { ...onboardingFacts(), hasBlaster: true };
  assert.equal(nextOnboardingStep(facts), "build");
  assert.equal(nextOnboardingStep({ ...facts, structuresBuilt: 1 }), "recover");
  assert.equal(nextOnboardingStep({ ...facts, phase: "Raid" }), "recover");
});

/** Execute the real lifecycle methods without constructing the generated Roblox world. */
function lifecycleFixture() {
  const source = fs
    .readFileSync(path.join(projectRoot, "src/server/main.server.ts"), "utf8")
    .replace("new WarWorldServer(installLocalizationTable()).start();", "");
  const module = { exports: {} };
  const scheduled = [];
  const roster = [];
  let close;
  let waits = 0;
  const players = {
    GetPlayers: () => roster,
    PlayerAdded: new Signal(),
    PlayerRemoving: new Signal(),
  };
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(`${code}\nexports.WarWorldServer = WarWorldServer;`, {
    module,
    exports: module.exports,
    Map: RobloxMap,
    Set: RobloxSet,
    require(id) {
      if (id === "@rbxts/services") return { Players: players, Debris: {} };
      if (id === "shared/localization/translations")
        return { localized: (key) => ({ key }), sourceFor: (key) => key };
      if (id === "server/tests/catalog-smoke-tests") return { runCatalogSmokeTests() {} };
      // Constructors are not executed: services under test are injected below.
      return {};
    },
    task: {
      spawn: (callback) => scheduled.push(callback),
      defer: (callback) => scheduled.push(callback),
      wait(seconds) {
        now += seconds;
        waits += 1;
        const hook = onWait;
        onWait = undefined;
        hook?.();
      },
    },
    game: { BindToClose: (callback) => (close = callback) },
    os: { clock: () => now },
    print() {},
    typeIs: () => false,
  });
  const server = Object.create(module.exports.WarWorldServer.prototype);
  const profiles = new ProfileStoreService();
  profiles.startAutosave = () => {};
  const state = new PlayerStateService();
  Object.assign(server, {
    profiles,
    playerState: state,
    teams: { assign() {}, resetScores() {}, changed: { Event: new Signal() } },
    network: { setCommandHandler() {}, sendAll() {} },
    match: { currentPhase: () => "Scavenge", start() {} },
    worldEvents: { onPhaseChanged() {} },
    reconnect: { clear() {}, startCleanup() {} },
    building: { resetAll() {} },
    loot: { resetAll() {} },
    resources: { resetAll() {} },
    npcs: { start() {}, stop() {}, resetAll() {} },
    extraction: { start() {} },
    depots: { start() {}, resetAll() {} },
    pendingSnapshots: new RobloxSet(),
    joining: new RobloxSet(),
    characterConnections: new RobloxMap(),
    deathConnections: new RobloxMap(),
    previousPhase: "Complete",
    shuttingDown: false,
    createSnapshot: () => undefined,
  });
  return {
    server,
    profiles,
    state,
    roster,
    players,
    flush: () => {
      while (scheduled.length) scheduled.shift()();
    },
    shutdown: () => close(),
    waits: () => waits,
  };
}

test("round reset does not spawn a player whose profile is still loading", () => {
  const { server, state, roster, players, flush } = lifecycleFixture();
  const joiningPlayer = player(501);
  const readyPlayer = player(502);
  let joiningSpawns = 0,
    readySpawns = 0;
  joiningPlayer.Parent = readyPlayer.Parent = players;
  joiningPlayer.Team = readyPlayer.Team = { Name: "Alpha" };
  joiningPlayer.LoadCharacter = () => joiningSpawns++;
  readyPlayer.LoadCharacter = () => readySpawns++;
  state.initialize(readyPlayer, testProfile(), 1, false);
  server.joining.add(joiningPlayer);
  roster.push(joiningPlayer, readyPlayer);
  server.onPhaseChanged();
  flush();
  assert.equal(state.get(joiningPlayer), undefined);
  assert.equal(joiningSpawns, 0);
  assert.equal(readySpawns, 1);
});

test("shutdown drains departed-player profile work within its bounded deadline", () => {
  const { server, profiles, shutdown, waits } = lifecycleFixture();
  // A departed player's yielding operation still owns a real ProfileStore FIFO ticket.
  profiles.acquireUserQueue(503);
  assert.equal(profiles.hasPendingOperations(), true);
  server.start();
  onWait = () => profiles.releaseUserQueue(503);
  shutdown();
  assert.equal(waits(), 1);
  assert.equal(profiles.hasPendingOperations(), false);
  profiles.acquireUserQueue(504);
  const startedAt = now;
  shutdown();
  assert.ok(now - startedAt >= 25 && now - startedAt < 25.2);
  assert.equal(profiles.hasPendingOperations(), true);
  profiles.releaseUserQueue(504);
});

test("profile completion during shutdown releases ownership without initializing a player", () => {
  const { server, profiles, state } = lifecycleFixture();
  const joiningPlayer = player(505);
  const load = profiles.load.bind(profiles);
  let loadCalls = 0;
  profiles.load = (p) => {
    loadCalls++;
    const profile = load(p);
    server.shuttingDown = true;
    profiles.beginShutdown();
    return profile;
  };
  server.onPlayerAdded(joiningPlayer);
  assert.equal(loadCalls, 1);
  assert.equal(state.get(joiningPlayer), undefined);
  assert.equal(server.joining.has(joiningPlayer), false);
  assert.equal(records.get("player_505").session, undefined);
  assert.equal(profiles.hasPendingOperations(), false);
  server.onPlayerAdded(player(506));
  assert.equal(loadCalls, 1, "shutdown must not initiate another profile load");
});

console.log(
  `${tests} server policy scenarios passed; ${writes} simulated committed DataStore writes.`,
);
