import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdminBearer } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  const adminUid = await requireAdminBearer(req);
  if (!adminUid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as { uid?: string; reason?: string } | null;
  const uid = body?.uid?.trim();
  const reason = body?.reason?.trim();
  if (!uid || !reason) {
    return NextResponse.json({ ok: false, error: "Missing uid or reason" }, { status: 400 });
  }

  await adminDb
    .collection("providers")
    .doc(uid)
    .set(
      {
        verificationStatus: "rejected",
        rejectionReason: reason,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: adminUid,
      },
      { merge: true },
    );

  const origin = new URL(req.url).origin;
  await fetch(`${origin}/api/email/driver-rejected`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: req.headers.get("authorization") ?? "",
    },
    body: JSON.stringify({ uid, reason }),
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}
