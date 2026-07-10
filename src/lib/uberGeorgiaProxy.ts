/**
 * UberX-style estimate using published Georgia-style rate structure when the Rides API
 * returns no prices (e.g. Sandbox) or when you need a stable comparison baseline.
 *
 * When `UBER_SERVER_TOKEN` is set, we call `/estimates/price` and use the response when
 * rows are valid; otherwise we fall back to this proxy.
 */
import { haversineRoadMiles } from "@/lib/geo";
import type { UberPriceEstimate } from "@/lib/uberTypes";
import { uberApi } from "@/lib/uberApi";

/** UberX-style published structure (Georgia reference for comparison). */
export const UBER_UBERX_GEORGIA_PROXY = {
  base: 1.0,
  perMile: 0.9,
  perMinute: 0.15,
  bookingFee: 2.99,
  serviceFeeRate: 0.15,
  minimum: 7.0,
} as const;

const TIER_MULT: Record<"standard" | "xl" | "premium", number> = {
  standard: 1,
  xl: 1.28,
  premium: 1.45,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Full trip using proxy structure: (base + mi + min + booking) + 15% service, then min fare;
 * scaled for XL / Premium vs UberX.
 */
export function estimateUberTierGeorgiaUsd(
  miles: number,
  minutes: number,
  tier: "standard" | "xl" | "premium",
): number {
  const m = Math.max(0, miles);
  const min = Math.max(0.5, minutes);
  const p = UBER_UBERX_GEORGIA_PROXY;
  const trip = p.base + p.perMile * m + p.perMinute * min;
  const line = trip + p.bookingFee;
  const service = line * p.serviceFeeRate;
  let total = (line + service) * TIER_MULT[tier];
  total = Math.max(p.minimum, round2(total));
  return total;
}

export function estimateUberXGeorgiaTotal(miles: number, minutes: number): number {
  return estimateUberTierGeorgiaUsd(miles, minutes, "standard");
}

export type UberEstimateSource = "live" | "proxy";

export function pickTierPriceRow(
  prices: UberPriceEstimate[],
  griddType: "standard" | "xl" | "premium",
): UberPriceEstimate | null {
  const match = (name: string) => {
    const n = name.toLowerCase();
    if (griddType === "xl") return n.includes("xl") || n.includes("suv") || n.includes("uberxl");
    if (griddType === "premium")
      return n.includes("black") || n.includes("lux") || n.includes("prem") || n.includes("comfort");
    return (
      n === "uberx" ||
      n.includes("uber x") ||
      n.includes("uberx") ||
      (n.includes("uber") && !n.includes("xl") && !n.includes("pool") && !n.includes("black"))
    );
  };
  const sorted = [...prices].sort((a, b) => (a.low_estimate ?? 0) - (b.low_estimate ?? 0));
  return sorted.find((p) => match(String(p.display_name ?? ""))) ?? sorted[0] ?? null;
}

/** One row from a live `/estimates/price` payload, or null to use proxy. */
export function tryLiveTierMid(
  prices: UberPriceEstimate[],
  tier: "standard" | "xl" | "premium",
): { mid: number; low: number; high: number } | null {
  const u = pickTierPriceRow(prices, tier);
  if (!u) return null;
  const lo = u.low_estimate;
  const hi = u.high_estimate;
  if (typeof lo !== "number" || typeof hi !== "number" || !Number.isFinite(lo) || !Number.isFinite(hi)) {
    return null;
  }
  const mid = (lo + hi) / 2;
  if (!Number.isFinite(mid) || mid <= 0) return null;
  return { mid: round2(mid), low: lo, high: hi };
}

/**
 * Resolve Uber mid for one tier from a **pre-fetched** `prices` array (single GET for all tiers).
 */
export function resolveTierMidFromPriceRows(
  prices: UberPriceEstimate[],
  miles: number,
  minutes: number,
  tier: "standard" | "xl" | "premium",
): {
  uberMid: number;
  uberLow: number | null;
  uberHigh: number | null;
  source: UberEstimateSource;
} {
  const m = Math.max(0, miles);
  const min = Math.max(0.5, minutes);
  const live = tryLiveTierMid(prices, tier);
  if (live) {
    return {
      uberMid: live.mid,
      uberLow: live.low,
      uberHigh: live.high,
      source: "live",
    };
  }
  const uberMid = estimateUberTierGeorgiaUsd(m, min, tier);
  return { uberMid, uberLow: null, uberHigh: null, source: "proxy" };
}

/**
 * Try live Uber price estimates (one network call); if missing or invalid, use Georgia proxy.
 */
export async function resolveUberMidForRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  miles: number,
  minutes: number,
  tier: "standard" | "xl" | "premium",
): Promise<{
  uberMid: number;
  uberLow: number | null;
  uberHigh: number | null;
  source: UberEstimateSource;
}> {
  const m = Math.max(0, miles);
  const min = Math.max(0.5, minutes);
  if (process.env.UBER_SERVER_TOKEN?.trim()) {
    try {
      const data = await uberApi.getPriceEstimates(startLat, startLng, endLat, endLng);
      return resolveTierMidFromPriceRows(data.prices ?? [], m, min, tier);
    } catch {
      /* fall through to proxy */
    }
  }
  const uberMid = estimateUberTierGeorgiaUsd(m, min, tier);
  return { uberMid, uberLow: null, uberHigh: null, source: "proxy" };
}

export function inferMilesMinutesFromEndpoints(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  milesHint?: number,
  minutesHint?: number,
): { miles: number; minutes: number } {
  const miles = milesHint ?? haversineRoadMiles(startLat, startLng, endLat, endLng);
  const minutes =
    minutesHint ?? Math.max(1, (miles / 35) * 60); /* ~35 mph blended */
  return { miles, minutes };
}
