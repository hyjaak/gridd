/**
 * PriceIQ™ two-tier monitor (server-only):
 * - Tier 1: rides — live Uber `/estimates/price` + min $1.84 or 3.2% savings (whichever is greater) vs avg Uber.
 * - Tier 2: other services — daily Perplexity + `priceIntelligence` cache (see getDailyServicePrice).
 */
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { computeRideLineItems, type PriceCalculationOptions } from "@/lib/calculatePrice";
import { haversineRoadMiles } from "@/lib/geo";
import { DEFAULT_BEAT_PERCENT } from "@/lib/pricing";
import { fetchPerplexityCompetitorUsd, zip5ForPrice } from "@/lib/perplexityCompetitorPrice";
import { uberApi } from "@/lib/uberApi";
import type { UberPriceEstimate } from "@/lib/uberTypes";
import {
  inferMilesMinutesFromEndpoints,
  pickTierPriceRow,
  resolveUberMidForRoute,
  type UberEstimateSource,
} from "@/lib/uberGeorgiaProxy";

const CACHE_COLLECTION = "priceIntelligence";

export const MINIMUM_RIDE_SAVINGS = 1.84;
export const BEAT_PERCENTAGE = 0.032;

/** Non-ride market beat (aligned with `DEFAULT_BEAT_PERCENT` in pricing). */
export const DAILY_SERVICE_BEAT_PERCENT = DEFAULT_BEAT_PERCENT;

export const DAILY_MONITOR_SERVICES = [
  "lawn",
  "haul",
  "send",
  "cuts",
  "pressure",
  "snow",
  "gutter",
  "fence",
  "protect",
  "help",
  "roadside",
  "evcharge",
] as const;

export const PRICE_MONITOR_BEAT_MULT = 1 - DEFAULT_BEAT_PERCENT;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function cacheDocId(service: string, zip: string): string {
  return `${service}_${zip5ForPrice(zip)}`.replace(/[/\\]/g, "_");
}

export type UberCompetitorSnapshot = {
  provider: "Uber";
  type: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  source: UberEstimateSource;
};

export type SmartPriceBreakdown = {
  baseFare: number;
  distanceCharge: number;
  timeCharge: number;
  bookingFee: number;
  subtotalUsd: number;
  platformFeePct: number;
  platformFeeUsd: number;
  totalUsd: number;
};

export type SmartPriceResult = {
  griddPrice: number;
  competitorPrice: number;
  beatenCompetitor: "Uber" | null;
  savings: number | null;
  uberPrice: number;
  uberSource: UberEstimateSource;
  breakdown: SmartPriceBreakdown;
  uberLow?: number | null;
  uberHigh?: number | null;
  savingsGuaranteed?: boolean;
  savingsMethod?: "minimum_guarantee" | "percentage_beat";
  isRealTime?: boolean;
  isSurging?: boolean;
  surgeMultiplier?: number;
  updatedAt?: string;
};

function rideTierFromType(rideType: string): "standard" | "xl" | "premium" {
  const r = rideType.toLowerCase();
  if (r === "xl") return "xl";
  if (r === "cargo" || r === "premium") return "premium";
  return "standard";
}

function surgeHeuristic(low: number | null, high: number | null, mult: number | undefined): boolean {
  if (typeof mult === "number" && mult > 1) return true;
  if (low != null && high != null && low > 0 && high / low > 1.2) return true;
  return false;
}

function readSurgeMultiplier(u: UberPriceEstimate | null): number {
  if (!u) return 1;
  const raw = (u as { surge_multiplier?: number }).surge_multiplier;
  if (typeof raw === "number" && raw > 0) return raw;
  return 1;
}

/**
 * At least $1.84 or 3.2% of Uber average — whichever is greater (customer discount).
 */
export function calculateRideSavings(uberPrice: number): {
  savings: number;
  griddPrice: number;
  method: "minimum_guarantee" | "percentage_beat";
} {
  const p = Math.max(0, uberPrice);
  const percentSavings = p * BEAT_PERCENTAGE;
  const savings = round2(Math.max(MINIMUM_RIDE_SAVINGS, percentSavings));
  return {
    savings,
    griddPrice: round2(p - savings),
    method: savings === MINIMUM_RIDE_SAVINGS ? "minimum_guarantee" : "percentage_beat",
  };
}

export function getDistanceMiles(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): number {
  return haversineRoadMiles(startLat, startLng, endLat, endLng);
}

