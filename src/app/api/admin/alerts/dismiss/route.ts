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

  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  }

  await adminDb.collection("alerts").doc(id).delete().catch(() => null);
  return NextResponse.json({ ok: true });
}
