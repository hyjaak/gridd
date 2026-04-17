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

  const body = (await req.json().catch(() => null)) as { uid?: string } | null;
  const uid = body?.uid?.trim();
  if (!uid) {
    return NextResponse.json({ ok: false, error: "Missing uid" }, { status: 400 });
  }

  await adminDb.collection("providers").doc(uid).set({ verified: true }, { merge: true });
  return NextResponse.json({ ok: true });
}
