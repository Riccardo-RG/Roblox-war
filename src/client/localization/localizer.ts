import { LocalizationService, ReplicatedStorage } from "@rbxts/services";
import {
  LOCALIZATION_TABLE_NAME,
  type LocalizationArgs,
  type LocalizationKey,
  type LocalizedMessage,
  sourceFor,
} from "shared/localization/translations";

export class Localizer {
  public readonly changed = new Instance("BindableEvent");
  public readonly table: LocalizationTable;
  private translator: Translator;

  public constructor() {
    const localizationTable = ReplicatedStorage.WaitForChild(LOCALIZATION_TABLE_NAME, 10);
    assert(localizationTable?.IsA("LocalizationTable"), "War World localization table is missing.");
    this.table = localizationTable;
    this.translator = this.createTranslator();

    LocalizationService.GetPropertyChangedSignal("RobloxLocaleId").Connect(() => {
      this.translator = this.createTranslator();
      this.changed.Fire();
    });
  }

  public text(key: LocalizationKey, args?: LocalizationArgs): string {
    const [success, result] = pcall(() => this.translator.FormatByKey(key, args ?? {}));
    if (success && typeIs(result, "string")) {
      return result;
    }
    return this.fallback(key, args);
  }

  public message(message: LocalizedMessage): string {
    return this.text(message.key, message.args);
  }

  private createTranslator(): Translator {
    const [success, translator] = pcall(() =>
      this.table.GetTranslator(LocalizationService.RobloxLocaleId),
    );
    if (success && typeIs(translator, "Instance") && translator.IsA("Translator")) {
      return translator;
    }
    return this.table.GetTranslator("en-us");
  }

  private fallback(key: LocalizationKey, args?: LocalizationArgs): string {
    let result = sourceFor(key);
    if (args === undefined) {
      return result;
    }
    for (const [name, value] of pairs(args)) {
      const [replaced] = string.gsub(result, `{${name}}`, tostring(value));
      result = replaced;
    }
    return result;
  }
}
