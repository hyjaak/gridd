import type { Provider } from "@/types";

/**
 * HARD GATE — no exceptions. Driver must satisfy all three to work the marketplace.
 */
export function canGoOnline(p: Provider | null | undefined): boolean {
  if (!p || p.blocked) return false;
  return (
    p.documentsSubmitted === true &&
    p.accountStatus === "approved" &&
    p.approvedByCEO === true
  );
}

/** Blocked from any driver job UI (feed, accept, online). */
export function driverIsHardBlocked(p: Provider | null | undefined): boolean {
  if (!p) return true;
  return !canGoOnline(p);
}

/** Show full-screen pending / review states (not yet CEO-approved, or rejected, or more docs). */
export function driverMustUsePendingExperience(p: Provider | null | undefined): boolean {
  if (!p) return true;
  if (p.blocked) return true;
  if (!p.documentsSubmitted) return false;
  if (p.accountStatus === "rejected") return true;
  if (p.accountStatus === "more_info_needed") return true;
  if (p.accountStatus === "pending_review") return true;
  // Legacy pending
  if (p.accountStatus === "pending") return true;
  if (p.verificationStatus === "pending" && !canGoOnline(p)) return true;
  if (!canGoOnline(p)) return true;
  return false;
}
