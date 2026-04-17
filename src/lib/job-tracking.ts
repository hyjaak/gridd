import type { JobStatus } from "@/types";

/** Customer-facing progress (legacy jobs may use assigned/en_route) */
export const TRACKING_STEP_DEFS: { status: JobStatus; label: string }[] = [
  { status: "pending", label: "Confirmed" },
  { status: "active", label: "Driver accepted" },
  { status: "en_route", label: "En route" },
  { status: "arrived", label: "Arrived" },
  { status: "in_progress", label: "In progress" },
  { status: "completed", label: "Done" },
];

const STATUS_ORDER: JobStatus[] = TRACKING_STEP_DEFS.map((s) => s.status);

/** Map job status to step index (handles legacy assigned + new active) */
export function trackingStepIndex(status: JobStatus): number {
  if (status === "disputed") return -1;
  if (status === "requested") return 0;
  if (status === "cancelled" || status === "draft") return -1;
  if (status === "assigned") return STATUS_ORDER.indexOf("active");
  const idx = STATUS_ORDER.indexOf(status);
  if (idx >= 0) return idx;
  return 0;
}

export function customerCanCancel(status: JobStatus): boolean {
  return status === "pending" || status === "requested";
}

export function money(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/** Provider share (85%) — keep in sync with server `db.payoutBaseCentsFromTotal`. */
export function payoutBaseCentsFromTotal(totalCents: number) {
  return Math.round(totalCents * 0.85);
}

export function driverNextStatus(status: JobStatus): JobStatus | null {
  switch (status) {
    case "active":
      return "arrived";
    case "assigned":
      return "en_route";
    case "en_route":
      return "arrived";
    case "arrived":
      return "in_progress";
    default:
      return null;
  }
}

export function driverStepLabel(status: JobStatus): string | null {
  switch (status) {
    case "active":
      return "Mark Arrived";
    case "assigned":
      return "Head out";
    case "en_route":
      return "Mark arrived";
    case "arrived":
      return "Mark Started";
    case "in_progress":
      return "Complete Job";
    default:
      return null;
  }
}

/** Driver step titles for the active job UI */
export function driverStepTitle(status: JobStatus): string | null {
  switch (status) {
    case "active":
    case "assigned":
      return "Head to Customer";
    case "en_route":
      return "En route";
    case "arrived":
      return "Arrived";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Complete";
    default:
      return null;
  }
}
