import { NextResponse } from "next/server";
import { verifyBearerDecoded } from "@/lib/admin-auth";
import { getRideMinutes, metersToMiles, type PriceCalculationOptions } from "@/lib/calculatePrice";
import { buildRideTierEstimates } from "@/lib/uberGriddTiers";
import { uberApi } from "@/lib/uberApi";
import { setNearbyProductPulse } from "@/lib/uberServerSync";

type EstBody = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  meters?: number | null;
  durationSeconds?: number;
};

async function runEstimates(
  _uid: string,
  slat: number,
  slng: number,
  elat: number,
  elng: number,
  meters: number | null | undefined,
  sec: number,
) {
  const miles = metersToMiles(meters != null ? Number(meters) : undefined);
  const opt: PriceCalculationOptions = {
    durationSeconds: sec > 0 ? sec : undefined,
    durationMinutes: sec > 0 ? sec / 60 : 15,
  };
  const minutes = getRideMinutes(opt);

  const [tiers, products] = await Promise.all([
    buildRideTierEstimates({
      startLat: slat,
      startLng: slng,
      endLat: elat,
      endLng: elng,
      miles: Math.max(0, miles),
      minutes,
    }),
    uberApi.getProducts(slat, slng),
  ]);
  if (products.products?.length) {
    await setNearbyProductPulse(slat, slng, products.products.length);
  }

  return {
    ok: true as const,
    miles: Math.max(0, miles),
    minutes: Math.round(minutes * 10) / 10,
    tiers,
  };
}

/**
 * Authenticated: Uber price + ETA + GRIDD tier prices (server token) for the active route.
 * GET: query `startLat` `startLng` `endLat` `endLng` `meters` `durationSeconds`
 * POST: same fields JSON body
 */
export async function GET(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const slat = Number(url.searchParams.get("startLat"));
  const slng = Number(url.searchParams.get("startLng"));
  const elat = Number(url.searchParams.get("endLat"));
  const elng = Number(url.searchParams.get("endLng"));
  const meters = url.searchParams.get("meters");
  const sec = Number(url.searchParams.get("durationSeconds") ?? "0");

  if (![slat, slng, elat, elng].every((n) => Number.isFinite(n))) {
    return NextResponse.json({ ok: false, error: "Missing coordinates" }, { status: 400 });
  }

  const m = meters != null && meters !== "" ? Number(meters) : null;
  return NextResponse.json(
    await runEstimates(decoded.uid, slat, slng, elat, elng, m, sec),
  );
}

export async function POST(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as EstBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const slat = body.startLat;
  const slng = body.startLng;
  const elat = body.endLat;
  const elng = body.endLng;
  if (![slat, slng, elat, elng].every((n) => typeof n === "number" && Number.isFinite(n))) {
    return NextResponse.json({ ok: false, error: "Missing coordinates" }, { status: 400 });
  }
  const sec = Number(body.durationSeconds ?? 0);
  return NextResponse.json(
    await runEstimates(
      decoded.uid,
      slat,
      slng,
      elat,
      elng,
      body.meters != null ? Number(body.meters) : null,
      sec,
    ),
  );
}
