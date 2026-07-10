import { computeRideLineItems, type PriceCalculationOptions } from "@/lib/calculatePrice";
import { computeRideCustomerUsd } from "@/lib/priceMonitor";
import type { UberPriceEstimate } from "@/lib/uberTypes";
import { uberApi } from "@/lib/uberApi";
import {
  pickTierPriceRow,
  resolveTierMidFromPriceRows,
  type UberEstimateSource,
} from "@/lib/uberGeorgiaProxy";

export type RideTierEstimateRow = {
  griddType: "standard" | "xl" | "premium";
  label: string;
  griddPrice: number;
  /** PriceIQ™ = Uber est. × (1 − beat %) */
  priceIqUsd: number;
  uberLow: number | null;
  uberHigh: number | null;
  uberAvg: number | null;
  uberSource: UberEstimateSource;
  savingsVsUber: number | null;
  etaMinutes: number | null;
  productId: string | null;
  fareId: string | null;
  uberDisplayName: string | null;
};

function pickProductMeta(
  prices: UberPriceEstimate[],
  griddType: "standard" | "xl" | "premium",
): { productId: string | null; fareId: string | null; displayName: string | null } {
  const row = pickTierPriceRow(prices, griddType);
  if (!row) return { productId: null, fareId: null, displayName: null };
  return {
    productId: row.product_id ?? null,
    fareId: typeof row.fare_id === "string" ? row.fare_id : null,
    displayName: row.display_name ?? null,
  };
}

function etaForProduct(productId: string, times: { product_id: string; estimate: number }[]): number | null {
  const t = times.find((x) => x.product_id === productId);
  if (!t) return null;
  return Math.max(1, Math.round((t.estimate ?? 0) / 60));
}

export async function buildRideTierEstimates(args: {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  miles: number;
  minutes: number;
}): Promise<RideTierEstimateRow[]> {
  const [pricesRes, timesRes] = await Promise.all([
    uberApi.getPriceEstimates(args.startLat, args.startLng, args.endLat, args.endLng),
    uberApi.getEtaEstimates(args.startLat, args.startLng),
  ]);
  const livePrices = pricesRes.prices ?? [];
  const times = (timesRes.times ?? []) as { product_id: string; estimate: number }[];

  const tiers: ("standard" | "xl" | "premium")[] = ["standard", "xl", "premium"];
  const labels: Record<(typeof tiers)[number], string> = {
    standard: "Standard",
    xl: "XL",
    premium: "Premium",
  };

  const out: RideTierEstimateRow[] = [];

  for (const griddType of tiers) {
    const opts: PriceCalculationOptions = {
      rideType: griddType === "premium" ? "premium" : griddType,
      durationMinutes: args.minutes,
      durationSeconds: args.minutes * 60,
    };
    const li = computeRideLineItems(args.miles, opts, {});
    const griddPrice = li.finalTotal;

    const resolved = resolveTierMidFromPriceRows(livePrices, args.miles, args.minutes, griddType);
    const uberAvg = resolved.uberMid;
    const low = resolved.uberLow;
    const high = resolved.uberHigh;
    const source = resolved.source;

    const { finalUsd: priceIqUsd } = computeRideCustomerUsd({
      uberAvg,
      griddList: griddPrice,
      miles: args.miles,
      minutes: args.minutes,
    });
    const savings = uberAvg > priceIqUsd ? Math.round((uberAvg - priceIqUsd) * 100) / 100 : null;

    const meta = pickProductMeta(livePrices, griddType);
    const productId = source === "live" ? meta.productId : null;
    const fareId = source === "live" ? meta.fareId : null;
    const etaMinutes = productId ? etaForProduct(productId, times) : null;

    out.push({
      griddType,
      label: labels[griddType],
      griddPrice,
      priceIqUsd,
      uberLow: low,
      uberHigh: high,
      uberAvg,
      uberSource: source,
      savingsVsUber: savings,
      etaMinutes,
      productId,
      fareId,
      uberDisplayName: meta.displayName,
    });
  }
  return out;
}
