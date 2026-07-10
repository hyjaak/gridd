import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { estimateOrderEconomics } from "@/lib/bitesPricing";

/**
 * On first "delivered" processing: 10% of net GRIDD profit → vault, 90% → revenue/bites (cents).
 * Idempotent via `bitesRevenueBooked` on the order doc.
 */
export async function processBitesRevenueOnDelivered(orderId: string): Promise<void> {
  const db = adminDb;
  if (!db) return;
  const ref = db.collection("biteOrders").doc(orderId);
  const vaultCents: { v: number; ceo: number } = { v: 0, ceo: 0 };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const d = snap.data() as {
      bitesRevenueBooked?: boolean;
      subtotal?: number;
      deliveryFee?: number;
      tip?: number;
    };
    if (d.bitesRevenueBooked) return;

    const sub = Number(d.subtotal ?? 0);
    const del = Number(d.deliveryFee ?? 3.99);
    const tip = Number(d.tip ?? 0);
    const econ = estimateOrderEconomics(sub, del, 0.12, 0.15, 8, tip);
    const netUsd = Math.max(0, econ.griddNetPerOrder);
    const vaultSave = netUsd * 0.1;
    const ceoNet = netUsd * 0.9;
    vaultCents.v = Math.round(vaultSave * 100);
    vaultCents.ceo = Math.round(ceoNet * 100);

    tx.set(
      ref,
      {
        bitesRevenueBooked: true,
        bitesNetProfitCents: Math.round(netUsd * 100),
        lastUpdated: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const vRef = db.collection("vault").doc("main");
    const rRef = db.collection("revenue").doc("bites");
    tx.set(
      vRef,
      {
        balanceCents: FieldValue.increment(vaultCents.v),
        totalDepositedCents: FieldValue.increment(vaultCents.v),
        lastBitesDepositAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.set(
      rRef,
      {
        balanceCents: FieldValue.increment(vaultCents.ceo),
        totalOrders: FieldValue.increment(1),
        lastUpdated: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  if (vaultCents.v > 0) {
    await db
      .collection("vaultTransactions")
      .add({
        type: "deposit",
        source: "bites",
        orderId,
        amountCents: vaultCents.v,
        createdAt: FieldValue.serverTimestamp(),
      })
      .catch(() => null);
  }
}
