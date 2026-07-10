import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchDeveloperBusinessesDoorDash,
  fetchNearbyBusinessesDoorDash,
} from "@/lib/doordashRestaurants.server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { manualRestaurantDocToLinkedBusiness } from "@/lib/bitesManualRestaurant";
import type { DoorDashLinkedBusiness } from "@/types/bitesDoordash";

export const runtime = "nodejs";

function bearer(req: NextRequest) {
  const a = req.headers.get("authorization") ?? "";
  const m = a.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function dedupeById(list: DoorDashLinkedBusiness[]): DoorDashLinkedBusiness[] {
  const m = new Map<string, DoorDashLinkedBusiness>();
  for (const b of list) m.set(b.id, b);
  return [...m.values()];
}

async function cacheBusinesses(list: DoorDashLinkedBusiness[]) {
  if (!adminDb) return;
  for (const b of list) {
    const safeId = b.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 150) || "unknown";
    await adminDb
      .collection("restaurants")
      .doc(safeId)
      .set(
        {
          doordashId: b.doordashId,
          name: b.name,
          address: b.address,
          lat: b.lat,
          lng: b.lng,
          phone: b.phone,
          cuisine: b.cuisine,
          rating: b.rating,
          deliveryTime: b.deliveryTime,
          deliveryFee: b.deliveryFee,
          minOrder: b.minOrder,
          imageUrl: b.imageUrl,
          isOpen: b.isOpen,
          priceRange: b.priceRange,
          source: b.source,
          bitesCachedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      .catch(() => null);
  }
}

/**
 * GET ?lat=&lng=&radius=5 — returns DoorDash-linked businesses (nearby try, then developer list).
 * Auth: Firebase ID token (customer).
 */
export async function GET(req: NextRequest) {
  if (!adminAuth) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }
  const token = bearer(req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const radius = Math.min(25, Math.max(1, Number(sp.get("radius")) || 5));

  let combined: DoorDashLinkedBusiness[] = [];
  let source: string[] = [];

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const nearby = await fetchNearbyBusinessesDoorDash(lat, lng, radius);
    combined = combined.concat(nearby);
    if (nearby.length) source.push("doordash_nearby");
  }

  const dev = await fetchDeveloperBusinessesDoorDash();
  combined = combined.concat(dev);
  if (dev.length) source.push("doordash_developer");

  if (adminDb) {
    const manualSnap = await adminDb.collection("restaurants").where("isManualEntry", "==", true).get().catch(() => null);
    if (manualSnap && !manualSnap.empty) {
      const manualRows = manualSnap.docs.map((d) =>
        manualRestaurantDocToLinkedBusiness(d.id, (d.data() ?? {}) as Record<string, unknown>),
      );
      combined = manualRows.concat(combined);
      source.push("manual");
    }
  }

  combined = dedupeById(combined);

  await cacheBusinesses(combined);

  return NextResponse.json({
    ok: true,
    businesses: combined,
    source: source.length ? source.join("+") : "empty",
    count: combined.length,
  });
}
