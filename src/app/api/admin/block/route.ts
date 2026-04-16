import { NextResponse } from "next/server";
import { requireAdminBearer } from "@/lib/admin-auth";
import { blockUserEverywhere } from "@/lib/db";

export async function POST(req: Request) {
  const adminUid = await requireAdminBearer(req);
  if (!adminUid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { uid?: string } | null;
  const uid = body?.uid?.trim();
  if (!uid) {
    return NextResponse.json({ ok: false, error: "Missing uid" }, { status: 400 });
  }

  await blockUserEverywhere(uid);
  return NextResponse.json({ ok: true });
}
