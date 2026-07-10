import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { verifyBearerDecoded } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";

/** Report a DM conversation to moderation queue (CEO dashboard). */
export async function POST(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as {
    conversationId?: string;
    otherUserId?: string;
    reason?: string;
    details?: string;
    snapshot?: string;
  } | null;

  const conversationId = body?.conversationId?.trim() ?? "";
  const otherUserId = body?.otherUserId?.trim() ?? "";
  const reason = (body?.reason ?? "other").slice(0, 64);
  const details = (body?.details ?? "").slice(0, 4000);
  const snapshot = (body?.snapshot ?? "").slice(0, 8000);

  if (!conversationId || !otherUserId) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const id = adminDb.collection("dmReports").doc().id;
  await adminDb
    .collection("dmReports")
    .doc(id)
    .set({
      conversationId,
      reportedUserId: otherUserId,
      reportedBy: decoded.uid,
      reporterName: decoded.name ?? decoded.email ?? "User",
      reason,
      details,
      snapshot,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "pending",
    });

  return NextResponse.json({ ok: true, id });
}
