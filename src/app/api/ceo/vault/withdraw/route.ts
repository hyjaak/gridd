import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { recordBintaVaultWithdrawal } from "@/lib/binta-vault-server";
import { canAccessBintaVault, requestIpAddress } from "@/lib/ceo-vault-guard";

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

  const body = (await req.json().catch(() => null)) as {
    amountCents?: number;
    reason?: string;
    confirm?: boolean;
  } | null;
  if (!body?.confirm) {
    return NextResponse.json(
      { ok: false, error: "Send confirm: true to execute withdrawal" },
      { status: 400 },
    );
  }
  const amountCents = Math.round(Number(body.amountCents));
  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid amount" }, { status: 400 });
  }

  const ip = requestIpAddress(req);
  const res = await recordBintaVaultWithdrawal(adminDb, decoded.uid, amountCents, reason, ip);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