/** Cost floor: base + $/mi + $/min (used as minimum customer price before margin algebra). */
export function calculateMinimumViablePrice(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): number {
  const miles = getDistanceMiles(startLat, startLng, endLat, endLng);
  const minutes = miles * 2.5;
  return round2(1.5 + miles * 1.25 + minutes * 0.2);
}

export function calculateMinimumViableFromRouteMiles(miles: number, minutes: number): number {
  const m = Math.max(0, miles);
  const min = Math.max(0.1, minutes);
  return round2(1.5 + m * 1.25 + min * 0.2);
}

/**
 * What the customer pays: at least the route floor, at most GRIDD list, target = Uberavg − ride savings.
 */
export function computeRideCustomerUsd(args: {
  uberAvg: number;
  griddList: number;
  miles: number;
  minutes: number;
}): { finalUsd: number; savings: number; method: "minimum_guarantee" | "percentage_beat" } {
  const { griddPrice: fromUber, method } = calculateRideSavings(args.uberAvg);
  const minV = calculateMinimumViableFromRouteMiles(args.miles, args.minutes);
  const capped = Math.min(args.griddList, fromUber);
  const finalUsd = round2(Math.max(minV, capped));
  return {
    finalUsd,
    savings: round2(Math.max(0, args.uberAvg - finalUsd)),
    method,
  };
}

function breakdownFromLineItems(
  li: ReturnType<typeof computeRideLineItems>,
  totalOverride?: number,
): SmartPriceBreakdown {
  const totalUsd = totalOverride != null ? round2(totalOverride) : li.finalTotal;
  return {
    baseFare: li.base,
    distanceCharge: li.dist,
    timeCharge: li.time,
    bookingFee: li.bookingFee,
    subtotalUsd: li.lineSubtotal,
    platformFeePct: li.platformFeeRate,
    platformFeeUsd: li.platformFeeUsd,
    totalUsd,
  };
}

/**
 * One Uber GET — build tier snapshot + GRIDD undercut, or null to fall back to proxy path.
 */
export async function getRealTimeRidePrice(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  miles: number,
  minutes: number,
  rideType: string = "standard",
): Promise<{
  uberPrice: number;
  uberLow: number;
  uberHigh: number;
  griddPrice: number;
  savings: number;
  savingsMethod: "minimum_guarantee" | "percentage_beat";
  isSurging: boolean;
  surgeMultiplier: number;
  isRealTime: boolean;
  updatedAt: Date;
} | null> {
  if (!process.env.UBER_SERVER_TOKEN?.trim()) return null;
  const tier = rideTierFromType(rideType);
  try {
    const data = await uberApi.getPriceEstimates(startLat, startLng, endLat, endLng);
    const prices = data.prices ?? [];
    if (!prices.length) return null;
    const row = pickTierPriceRow(prices, tier);
    if (!row) return null;
    const lo = row.low_estimate;
    const hi = row.high_estimate;
    if (typeof lo !== "number" || typeof hi !== "number" || !Number.isFinite(lo + hi)) {
      return null;
    }
    const uberAvg = (lo + hi) / 2;
    if (!Number.isFinite(uberAvg) || uberAvg <= 0) return null;
    const sur = readSurgeMultiplier(row);
    const { miles: m, minutes: min } = inferMilesMinutesFromEndpoints(
      startLat,
      startLng,
      endLat,
      endLng,
      miles,
      minutes,
    );
    const li = computeRideLineItems(m, { rideType, durationSeconds: min * 60, durationMinutes: min }, {});
    const griddList = li.finalTotal;
    const { finalUsd, savings, method } = computeRideCustomerUsd({
      uberAvg,
      griddList,
      miles: m,
      minutes: min,
    });
    return {
      uberPrice: round2(uberAvg),
      uberLow: lo,
      uberHigh: hi,
      griddPrice: finalUsd,
      savings: round2(savings),
      savingsMethod: method,
      isSurging: sur > 1 || surgeHeuristic(lo, hi, sur),
      surgeMultiplier: sur,
      isRealTime: true,
      updatedAt: new Date(),
    };
  } catch (e) {
    console.error("Real time price error:", e);
    return null;
  }
}

