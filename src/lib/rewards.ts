export type RewardTier = "bronze" | "silver" | "gold" | "platinum";

export function tierForPoints(points: number): RewardTier {
  if (points >= 5000) return "platinum";
  if (points >= 2000) return "gold";
  if (points >= 800) return "silver";
  return "bronze";
}

