import type { Job } from "@/types";

/** Parse Firestore Timestamp | ISO string | missing */
export function createdAtToMs(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "object" && raw !== null && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof raw === "string") {
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

export function countSignupsToday<T extends { createdAt?: unknown }>(rows: T[], startOfTodayMs: number): number {
  return rows.filter((r) => createdAtToMs(r.createdAt) >= startOfTodayMs).length;
}

export function jobBookingCoords(job: Job): { lat: number; lng: number } | null {
  const bd = job.bookingDetails as Record<string, unknown> | undefined;
  if (!bd) return null;
  const pick = bd.pickupCoords as { lat?: number; lng?: number } | undefined;
  const addr = bd.addressCoords as { lat?: number; lng?: number } | undefined;
  const drop = bd.dropoffCoords as { lat?: number; lng?: number } | undefined;
  const c = pick ?? addr ?? drop;
  if (c && typeof c.lat === "number" && typeof c.lng === "number") return { lat: c.lat, lng: c.lng };
  return null;
}