/** UberX-style snapshot (all tiers use resolve path); kept for admin tools. */
export async function getUberPrice(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  miles?: number,
  minutes?: number,
): Promise<UberCompetitorSnapshot> {
  const { miles: m, minutes: min } = inferMilesMinutesFromEndpoints(
    startLat,
    startLng,
    endLat,
    endLng,
    miles,
    minutes,
  );
  const r = await resolveUberMidForRoute(startLat, startLng, endLat, endLng, m, min, "standard");
  return {
    provider: "Uber",
    type: "standard",
    minPrice: r.uberLow ?? r.uberMid,
    maxPrice: r.uberHigh ?? r.uberMid,
    avgPrice: r.uberMid,
    source: r.source,
  };
}

/**
 * Benchmark ride: live Uber + $1.84 / 3.2% savings, floored, capped vs GRIDD list.
 */
export async function getSmartPrice(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  miles: number,
  minutes: number,
  rideType: string = "standard",
): Promise<SmartPriceResult> {
  const opts: PriceCalculationOptions = {
    rideType,
    durationSeconds: minutes * 60,
    durationMinutes: minutes,
  };
  const { miles: m, minutes: min } = inferMilesMinutesFromEndpoints(
    startLat,
    startLng,
    endLat,
    endLng,
    miles,
    minutes,
  );
  const li = computeRideLineItems(m, opts, {});
  const griddBase = li.finalTotal;
  const tier = rideTierFromType(rideType);

  const live = await getRealTimeRidePrice(startLat, startLng, endLat, endLng, m, min, rideType);
  if (live) {
    return {
      griddPrice: live.griddPrice,
      competitorPrice: live.uberPrice,
      beatenCompetitor: "Uber",
      savings: live.savings > 0 ? live.savings : null,
      uberPrice: live.uberPrice,
      uberSource: "live",
      breakdown: breakdownFromLineItems(li, live.griddPrice),
      uberLow: live.uberLow,
      uberHigh: live.uberHigh,
      savingsGuaranteed: true,
      savingsMethod: live.savingsMethod,
      isRealTime: true,
      isSurging: live.isSurging,
      surgeMultiplier: live.surgeMultiplier,
      updatedAt: live.updatedAt.toISOString(),
    };
  }

  const r = await resolveUberMidForRoute(startLat, startLng, endLat, endLng, m, min, tier);
  const uberAvg = r.uberMid;
  const { finalUsd, savings, method } = computeRideCustomerUsd({
    uberAvg,
    griddList: griddBase,
    miles: m,
    minutes: min,
  });
  return {
    griddPrice: finalUsd,
    competitorPrice: uberAvg,
    beatenCompetitor: "Uber",
    savings: savings > 0 ? round2(savings) : null,
    uberPrice: uberAvg,
    uberSource: r.source,
    breakdown: breakdownFromLineItems(li, finalUsd),
    uberLow: r.uberLow,
    uberHigh: r.uberHigh,
    savingsGuaranteed: true,
    savingsMethod: method,
    isRealTime: false,
    isSurging: false,
    surgeMultiplier: 1,
    updatedAt: new Date().toISOString(),
  };
}

export type RideshareBenchmark = {
  lowest: number;
  label: "Uber est.";
  uber: number;
  source: UberEstimateSource;
  uberLow: number | null;
  uberHigh: number | null;
  isSurging: boolean;
  surgeMultiplier: number;
  isRealTime: boolean;
  savingsMethod: "minimum_guarantee" | "percentage_beat";
};

export async function fetchRideshareCompetitor(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  miles: number,
  minutes: number,
  rideType: string = "standard",
): Promise<RideshareBenchmark> {
  const { miles: m, minutes: min } = inferMilesMinutesFromEndpoints(
    startLat,
    startLng,
    endLat,
    endLng,
    miles,
    minutes,
  );
  const live = await getRealTimeRidePrice(startLat, startLng, endLat, endLng, m, min, rideType);
  if (live) {
    return {
      lowest: live.uberPrice,
      label: "Uber est.",
      uber: live.uberPrice,
      source: "live",
      uberLow: live.uberLow,
      uberHigh: live.uberHigh,
      isSurging: live.isSurging,
      surgeMultiplier: live.surgeMultiplier,
      isRealTime: true,
      savingsMethod: live.savingsMethod,
    };
  }
  const tier = rideTierFromType(rideType);
  const r = await resolveUberMidForRoute(startLat, startLng, endLat, endLng, m, min, tier);
  const s = calculateRideSavings(r.uberMid);
  return {
    lowest: r.uberMid,
    label: "Uber est.",
    uber: r.uberMid,
    source: r.source,
    uberLow: r.uberLow,
    uberHigh: r.uberHigh,
    isSurging: false,
    surgeMultiplier: 1,
    isRealTime: false,
    savingsMethod: s.method,
  };
}

