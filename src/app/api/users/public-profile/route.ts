import { NextResponse } from "next/server";
import { verifyBearerDecoded } from "@/lib/admin-auth";
import { getUser } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";

/**
 * Minimal public display info for DM headers (auth required).
 */
export async function POST(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as { uid?: string } | null;
  const uid = body?.uid?.trim();
  if (!uid) {
    return NextResponse.json({ ok: false, error: "Missing uid" }, { status: 400 });
  }

  const user = await getUser(uid);
  if (user?.blocked === true) {
    return NextResponse.json({ ok: false, error: "Unavailable" }, { status: 403 });
  }
  if (user?.name) {
    return NextResponse.json({
      ok: true,
      name: user.name,
      photo: (user as { photoURL?: string }).photoURL ?? null,
    });
  }

  const prov = await adminDb.collection("providers").doc(uid).get();
  if (prov.exists) {
    const p = prov.data() as { name?: string; photoUrl?: string; blocked?: boolean };
    if (p.blocked === true) {
      return NextResponse.json({ ok: false, error: "Unavailable" }, { status: 403 });
    }
    return NextResponse.json({
      ok: true,
      name: p.name ?? "Driver",
      photo: p.photoUrl ?? null,
    });
  }

  return NextResponse.json({ ok: true, name: "User", photo: null });
}
