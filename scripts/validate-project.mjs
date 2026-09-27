import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "default.project.json",
  "tsconfig.json",
  "src/shared/catalog/items.ts",
  "src/shared/catalog/recipes.ts",
  "src/shared/catalog/build-pieces.ts",
  "src/shared/localization/translations.ts",
  "src/server/main.server.ts",
  "src/server/localization/install-localization.ts",
  "src/server/services/building-service.ts",
  "src/server/services/combat-service.ts",
  "src/server/services/loot-service.ts",
  "src/server/services/match-service.ts",
  "src/server/services/profile-store-service.ts",
  "src/server/services/reconnect-service.ts",
  "src/server/services/world-event-service.ts",
  "src/server/services/depot-service.ts",
  "src/server/services/interaction-guard.ts",
  "scripts/test-server-policies.mjs",
  "src/server/world/world-art.ts",
  "src/client/main.client.ts",
  "src/client/controllers/game-controller.ts",
  "src/client/controllers/input-policy.ts",
  "src/client/ui/onboarding-policy.ts",
  "src/client/localization/localizer.ts",
  "src/client/ui/ui-controller.ts",
  "docs/LOCALIZZAZIONE.md",
  "docs/PLAYTEST_CHECKLIST.md",
  "docs/ARCHITETTURA.md",
  "docs/ROADMAP.md",
  "out/server/main.server.luau",
  "out/client/main.client.luau",
  "out/client/controllers/input-policy.luau",
  "out/client/ui/onboarding-policy.luau",
  "out/shared/localization/translations.luau",
  "out/client/localization/localizer.luau",
  "out/server/localization/install-localization.luau",
  "build/sourcemap.json",
];

for (const file of requiredFiles) {
  await access(path.join(root, file));
}

const project = JSON.parse(await readFile(path.join(root, "default.project.json"), "utf8"));
const tsconfig = JSON.parse(await readFile(path.join(root, "tsconfig.json"), "utf8"));
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

if (project.name !== "WarWorld") {
  throw new Error("default.project.json must keep the WarWorld project name.");
}

if (tsconfig.compilerOptions?.strict !== true) {
  throw new Error("TypeScript strict mode must remain enabled.");
}

if (tsconfig.compilerOptions?.rootDir !== "src" || tsconfig.compilerOptions?.outDir !== "out") {
  throw new Error("roblox-ts source/output directories are misconfigured.");
}

if (project.tree?.Workspace?.$properties?.StreamingEnabled !== true) {
  throw new Error("Workspace streaming must remain enabled for the generated world.");
}

if (
  project.tree?.StarterPlayer?.$properties?.CameraMode !== "LockFirstPerson" ||
  project.tree?.StarterPlayer?.$properties?.CameraMinZoomDistance !== 0.5 ||
  project.tree?.StarterPlayer?.$properties?.CameraMaxZoomDistance !== 0.5
) {
  throw new Error("StarterPlayer must keep the locked first-person camera profile.");
}

if (project.tree?.Lighting?.$properties?.Technology !== "Voxel") {
  throw new Error("Lighting must explicitly use Voxel to avoid Studio migration prompts.");
}

if (
  project.tree?.Lighting?.$properties?.LightingStyle !== "Realistic" ||
  typeof project.tree?.Lighting?.$properties?.PrioritizeLightingQuality !== "boolean"
) {
  throw new Error(
    "Lighting must explicitly configure its realistic rendering profile and quality tradeoff.",
  );
}

for (const colorProperty of ["Ambient", "OutdoorAmbient"]) {
  const color = project.tree?.Lighting?.$properties?.[colorProperty];
  if (
    !Array.isArray(color) ||
    color.length !== 3 ||
    color.some((component) => typeof component !== "number" || component < 0 || component > 1)
  ) {
    throw new Error(`Lighting ${colorProperty} must use normalized Color3 components (0-1).`);
  }
}

