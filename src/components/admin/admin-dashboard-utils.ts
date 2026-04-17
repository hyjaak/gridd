import type { Job } from "@/types";

function platformFeeCentsFromTotal(totalCents: number) {
  return Math.round(totalCents * 0.15);
}

export function feeForJob(job: Job): number {
  if (typeof job.platformFeeCents === "number") return job.platformFeeCents;
  const gross = job.amountCents ?? job.chargedTotalCents ?? 0;
  return platformFeeCentsFromTotal(gross);
}

export function parseJobTime(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function timeAgo(iso: string | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function isDisputed(job: Job): boolean {
  return job.status === "disputed" || Boolean((job as { disputeFlag?: boolean }).disputeFlag);
}

export type AlertSeverity = "critical" | "high" | "medium";

export function normalizeAlertSeverity(
  raw: string | undefined,
): AlertSeverity {
  const s = (raw ?? "").toLowerCase();
  if (s === "critical" || s === "error") return "critical";
  if (s === "high" || s === "warning") return "high";
  return "medium";
}
