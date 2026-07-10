import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { createDoorDashDelivery, parseDriveDeliveryResponse } from "@/lib/doordashDrive.server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

type Body = {
  orderId: string;
  /** dollars */
  orderValue: number;
  tipCents?: number;
  pickup: { name: string; address: string; phone: string; instructions?: string };
  dropoff: { name: string; address: string; phone: string; instructions?: string };
};

/**
 * After the client creates `biteOrders/{orderId}`, call this to request a DoorDash Dasher
 * and persist Drive IDs on the same document.
 */
export async function POST(req: NextRequest) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }
  const authz = req.headers.get("authorization");
  const token = authz?.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let uid: string;
  try {
    const dec = await adminAuth.verifyIdToken(token);
    uid = dec.uid;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const { orderId, orderValue, pickup, dropoff, tipCents } = body;
  if (!orderId || !pickup || !dropoff || typeof orderValue !== "number") {
    return NextResponse.json({ ok: false, error: "orderId, orderValue, pickup, dropoff required" }, { status: 400 });
  }

  const ref = adminDb.collection("biteOrders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
  }
  const data = snap.data() as { customerId?: string; status?: string };
  if (data.customerId !== uid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const raw = (await createDoorDashDelivery(
      orderId,
      {
        name: pickup.name,
        address: pickup.address,
        phone: pickup.phone,
        instructions: pickup.instructions ?? "Pick up for GRIDD Bites",
      },
      {
        name: dropoff.name,
        address: dropoff.address,
        phone: dropoff.phone,
        instructions: dropoff.instructions ?? "GRIDD delivery",
      },
      orderValue,
      tipCents ?? 0,
    )) as unknown;
    const parsed = parseDriveDeliveryResponse(raw);
    if (!parsed.id) {
      await ref.update({ status: "failed", lastUpdated: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: false, error: "DoorDash did not return an id" }, { status: 502 });
    }

    await ref.update({
      doordashDeliveryId: parsed.id,
      doordashExternalId: orderId,
      status: "dasher_assigned",
      dasherName: parsed.dasherName ?? null,
      dasherPhoto: parsed.dasherPhoto ?? null,
      dasherPhone: parsed.dasherPhone ?? null,
      lastUpdated: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      deliveryId: parsed.id,
      raw,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "DoorDash error";
    await ref
      .update({ status: "failed", lastUpdated: FieldValue.serverTimestamp() })
      .catch(() => null);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
