import { NextResponse } from "next/server";
import { verifyBearerDecoded } from "@/lib/admin-auth";
import { uberApi } from "@/lib/uberApi";
import { setJobCustomerRating } from "@/lib/uberServerSync";
import { getValidUserAccessToken } from "@/lib/uberUserSession";

export async function POST(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    requestId?: string;
    rating?: number;
    feedback?: string;
    tipUsd?: number;
  } | null;
  const requestId = body?.requestId?.trim() ?? "";
  const rating = Number(body?.rating);
  if (!requestId || !Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ ok: false, error: "requestId and rating 1–5 required" }, { status: 400 });
  }
  const token = await getValidUserAccessToken(decoded.uid);
  await uberApi.rateRide(token, requestId, {
    rating: Math.round(rating),
    feedback: body?.feedback,
    tipUsd: body?.tipUsd,
  });
  await setJobCustomerRating(requestId, {
    rating: Math.round(rating),
    feedback: body?.feedback,
    tipUsd: body?.tipUsd,
  });
  return NextResponse.json({ ok: true });
}
