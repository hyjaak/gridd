import { NextResponse } from "next/server";
import admin, { adminAuth, adminDb } from "@/lib/firebase-admin";
import { verifyBearerUid } from "@/lib/notify-internal";

export const runtime = "nodejs";

/** CEO only — revokes refresh tokens so user must sign in again. */
export async function POST(req: Request) {
  if (!adminAuth) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }
  const uid = await verifyBearerUid(req);
  if (!uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }
  const snap = await adminDb.collection("users").doc(uid).get();
  const role = snap.exists ? (snap.data() as { role?: string }).role : undefined;
  if (role !== "ceo") {
    return NextResponse.json({ ok: false, error: "CEO only" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { targetUid?: string } | null;
  const target = body?.targetUid?.trim();
  if (!target) {
    return NextResponse.json({ ok: false, error: "targetUid required" }, { status: 400 });
  }

  try {
    await admin.auth().revokeRefreshTokens(target);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "revoke failed" },
      { status: 500 },
    );
  }

  await adminDb.collection("ceoAlerts").add({
    type: "session_revoked",
    message: `Sessions revoked for ${target} by CEO ${uid}`,
    metadata: { targetUid: target },
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    priority: "low",
  });

  return NextResponse.json({ ok: true });
}
