import { Workspace } from "@rbxts/services";
import { isFiniteVector3 } from "shared/util/math";

export function livingRoot(player: Player): BasePart | undefined {
  const character = player.Character;
  const root = character?.FindFirstChild("HumanoidRootPart");
  const humanoid = character?.FindFirstChildOfClass("Humanoid");
  return root?.IsA("BasePart") &&
    isFiniteVector3(root.Position) &&
    humanoid !== undefined &&
    humanoid.Health > 0
    ? root
    : undefined;
}

/** ProximityPrompt events and client targets are requests, never proof of proximity. */
export function canInteract(player: Player, target: BasePart, distance: number): boolean {
  const root = livingRoot(player);
  if (root === undefined || !target.IsDescendantOf(Workspace)) return false;
  if (root.Position.sub(target.Position).Magnitude > distance) return false;
  const head = player.Character?.FindFirstChild("Head");
  const origin = head?.IsA("BasePart") ? head.Position : root.Position;
  if (!isFiniteVector3(origin) || !isFiniteVector3(target.Position)) return false;
  const parameters = new RaycastParams();
  parameters.FilterType = Enum.RaycastFilterType.Exclude;
  parameters.FilterDescendantsInstances = player.Character !== undefined ? [player.Character] : [];
  parameters.IgnoreWater = true;
  const result = Workspace.Raycast(origin, target.Position.sub(origin), parameters);
  return (
    result === undefined || result.Instance === target || result.Instance.IsDescendantOf(target)
  );
}
