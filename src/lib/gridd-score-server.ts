import admin from "@/lib/firebase-admin";
import { adminDb } from "@/lib/firebase-admin";
import { griddTierLabel } from "@/lib/gridd-score";

/**
 * Apply GRIDD Score™ delta to `users` or `providers`. Clamps 0–1000; `scoreHistory` last 10.
 */
export async function applyGriddScoreDelta(opts: {
  uid: string;
  collection: "users" | "providers";
  delta: number;
  reason: string;
}): Promise<{ next: number } | null> {
  if (!adminDb) return null;
  const ref = adminDb.collection(opts.collection).doc(opts.uid);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const curRaw = snap.data()?.griddScore;
    const cur = typeof curRaw === "number" && Number.isFinite(curRaw) ? curRaw : 0;
    const next = Math.max(0, Math.min(1000, Math.round(cur + opts.delta)));
    const tier = griddTierLabel(next);
    const prevHist = snap.data()?.scoreHistory;
    const histIn =
      Array.isArray(prevHist) && prevHist.length
        ? (prevHist as { at?: string; reason?: string; delta?: number }[])
        : [];
    const at = new Date().toISOString();
    const newHist = [...histIn, { at, reason: opts.reason, delta: opts.delta }].slice(-10);
    tx.set(
      ref,
      {
        griddScore: next,
        griddTier: tier,
        scoreHistory: newHist,
      },
      { merge: true },
    );
    return { next };
  });
}

export async function recordGriddScoreLedgerOnce(ledgerId: string): Promise<boolean> {
  if (!adminDb) return false;
  const ref = adminDb.collection("griddScoreLedger").doc(ledgerId);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, { createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return true;
  });
}
