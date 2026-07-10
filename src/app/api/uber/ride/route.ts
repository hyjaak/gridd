import { NextResponse } from "next/server";
import { verifyBearerDecoded } from "@/lib/admin-auth";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { uberApi } from "@/lib/uberApi";
import { upsertJobUberRequest } from "@/lib/uberServerSync";
import { getValidUserAccessToken } from "@/lib/uberUserSession";

type Body = {
  productId: string;
  fareId?: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startAddress: string;
  endAddress: string;
  jobId?: string;
};

/**
 * Create an Uber trip (user must have completed OAuth). Optionally attach to a GRIDD `jobs` doc.
 */
export async function POST(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.productId || typeof body.startAddress !== "string" || typeof body.endAddress !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  if (![body.startLat, body.startLng, body.endLat, body.endLng].every((n) => typeof n === "number" && Number.isFinite(n))) {
    return NextResponse.json({ ok: false, error: "Invalid coordinates" }, { status: 400 });
  }
  const token = await getValidUserAccessToken(decoded.uid);
  const ride = await uberApi.requestRide(token, {
    product_id: body.productId,
    fare_id: body.fareId,
    start_latitude: body.startLat,
    start_longitude: body.startLng,
    start_address: body.startAddress,
    end_latitude: body.endLat,
    end_longitude: body.endLng,
    end_address: body.endAddress,
  });
  const requestId = String(ride.request_id ?? "");
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "No request_id" }, { status: 500 });
  }

  let jobDocId = body.jobId?.trim() || "";
  if (jobDocId && adminDb) {
    const ref = adminDb.collection("jobs").doc(jobDocId);
    const snap = await ref.get();
    if (!snap.exists) jobDocId = "";
    const j = snap.data() as { customerUid?: string } | undefined;
    if (j?.customerUid !== decoded.uid) jobDocId = "";
  }
  if (!jobDocId && adminDb) {
    let customerName = "Customer";
    if (adminAuth) {
      const u = await adminAuth.getUser(decoded.uid).catch(() => null);
      if (u?.displayName) customerName = u.displayName;
      else if (u?.email) customerName = u.email.split("@")[0] ?? customerName;
    }
    const ref = await adminDb.collection("jobs").add({
      customerUid: decoded.uid,
      customerName,
      serviceId: "ride",
      serviceName: "Ride",
      tier: "standard",
      city: "Rideshare",
      zip: "",
      addressLine: `${body.startAddress} → ${body.endAddress}`,
      status: "pending",
      amountCents: 0,
      paymentStatus: "pending",
      payoutStatus: "none",
      fulfillment: "uber",
      createdAt: new Date().toISOString(),
    });
    jobDocId = ref.id;
  }
  if (jobDocId) {
    await upsertJobUberRequest({
      jobDocId,
      uberRequestId: requestId,
      status: String(ride.status ?? "pending"),
      productId: body.productId,
      startAddress: body.startAddress,
      endAddress: body.endAddress,
      startLat: body.startLat,
      startLng: body.startLng,
      endLat: body.endLat,
      endLng: body.endLng,
    });
  }

  return NextResponse.json({ ok: true, requestId, jobId: jobDocId || null, raw: ride });
}
