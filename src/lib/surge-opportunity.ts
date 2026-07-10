import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { saveNotificationAndPush } from "@/lib/notify-internal";
import { canGoOnline } from "@/lib/driver-gate";
import type { Provider } from "@/types";

const MAX_DRIVERS = 120;

/**
 * When Uber is surging in a ZIP, alert the CEO and ping drivers in that area (ride-capable, approved).
 */
export async function sendSurgeOpportunityAlerts(args: {
  zip: string;
  surgeMultiplier: number;
  griddSavings: number;
  uberPrice: number;
  griddPrice: number;
}): Promise<void> {
  if (!adminDb) return;
  const z = args.zip.replace(/\D/g, "").slice(0, 5);
  if (z.length !== 5) return;
  if (args.surgeMultiplier <= 1.01) return;

  const mult = args.surgeMultiplier;
  const savings = Math.max(0, args.griddSavings);

  let nearCount = 0;
  try {
    const near = await adminDb
      .collection("providers")
      .where("zip", "==", z)
      .where("isOnline", "==", true)
      .limit(MAX_DRIVERS)
      .get();
    nearCount = near.docs.length;
  } catch {
    /* ignore */
  }

  const ceoMessage = `🔥 Uber surging ${mult.toFixed(1)}x in ${z}! GRIDD stays flat. Customers saving $${savings.toFixed(0)}+ right now. ${nearCount} driver(s) in area online — need more?`;

  await adminDb
    .collection("ceoAlerts")
    .add({
      type: "competitor_surge_opportunity",
      message: ceoMessage,
      metadata: { zip: z, surge: mult, uberPrice: args.uberPrice, griddPrice: args.griddPrice, savings, nearCount },
      priority: "high",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    })
    .catch(() => null);

  const snap = await adminDb
    .collection("providers")
    .where("zip", "==", z)
    .limit(200)
    .get()
    .catch(() => null);
  if (!snap?.docs.length) return;

  for (const d of snap.docs) {
    const p = { uid: d.id, ...(d.data() as Omit<Provider, "uid">) };
    if (!canGoOnline(p)) continue;
    const sid = p.serviceIds ?? [];
    if (!sid.includes("ride")) continue;
    void saveNotificationAndPush({
      userId: p.uid,
      event: "surge_opportunity",
      title: "🔥 High demand in your area",
      body: "Customers are choosing GRIDD over Uber right now. Go ON THE GRIDD to capitalize! ⚡",
      icon: "🚗",
      color: "#F97316",
    }).catch(() => null);
  }
}
