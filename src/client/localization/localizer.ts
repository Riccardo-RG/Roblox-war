import { LocalizationService, ReplicatedStorage } from "@rbxts/services";
import {
  LOCALIZATION_TABLE_NAME,
  type LocalizationArgs,
  type LocalizationKey,
  type LocalizedMessage,
  localTextFor,
} from "shared/localization/translations";

/** Local catalog is always ready; replicated translations are an optional enhancement. */
export class Localizer {
  public readonly changed = new Instance("BindableEvent");
  public table: LocalizationTable | undefined;
  private translator: Translator | undefined;

  public constructor() {
    this.attachTable(ReplicatedStorage.FindFirstChild(LOCALIZATION_TABLE_NAME));
    ReplicatedStorage.ChildAdded.Connect((child) => this.attachTable(child));
    LocalizationService.GetPropertyChangedSignal("RobloxLocaleId").Connect(() => {
      this.refreshTranslator();
      this.changed.Fire();
    });
  }

  public text(key: LocalizationKey, args?: LocalizationArgs): string {
    const translator = this.translator;
    if (translator !== undefined) {
      const [success, result] = pcall(() => translator.FormatByKey(key, args ?? {}));
      if (success && typeIs(result, "string")) return result;
    }
    const source = localTextFor(key, LocalizationService.RobloxLocaleId);
    const [formatted] = string.gsub(source, "{([%w_]+)}", (name: string) => {
      const value = args?.[name];
      return value !== undefined ? tostring(value) : `{${name}}`;
    });
    return formatted;
  }

  public message(message: LocalizedMessage): string {
    return this.text(message.key, message.args);
  }

  private attachTable(instance: Instance | undefined): void {
    if (
      instance === undefined ||
      instance.Name !== LOCALIZATION_TABLE_NAME ||
      !instance.IsA("LocalizationTable")
    )
      return;
    this.table = instance;
    this.refreshTranslator();
    this.changed.Fire();
  }

  private refreshTranslator(): void {
    this.translator = undefined;
    const localizationTable = this.table;
    if (localizationTable === undefined) return;
    const [success, translator] = pcall(() =>
      localizationTable.GetTranslator(LocalizationService.RobloxLocaleId),
    );
    if (success && typeIs(translator, "Instance") && translator.IsA("Translator"))
      this.translator = translator;
  }
}
