"use client";

import { doc, getDoc } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import type { BiteOrderItem } from "@/types/bites";

/**
 * Pre-fill a local cart from a public order (call from UI, then `router.push("/bites/checkout")`).
 * Wire your cart state (Zustand/Context) to this in the Bites flow.
 */
export async function loadBiteOrderForReorder(orderId: string): Promise<{
  restaurantId: string;
  items: BiteOrderItem[];
} | null> {
  const db = getFirestore(firebaseApp);
  const snap = await getDoc(doc(db, "biteOrders", orderId));
  if (!snap.exists()) return null;
  const d = snap.data() as { restaurantId?: string; items?: BiteOrderItem[] };
  if (!d.restaurantId || !Array.isArray(d.items)) return null;
  return { restaurantId: d.restaurantId, items: d.items };
}
