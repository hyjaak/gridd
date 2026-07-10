import type { Provider } from "@/types";

/** Driver routing: production approval beats demo so approved drivers never see trial UI. */
export type DriverAccessLevel =
  | "demo"
  | "approved"
  | "rejected"
  | "pending"
  | "upload"
  | "account_hold"
  | "account_suspended"
  | "account_banned";

/** True while accountStatus is suspended and suspendedUntil is still in the future. */
export function isProviderSuspensionActive(p: Provider | null | undefined): boolean {
  if (!p || p.accountStatus !== "suspended") return false;
  const raw = p.suspendedUntil;
  if (!raw || typeof raw !== "string") return true;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() < t;
}

export function driverAccountRestricted(p: Provider | null | undefined): boolean {
  if (!p) return true;
  if (p.blocked || p.banned || p.accountStatus === "banned") return true;
  if (p.accountStatus === "on_hold") return true;
  if (isProviderSuspensionActive(p)) return true;
  return false;
}

/** Full production access: documents + CEO approval flags. */
export function isFullyApprovedDriver(p: Provider | null | undefined): boolean {
  if (!p || p.blocked) return false;
  return (
    p.documentsSubmitted === true &&
    p.accountStatus === "approved" &&
    p.approvedByCEO === true
  );
}

export function demoJobLimit(p: Provider | null | undefined): number {
  if (!p) return 3;
  const n = p.demoJobsLimit;
  return typeof n === "number" && n > 0 ? n : 3;
}

export function demoJobsUsedCount(p: Provider | null | undefined): number {
  const u = p?.demoJobsUsed;
  return typeof u === "number" && u >= 0 ? u : 0;
}

/**
 * Single source of truth for driver shell routing (login redirects, approval hook, docs gate).
 * Order: production-approved → active demo trial → rejected → pending CEO → document upload.
 */
export function getDriverAccess(driver: Provider | null | undefined): DriverAccessLevel {
  if (!driver) return "upload";
  if (driver.blocked) return "upload";
  if (driver.banned === true || driver.accountStatus === "banned") return "account_banned";
  if (driver.accountStatus === "on_hold") return "account_hold";
  if (isProviderSuspensionActive(driver)) return "account_suspended";

  if (driver.accountStatus === "approved" && driver.approvedByCEO === true) {
    return "approved";
  }

  const limit = demoJobLimit(driver);
  const used = demoJobsUsedCount(driver);
  if (driver.demoMode === true && used < limit) {
    return "demo";
  }

  if (driver.verificationStatus === "rejected" || driver.accountStatus === "rejected") {
    return "rejected";
  }

  if (driver.documentsSubmitted === true) {
    return "pending";
  }

  return "upload";
}

/** Demo trial jobs exhausted — must submit docs / get approved to continue. */
export function demoExhausted(p: Provider | null | undefined): boolean {
  if (!p?.demoMode) return false;
  return demoJobsUsedCount(p) >= demoJobLimit(p);
}

/** CEO turned on demo and driver is not yet fully approved, with jobs remaining. */
export function inActiveDemo(p: Provider | null | undefined): boolean {
  return getDriverAccess(p) === "demo";
}

/**
 * Can go online, see jobs, accept jobs — full approval OR active demo (trials left).
 */
export function canGoOnline(p: Provider | null | undefined): boolean {
  if (!p || p.blocked) return false;
  if (driverAccountRestricted(p)) return false;
  const a = getDriverAccess(p);
  /** New drivers (v2+) must be CEO-approved — demo trial does not grant marketplace access. */
  if ((p.driverFlowVersion ?? 1) >= 2) {
    return a === "approved";
  }
  return a === "approved" || a === "demo";
}

/** Wallet / cash-out style restrictions while in demo (not yet fully approved). */
export function demoWalletRestricted(p: Provider | null | undefined): boolean {
  if (!p?.demoMode) return false;
  return !isFullyApprovedDriver(p);
}

/** Blocked from any driver job UI (feed, accept, online). */
export function driverIsHardBlocked(p: Provider | null | undefined): boolean {
  if (!p) return true;
  if (p.blocked) return true;
  if (driverAccountRestricted(p)) return true;
  return !canGoOnline(p);
}

/**
 * Redirect to /driver-pending when docs are submitted but CEO approval is still pending (or rejected flow).
 * When documents are not submitted, callers redirect to /signup/driver-docs instead.
 */
export function driverMustUsePendingExperience(p: Provider | null | undefined): boolean {
  return getDriverAccess(p) === "pending";
}

export function demoTrialJobsRemaining(p: Provider | null | undefined): number {
  if (!p?.demoMode) return 0;
  return Math.max(0, demoJobLimit(p) - demoJobsUsedCount(p));
}
