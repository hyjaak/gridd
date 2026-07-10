import { NextResponse } from "next/server";
import { computeRideLineItems } from "@/lib/calculatePrice";
import { requireCeoBearer } from "@/lib/admin-auth";
import { getSmartPrice, MINIMUM_RIDE_SAVINGS } from "@/lib/priceMonitor";
import type { UberEstimateSource } from "@/lib/uberGeorgiaProxy";
import { nominatimZipCenter, offsetNorthMiles } from "@/lib/zipGeocode";

const DIST_MILES = [5, 10, 20, 35, 50];

/**
 * CEO-only: benchmark routes — real-time Uber vs PriceIQ (min $1.84 or 3.2% off Uber mid).
 * Uses live `/estimates/price` when `UBER_SERVER_TOKEN` returns rows; else Georgia published-rate proxy.
 */
export async function GET(req: Request) {
  const uid = await requireCeoBearer(req);
  if (!uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const zip = url.searchParams.get("zip")?.replace(/\D/g, "").slice(0, 5) ?? "30309";

  if (zip.length !== 5) {
    return NextResponse.json({ ok: false, error: "Invalid zip" }, { status: 400 });
  }

  const center = (await nominatimZipCenter(zip)) ?? { lat: 33.749, lng: -84.388 };

  const rows: Array<{
    miles: number;
    minutes: number;
    griddList: number;
    uber: number;
    priceIq: number;
    youSave: number | null;
    uberSource: UberEstimateSource;
    isSurging?: boolean;
    surgeMultiplier?: number;
  }> = [];
  let anySurge = false;
  for (const m of DIST_MILES) {
    const end = offsetNorthMiles(center.lat, center.lng, m);
    const minutes = Math.max(12, Math.min(90, Math.round(m * 1.75)));
    const li = computeRideLineItems(m, { rideType: "standard", durationMinutes: minutes }, {});
    const smart = await getSmartPrice(
      center.lat,
      center.lng,
      end.lat,
      end.lng,
      m,
      minutes,
      "standard",
    );
    const griddList = li.finalTotal;
    const uber = smart.uberPrice;
    const priceIq = smart.griddPrice;
    const youSave = smart.savings != null && smart.savings > 0 ? smart.savings : null;
    if (smart.isSurging) anySurge = true;
    rows.push({
      miles: m,
      minutes,
      griddList,
      uber,
      priceIq,
      youSave,
      uberSource: smart.uberSource,
      isSurging: smart.isSurging,
      surgeMultiplier: smart.surgeMultiplier,
    });
  }

  const beatsUberOnAll = rows.length > 0 && rows.every((r) => r.priceIq < r.uber);

  return NextResponse.json({
    ok: true,
    zip,
    center,
    updatedAt: new Date().toISOString(),
    beatsUberOnAll,
    anySurge,
    realTime: {
      intervalSec: 60,
      minSavingsUsd: MINIMUM_RIDE_SAVINGS,
      label: "REAL TIME MONITOR",
    },
    daily: {
      label: "DAILY MONITOR",
      services: "Non-ride: Perplexity + 24h cache; refresh via booking/cron",
    },
    rows,
  });
}
