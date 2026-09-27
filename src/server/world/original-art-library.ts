import { CollectionService, ServerStorage } from "@rbxts/services";

export type OriginalArtName = "CoastalPine" | "CoastalRock" | "SupplyCrate" | "ScrapPile";

const TEMPLATE_PART_LIMITS: Record<OriginalArtName, number> = {
  CoastalPine: 8,
  CoastalRock: 3,
  SupplyCrate: 4,
  ScrapPile: 3,
};

/** Optional local-imported original models. The procedural world works without uploads or asset IDs. */
export function cloneOriginalArt(
  name: OriginalArtName,
  parent: Instance,
  groundPosition: Vector3,
  scale = 1,
  yaw = 0,
  collidable = false,
): Model | undefined {
  const template = ServerStorage.FindFirstChild("WorldArtLibrary")?.FindFirstChild(name);
  if (template === undefined || (!template.IsA("Model") && !template.IsA("BasePart"))) {
    return undefined;
  }
  const model = new Instance("Model");
  model.Name = name;
  model.ModelStreamingMode = Enum.ModelStreamingMode.Atomic;
  const art = template.Clone();
  art.Parent = model;
  let partCount = 0;
  for (const descendant of model.GetDescendants()) {
    if (descendant.IsA("LuaSourceContainer")) {
      descendant.Destroy();
    } else if (descendant.IsA("BasePart")) {
      partCount += 1;
      descendant.Anchored = true;
      descendant.CanTouch = false;
      descendant.CanCollide = collidable;
      descendant.CanQuery = collidable;
    }
  }
  // A template is art, not an unlimited descendant container.
  if (partCount === 0 || partCount > TEMPLATE_PART_LIMITS[name]) {
    model.Destroy();
    return undefined;
  }
  model.ScaleTo(scale);
  model.PivotTo(CFrame.Angles(0, yaw, 0));
  const [bounds, size] = model.GetBoundingBox();
  const bottom = new Vector3(bounds.Position.X, bounds.Position.Y - size.Y / 2, bounds.Position.Z);
  model.PivotTo(model.GetPivot().add(groundPosition.sub(bottom)));
  CollectionService.AddTag(model, "WorldArt");
  model.Parent = parent;
  return model;
}
