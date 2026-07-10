import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyBearerDecoded } from "@/lib/admin-auth";
import { uberApi } from "@/lib/uberApi";
import { savePendingOauthState } from "@/lib/uberServerSync";

/**
 * Returns Uber OAuth URL with server-side `state` (maps to your Firebase user after callback).
 */
export async function GET(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.NEXT_PUBLIC_UBER_CLIENT_ID) {
    return NextResponse.json({ ok: false, error: "NEXT_PUBLIC_UBER_CLIENT_ID not configured" }, { status: 500 });
  }

  const state = randomBytes(24).toString("hex");
  await savePendingOauthState(state, decoded.uid, 12);
  const url = uberApi.getAuthUrl(state);
  return NextResponse.json({ ok: true, url });
}
