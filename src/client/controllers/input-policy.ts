/** Pure policy shared by input handlers; core UI always takes precedence over gameplay. */
export interface InputState {
  readonly windowFocused: boolean;
  readonly systemMenuOpen: boolean;
  readonly textFocused: boolean;
  readonly menuVisible: boolean;
  readonly cursorHeld: boolean;
  readonly alive: boolean;
}

export type InputContext = "ExternalUI" | "GameMenu" | "Cursor" | "Unavailable" | "Gameplay";

export function inputContext(state: InputState): InputContext {
  if (!state.windowFocused || state.systemMenuOpen || state.textFocused) return "ExternalUI";
  if (state.menuVisible) return "GameMenu";
  if (state.cursorHeld) return "Cursor";
  if (!state.alive) return "Unavailable";
  return "Gameplay";
}
