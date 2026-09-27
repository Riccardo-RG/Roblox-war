/** Shared server-side layout: gameplay, terrain and decoration use the same anchors. */
export const MONUMENT_POSITIONS = [
  new Vector3(-115, 0, -70),
  new Vector3(120, 0, -65),
  new Vector3(0, 0, 125),
] as const;

export const WORLD_ART_BUDGET = {
  sceneryTrees: 28,
  rockClusters: 22,
  grassTufts: 36,
  abandonedProps: 9,
  sceneryBaseParts: 500,
  environmentBaseParts: 850,
  resourceNodes: 72,
} as const;

export function getCampPosition(index: number, count = 6): Vector3 {
  const angle = (index / math.max(1, count)) * math.pi * 2;
  return new Vector3(math.cos(angle) * 205, 0, math.sin(angle) * 205);
}

export function horizontalDistance(a: Vector3, b: Vector3): number {
  return new Vector2(a.X - b.X, a.Z - b.Z).Magnitude;
}

export function distanceToRoute(position: Vector3, start: Vector3, finish: Vector3): number {
  const point = new Vector2(position.X, position.Z);
  const a = new Vector2(start.X, start.Z);
  const direction = new Vector2(finish.X - start.X, finish.Z - start.Z);
  const lengthSquared = direction.Dot(direction);
  const progress =
    lengthSquared > 0 ? math.clamp(point.sub(a).Dot(direction) / lengthSquared, 0, 1) : 0;
  return point.sub(a.add(direction.mul(progress))).Magnitude;
}

export function nearestMonument(position: Vector3): Vector3 {
  let nearest: Vector3 = MONUMENT_POSITIONS[0];
  for (const monument of MONUMENT_POSITIONS) {
    if (horizontalDistance(position, monument) < horizontalDistance(position, nearest)) {
      nearest = monument;
    }
  }
  return nearest;
}

export function islandRoutes(): ReadonlyArray<readonly [Vector3, Vector3]> {
  const routes = new Array<readonly [Vector3, Vector3]>();
  for (const monument of MONUMENT_POSITIONS) {
    routes.push([Vector3.zero, monument]);
  }
  for (let index = 0; index < 6; index += 1) {
    const camp = getCampPosition(index);
    routes.push([camp, nearestMonument(camp)]);
  }
  return routes;
}

const ROUTES = islandRoutes();

function smoothstep(value: number): number {
  const clamped = math.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

/** Nominal top of generated terrain; the six camps, monuments and main routes stay at Y = 0. */
export function groundHeightAt(x: number, z: number): number {
  const position = new Vector3(x, 0, z);
  const radius = new Vector2(x, z).Magnitude;
  if (radius > 252) {
    const angle = math.atan2(z, x);
    const shoreline = 282 + math.sin(angle * 3) * 7 + math.sin(angle * 7) * 4;
    return -smoothstep((radius - 252) / (shoreline - 252)) * 7;
  }

  let hill = 2 + math.noise(x / 95, z / 95, 0.73) * 5;
  for (let index = 0; index < 6; index += 1) {
    const angle = ((index + 0.5) / 6) * math.pi * 2;
    const ridge = new Vector3(math.cos(angle) * 164, 0, math.sin(angle) * 164);
    const distance = horizontalDistance(position, ridge);
    hill += (index % 2 === 0 ? 17 : 12) * math.exp(-(distance * distance) / (2 * 34 * 34));
  }

  let flatten = smoothstep((radius - 43) / 20);
  for (const monument of MONUMENT_POSITIONS) {
    flatten = math.min(flatten, smoothstep((horizontalDistance(position, monument) - 49) / 20));
  }
  for (let index = 0; index < 6; index += 1) {
    flatten = math.min(
      flatten,
      smoothstep((horizontalDistance(position, getCampPosition(index)) - 31) / 24),
    );
  }
  for (const [start, finish] of ROUTES) {
    flatten = math.min(flatten, smoothstep((distanceToRoute(position, start, finish) - 8) / 17));
  }
  return math.max(0, hill) * flatten;
}

export function isPlayableIslandPosition(position: Vector3): boolean {
  return new Vector2(position.X, position.Z).Magnitude <= 263;
}

/** Avoid authored objective footprints, every real team spawn and readable travel lanes. */
export function isProtectedWorldPosition(position: Vector3, clearance = 0): boolean {
  if (horizontalDistance(position, Vector3.zero) < 39 + clearance) {
    return true;
  }
  for (const monument of MONUMENT_POSITIONS) {
    if (horizontalDistance(position, monument) < 45 + clearance) {
      return true;
    }
  }
  for (let index = 0; index < 6; index += 1) {
    if (horizontalDistance(position, getCampPosition(index)) < 27 + clearance) {
      return true;
    }
  }
  return ROUTES.some(([start, finish]) => distanceToRoute(position, start, finish) < 8 + clearance);
}

/** Terrain-only ray prevents props spawning on roofs and compensates for voxel surface smoothing. */
export function surfacePositionAt(position: Vector3, terrain: Terrain): Vector3 {
  const parameters = new RaycastParams();
  parameters.FilterType = Enum.RaycastFilterType.Include;
  parameters.FilterDescendantsInstances = [terrain];
  parameters.IgnoreWater = true;
  const result = game
    .GetService("Workspace")
    .Raycast(new Vector3(position.X, 80, position.Z), new Vector3(0, -120, 0), parameters);
  return (
    result?.Position ?? new Vector3(position.X, groundHeightAt(position.X, position.Z), position.Z)
  );
}
