/** GRIDD Score™ (0–1000) — tier labels for display. */

export function griddTierLabel(score: number): string {
  const s = Math.max(0, Math.min(1000, Math.floor(score)));
  if (s >= 1000) return "🔴 GRIDD Legend ‼️";
  if (s >= 750) return "🟠 GRIDD OG";
  if (s >= 500) return "🟡 GRIDD Regular";
  if (s >= 250) return "🟢 Trusted";
  if (s >= 100) return "🔵 Neighbor";
  return "🌱 New to GRIDD";
}

export function griddTierShort(score: number): string {
  const s = Math.max(0, Math.min(1000, Math.floor(score)));
  if (s >= 1000) return "Legend";
  if (s >= 750) return "OG";
  if (s >= 500) return "Regular";
  if (s >= 250) return "Trusted";
  if (s >= 100) return "Neighbor";
  return "New";
}
