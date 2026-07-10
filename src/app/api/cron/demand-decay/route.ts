import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

function heatFromCount(n: number): "low" | "medium" | "high" {
  if (n >= 20) return "high";
  if (n >= 8) return "medium";
  return "low";
}

function bearer(req: Request) {
  const a = req.headers.get("authorization") ?? "";
  const m = a.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/**
 * Scheduled decay: signals stale by 10+ minutes lose 50% count; heat recalculated.
 * Protect with CRON_SECRET (Vercel Cron sends Authorization: Bearer …).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || bearer(req) !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const now = Date.now();
  const tenMin = 10 * 60 * 1000;
  const snap = await adminDb.collection("demandSignals").limit(500).get();
  let updated = 0;

  for (const doc of snap.docs) {
    const d = doc.data() as {
      lastSignalAt?: { toMillis?: () => number };
      signalCount?: number;
    };
    const lastMs = d.lastSignalAt?.toMillis?.() ?? 0;
    if (!lastMs || now - lastMs < tenMin) continue;

    const cur = Math.max(0, Math.floor(Number(d.signalCount ?? 0) * 0.5));
    await doc.ref.set(
      {
        signalCount: cur,
        heatLevel: heatFromCount(cur),
        lastDecayAt: new Date().toISOString(),
      },
      { merge: true },
    );
    updated += 1;
  }

  return NextResponse.json({ ok: true, updated });
}
