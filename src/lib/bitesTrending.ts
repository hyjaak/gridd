/**
 * TRENDING score for feed (hourly batch or client-side sort on a window).
 * trendingScore = (orderCount*3 + gridditCount*2 + likeCount) / max(1, hoursSincePosted)
 */
export function biteTrendingScore(p: {
  orderCount: number;
  gridditCount: number;
  likeCount: number;
  createdAtMs: number;
}): number {
  const hours = Math.max(1 / 60, (Date.now() - p.createdAtMs) / 3600_000);
  const num = p.orderCount * 3 + p.gridditCount * 2 + p.likeCount;
  return num / hours;
}
