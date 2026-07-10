import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { computeRideLineItems } from "@/lib/calculatePrice";
import { getSmartPrice } from "@/lib/priceMonitor";
import { sendSurgeOpportunityAlerts } from "@/lib/surge-opportunity";
import { nominatimZipCenter, offsetNorthMiles } from "@/lib/zipGeocode";

const TOP = 8;
const BENCH_MILES = 10;
const BENCH_MIN = 22;

/**
 * Scheduled ride market snapshot: active ZIPs → `marketRates` + optional `ceoAlerts` on surge-like spread.
 * Vercel Hobby: daily cron only (see `vercel.json`). Pro: increase frequency to every five minutes.
 * Authorization: Bearer CRON_SECRET
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Admin not configured" }, { status: 500 });
  }

  const snap = await adminDb.collection("jobs").limit(400).get().catch(() => null);
  const zipCounts: Record<string, number> = {};
  snap?.docs.forEach((d) => {
    const z = String(d.data()?.zip ?? "").replace(/\D/g, "").slice(0, 5);
    if (z.length === 5) zipCounts[z] = (zipCounts[z] ?? 0) + 1;
  });
  const topZips = Object.entries(zipCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([z]) => z);

  if (topZips.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, message: "No ZIPs from recent jobs" });
  }

  let updated = 0;
  for (const zip of topZips) {
    const center = (await nominatimZipCenter(zip)) ?? { lat: 33.749, lng: -84.388 };
    const end = offsetNorthMiles(center.lat, center.lng, BENCH_MILES);
    const li = computeRideLineItems(
      BENCH_MILES,
      { rideType: "standard", durationMinutes: BENCH_MIN },
      {},
    );
    const griddBase = li.finalTotal;
    const smart = await getSmartPrice(
      center.lat,
      center.lng,
      end.lat,
      end.lng,
      BENCH_MILES,
      BENCH_MIN,
      "standard",
    );
    const peak = smart.uberPrice;
    const sur = smart.surgeMultiplier ?? 1;
    const surgeLike = Boolean(smart.isSurging) || sur > 1.1 || peak > griddBase * 1.45;

    await adminDb
      .collection("marketRates")
      .doc(zip)
      .set(
        {
          zip,
          uberPrice: smart.uberPrice,
          griddPrice: smart.griddPrice,
          griddListUsd: griddBase,
          savings: smart.savings,
          benchMiles: BENCH_MILES,
          isSurging: smart.isSurging,
          surgeMultiplier: smart.surgeMultiplier,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    updated++;

    if (surgeLike && (smart.savings ?? 0) > 3) {
      void sendSurgeOpportunityAlerts({
        zip,
        surgeMultiplier: smart.surgeMultiplier ?? 1.2,
        griddSavings: smart.savings ?? 0,
        uberPrice: smart.uberPrice,
        griddPrice: smart.griddPrice,
      });
    } else if (surgeLike) {
      await adminDb.collection("ceoAlerts").add({
        type: "competitor_surge",
        message: `Rideshare estimates elevated in ${zip} (benchmark ${BENCH_MILES} mi) — review PriceIQ™.`,
        metadata: { zip, peak, griddBase, uber: smart.uberPrice },
        priority: "normal",
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  return NextResponse.json({ ok: true, updated, zips: topZips });
}
