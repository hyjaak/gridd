import { NextResponse } from "next/server";
import { verifyBearerDecoded } from "@/lib/admin-auth";
import { deleteUberTokensForUser, getUberTokensForUser } from "@/lib/uberServerSync";

export async function GET(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const t = await getUberTokensForUser(decoded.uid);
  return NextResponse.json({
    ok: true,
    connected: t != null,
    expiresAt: t?.expiresAt ?? null,
  });
}

export async function DELETE(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  await deleteUberTokensForUser(decoded.uid);
  return NextResponse.json({ ok: true });
}
