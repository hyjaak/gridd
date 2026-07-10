"use client";

import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import { firebaseAuth } from "@/lib/firebase";
import { sanitizeForFirestore } from "@/lib/sanitizeFirestore";
import type { BiteOrderItem, BiteRestaurant } from "@/types/bites";

function dayKeyNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function requestDoorDashForBiteOrder(args: {
  orderId: string;
  orderValueUsd: number;
  tipCents: number;
  pickup: { name: string; address: string; phone: string; instructions?: string };
  dropoff: { name: string; address: string; phone: string; instructions?: string };
}) {
  const token = await firebaseAuth?.currentUser?.getIdToken();
  if (!token) throw new Error("Not signed in");
  const res = await fetch("/api/bites/order", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      orderId: args.orderId,
      orderValue: args.orderValueUsd,
      tipCents: args.tipCents,
      pickup: args.pickup,
      dropoff: args.dropoff,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function writeBiteOrderDoc(args: {
  orderId: string;
  customerName: string;
  customerPhoto: string;
  customerId: string;
  customerZip: string;
  restaurant: BiteRestaurant;
  restaurantId: string;
  items: BiteOrderItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tip: number;
  total: number;
  isPublic: boolean;
  vibeTag: string;
  caption: string;
  dropoffAddress: string;
  dropoffLat?: number;
  dropoffLng?: number;
  /** Skip DoorDash Drive — CEO fulfills manually */
  manualFulfillment?: boolean;
}): Promise<void> {
  const uid = firebaseAuth?.currentUser?.uid;
  if (!uid || uid !== args.customerId) {
    throw new Error("Not signed in");
  }

  const db = getFirestore(firebaseApp);

  const itemsClean = args.items.map((line) => {
    const row: Record<string, unknown> = {
      itemId: String(line.itemId ?? ""),
      name: String(line.name ?? ""),
      quantity: typeof line.quantity === "number" && line.quantity > 0 ? line.quantity : 1,
      unitPrice: typeof line.unitPrice === "number" ? line.unitPrice : 0,
    };
    if (line.category != null && String(line.category).length > 0) {
      row.category = line.category;
    }
    return sanitizeForFirestore(row);
  }) as BiteOrderItem[];

  const payload: Record<string, unknown> = {
    customerId: args.customerId,
    customerName: args.customerName ?? "GRIDD",
    customerPhoto: args.customerPhoto ?? "",
    restaurantId: args.restaurantId,
    restaurantName: args.restaurant.name ?? "",
    items: itemsClean,
    subtotal: args.subtotal,
    deliveryFee: args.deliveryFee,
    serviceFee: args.serviceFee,
    tip: args.tip,
    total: args.total,
    status: args.manualFulfillment ? "manual_pending" : "pending",
    manualFulfillment: args.manualFulfillment === true,
    isPublic: args.isPublic,
    vibeTag: args.vibeTag ?? "",
    caption: args.caption ?? "",
    gridditUserIds: [] as string[],
    gridditCount: 0,
    likeCount: 0,
    commentCount: 0,
    customerZip: args.customerZip,
    dayKey: dayKeyNow(),
    dropoffAddress: args.dropoffAddress ?? "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (args.dropoffLat != null && Number.isFinite(args.dropoffLat)) {
    payload.dropoffLat = args.dropoffLat;
  }
  if (args.dropoffLng != null && Number.isFinite(args.dropoffLng)) {
    payload.dropoffLng = args.dropoffLng;
  }

  await setDoc(doc(db, "biteOrders", args.orderId), sanitizeForFirestore(payload));
}
