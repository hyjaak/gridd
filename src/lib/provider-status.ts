import type { Provider } from "@/types";

/** Firestore values for driver presence (legacy `active` / `idle` / `offline` still read as aliases). */
export type DriverPresenceStatus =
  | "on_the_gridd"
  | "off_gridd"
  | "busy"
  | "active"
  | "idle"
  | "offline";

export function isProviderBusy(p: Provider | null | undefined): boolean {
  if (!p) return false;
  if (p.activeJob) return true;
  return p.status === "busy";
}

/** Driver is live on the GRIDD (accepting work) — not busy, not off. */
export function isOnTheGridd(p: Provider | null | undefined): boolean {
  if (!p || isProviderBusy(p)) return false;
  const s = p.status ?? "offline";
  if (s === "offline" || s === "off_gridd") return false;
  return s === "on_the_gridd" || s === "active" || s === "idle";
}

/** Eligible to appear in customer matching as “available driver”. */
export function isProviderAvailableForMatching(p: Provider): boolean {
  if (p.blocked || p.activeJob) return false;
  const s = p.status ?? "offline";
  return s === "on_the_gridd" || s === "active" || s === "idle";
}

/** Counted as “live” in admin stats (on platform or busy). */
export function isProviderLiveOnPlatform(p: Provider): boolean {
  const s = p.status ?? "offline";
  return (
    s === "on_the_gridd" ||
    s === "active" ||
    s === "idle" ||
    s === "busy"
  );
}

export function presenceWriteOnline(): { status: "on_the_gridd"; isOnline: boolean } {
  return { status: "on_the_gridd", isOnline: true };
}

export function presenceWriteOffline(): { status: "off_gridd"; isOnline: boolean } {
  return { status: "off_gridd", isOnline: false };
}
