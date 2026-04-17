import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyBearerUid } from "@/lib/notify-internal";

/** Driver calls after submitting documents — creates admin alert. */
export async function POST(req: Request) {
  const uid = await verifyBearerUid(req);
  if (!uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!adminDb) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await adminDb.collection("alerts").add({
    severity: "warning",
    title: "New driver application",
    body: `Driver ${uid} submitted documents for CEO review.`,
    uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
