/** Great-circle distance in miles (no road multiplier). */
export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Straight-line distance (miles) × 1.25 as a rough road-distance fallback
 * when Google Distance Matrix is unavailable.
 */
export function haversineRoadMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineMiles(lat1, lon1, lat2, lon2) * 1.25;
}

/** Rough duration estimate when we only have miles (e.g. ~35 mph avg). */
export function estimateDurationSecondsFromMiles(miles: number): number {
  const m = Math.max(0, miles);
  return Math.round((m / 35) * 3600);
}
