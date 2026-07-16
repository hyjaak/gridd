"use client";

import { useState } from "react";
import { GlassCard, StatusBadge, SectionTitle } from "./ui";
import { AI_RECOMMENDATIONS } from "@/lib/cockpit/data";

export default function AICommandCenter() {
  const [input, setInput] = useState("");
  const recs = AI_RECOMMENDATIONS;

  return (
    <GlassCard className="lg:col-span-1 xl:col-span-2">
      <SectionTitle
        title="AI Command Center"
        subtitle="Dispatch recommendations & insights"
        action={<StatusBadge status="active" />}
      />

      {/* Chat input */}
      <div className="relative mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask AI anything... (voice commands coming)"
          className="w-full px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-white/80 text-sm placeholder:text-white/20 outline-none focus:border-emerald-500/30 transition-colors"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/20">🎤</span>
      </div>

      {/* AI recommendations */}
      <div className="space-y-2 max-h-[240px] overflow-y-auto custom-scrollbar">
        {recs.map((rec) => (
          <div key={rec.id} className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.04] hover:border-white/[0.08] transition-all cursor-pointer">
            <div className="flex items-start justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">{rec.type}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  rec.impact === "high" ? "text-amber-400 bg-amber-500/15" :
                  rec.impact === "medium" ? "text-blue-400 bg-blue-500/15" : "text-zinc-400 bg-zinc-500/15"
                }`}>
                  {rec.impact}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-emerald-400 text-[10px] font-bold">{rec.confidence}%</span>
                <span className="text-[9px] text-emerald-500/50">⚡</span>
              </div>
            </div>
            <p className="text-sm text-white/80 font-medium mb-0.5">{rec.title}</p>
            <p className="text-[11px] text-white/40">{rec.description}</p>
            <div className="mt-2 flex items-center gap-2">
              <button className="px-3 py-1 text-[11px] font-semibold rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors">
                {rec.suggestedAction}
              </button>
              <button className="px-3 py-1 text-[11px] font-semibold rounded-lg bg-white/[0.04] text-white/40 hover:bg-white/[0.08] transition-colors">
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Confidence score */}
      <div className="mt-3 flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-r from-emerald-500/5 to-transparent border border-emerald-500/10">
        <span className="text-[11px] text-white/40">AI Confidence Index</span>
        <span className="text-sm font-bold text-emerald-400">91.3%</span>
      </div>
    </GlassCard>
  );
}