/** Expired sessions can be claimed, but never renewed by a stale owner. */
export function canClaimProfileSession(
  storedOwner: string | undefined,
  leaseExpiresAt: number,
  requestedOwner: string,
  now: number,
): boolean {
  return storedOwner === undefined || storedOwner === requestedOwner || leaseExpiresAt <= now;
}

export function canWriteProfileSession(
  storedOwner: string | undefined,
  leaseExpiresAt: number,
  requestedOwner: string,
  now: number,
): boolean {
  return storedOwner === requestedOwner && leaseExpiresAt > now;
}
