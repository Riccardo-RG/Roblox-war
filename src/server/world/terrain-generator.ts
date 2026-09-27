import { Workspace } from "@rbxts/services";
import { distanceToRoute, groundHeightAt, islandRoutes } from "server/world/world-layout";

const RESOLUTION = 4;
const EXTENT = 328;
const MIN_Y = -24;
const MAX_Y = 32;
const SEA_LEVEL = -3;

/** A bounded, deterministic voxel island. Never clears Terrain or touches voxels outside its region. */
export function generateIslandTerrain(): void {
  const terrain = Workspace.Terrain;
  const routes = islandRoutes();
  terrain.WaterColor = Color3.fromRGB(52, 103, 116);
  terrain.WaterTransparency = 0.35;
  terrain.WaterReflectance = 0.12;
  terrain.WaterWaveSize = 0.16;
  terrain.WaterWaveSpeed = 6;
  terrain.SetMaterialColor(Enum.Material.Grass, Color3.fromRGB(104, 133, 84));
  terrain.SetMaterialColor(Enum.Material.Ground, Color3.fromRGB(123, 108, 84));
  terrain.SetMaterialColor(Enum.Material.Rock, Color3.fromRGB(116, 123, 117));
  terrain.SetMaterialColor(Enum.Material.Sand, Color3.fromRGB(176, 164, 126));

  // Narrow X slices keep transient Lua allocations bounded instead of building one giant voxel table.
  for (let chunkX = -EXTENT; chunkX < EXTENT; chunkX += 64) {
    const endX = math.min(chunkX + 64, EXTENT);
    const materials = new Array<Array<Array<Enum.Material>>>();
    const occupancies = new Array<Array<Array<number>>>();
    for (let x = chunkX; x < endX; x += RESOLUTION) {
      const materialColumn = new Array<Array<Enum.Material>>();
      const occupancyColumn = new Array<Array<number>>();
      const heightColumn = new Array<number>();
      const surfaceMaterials = new Array<Enum.Material>();
      for (let z = -EXTENT; z < EXTENT; z += RESOLUTION) {
        const cx = x + RESOLUTION / 2;
        const cz = z + RESOLUTION / 2;
        const height = groundHeightAt(cx, cz);
        const point = new Vector3(cx, 0, cz);
        const onRoute = routes.some(([start, finish]) => distanceToRoute(point, start, finish) < 6);
        heightColumn.push(height);
        surfaceMaterials.push(
          height < -0.6
            ? Enum.Material.Sand
            : onRoute
              ? Enum.Material.Ground
              : height > 10.5
                ? Enum.Material.Rock
                : Enum.Material.Grass,
        );
      }
      for (let y = MIN_Y; y < MAX_Y; y += RESOLUTION) {
        const materialRow = new Array<Enum.Material>();
        const occupancyRow = new Array<number>();
        for (let column = 0; column < heightColumn.size(); column += 1) {
          const height = heightColumn[column]!;
          const solid = math.clamp((height - y) / RESOLUTION, 0, 1);
          if (solid > 0) {
            materialRow.push(y < height - 6 ? Enum.Material.Rock : surfaceMaterials[column]!);
            occupancyRow.push(solid);
          } else if (y < SEA_LEVEL) {
            materialRow.push(Enum.Material.Water);
            occupancyRow.push(math.clamp((SEA_LEVEL - y) / RESOLUTION, 0, 1));
          } else {
            materialRow.push(Enum.Material.Air);
            occupancyRow.push(0);
          }
        }
        materialColumn.push(materialRow);
        occupancyColumn.push(occupancyRow);
      }
      materials.push(materialColumn);
      occupancies.push(occupancyColumn);
    }
    terrain.WriteVoxels(
      new Region3(new Vector3(chunkX, MIN_Y, -EXTENT), new Vector3(endX, MAX_Y, EXTENT)),
      RESOLUTION,
      materials,
      occupancies,
    );
    task.wait();
  }
}
