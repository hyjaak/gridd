import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

function heatFromCount(n: number): "low" | "medium" | "high" {
  if (n >= 20) return "high";
  if (n >= 8) return "medium";
  return "low";
}

function normalizeZip(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const z = raw.replace(/\D/g, "").slice(0, 5);
  return z.length === 5 ? z : null;
}

/**
 * Customer booking screen — silent demand ping (ZIP only).
 * Uses Firestore increment (no external APIs).
 */
export async function POST(req: Request) {
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as { zip?: string } | null;
  const zip = normalizeZip(body?.zip);
  if (!zip) {
    return NextResponse.json({ ok: false, error: "Invalid zip" }, { status: 400 });
  }

  const ref = adminDb.collection("demandSignals").doc(zip);
  await ref.set(
    {
      signalCount: FieldValue.increment(1),
      lastSignalAt: FieldValue.serverTimestamp(),
      zip,
    },
    { merge: true },
  );

  const snap = await ref.get();
  const n = Number((snap.data() as { signalCount?: number })?.signalCount ?? 0);
  await ref.set({ heatLevel: heatFromCount(n) }, { merge: true });

  return NextResponse.json({ ok: true });
}
