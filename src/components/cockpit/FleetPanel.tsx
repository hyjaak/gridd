"use client";

import { GlassCard, SectionTitle, StatusBadge, ProgressBar } from "./ui";
import { useFleet } from "@/lib/cockpit/hooks";

export default function FleetPanel() {
  const { data: vehicles } = useFleet();

  return (
    <GlassCard className="lg:col-span-1 xl:col-span-2">
      <SectionTitle title="Fleet" subtitle={`${vehicles.filter(v => v.status === "active").length} active`} />

      <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
        {vehicles.map((v) => (
          <div key={v.id} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.03] hover:bg-white/[0.04] transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm text-white/80 font-medium">{v.plate}</span>
                <span className="text-[10px] text-white/30 capitalize">{v.type}</span>
              </div>
              <StatusBadge status={v.status} />
            </div>
            <div className="flex items-center gap-3 text-[10px] text-white/30">
              <span>{v.odometer.toLocaleString()} mi</span>
              <span className="flex items-center gap-1">
                Fuel: <span className={v.fuelLevel < 20 ? "text-red-400" : "text-white/60"}>{Math.round(v.fuelLevel)}%</span>
              </span>
            </div>
            <ProgressBar value={v.fuelLevel} color={v.fuelLevel < 20 ? "bg-red-500" : "bg-emerald-500"} />
            {v.diagnostics.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-[9px] text-amber-400">⚠</span>
                <span className="text-[9px] text-amber-400/80">{v.diagnostics[0].code}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}