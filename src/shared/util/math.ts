export function horizontalDistance(a: Vector3, b: Vector3): number {
  const delta = new Vector3(a.X - b.X, 0, a.Z - b.Z);
  return delta.Magnitude;
}

export function snapNumber(value: number, grid: number): number {
  return math.round(value / grid) * grid;
}

export function snapPosition(position: Vector3, grid: number): Vector3 {
  return new Vector3(
    snapNumber(position.X, grid),
    snapNumber(position.Y, grid),
    snapNumber(position.Z, grid),
  );
}

export function sanitizeRightAngleYaw(cframe: CFrame): number {
  const [, yaw] = cframe.ToOrientation();
  const quarterTurn = math.pi / 2;
  return math.round(yaw / quarterTurn) * quarterTurn;
}

export function isFiniteVector3(value: Vector3): boolean {
  return (
    value.X === value.X &&
    value.Y === value.Y &&
    value.Z === value.Z &&
    math.abs(value.X) < math.huge &&
    math.abs(value.Y) < math.huge &&
    math.abs(value.Z) < math.huge
  );
}
