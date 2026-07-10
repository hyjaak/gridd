import { NextRequest, NextResponse } from "next/server";
import { getDoorDashDeliveryByExternalId } from "@/lib/doordashDrive.server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function bearer(req: NextRequest) {
  const a = req.headers.get("authorization") ?? "";
  const m = a.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/**
 * Authenticated poll of DoorDash delivery by order id (external id on Drive).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }
  const token = bearer(req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  const { orderId } = await ctx.params;
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "orderId required" }, { status: 400 });
  }

  const snap = await adminDb.collection("biteOrders").doc(orderId).get();
  if (!snap.exists) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const data = snap.data() as { customerId?: string };
  if (data.customerId !== uid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const delivery = await getDoorDashDeliveryByExternalId(orderId);
    return NextResponse.json({ ok: true, delivery });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "DoorDash error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
