import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { canAccessBintaVault } from "@/lib/ceo-vault-guard";

export const runtime = "nodejs";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function POST(req: Request) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }
  if (!(await canAccessBintaVault(decoded.uid))) {
    return NextResponse.json({ ok: false, error: "Vault access denied" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { monthlyGoalCents?: number } | null;
  const c = Math.round(Number(body?.monthlyGoalCents));
  if (!Number.isFinite(c) || c < 0) {
    return NextResponse.json({ ok: false, error: "Invalid goal" }, { status: 400 });
  }
  await adminDb
    .collection("vault")
    .doc("main")
    .set(
      {
        monthlyGoalCents: c,
        monthlyGoalSetAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  return NextResponse.json({ ok: true });
}
