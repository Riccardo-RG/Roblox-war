import type { BuildPieceId } from "shared/catalog/build-pieces";
import type { RecipeId } from "shared/catalog/recipes";
import type { LocalizedMessage } from "shared/localization/translations";
import type { PlayerSnapshot } from "shared/types/game";

export const REMOTE_FOLDER_NAME = "WarWorldRemotes";
export const COMMAND_REMOTE_NAME = "Command";
export const EVENT_REMOTE_NAME = "Event";

export type ClientCommand =
  | { readonly kind: "Ready" }
  | { readonly kind: "Harvest"; readonly target: Instance }
  | { readonly kind: "Craft"; readonly recipeId: RecipeId }
  | { readonly kind: "PlaceBuild"; readonly pieceId: BuildPieceId; readonly cframe: CFrame }
  | {
      readonly kind: "FireWeapon";
      readonly weaponId: "survival_blaster";
      readonly origin: Vector3;
      readonly direction: Vector3;
      readonly sequence: number;
    }
  | { readonly kind: "UseBreach"; readonly target: Instance }
  | { readonly kind: "UseBandage" };

export type ServerEvent =
  | { readonly kind: "Snapshot"; readonly snapshot: PlayerSnapshot }
  | { readonly kind: "Toast"; readonly message: LocalizedMessage; readonly tone: ToastTone }
  | { readonly kind: "HitConfirm"; readonly eliminated: boolean }
  | {
      readonly kind: "ShotEffect";
      readonly origin: Vector3;
      readonly endpoint: Vector3;
      readonly shooterUserId: number;
    }
  | { readonly kind: "PhaseChanged"; readonly snapshot: PlayerSnapshot };

export type ToastTone = "Info" | "Success" | "Warning" | "Danger";
