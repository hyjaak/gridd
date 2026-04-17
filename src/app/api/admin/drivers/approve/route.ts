import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdminBearer } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";
import { saveNotificationAndPush } from "@/lib/notify-internal";

export async function POST(req: Request) {
  const adminUid = await requireAdminBearer(req);
  if (!adminUid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as { uid?: string } | null;
  const uid = body?.uid?.trim();
  if (!uid) {
    return NextResponse.json({ ok: false, error: "Missing uid" }, { status: 400 });
  }

  await adminDb
    .collection("providers")
    .doc(uid)
    .set(
      {
        verified: true,
        verificationStatus: "approved",
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: adminUid,
        status: "offline",
      },
      { merge: true },
    );

  const origin = new URL(req.url).origin;
  await fetch(`${origin}/api/email/driver-approved`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: req.headers.get("authorization") ?? "",
    },
    body: JSON.stringify({ uid }),
  }).catch(() => null);

  try {
    await saveNotificationAndPush({
      userId: uid,
      event: "driver_approved",
      title: "🎉 You're approved!",
      body: "Your GRIDD driver account is active. Go online and start earning.",
      icon: "✅",
      color: "#00FF88",
    });
  } catch {
    /* notification optional */
  }

  return NextResponse.json({ ok: true });
}
