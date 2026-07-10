import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { verifyBearerDecoded } from "@/lib/admin-auth";
import {
  applyPlatformFee,
  computeRideLineItems,
  getPerMileRate,
  getRideMinutes,
  getSubtotalParts,
  metersToMiles,
  type PriceCalculationOptions,
  type SubtotalParts,
} from "@/lib/calculatePrice";
import { adminDb } from "@/lib/firebase-admin";
import {
  DEFAULT_BEAT_PERCENT,
  DEFAULT_PLATFORM_FEE,
  type PricingConfigDoc,
} from "@/lib/pricing";
import {
  buildPriceBreakdown,
  getCompetitorName,
  type PriceIQEstimateResult,
  type PriceIQMetaRide,
} from "@/lib/priceIQ";
import { recordUberPriceSample } from "@/lib/priceHistory";
import { fetchPerplexityCompetitorUsd } from "@/lib/perplexityCompetitorPrice";
import {
  cachePriceMonitorRow,
  computeRideCustomerUsd,
  fetchRideshareCompetitor,
  MINIMUM_RIDE_SAVINGS,
} from "@/lib/priceMonitor";

const CACHE_COLLECTION = "priceIntelligence";
const CONFIG_COLLECTION = "pricingConfig";

function zip5(z: string): string {
  return z.replace(/\D/g, "").slice(0, 5);
}

function rideCoordsFromOptions(o: PriceCalculationOptions): {
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
} | null {
  const a = o.pickupLat;
  const b = o.pickupLng;
  const c = o.dropoffLat;
  const d = o.dropoffLng;
  if (
    typeof a === "number" &&
    typeof b === "number" &&
    typeof c === "number" &&
    typeof d === "number" &&
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Number.isFinite(c) &&
    Number.isFinite(d)
  ) {
    return { pickupLat: a, pickupLng: b, dropoffLat: c, dropoffLng: d };
  }
  return null;
}

function cacheDocId(service: string, zip: string): string {
  return `${service}_${zip5(zip)}`.replace(/[/\\]/g, "_");
}

async function loadPricingOverrides(service: string): Promise<PricingConfigDoc> {
  if (!adminDb) return {};
  const snap = await adminDb.collection(CONFIG_COLLECTION).doc(service).get();
  if (!snap.exists) return {};
  return (snap.data() ?? {}) as PricingConfigDoc;
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
  return Math.round((d.averagePrice + perMi * miles) * 100) / 100;
}

async function persistCache(
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
        zipCode: zip5(zip),
        lastUpdated: FieldValue.serverTimestamp(),
        source: "perplexity_ai",
      },
      { merge: true },
    );
}

