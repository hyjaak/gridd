"use client";

import { money } from "@/lib/job-tracking";

export type TopStatsNavigate = (target: AdminTopNavTarget) => void;

export type AdminTopNavTarget =
  | "overview"
  | "jobs"
  | "providers"
  | "reports"
  | "approvals"
  | "revenue"
  | "security"
  | "gridd-eye"
  | "customers"
  | "vault"
  /** @deprecated use vault */
  | "binta-vault";

type Props = {
  revenueToday: number;
  activeJobs: number;
  userCount: number;
  liveDrivers: number;
  avgRating: number;
  signupsToday: number;
  pendingReports: number;
  pendingApprovals: number;
  failedPayments: number;
  onNavigate: TopStatsNavigate;
  /** CEO-only: hide the vault shortcut from partners and non–vault-eligible users */
  showBintaVaultLink?: boolean;
};

const CARD = "#111";
const BORDER = "#1e1e1e";
const GREEN = "#3dff7a";
const ACCENT = "#ff6b00";

export function AdminTopStatsBar({
  revenueToday,
  activeJobs,
  userCount,
  liveDrivers,
  avgRating,
  signupsToday,
  pendingReports,
  pendingApprovals,
  failedPayments,
  onNavigate,
  showBintaVaultLink = false,
}: Props) {
  const cells: {
    icon: string;
    value: string;
    label: string;
    onClick: () => void;
  }[] = [
    { icon: "💰", value: money(revenueToday), label: "Today", onClick: () => onNavigate("overview") },
    { icon: "🔥", value: String(activeJobs), label: "Jobs today", onClick: () => onNavigate("jobs") },
    { icon: "👥", value: String(userCount), label: "Users", onClick: () => onNavigate("customers") },
    { icon: "🚛", value: String(liveDrivers), label: "Live", onClick: () => onNavigate("gridd-eye") },
    { icon: "⭐", value: avgRating.toFixed(2), label: "Rating", onClick: () => onNavigate("overview") },
  ];

  const extras: { icon: string; label: string; value: number; onClick: () => void; valueHint?: string }[] = [
    { icon: "🆕", label: "New signups today", value: signupsToday, onClick: () => onNavigate("overview") },
    { icon: "🚨", label: "Pending reports", value: pendingReports, onClick: () => onNavigate("reports") },
    { icon: "⏳", label: "Pending approvals", value: pendingApprovals, onClick: () => onNavigate("approvals") },
    { icon: "💳", label: "Failed payments", value: failedPayments, onClick: () => onNavigate("revenue") },
    ...(showBintaVaultLink
      ? [
          {
            icon: "🏦",
            label: "BINTA Vault",
            value: 0,
            valueHint: "Open" as const,
            onClick: () => onNavigate("vault"),
          },
        ]
      : []),
  ];

  return (
    <div
      className="sticky top-0 z-[25] border-b px-3 py-3 sm:px-4"
      style={{ background: "#0a0a0a", borderColor: BORDER }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3">
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {cells.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={c.onClick}
              className="flex flex-col items-center rounded-xl border px-1 py-2 text-center transition hover:opacity-90 active:scale-[0.98] sm:px-2"
              style={{ background: CARD, borderColor: BORDER }}
            >
              <span className="text-base sm:text-lg" aria-hidden>
                {c.icon}
              </span>
              <span className="mt-0.5 font-mono text-[11px] font-bold sm:text-sm" style={{ color: GREEN }}>
                {c.value}
              </span>
              <span className="mt-0.5 text-[9px] text-zinc-500 sm:text-[10px]">{c.label}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {extras.map((e) => (
            <button
              key={e.label}
              type="button"
              onClick={e.onClick}
              className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition hover:opacity-90"
              style={{ background: CARD, borderColor: BORDER, color: "#888" }}
            >
              <span>
                {e.icon} {e.label}
              </span>
              <span
                className="font-mono font-bold"
                style={{ color: e.valueHint || e.value > 0 ? (e.valueHint ? GREEN : ACCENT) : "#888" }}
              >
                {e.valueHint ?? e.value}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
