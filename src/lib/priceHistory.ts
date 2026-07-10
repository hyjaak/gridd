import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

/**
 * Rolling `uberAvg` for benchmark routes (from real estimate samples).
 * Doc id: hashed route key (alphanumeric, max length capped).
 */
export async function recordUberPriceSample(routeKey: string, uberMid: number): Promise<void> {
  if (!adminDb || !Number.isFinite(uberMid) || uberMid <= 0) return;
  const id = routeKey.replace(/[.#$/[\]]/g, "_").slice(0, 400);
  const ref = adminDb.collection("priceHistory").doc(id);
  try {
    await adminDb.runTransaction(async (t) => {
      const s = await t.get(ref);
      const d = s.data() as { uberAvg?: number; sampleCount?: number } | undefined;
      const c = (d?.sampleCount ?? 0) + 1;
      const nextAvg =
        c === 1
          ? uberMid
          : Math.round(((d!.uberAvg! * (c - 1) + uberMid) / c) * 100) / 100;
      t.set(
        ref,
        {
          route: id,
          uberAvg: nextAvg,
          lastSeen: FieldValue.serverTimestamp(),
          sampleCount: c,
        },
        { merge: true },
      );
    });
  } catch {
    /* optional */
  }
}
