/** Shared presentation limits; the server independently validates every placement. */
export const BUILD_RULES = {
  maxDistance: 35,
  minHeight: -2,
  maxHeight: 48,
  grid: 1,
  heightGrid: 0.5,
  spawnClearance: 8,
  extractionClearance: 22,
  depotClearance: 5,
  monumentClearance: 30,
} as const;
