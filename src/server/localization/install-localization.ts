import { ReplicatedStorage } from "@rbxts/services";
import {
  LOCALIZATION_ENTRIES,
  LOCALIZATION_TABLE_NAME,
  SOURCE_LOCALE,
} from "shared/localization/translations";

export function installLocalizationTable(): LocalizationTable {
  const existing = ReplicatedStorage.FindFirstChild(LOCALIZATION_TABLE_NAME);
  if (existing?.IsA("LocalizationTable")) {
    existing.SourceLocaleId = SOURCE_LOCALE;
    existing.SetEntries([...LOCALIZATION_ENTRIES]);
    return existing;
  }

  const localizationTable = new Instance("LocalizationTable");
  localizationTable.Name = LOCALIZATION_TABLE_NAME;
  localizationTable.SourceLocaleId = SOURCE_LOCALE;
  localizationTable.SetEntries([...LOCALIZATION_ENTRIES]);
  localizationTable.Parent = ReplicatedStorage;
  return localizationTable;
}
