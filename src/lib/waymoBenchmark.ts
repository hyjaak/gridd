/**
 * Optional Waymo / other AV list-price hints. No public per-route API — extend when you have a data feed.
 * Returns null until wired (e.g. env or regional statics).
 */
export function getWaymoBenchmarkUsd(
  _miles: number,
  _startLat: number,
  _startLng: number,
): number | null {
  const cpm = Number(process.env.WAYMO_PROXY_USD_PER_MILE);
  if (!Number.isFinite(cpm) || cpm <= 0) return null;
  return Math.round(cpm * _miles * 100) / 100;
}
