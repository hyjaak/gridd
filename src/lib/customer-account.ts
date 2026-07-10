import type { GriddProfile } from "@/providers/AuthProvider";

export type CustomerAccountBlockReason =
  | "banned"
  | "on_hold"
  | "suspended";

/** Customers cannot book if account is restricted (mirrors Firestore `users`). */
export function getCustomerBookingBlock(
  profile: GriddProfile | null | undefined,
): { blocked: true; reason: CustomerAccountBlockReason; message: string } | { blocked: false } {
  if (!profile || profile.role !== "customer") return { blocked: false };
  const p = profile as GriddProfile & {
    blocked?: boolean;
    banned?: boolean;
    accountStatus?: string;
    suspendedUntil?: string;
  };
  if (p.banned || p.blocked || p.accountStatus === "banned") {
    return {
      blocked: true,
      reason: "banned",
      message: "This account cannot book services. Contact support@gridd.click.",
    };
  }
  if (p.accountStatus === "on_hold") {
    return {
      blocked: true,
      reason: "on_hold",
      message: "Your account is on hold. Contact support@gridd.click to resolve.",
    };
  }
  if (p.accountStatus === "suspended") {
    const raw = p.suspendedUntil;
    if (typeof raw === "string" && raw) {
      const t = new Date(raw).getTime();
      if (Number.isFinite(t) && Date.now() < t) {
        return {
          blocked: true,
          reason: "suspended",
          message: "Your account is temporarily suspended. Contact support@gridd.click if you need help.",
        };
      }
    } else if (p.accountStatus === "suspended") {
      return {
        blocked: true,
        reason: "suspended",
        message: "Your account is temporarily suspended. Contact support@gridd.click.",
      };
    }
  }
  return { blocked: false };
}