export async function cachePriceMonitorRow(routeKey: string, payload: Record<string, unknown>): Promise<void> {
  if (!adminDb) return;
  const id = routeKey.replace(/[.#$/[\]]/g, "_").slice(0, 500);
  try {
    await adminDb
      .collection("priceCache")
      .doc(id)
      .set(
        {
          ...payload,
          cachedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch {
    /* optional */
  }
}

async function persistIntelligence(
  service: string,
  zip: string,
  miles: number,
  price: number,
): Promise<void> {
  if (!adminDb || miles <= 0) return;
  await adminDb
    .collection(CACHE_COLLECTION)
    .doc(cacheDocId(service, zip))
    .set(
      {
        averagePrice: price,
        perMileRate: price / miles,
        service,
        zipCode: zip5ForPrice(zip),
        lastUpdated: FieldValue.serverTimestamp(),
        source: "perplexity_ai",
      },
      { merge: true },
    );
}

async function getCachedCompetitorUsd(
  service: string,
  zip: string,
  miles: number,
): Promise<number | null> {
  if (!adminDb) return null;
  const ref = adminDb.collection(CACHE_COLLECTION).doc(cacheDocId(service, zip));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const d = snap.data() as {
    averagePrice?: number;
    perMileRate?: number;
    lastUpdated?: { toMillis: () => number };
  };
  if (typeof d.averagePrice !== "number") return null;
  const last = d.lastUpdated?.toMillis?.() ?? 0;
  const ageHours = (Date.now() - last) / 3600000;
  if (ageHours >= 24) return null;
  const perMi = typeof d.perMileRate === "number" ? d.perMileRate : 0;
  return round2(d.averagePrice + perMi * miles);
}

/**
 * Tier 2 — cached daily competitor reference for non-ride services.
 */
export async function getDailyServicePrice(
  service: string,
  zipCode: string,
  details: { miles?: number } = {},
): Promise<{
  marketUsd: number | null;
  fromCache: boolean;
  service: string;
  zip: string;
}> {
  const z = zip5ForPrice(zipCode);
  if (z.length !== 5) {
    return { marketUsd: null, fromCache: false, service, zip: z };
  }
  const miles = Math.max(0.1, details.miles ?? 5);

  const hit = await getCachedCompetitorUsd(service, z, miles);
  if (hit != null) {
    return { marketUsd: hit, fromCache: true, service, zip: z };
  }
  const fresh = await fetchPerplexityCompetitorUsd(service, z, miles);
  if (fresh == null) {
    return { marketUsd: null, fromCache: false, service, zip: z };
  }
  await persistIntelligence(service, z, miles, fresh);
  return { marketUsd: fresh, fromCache: false, service, zip: z };
}

export type UnifiedDetails = {
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  zipCode?: string;
  miles?: number;
  minutes?: number;
  rideType?: string;
};

/**
 * Single entry: `ride` → real-time (or live GET) path; `roadside` → daily; others from DAILY_MONITOR.
 */
export async function getSmartPriceUnified(
  service: string,
  details: UnifiedDetails,
): Promise<SmartPriceResult | { type: "daily"; marketUsd: number | null; fromCache: boolean; service: string; zip: string }> {
  if (service === "ride") {
    const a = details.startLat;
    const b = details.startLng;
    const c = details.endLat;
    const d = details.endLng;
    if (
      [a, b, c, d].every(
        (n) => typeof n === "number" && Number.isFinite(n as number),
      )
    ) {
      const m = details.miles ?? 5;
      const min = details.minutes ?? 15;
      return getSmartPrice(a!, b!, c!, d!, m, min, details.rideType ?? "standard");
    }
  }
  const zip = details.zipCode?.trim() || "30052";
  const d = await getDailyServicePrice(service, zip, { miles: details.miles });
  return { type: "daily", ...d };
}

export class PriceMonitor {
  readonly BEAT_BY = PRICE_MONITOR_BEAT_MULT;

  getUberPrice = getUberPrice;
  getSmartPrice = getSmartPrice;
  fetchRideshareCompetitor = fetchRideshareCompetitor;

  calcGRIDDBase(miles: number, minutes: number, rideType: string = "standard"): number {
    return computeRideLineItems(
      miles,
      { rideType, durationSeconds: minutes * 60, durationMinutes: minutes },
      {},
    ).finalTotal;
  }
}

export const priceMonitor = new PriceMonitor();
