import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const sourcePath = path.join(process.cwd(), "src/shared/localization/translations.ts");
const sourceText = await readFile(sourcePath, "utf8");
const sourceFile = ts.createSourceFile(
  sourcePath,
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

function unwrap(expression) {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

let definitions;
for (const statement of sourceFile.statements) {
  if (!ts.isVariableStatement(statement)) {
    continue;
  }
  for (const declaration of statement.declarationList.declarations) {
    if (
      ts.isIdentifier(declaration.name) &&
      declaration.name.text === "DEFINITIONS" &&
      declaration.initializer !== undefined
    ) {
      const value = unwrap(declaration.initializer);
      if (ts.isArrayLiteralExpression(value)) {
        definitions = value;
      }
    }
  }
}

if (definitions === undefined) {
  throw new Error("Could not find the localization DEFINITIONS array.");
}

const locales = ["en-us", "it-it", "es-es", "pt-br", "fr-fr", "de-de"];
const seen = new Set();
const placeholderPattern = /\{([A-Za-z0-9_]+)\}/g;

function placeholders(value) {
  return [...value.matchAll(placeholderPattern)]
    .map((match) => match[1])
    .sort()
    .join("|");
}

for (const element of definitions.elements) {
  const row = unwrap(element);
  if (!ts.isArrayLiteralExpression(row) || row.elements.length !== locales.length + 1) {
    throw new Error("Every localization entry must contain one key and six language values.");
  }
  const values = row.elements.map((entry) => {
    const value = unwrap(entry);
    if (!ts.isStringLiteralLike(value)) {
      throw new Error("Localization entries must use static string literals.");
    }
    return value.text;
  });

  const [key, english, ...translations] = values;
  if (key.length === 0 || english.length === 0) {
    throw new Error("Localization keys and English source text cannot be empty.");
  }
  if (seen.has(key)) {
    throw new Error(`Duplicate localization key: ${key}`);
  }
  seen.add(key);

  const expectedPlaceholders = placeholders(english);
  for (let index = 0; index < translations.length; index += 1) {
    const translated = translations[index];
    if (translated.length === 0) {
      throw new Error(`Missing ${locales[index + 1]} translation for ${key}.`);
    }
    if (placeholders(translated) !== expectedPlaceholders) {
      throw new Error(`Placeholder mismatch for ${key} in ${locales[index + 1]}.`);
    }
  }
}

for (const requiredKey of [
  "tutorial.step5.controls",
  "objective.extraction",
  "toast.phase.extraction",
  "toast.inventory_full",
  "prompt.team_entrance",
]) {
  if (!seen.has(requiredKey)) {
    throw new Error(`Missing required localization key: ${requiredKey}`);
  }
}

if (seen.size < 100) {
  throw new Error(`Localization catalog is unexpectedly small: ${seen.size} entries.`);
}

console.log(`Validated ${seen.size} localization keys across ${locales.length} languages.`);
