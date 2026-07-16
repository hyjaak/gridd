"use client";

import { useCurrentTime } from "@/lib/cockpit/hooks";
import { PulseDot, StatusBadge } from "./ui";

export default function CockpitHeader() {
  const now = useCurrentTime();

  return (
    <header className="w-full px-6 py-3 border-b border-white/[0.06] bg-black/40 backdrop-blur-2xl">
      <div className="flex items-center justify-between">
        {/* Left — Brand + Time */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 text-lg font-black tracking-tight font-[family-name:var(--font-bricolage)]">
              GRIDD
            </span>
            <span className="text-[10px] text-white/30 uppercase tracking-[2px] font-semibold hidden sm:inline">
              Cockpit
            </span>
          </div>
          <div className="text-white/60 text-sm font-mono tabular-nums">
            {now.toLocaleTimeString("en-US", { hour12: false })}
          </div>
        </div>

        {/* Center — Status + Search */}
        <div className="hidden md:flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
            <PulseDot />
            <span className="text-[11px] text-white/50">All Systems</span>
            <StatusBadge status="active" />
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search jobs, drivers, locations... (Ctrl+K)"
              className="w-[280px] px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white/80 text-sm placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/20 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right — Actions */}
        <div className="flex items-center gap-3">
          <button className="relative p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors">
            <svg className="w-4 h-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>
          <button className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/30 transition-colors">
            🆘 Emergency
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white text-xs font-bold">
            I
          </div>
        </div>
      </div>
    </header>
  );
}