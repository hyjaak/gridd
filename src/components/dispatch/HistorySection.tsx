"use client";

import { useState } from "react";
import type { DispatchJob } from "@/types/dispatch";

function dayKey(ts: any): string {
  if (!ts) return "Earlier";
  const t = ts.seconds ? ts.seconds * 1000 : (ts.toMillis?.() ?? 0);
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function fmtAmount(j: DispatchJob): number {
  return j.agreedAmount ?? j.quoteAmount ?? 0;
}

/** All-time p90 grouping via day-of-row, not paidAt (missing paidAt falls to "Earlier"). */
function groupHistory(list: DispatchJob[]): { label: string; jobs: DispatchJob[]; total: number }[] {
  const map = new Map<string, DispatchJob[]>();
  for (const j of list) {
    const k = dayKey(j.paidAt ?? j.updatedAt ?? j.createdAt);
    const arr = map.get(k) ?? [];
    arr.push(j);
    map.set(k, arr);
  }
  return [...map.entries()].map(([label, jobs]) => ({
    label,
    jobs,
    total: jobs.reduce((s, j) => s + fmtAmount(j), 0),
  }));
}

export default function HistorySection({ jobs, onOpenSheet }: {
  jobs: DispatchJob[];
  onOpenSheet: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const groups = groupHistory(jobs);

  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-white border border-[rgba(16,22,19,0.09)] rounded-[18px] px-4 py-3 cursor-pointer">
        <span className="text-[12px] font-extrabold tracking-widest uppercase text-[#5c6a62]">History</span>
        <span className="text-[12px] font-extrabold text-[#5c6a62]">{open ? "−" : "＋"}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-3">
          {jobs.length === 0 && (
            <div className="border-2 border-dashed border-[rgba(16,22,19,0.14)] rounded-[18px] p-6 text-center text-[13px] text-[#5c6a62] font-semibold">Nothing older than today yet.</div>
          )}
          {groups.map((g) => (
            <div key={g.label}>
              <div className="text-[11px] font-extrabold text-[#8fa096] uppercase tracking-wide px-1 mb-1.5">
                {g.label} — {g.jobs.length > 1 ? `$${g.total.toFixed(0)} · ${g.jobs.length} runs` : `${g.jobs.length} run`}
              </div>
              <div className="space-y-2">
                {g.jobs.map((j) => (
                  <div key={j.id} onClick={() => onOpenSheet(j.id)}
                    className="bg-white border border-[rgba(16,22,19,0.09)] rounded-xl px-3 py-2.5 cursor-pointer hover:shadow-[0_6px_20px_rgba(16,22,19,0.08)] transition-shadow">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-[13px] truncate">{j.contactName || "Unknown"}</span>
                      <span className="text-[10.5px] text-[#5c6a62] font-semibold truncate min-w-0">{j.jobType} · {j.pickupAddress?.city ?? "?"} → {j.dropoffAddress?.city ?? "?"}</span>
                      <span className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[15px] text-[#0e9f6e] ml-auto shrink-0">${fmtAmount(j).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[9.5px] font-extrabold rounded-md px-1.5 py-0.5 ${j.status === "paid" ? "bg-[#0e9f6e] text-white" : "bg-[#5c6a62] text-white"}`}>
                        {j.status === "paid" ? "PAID" : j.status.toUpperCase()}
                      </span>
                      {j.proofPhotoUrl && (
                        <img src={j.proofPhotoUrl} alt="" className="w-7 h-7 rounded-md object-cover border border-[rgba(16,22,19,0.09)]" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}