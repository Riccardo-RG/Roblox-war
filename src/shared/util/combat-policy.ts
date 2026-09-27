/** Numeric policies kept independent of Roblox instances for deterministic regression tests. */
export function validShotSequence(sequence: number, previous: number): boolean {
  return sequence > previous && sequence <= 1_000_000_000 && sequence % 1 === 0;
}

export function canAwardElimination(
  before: number,
  after: number,
  alreadyAwarded: boolean,
): boolean {
  return before > 0 && after <= 0 && !alreadyAwarded;
}

export function isWithinActionRange(distance: number, maximum: number): boolean {
  return distance >= 0 && distance <= maximum;
}
