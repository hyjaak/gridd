import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { verifyDoorDashWebhookSignature } from "@/lib/doordashDrive.server";
import { processBitesRevenueOnDelivered } from "@/lib/bitesRevenue.server";
import { adminDb } from "@/lib/firebase-admin";
import { saveNotificationAndPush } from "@/lib/notify-internal";

const STATUS_MAP: Record<string, string> = {
  dasher_confirmed: "dasher_assigned",
  dasher_confirmed_pickup_arrival: "arrived_at_restaurant",
  dasher_picked_up: "picked_up",
  dasher_confirmed_dropoff_arrival: "almost_there",
  delivered: "delivered",
  delivery_cancelled: "cancelled",
  cancelled: "cancelled",
};

/**
 * Canonical DoorDash Drive webhook (`POST` only). Same handler is re-exported at
 * `/api/bites/doordash/webhook` for backwards compatibility.
 * Public URL: `https://gridd.click/api/bites/webhook`
 */
export async function POST(req: NextRequest) {
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }
  const raw = await req.text();
  const sig = req.headers.get("x-doordash-signature") ?? req.headers.get("X-DoorDash-Signature");
  if (process.env.DOORDASH_WEBHOOK_STRICT === "1" && !verifyDoorDashWebhookSignature(raw, sig)) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  let event: Record<string, unknown> = {};
  try {
    event = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }

  const del = (event.delivery as Record<string, unknown> | undefined) ?? event;
  const ext =
    (event.external_delivery_id as string) ??
    (del.external_id as string) ??
    (del.id as string) ??
    (event.external_id as string);
  if (!ext) {
    return NextResponse.json({ received: true, note: "no external id" });
  }

  const deliveryStatus =
    (event.delivery_status as string) ??
    (event.event_name as string) ??
    (del.status as string) ??
    (event.status as string) ??
    "";

  const daser = (del.dasher as Record<string, unknown> | undefined) ?? (event.dasher as Record<string, unknown>);
  const loc = daser?.location as { lat?: number; lng?: number } | undefined;

  const griddStatus = (STATUS_MAP[deliveryStatus] ?? deliveryStatus) || "en_route";
  const ref = adminDb.collection("biteOrders").doc(ext);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ received: true, note: "unknown order" });
  }
  const customerId = (snap.data() as { customerId?: string }).customerId;

  const update: Record<string, unknown> = {
    status: griddStatus,
    lastUpdated: FieldValue.serverTimestamp(),
  };
  if (daser) {
    update.dasherName = (daser.name as string) ?? null;
    update.dasherPhoto = (daser.img_href as string) ?? (daser.photo as string) ?? null;
    update.dasherPhone = (daser.phone_number as string) ?? (daser.phone as string) ?? null;
  }
  if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
    update.dasherLocation = { lat: loc.lat, lng: loc.lng };
  }
  if (griddStatus === "delivered") {
    update.awaitingRating = true;
    update.deliveredAt = FieldValue.serverTimestamp();
  }
  if (del.estimated_arrival) {
    try {
      update.estimatedDelivery = Timestamp.fromDate(new Date(String(del.estimated_arrival)));
    } catch {
      /* ignore */
    }
  }
  await ref.update(update);

  if (customerId && griddStatus === "dasher_assigned") {
    await saveNotificationAndPush({
      userId: customerId,
      event: "bites_dasher_assigned",
      title: "🛵 Dasher assigned",
      body: `${(update.dasherName as string) || "Your Dasher"} is heading to the restaurant`,
      color: "#3B82F6",
    });
  }
  if (customerId && griddStatus === "picked_up") {
    await saveNotificationAndPush({
      userId: customerId,
      event: "bites_picked_up",
      title: "🍗 Your food is on the way!",
      body: `${(update.dasherName as string) || "Your Dasher"} picked up your order`,
      color: "#ff6b00",
    });
  }
  if (customerId && griddStatus === "almost_there") {
    await saveNotificationAndPush({
      userId: customerId,
      event: "bites_almost_there",
      title: "📍 Almost there!",
      body: "Your Dasher is pulling up with your order",
      color: "#8B5CF6",
    });
  }
  if (customerId && griddStatus === "delivered") {
    await processBitesRevenueOnDelivered(ext).catch(() => null);
    await saveNotificationAndPush({
      userId: customerId,
      event: "bites_delivered",
      title: "✅ Delivered!",
      body: "Your GRIDD Bites order arrived 🎉 — tap to rate",
      color: "#00FF88",
    });
  }

  return NextResponse.json({ received: true });
}
