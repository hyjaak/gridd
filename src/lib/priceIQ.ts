import { DEFAULT_BEAT_PERCENT } from "./pricing";
import type { PriceCalculationOptions } from "./calculatePrice";

export const COMPETITOR_PRICE_MULTIPLIER = 1 - DEFAULT_BEAT_PERCENT;

const COMPETITOR_LABELS: Record<string, string> = {
  ride: "Uber est.",
  haul: "Lugg",
  send: "Uber Connect",
  roadside: "AAA",
  lawn: "Thumbtack",
  help: "TaskRabbit",
  pressure: "Angi",
  protect: "Bark",
  cuts: "Thumbtack",
  evcharge: "ChargePoint",
  snow: "Thumbtack",
  gutter: "Angi",
  fence: "Thumbtack",
};

export function getCompetitorName(service: string): string {
  return COMPETITOR_LABELS[service] ?? "competitors";
}

export type PriceIQBreakdown = {
  baseFare: number;
  distanceCharge: number;
  timeCharge: number;
  extraCharge: number;
  miles: number;
  perMileRate: number;
  subtotalUsd: number;
  platformFeePct: number;
  platformFeeUsd: number;
  griddTotalUsd: number;
  /** What the customer pays after PriceIQ™ (min of GRIDD vs beat). */
  finalUsd: number;
  uberEstimateUsd: number | null;
  youSaveUsd: number | null;
};

export function buildPriceBreakdown(args: {
  miles: number;
  perMileRate: number;
  parts: {
    baseComponent: number;
    distanceComponent: number;
    timeComponent: number;
    extraComponent: number;
    subtotalUsd: number;
  };
  platformFeePct: number;
  platformFeeUsd: number;
  griddTotalUsd: number;
  competitorPriceUsd: number | null;
  finalUsd: number;
}): PriceIQBreakdown {
  const { miles, perMileRate, parts, platformFeePct, platformFeeUsd, griddTotalUsd, competitorPriceUsd, finalUsd } =
    args;
  return {
    baseFare: parts.baseComponent,
    distanceCharge: parts.distanceComponent,
    timeCharge: parts.timeComponent,
    extraCharge: parts.extraComponent,
    miles,
    perMileRate,
    subtotalUsd: parts.subtotalUsd,
    platformFeePct,
    platformFeeUsd,
    griddTotalUsd,
    finalUsd,
    uberEstimateUsd: competitorPriceUsd,
    youSaveUsd:
      competitorPriceUsd != null && competitorPriceUsd > finalUsd
        ? Math.round((competitorPriceUsd - finalUsd) * 100) / 100
        : null,
  };
}

export type PriceIQMetaRide = {
  minSavingsUsd: number;
  live: boolean;
  isSurging: boolean;
  surgeMultiplier: number;
  updatedAt: string;
  beatPercent: number;
  savingsMethod?: "minimum_guarantee" | "percentage_beat";
};

export type PriceIQMetaService = {
  /** Market reference came from 24h cache or fresh Perplexity */
  dailyVerified: boolean;
  beatPercent: number;
  /** ISO when cache/AI was written (if known) */
  lastCheckedAt?: string;
};

export type PriceIQEstimateResult = {
  priceUsd: number;
  miles: number;
  competitorPrice: number | null;
  competitorName: string | null;
  savingsUsd: number | null;
  usedCompetitorBeat: boolean;
  breakdown: PriceIQBreakdown;
  message: string | null;
  /** Ride: real-time Uber + $1.84+ guarantee */
  priceIQMetaRide?: PriceIQMetaRide;
  priceIQMetaService?: PriceIQMetaService;
};

export type PriceIQRequestBody = {
  service: string;
  zipCode: string;
  meters?: number | null;
  /** Ride routes: pickup/dropoff from Distance Matrix (also in options via buildPriceIQOptions). */
  options?: PriceCalculationOptions;
};

/**
 * Client: calls server estimate (Perplexity + cache live on server only).
 */
export async function fetchPriceIQEstimate(
  body: PriceIQRequestBody,
  idToken: string,
): Promise<PriceIQEstimateResult> {
  const res = await fetch("/api/pricing/estimate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as
    | ({ ok?: boolean; error?: string } & Partial<PriceIQEstimateResult>)
    | null;
  if (!res.ok || !data || data.ok === false) {
    throw new Error(data?.error ?? "Estimate failed");
  }
  const { ok: _ok, error: _e, ...rest } = data;
  return rest as PriceIQEstimateResult;
}
