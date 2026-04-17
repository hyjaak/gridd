"use client";

import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserRole } from "@/types";

/**
 * Client-side role resolution: `users` document first, then `providers` → driver.
 */
export async function getUserRole(uid: string): Promise<UserRole | null> {
  const userSnap = await getDoc(doc(db, "users", uid));
  if (userSnap.exists()) {
    const r = userSnap.data()?.role as UserRole | undefined;
    if (r === "admin" || r === "customer" || r === "driver") return r;
    return "customer";
  }
  const provSnap = await getDoc(doc(db, "providers", uid));
  if (provSnap.exists()) return "driver";
  return null;
}
