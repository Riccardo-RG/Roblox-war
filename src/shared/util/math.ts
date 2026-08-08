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

export function isFiniteCFrame(value: CFrame): boolean {
  const [x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22] = value.GetComponents();
  for (const component of [x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22]) {
    if (component !== component || math.abs(component) >= math.huge) {
      return false;
    }
  }
  return true;
}
