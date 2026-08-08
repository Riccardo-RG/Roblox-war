import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "default.project.json",
  "tsconfig.json",
  "src/shared/catalog/items.ts",
  "src/shared/catalog/recipes.ts",
  "src/shared/catalog/build-pieces.ts",
  "src/server/main.server.ts",
  "src/server/services/building-service.ts",
  "src/server/services/combat-service.ts",
  "src/server/services/loot-service.ts",
  "src/server/services/match-service.ts",
  "src/server/services/profile-store-service.ts",
  "src/server/services/reconnect-service.ts",
  "src/server/services/world-event-service.ts",
  "src/client/main.client.ts",
  "src/client/controllers/game-controller.ts",
  "src/client/ui/ui-controller.ts",
  "docs/PLAYTEST_CHECKLIST.md",
  "docs/ARCHITETTURA.md",
  "docs/ROADMAP.md",
  "out/server/main.server.luau",
  "out/client/main.client.luau",
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

if (project.tree?.Lighting?.$properties?.Technology !== "Voxel") {
  throw new Error("Lighting must explicitly use Voxel to avoid Studio migration prompts.");
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
for (const fallbackMarker of ["pcall(() => DataStoreService.GetDataStore", "store === undefined"]) {
  if (!profileStoreSource.includes(fallbackMarker)) {
    throw new Error(`Studio profile fallback is missing guard: ${fallbackMarker}`);
  }
}

const sourcemapText = await readFile(path.join(root, "build/sourcemap.json"), "utf8");
for (const compiledService of [
  "building-service",
  "combat-service",
  "loot-service",
  "reconnect-service",
  "world-event-service",
]) {
  if (!sourcemapText.includes(`\"name\":\"${compiledService}\"`)) {
    throw new Error(`Rojo sourcemap is missing compiled service: ${compiledService}`);
  }
}

console.log(`Validated ${requiredFiles.length} required project files and core configuration.`);
