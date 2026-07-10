"use client";

import { arrayRemove, arrayUnion, doc, getDoc, increment, updateDoc } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import { firebaseAuth } from "@/lib/firebase";

const GRIDDIT_ARR = "gridditUserIds";
const GRIDDIT_CNT = "gridditCount";

export async function toggleGridditBiteOrder(orderId: string): Promise<void> {
  const u = firebaseAuth?.currentUser;
  if (!u) throw new Error("Sign in to GRIDD IT");
  const db = getFirestore(firebaseApp);
  const ref = doc(db, "biteOrders", orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found");
  const data = snap.data() as { gridditUserIds?: string[] };
  const list = data.gridditUserIds ?? [];
  const on = list.includes(u.uid);
  if (on) {
    await updateDoc(ref, {
      [GRIDDIT_ARR]: arrayRemove(u.uid),
      [GRIDDIT_CNT]: increment(-1),
    });
  } else {
    await updateDoc(ref, {
      [GRIDDIT_ARR]: arrayUnion(u.uid),
      [GRIDDIT_CNT]: increment(1),
    });
  }
}
