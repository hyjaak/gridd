"use client";

import { GlassCard, SectionTitle, StatusBadge, PulseDot, ProgressBar } from "./ui";
import { useDrivers } from "@/lib/cockpit/hooks";

export default function DriverPanel() {
  const { data: drivers } = useDrivers();
  const online = drivers.filter((d) => d.status === "online" || d.status === "en-route");

  return (
    <GlassCard className="lg:col-span-1 xl:col-span-2">
      <SectionTitle title="Driver Panel" subtitle={`${online.length} online`} />

      <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
        {drivers.slice(0, 8).map((driver) => (
          <div key={driver.id} className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.03] hover:bg-white/[0.04] transition-colors">
            <div className="flex items-center gap-3">
              {driver.status === "online" || driver.status === "en-route" ? <PulseDot /> : <span className="w-2.5 h-2.5 rounded-full bg-zinc-500" />}
              <div>
                <p className="text-sm text-white/80 font-medium">{driver.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-amber-400">★ {driver.rating}</span>
                  <span className="text-[10px] text-white/30">${driver.earnings}</span>
                  <span className="text-[10px] text-white/30">{driver.hoursToday}h</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <StatusBadge status={driver.status} />
              <div className="mt-1">
                <ProgressBar value={driver.acceptanceRate} color="bg-emerald-500" />
                <span className="text-[9px] text-white/30">{driver.acceptanceRate}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}