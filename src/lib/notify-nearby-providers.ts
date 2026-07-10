import admin from "@/lib/firebase-admin";
import { adminDb } from "@/lib/firebase-admin";
import { canGoOnline } from "@/lib/driver-gate";
import { getJob } from "@/lib/db";
import { haversineMiles } from "@/lib/geo";
import { saveNotificationAndPush } from "@/lib/notify-internal";
import type { Job, Provider } from "@/types";

const MAX_RADIUS_MILES = 25;
const MAX_PROVIDERS_SCAN = 400;

function pickupPointFromJob(job: Job): { lat: number; lng: number } | null {
  const p = job.pickup;
  if (p && typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat + p.lng)) {
    return { lat: p.lat, lng: p.lng };
  }
  const b = job.bookingDetails;
  if (b && typeof b === "object") {
    const raw = (b as Record<string, unknown>).pickupCoords;
    if (raw && typeof raw === "object" && "lat" in raw && "lng" in raw) {
      const lat = Number((raw as { lat: unknown }).lat);
      const lng = Number((raw as { lng: unknown }).lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    const ac = (b as Record<string, unknown>).addressCoords;
    if (ac && typeof ac === "object" && "lat" in ac && "lng" in ac) {
      const lat = Number((ac as { lat: unknown }).lat);
      const lng = Number((ac as { lng: unknown }).lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }
  return null;
}

/**
 * FCM + in-app notification to on-duty drivers near the job pickup after payment.
 * Open-market jobs only (no pre-assigned `providerUid`).
 */
export async function notifyNearbyProvidersForJob(jobId: string): Promise<{ sent: number; skipped: string }> {
  if (!adminDb || !admin.apps.length) {
    return { sent: 0, skipped: "no_admin" };
  }

  const job = await getJob(jobId);
  if (!job) return { sent: 0, skipped: "no_job" };
  if (job.providerUid) return { sent: 0, skipped: "has_provider" };
  if (job.paymentStatus !== "confirmed") return { sent: 0, skipped: "unpaid" };
  if (!["pending", "requested"].includes(job.status)) {
    return { sent: 0, skipped: "bad_status" };
  }

  const origin = pickupPointFromJob(job);
  if (!origin) return { sent: 0, skipped: "no_pickup_coords" };

  const serviceId = job.serviceId;
  const snap = await adminDb
    .collection("providers")
    .where("isOnline", "==", true)
    .limit(MAX_PROVIDERS_SCAN)
    .get()
    .catch(() => null);
  if (!snap?.docs.length) return { sent: 0, skipped: "no_online" };

  const candidates: { uid: string; p: Provider; token?: string; dist: number }[] = [];
  for (const d of snap.docs) {
    const p = { uid: d.id, ...(d.data() as Omit<Provider, "uid">) };
    if (!canGoOnline(p)) continue;
    if (p.activeJob) continue;
    const ids = p.serviceIds ?? [];
    if (!ids.includes(serviceId)) continue;
    const loc = p.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") continue;
    const dist = haversineMiles(origin.lat, origin.lng, loc.lat, loc.lng);
    if (dist > MAX_RADIUS_MILES) continue;
    const token = typeof p.fcmToken === "string" && p.fcmToken.length > 20 ? p.fcmToken : undefined;
    candidates.push({ uid: p.uid, p, token, dist });
  }

  if (candidates.length === 0) return { sent: 0, skipped: "no_match" };

  const price = typeof job.amountCents === "number" ? (job.amountCents / 100).toFixed(2) : "?";
  const address = job.pickup?.address ?? job.addressLine ?? "See app";
  let sent = 0;

  const title = `New ${job.serviceName} job! 💰`;
  const body = `$${price} — ${address}`;
  const fcmTokens = candidates.map((c) => c.token).filter((t): t is string => Boolean(t));
  if (fcmTokens.length) {
    const chunkSize = 500;
    for (let i = 0; i < fcmTokens.length; i += chunkSize) {
      const tok = fcmTokens.slice(i, i + chunkSize);
      try {
        const resp = await admin.messaging().sendEachForMulticast({
          tokens: tok,
          notification: { title, body },
          data: {
            action: "new_job",
            jobId,
            type: serviceId,
            price: String(price),
          },
        });
        sent += resp.successCount;
      } catch {
        /* ignore */
      }
    }
  }

  const notifTime = new Date().toISOString();
  for (const c of candidates) {
    await saveNotificationAndPush({
      userId: c.uid,
      event: "new_job",
      title: "New job nearby",
      body: `${job.serviceName} · $${price} · open to accept`,
      icon: "📦",
      color: "#00FF88",
    }).catch(() => null);

    await adminDb
      .collection("driverNotifications")
      .add({
        driverId: c.uid,
        jobId,
        type: "new_job",
        message: `New ${job.serviceName} — $${price}`,
        read: false,
        distMiles: Math.round(c.dist * 10) / 10,
        createdAt: notifTime,
      })
      .catch(() => null);
  }

  return { sent, skipped: "ok" };
}