export async function POST(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    service?: string;
    zipCode?: string;
    meters?: number | null;
    options?: PriceCalculationOptions;
  } | null;

  const service = String(body?.service ?? "").trim();
  const zipCode = zip5(String(body?.zipCode ?? ""));
  const meters = body?.meters ?? null;
  const options: PriceCalculationOptions = body?.options ?? {};

  if (!service) {
    return NextResponse.json({ ok: false, error: "Missing service" }, { status: 400 });
  }

  const miles = metersToMiles(meters ?? undefined);
  const overrides = await loadPricingOverrides(service);

  let parts: SubtotalParts;
  let platformFeePct: number;
  let platformFeeUsd: number;
  let griddTotalUsd: number;

  if (service === "ride") {
    const li = computeRideLineItems(miles, options, overrides);
    parts = {
      baseComponent: li.base,
      distanceComponent: li.dist,
      timeComponent: li.time,
      extraComponent: li.bookingFee,
      subtotalUsd: li.lineSubtotal,
    };
    platformFeePct = li.platformFeeRate;
    platformFeeUsd = li.platformFeeUsd;
    griddTotalUsd = li.finalTotal;
  } else {
    const partsRaw = getSubtotalParts(service, miles, options, overrides);
    const rushUsd =
      service !== "cuts" &&
      service !== "send" &&
      service !== "ride" &&
      (options.bookingUrgency ?? "") === "now"
        ? 15
        : 0;
    parts = {
      ...partsRaw,
      extraComponent: partsRaw.extraComponent + rushUsd,
      subtotalUsd: partsRaw.subtotalUsd + rushUsd,
    };
    platformFeePct = overrides.platformFee ?? DEFAULT_PLATFORM_FEE;
    const pf = applyPlatformFee(parts.subtotalUsd, platformFeePct);
    platformFeeUsd = pf.platformFeeUsd;
    griddTotalUsd = pf.totalUsd;
  }

  let competitorPrice: number | null = null;
  let rideshareLabel: "Uber est." | null = null;
  let dailyVerified = false;
  let ridePriced = false;
  let priceIQMetaRide: PriceIQMetaRide | undefined;
  let finalUsd = griddTotalUsd;
  let usedCompetitorBeat = false;

  if (service === "ride" && miles > 0) {
    const rc = rideCoordsFromOptions(options);
    if (rc) {
      const rideMinutes = getRideMinutes(options);
      const rideType = options.rideType ?? "standard";
      const rs = await fetchRideshareCompetitor(
        rc.pickupLat,
        rc.pickupLng,
        rc.dropoffLat,
        rc.dropoffLng,
        miles,
        rideMinutes,
        rideType,
      );
      competitorPrice = rs.uber;
      rideshareLabel = rs.label;
      const comp = computeRideCustomerUsd({
        uberAvg: rs.uber,
        griddList: griddTotalUsd,
        miles,
        minutes: rideMinutes,
      });
      const key = `ride_${rc.pickupLat}_${rc.pickupLng}_${rc.dropoffLat}_${rc.dropoffLng}`;
      await cachePriceMonitorRow(key, {
        route: key,
        griddPriceUsd: comp.finalUsd,
        competitorAvgUsd: rs.uber,
        uber: rs.uber,
        label: rs.label,
        miles,
        uberSource: rs.source,
        isSurging: rs.isSurging,
        surgeMultiplier: rs.surgeMultiplier,
      }).catch(() => null);
      void recordUberPriceSample(key, rs.uber).catch(() => null);
      ridePriced = true;
      finalUsd = comp.finalUsd;
      usedCompetitorBeat = comp.savings > 0.001;
      priceIQMetaRide = {
        minSavingsUsd: MINIMUM_RIDE_SAVINGS,
        live: rs.isRealTime,
        isSurging: rs.isSurging,
        surgeMultiplier: rs.surgeMultiplier,
        updatedAt: new Date().toISOString(),
        beatPercent: 0.032,
        savingsMethod: comp.method,
      };
    }
  }

  if (competitorPrice == null && service !== "ride" && zipCode.length === 5 && miles > 0) {
    const cached = await getCachedCompetitorUsd(service, zipCode, miles);
    if (cached != null) {
      dailyVerified = true;
      competitorPrice = cached;
    } else {
      const fresh = await fetchPerplexityCompetitorUsd(service, zipCode, miles);
      if (fresh != null) {
        await persistCache(service, zipCode, miles, fresh).catch(() => null);
        dailyVerified = true;
        competitorPrice = fresh;
      }
    }
  }

  const beatPct = overrides.beatPercent ?? DEFAULT_BEAT_PERCENT;
  const beatMult = 1 - beatPct;

  if (!ridePriced && competitorPrice != null && competitorPrice > 0) {
    const beatPrice = Math.round(competitorPrice * beatMult * 100) / 100;
    if (beatPrice < griddTotalUsd) {
      finalUsd = beatPrice;
      usedCompetitorBeat = true;
    }
  }

  const savingsUsd =
    competitorPrice != null && competitorPrice > finalUsd
      ? Math.round((competitorPrice - finalUsd) * 100) / 100
      : null;

  const perMileRate = getPerMileRate(service, overrides, options);

  const breakdown = buildPriceBreakdown({
    miles,
    perMileRate,
    parts,
    platformFeePct,
    platformFeeUsd,
    griddTotalUsd,
    competitorPriceUsd: competitorPrice,
    finalUsd,
  });

  const result: PriceIQEstimateResult = {
    priceUsd: finalUsd,
    miles,
    competitorPrice,
    competitorName:
      competitorPrice != null
        ? rideshareLabel ?? getCompetitorName(service)
        : null,
    savingsUsd,
    usedCompetitorBeat,
    breakdown,
    message:
      competitorPrice == null
        ? "Best price guaranteed ✓"
        : usedCompetitorBeat
          ? `Save vs ${getCompetitorName(service)}`
          : "Best price guaranteed ✓",
    priceIQMetaRide: service === "ride" ? priceIQMetaRide : undefined,
    priceIQMetaService:
      service === "ride"
        ? undefined
        : { dailyVerified, beatPercent: DEFAULT_BEAT_PERCENT },
  };

  return NextResponse.json({ ok: true, ...result });
}
