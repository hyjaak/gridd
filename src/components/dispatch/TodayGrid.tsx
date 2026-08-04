"use client";

import { useState } from "react";
import type { DispatchJob } from "@/types/dispatch";

function tsMs(ts: any): number {
  if (!ts) return 0;
  return ts.seconds ? ts.seconds * 1000 : (ts.toMillis?.() ?? 0);
}

export type GridFilter = "needs" | "waiting" | "due" | "unpaid" | null;

export default function TodayGrid({ jobs, filter, onFilter, onRead, reading }: {
  jobs: DispatchJob[];
  filter: GridFilter;
  onFilter: (f: GridFilter) => void;
  onRead: () => void;
  reading: boolean;
}) {
  const [open, setOpen] = useState(true);
  const now = Date.now();
  const twoHrs = 2 * 60 * 60 * 1000;

  const needs = jobs.filter((j) => j.status === "request");
  const waiting = jobs.filter((j) => j.status === "quoted" && tsMs(j.quotedAt ?? j.createdAt) < now - twoHrs);
  const due = jobs.filter((j) => ["accepted", "assigned", "pickup", "in_progress"].includes(j.status) && (j.timeWindow?.toLowerCase().includes("today") || j.timeWindow?.toLowerCase().includes("asap")));
  const unpaid = jobs.filter((j) => j.status === "proof");

  const doneAll = jobs.filter((j) => j.status === "paid");
  const weekAgo = now - 7 * 86_400_000;
  const weekTotal = doneAll
    .filter((j) => tsMs(j.paidAt ?? j.updatedAt ?? j.createdAt) >= weekAgo)
    .reduce((s, j) => s + (j.agreedAmount ?? j.quoteAmount ?? 0) + (j.tipAmount ?? 0), 0);
  const weekRuns = doneAll.length;
  const quoteTimes = doneAll
    .filter((j) => j.quotedAt && j.createdAt)
    .map((j) => tsMs(j.quotedAt) - tsMs(j.createdAt));
  const avgQuote = quoteTimes.length ? Math.round(quoteTimes.reduce((a, b) => a + b, 0) / quoteTimes.length / 60000) : 0;

  const chips: { key: GridFilter; label: string; count: number; color: string }[] = [
    { key: "needs", label: "🔥 NEEDS QUOTE", count: needs.length, color: "bg-[#d9a441] text-white" },
    { key: "waiting", label: "⏳ WAITING ON YES", count: waiting.length, color: "bg-[#101613] text-white" },
    { key: "due", label: "🚚 DUE TODAY", count: due.length, color: "bg-[#0e9f6e] text-white" },
    { key: "unpaid", label: "💰 UNPAID", count: unpaid.length, color: "bg-[#c0392b] text-white" },
  ];

  return (
    <div className="px-[4vw] pt-3">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-[11px] font-extrabold tracking-widest uppercase text-[#5c6a62] mb-2">
        <span>Today's grid</span>
        <span>{open ? "−" : "＋"}</span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-2 items-center">
          {chips.map((c) => (
            <button key={c.key} onClick={() => onFilter(filter === c.key ? null : c.key)}
              className={`text-[10.5px] font-extrabold rounded-full px-3 py-1.5 border-none cursor-pointer transition-colors ${filter === c.key ? "ring-2 ring-[#0e9f6e] " + c.color : c.color + " opacity-80 hover:opacity-100"}`}>
              {c.label} · {c.count}
            </button>
          ))}
          <button onClick={onRead}
            className={`text-[10.5px] font-extrabold rounded-full px-3 py-1.5 border-none cursor-pointer ${reading ? "bg-[#c0392b] text-white" : "bg-white text-[#101613] border border-[rgba(16,22,19,0.09)]"}`}>
            {reading ? "⏹ Stop" : "🔊 Read board"}
          </button>
          <span className="text-[11px] text-[#8fa096] font-semibold ml-auto">
            This week: ${weekTotal.toFixed(0)} · {weekRuns} runs · avg quote {avgQuote}m
          </span>
        </div>
      )}
    </div>
  );
}