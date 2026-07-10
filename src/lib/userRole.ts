"use client";

import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserRole } from "@/types";

function isCeoAdminData(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (data.approved === false) return false;
  return data.role === "ceo" || data.isCEO === true;
}

/**
 * Client-side role resolution: `admins/{uid}` CEO allowlist, then `users`, then `providers` → driver.
 */
export async function getUserRole(uid: string): Promise<UserRole | null> {
  // Each read is isolated so a permission-denied on one (e.g. `admins/{uid}`
  // when the admin-self-read rule isn't deployed) doesn't wipe out role
  // detection for normal users who have valid reads on the others.
  try {
    const adminSnap = await getDoc(doc(db, "admins", uid));
    if (adminSnap.exists() && isCeoAdminData(adminSnap.data() as Record<string, unknown>)) {
      return "ceo";
    }
  } catch (e) {
    console.warn("getUserRole: admins read failed (non-fatal):", e);
  }

  try {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (userSnap.exists()) {
      const r = userSnap.data()?.role as string | undefined;
      if (r === "admin") return "ceo";
      if (r === "ceo" || r === "customer" || r === "driver") return r as UserRole;
      return "customer";
    }
  } catch (e) {
    console.warn("getUserRole: users read failed (non-fatal):", e);
  }

  try {
    const provSnap = await getDoc(doc(db, "providers", uid));
    if (provSnap.exists()) return "driver";
  } catch (e) {
    console.warn("getUserRole: providers read failed (non-fatal):", e);
  }

  return null;
}