const lighting = project.tree?.Lighting?.$properties;
if (
  typeof lighting?.Brightness !== "number" ||
  lighting.Brightness <= 0 ||
  lighting.Brightness > 3
) {
  throw new Error("Lighting Brightness must stay within the safe 0-3 range.");
}

if (
  typeof lighting?.ExposureCompensation !== "number" ||
  lighting.ExposureCompensation < -2 ||
  lighting.ExposureCompensation > 0
) {
  throw new Error("Lighting ExposureCompensation must stay within the safe -2 to 0 range.");
}

for (const script of [
  "typecheck",
  "format:check",
  "validate",
  "validate:localization",
  "test:server",
  "rojo:build",
  "rojo:sourcemap",
  "check",
]) {
  if (typeof packageJson.scripts?.[script] !== "string") {
    throw new Error(`Missing npm quality script: ${script}`);
  }
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(resolved)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(resolved);
    }
  }
  return files;
}

for (const sourceFile of await sourceFiles(path.join(root, "src"))) {
  const source = await readFile(sourceFile, "utf8");
  if (/\b(?:TODO|FIXME)\b/.test(source)) {
    throw new Error(`Unresolved implementation marker in ${path.relative(root, sourceFile)}.`);
  }
}

const serverSource = await readFile(path.join(root, "src/server/main.server.ts"), "utf8");
for (const securityMarker of [
  "typeIs(payload",
  "commandRateLimiter",
  "isBuildPieceId",
  "isRecipeId",
]) {
  if (!serverSource.includes(securityMarker)) {
    throw new Error(`Server command boundary is missing security check: ${securityMarker}`);
  }
}

const profileStoreSource = await readFile(
  path.join(root, "src/server/services/profile-store-service.ts"),
  "utf8",
);
// Structural presence only. Behavioral safety is exercised by test:server.
for (const persistenceMarker of [
  "canClaimProfileSession",
  "canWriteProfileSession",
  "public release(",
]) {
  if (!profileStoreSource.includes(persistenceMarker)) {
    throw new Error(`Profile session implementation is missing entry point: ${persistenceMarker}`);
  }
}

// Input and onboarding decisions run in test:server; source-name checks cannot
// establish correct focus handling or a usable tutorial on real devices.

const localizationSource = await readFile(
  path.join(root, "src/shared/localization/translations.ts"),
  "utf8",
);
for (const locale of ["en-us", "it-it", "es-es", "pt-br", "fr-fr", "de-de"]) {
  if (!localizationSource.includes(`\"${locale}\"`)) {
    throw new Error(`Localization catalog is missing supported locale: ${locale}`);
  }
}
for (const localizationMarker of [
  "validateLocalizationCatalog",
  "tutorial.step5.controls",
  "toast.phase.extraction",
  "prompt.team_entrance",
]) {
  if (!localizationSource.includes(localizationMarker)) {
    throw new Error(`Localization catalog is missing required entry: ${localizationMarker}`);
  }
}

const worldArtSource = await readFile(path.join(root, "src/server/world/world-art.ts"), "utf8");
for (const worldMarker of [
  "createScenery",
  "createDepot",
  "createLaboratory",
  "createPowerStation",
]) {
  if (!worldArtSource.includes(worldMarker)) {
    throw new Error(`Generated world art is missing feature: ${worldMarker}`);
  }
}

const sourcemapText = await readFile(path.join(root, "build/sourcemap.json"), "utf8");
for (const compiledService of [
  "building-service",
  "combat-service",
  "loot-service",
  "reconnect-service",
  "world-event-service",
  "depot-service",
  "input-policy",
  "onboarding-policy",
]) {
  if (!sourcemapText.includes(`\"name\":\"${compiledService}\"`)) {
    throw new Error(`Rojo sourcemap is missing compiled service: ${compiledService}`);
  }
}

console.log(`Validated ${requiredFiles.length} required project files and core configuration.`);
