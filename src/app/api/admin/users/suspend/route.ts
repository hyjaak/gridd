import { NextResponse } from "next/server";
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

  const body = (await req.json().catch(() => null)) as { uid?: string; hours?: number } | null;
  const uid = body?.uid?.trim();
  const hours = typeof body?.hours === "number" && body.hours > 0 ? body.hours : 24;
  if (!uid) {
    return NextResponse.json({ ok: false, error: "Missing uid" }, { status: 400 });
  }

  const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const patch = { suspendedUntil: until };

  await adminDb.collection("users").doc(uid).set(patch, { merge: true });
  await adminDb.collection("providers").doc(uid).set(patch, { merge: true });

  return NextResponse.json({ ok: true, suspendedUntil: until });
}
