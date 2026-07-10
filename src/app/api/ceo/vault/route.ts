import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { bintaVaultDepositCentsFromPlatformFeeCents } from "@/lib/binta-vault";
import { canAccessBintaVault } from "@/lib/ceo-vault-guard";

export const runtime = "nodejs";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function GET(req: Request) {
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
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const mainSnap = await adminDb.collection("vault").doc("main").get();
  const main = mainSnap.exists ? (mainSnap.data() as Record<string, unknown>) : null;

  const q = await adminDb
    .collection("vaultTransactions")
    .orderBy("createdAt", "desc")
    .limit(200)
    .get()
    .catch(() => null);

  const rows =
    q?.docs.map((d) => {
      const raw = d.data() as Record<string, unknown>;
      const ca = raw.createdAt;
      const createdAtMs =
        ca instanceof Timestamp ? ca.toMillis() : typeof ca === "object" && ca && "toMillis" in ca && typeof (ca as Timestamp).toMillis === "function"
          ? (ca as Timestamp).toMillis()
          : null;
      return {
        id: d.id,
        ...raw,
        createdAtMs,
      };
    }) ?? [];

  return NextResponse.json({
    ok: true,
    main: main
      ? {
          balanceCents: main.balanceCents ?? 0,
          totalDepositedCents: main.totalDepositedCents ?? 0,
          totalWithdrawnCents: main.totalWithdrawnCents ?? 0,
          monthlyGoalCents: main.monthlyGoalCents ?? 50_000,
          lastDepositAmountCents: main.lastDepositAmountCents,
          name: main.name,
        }
      : {
          balanceCents: 0,
          totalDepositedCents: 0,
          totalWithdrawnCents: 0,
          monthlyGoalCents: 50_000,
        },
    transactions: rows,
    explainer: {
      vaultSaves: "10% of CEO gross (90% of 15% platform fee)",
      /** Example: $15.00 platform fee in cents */
      exampleVaultCents: bintaVaultDepositCentsFromPlatformFeeCents(1500),
    },
  });
}
