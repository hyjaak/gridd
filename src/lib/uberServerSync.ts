import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import type { UberRideDetail, UberReceipt } from "@/lib/uberTypes";

const PENDING = "pendingUberOauth";
const UBER_INTEGRATION = "uber";

export type StoredUberTokens = {
  accessToken: string;
  refreshToken?: string;
  /** epoch ms */
  expiresAt: number;
  updatedAt: FirebaseFirestore.FieldValue;
};

function userUberRef(uid: string) {
  return adminDb?.collection("users").doc(uid).collection("private").doc(UBER_INTEGRATION);
}

export async function saveUberTokensForUser(
  uid: string,
  accessToken: string,
  refreshToken: string | undefined,
  expiresInSec: number | undefined,
): Promise<void> {
  if (!adminDb) return;
  const ref = userUberRef(uid);
  if (!ref) return;
  const now = Date.now();
  const expMs = expiresInSec && expiresInSec > 0 ? now + expiresInSec * 1000 : now + 3600 * 1000;
  const payload: Record<string, unknown> = {
    accessToken,
    refreshToken: refreshToken ?? null,
    expiresAt: expMs,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(payload, { merge: true });
}

export async function getUberTokensForUser(
  uid: string,
): Promise<{ accessToken: string; refreshToken?: string; expiresAt: number } | null> {
  if (!adminDb) return null;
  const ref = userUberRef(uid);
  if (!ref) return null;
  const snap = await ref.get();
  if (!snap.exists) return null;
  const d = snap.data() as { accessToken?: string; refreshToken?: string; expiresAt?: number };
  if (typeof d.accessToken !== "string") return null;
  return {
    accessToken: d.accessToken,
    refreshToken: typeof d.refreshToken === "string" ? d.refreshToken : undefined,
    expiresAt: typeof d.expiresAt === "number" ? d.expiresAt : 0,
  };
}

export async function deleteUberTokensForUser(uid: string): Promise<void> {
  if (!adminDb) return;
  const ref = userUberRef(uid);
  if (!ref) return;
  await ref.delete();
}

export async function savePendingOauthState(state: string, uid: string, ttlMin = 12): Promise<void> {
  if (!adminDb) return;
  const exp = new Date(Date.now() + ttlMin * 60 * 1000);
  await adminDb.collection(PENDING).doc(state).set({
    uid,
    expMs: exp.getTime(),
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function takePendingOauthState(state: string): Promise<string | null> {
  if (!adminDb) return null;
  const ref = adminDb.collection(PENDING).doc(state);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const d = snap.data() as { uid?: string; expMs?: number };
  const uid = d.uid;
  if (typeof uid !== "string" || !uid) {
    await ref.delete().catch(() => null);
    return null;
  }
  if (typeof d.expMs === "number" && d.expMs < Date.now() - 5000) {
    await ref.delete().catch(() => null);
    return null;
  }
  await ref.delete().catch(() => null);
  return uid;
}

export async function setNearbyProductPulse(
  lat: number,
  lng: number,
  productCount: number,
): Promise<void> {
  if (!adminDb) return;
  const id = `${Math.round(lat * 1000)}_${Math.round(lng * 1000)}`;
  await adminDb
    .collection("nearbyDrivers")
    .doc(id)
    .set(
      {
        count: productCount,
        lat,
        lng,
        source: "uber_products",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function upsertJobUberRequest(params: {
  jobDocId: string;
  uberRequestId: string;
  status: string;
  productId: string;
  startAddress: string;
  endAddress: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}): Promise<void> {
  if (!adminDb) return;
  await adminDb
    .collection("jobs")
    .doc(params.jobDocId)
    .set(
      {
        uberRequestId: params.uberRequestId,
        fulfillment: "uber" as const,
        uberStatus: params.status,
        serviceId: "ride",
        type: "ride",
        addressLine: `${params.startAddress} → ${params.endAddress}`,
        updatedAt: FieldValue.serverTimestamp(),
        bookingDetails: {
          pickup: { address: params.startAddress, lat: params.startLat, lng: params.startLng },
          dropoff: { address: params.endAddress, lat: params.endLat, lng: params.endLng },
          productId: params.productId,
        },
      },
      { merge: true },
    );
}

function detailStatus(d: UberRideDetail): string {
  return String(d.status ?? d.request?.status ?? "");
}

export async function updateJobFromUberDetail(requestId: string, data: UberRideDetail): Promise<void> {
  if (!adminDb) return;
  const q = await adminDb.collection("jobs").where("uberRequestId", "==", requestId).limit(3).get();
  if (q.empty) return;
  const st = detailStatus(data);
  const loc = data.location;
  const path: Record<string, unknown> = {
    uberStatus: st,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (loc) {
    path["driverLocation"] = {
      lat: loc.latitude,
      lng: loc.longitude,
      bearing: loc.bearing,
    };
  }
  if (data.driver) {
    path["uberDriver"] = {
      name: data.driver.name,
      phone: data.driver.phone_number,
      rating: data.driver.rating,
      pictureUrl: data.driver.picture_url,
    };
  }
  if (data.vehicle) {
    path["vehicle"] = {
      make: data.vehicle.make,
      model: data.vehicle.model,
      plate: data.vehicle.license_plate,
      color: data.vehicle.color,
    };
  }
  if (data.pickup?.eta != null) {
    path["etaMinutes"] = Math.round((data.pickup.eta as number) / 60);
  }
  for (const doc of q.docs) {
    await doc.ref.set(path, { merge: true });
  }
}

export async function applyReceiptToJob(requestId: string, receipt: UberReceipt): Promise<void> {
  if (!adminDb) return;
  const q = await adminDb.collection("jobs").where("uberRequestId", "==", requestId).limit(3).get();
  if (q.empty) return;
  const patch: Record<string, unknown> = {
    status: "completed" as const,
    uberStatus: "completed",
    completedAt: new Date().toISOString(),
    uberReceipt: {
      totalCharged: receipt.total_charged,
      totalFare: receipt.total_fare,
      subtotal: receipt.subtotal,
      distance: receipt.distance,
      duration: receipt.duration,
    },
    updatedAt: FieldValue.serverTimestamp(),
  };
  for (const doc of q.docs) {
    await doc.ref.set(patch, { merge: true });
  }
}

export async function setJobCancelledByUber(requestId: string): Promise<void> {
  if (!adminDb) return;
  const q = await adminDb.collection("jobs").where("uberRequestId", "==", requestId).limit(3).get();
  for (const doc of q.docs) {
    await doc.ref.set(
      {
        status: "cancelled",
        uberStatus: "cancelled",
        cancelledAt: new Date().toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
}

export async function setJobCustomerRating(
  requestId: string,
  r: { rating: number; feedback?: string; tipUsd?: number },
): Promise<void> {
  if (!adminDb) return;
  const q = await adminDb.collection("jobs").where("uberRequestId", "==", requestId).limit(3).get();
  for (const doc of q.docs) {
    await doc.ref.set(
      {
        customerRating: r.rating,
        customerFeedback: r.feedback ?? null,
        tipCents: r.tipUsd != null ? Math.round(r.tipUsd * 100) : null,
        reviewSubmittedAt: new Date().toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
}

