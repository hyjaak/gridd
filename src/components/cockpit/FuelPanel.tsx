"use client";

import { GlassCard, SectionTitle, StatusBadge } from "./ui";
import { FUEL } from "@/lib/cockpit/data";

export default function FuelPanel() {
  const f = FUEL;

  return (
    <GlassCard className="lg:col-span-1 xl:col-span-1">
      <SectionTitle
        title="Fuel"
        subtitle={`Avg $${f.avgPrice}/gal`}
        action={
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            f.trend === "down" ? "text-emerald-400 bg-emerald-500/15" :
            f.trend === "up" ? "text-red-400 bg-red-500/15" : "text-zinc-400 bg-zinc-500/15"
          }`}>
            {f.trend === "down" ? "▼" : f.trend === "up" ? "▲" : "◆"} {f.trend}
          </span>
        }
      />

      <div className="space-y-1.5">
        {f.stations.map((s) => (
          <div key={s.name} className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-white/[0.03]">
            <div>
              <p className="text-sm text-white/80 font-medium">{s.name}</p>
              <p className="text-[9px] text-white/30">{s.distance} mi · {s.address}</p>
            </div>
            <span className="text-sm font-bold text-white/90">${s.price}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}