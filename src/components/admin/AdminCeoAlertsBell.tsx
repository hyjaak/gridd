"use client";

import { useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { markCeoAlertRead } from "@/lib/admin-firestore";

export type CeoAlertRow = {
  id: string;
  type?: string;
  message?: string;
  read?: boolean;
  createdAt?: unknown;
  priority?: "high" | "medium" | "low";
  metadata?: Record<string, unknown>;
};

function formatTime(raw: unknown): string {
  if (raw instanceof Timestamp) return raw.toDate().toLocaleString();
  if (typeof raw === "string") return new Date(raw).toLocaleString();
  return "—";
}

type Props = {
  alerts: CeoAlertRow[];
};

export function AdminCeoAlertsBell({ alerts }: Props) {
  const [open, setOpen] = useState(false);
  const unread = useMemo(() => alerts.filter((a) => !a.read), [alerts]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full border border-zinc-700 bg-[#111] p-2 text-lg text-zinc-200 hover:border-[#ff6b00]/50"
        aria-label="CEO alerts"
      >
        🔔
        {unread.length > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff6b00] px-1 text-[10px] font-bold text-black">
            {unread.length > 99 ? "99+" : unread.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default bg-black/40" aria-label="Close" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-50 mt-2 max-h-[min(70vh,480px)] w-[min(100vw-2rem,380px)] overflow-y-auto rounded-2xl border border-[#1e1e1e] bg-[#111] p-2 shadow-xl"
            style={{ boxShadow: "0 16px 48px rgba(0,0,0,0.6)" }}
          >
            <div className="px-2 py-1 text-xs font-semibold text-zinc-500">CEO alerts</div>
            {alerts.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-zinc-500">No alerts yet.</p>
            ) : (
              <ul className="space-y-1">
                {alerts.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!a.read) void markCeoAlertRead(a.id);
                      }}
                      className={[
                        "w-full rounded-xl px-3 py-2 text-left text-sm transition",
                        a.read ? "text-zinc-500" : "text-zinc-100",
                        a.priority === "high" ? "border border-red-500/40 bg-red-950/30" : "border border-transparent hover:bg-zinc-900/80",
                      ].join(" ")}
                    >
                      <div className="text-[10px] text-zinc-500">{formatTime(a.createdAt)}</div>
                      <div className="mt-0.5 font-medium">{a.type ?? "alert"}</div>
                      <div className="mt-1 text-xs text-zinc-400">{a.message ?? ""}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
