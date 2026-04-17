import type { DriverTier } from "@/types";

const DRIVER_TIER_LABEL: Record<DriverTier, string> = {
  starter: "Bronze",
  bronze: "Silver",
  silver: "Gold",
  gold: "Elite",
};

const DRIVER_NEXT: Record<DriverTier, DriverTier | null> = {
  starter: "bronze",
  bronze: "silver",
  silver: "gold",
  gold: null,
};

/** Jobs required at this tier band to advance (aligned with earnings page). */
export const JOBS_AT_TIER: Record<DriverTier, number> = {
  starter: 10,
  bronze: 50,
  silver: 150,
  gold: 99999,
};

export function driverTierDisplay(tier: DriverTier | undefined): string {
  const t = tier ?? "starter";
  return DRIVER_TIER_LABEL[t] ?? "Bronze";
}

export function driverTierColor(tier: DriverTier | undefined): string {
  const t = tier ?? "starter";
  if (t === "gold") return "#FFB800";
  if (t === "silver") return "#94a3b8";
  if (t === "bronze") return "#cd7f32";
  return "#64748b";
}

export function nextDriverTier(tier: DriverTier | undefined): DriverTier | null {
  const t = tier ?? "starter";
  return DRIVER_NEXT[t];
}

export function jobsRemainingForNextTier(
  tier: DriverTier | undefined,
  completedJobCount: number,
): { next: DriverTier | null; remaining: number; target: number } {
  const t = tier ?? "starter";
  const target = JOBS_AT_TIER[t] ?? 10;
  const next = DRIVER_NEXT[t];
  const remaining = Math.max(0, target - completedJobCount);
  return { next, remaining, target };
}

export function tierProgressPct(tier: DriverTier | undefined, completedJobCount: number): number {
  const t = tier ?? "starter";
  const target = JOBS_AT_TIER[t] ?? 10;
  if (target >= 99999) return 100;
  return Math.min(100, Math.round((completedJobCount / target) * 100));
}

export function customerTierLabel(points: number): "Member" | "Regular" | "VIP" | "Platinum" {
  if (points >= 5000) return "Platinum";
  if (points >= 1500) return "VIP";
  if (points >= 500) return "Regular";
  return "Member";
}

export function pointsToNextTier(points: number): { label: string; need: number; cap: number } {
  if (points < 500) return { label: "Regular", need: 500 - points, cap: 500 };
  if (points < 1500) return { label: "VIP", need: 1500 - points, cap: 1500 };
  if (points < 5000) return { label: "Platinum", need: 5000 - points, cap: 5000 };
  return { label: "Max", need: 0, cap: 5000 };
}

/** Progress 0–100 within the current customer tier band (toward the next tier). */
export function customerTierProgressPct(points: number): number {
  if (points < 500) return Math.min(100, Math.round((points / 500) * 100));
  if (points < 1500) return Math.min(100, Math.round(((points - 500) / 1000) * 100));
  if (points < 5000) return Math.min(100, Math.round(((points - 1500) / 3500) * 100));
  return 100;
}
