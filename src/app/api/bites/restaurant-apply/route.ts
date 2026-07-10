import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { createCeoAlertServer } from "@/lib/ceo-alerts-server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

/**
 * Public application for restaurants to join GRIDD Bites (CEO approves in dashboard).
 */
export async function POST(req: NextRequest) {
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }
  let body: {
    businessName?: string;
    address?: string;
    phone?: string;
    cuisine?: string;
    notes?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.businessName ?? "").trim();
  const address = (body.address ?? "").trim();
  const phone = (body.phone ?? "").trim();
  if (name.length < 2 || address.length < 6 || phone.length < 7) {
    return NextResponse.json({ ok: false, error: "Name, address, and phone required" }, { status: 400 });
  }

  const ref = await adminDb.collection("restaurantApplications").add({
    businessName: name,
    address,
    phone,
    cuisine: (body.cuisine ?? "").trim(),
    notes: (body.notes ?? "").trim().slice(0, 2000),
    status: "pending",
    commissionPercent: 15,
    createdAt: FieldValue.serverTimestamp(),
  });

  await createCeoAlertServer({
    type: "restaurant_application",
    message: `New restaurant application: ${name} — ${phone}`,
    priority: "medium",
    metadata: { applicationId: ref.id },
    skipPush: true,
  }).catch(() => null);

  return NextResponse.json({ ok: true, id: ref.id });
}
