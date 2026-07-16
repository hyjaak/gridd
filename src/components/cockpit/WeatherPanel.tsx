"use client";

import { GlassCard, StatusBadge, SectionTitle } from "./ui";
import { WEATHER } from "@/lib/cockpit/data";

export default function WeatherPanel() {
  const w = WEATHER;

  return (
    <GlassCard className="lg:col-span-1 xl:col-span-1">
      <SectionTitle title="Weather" subtitle="Dayton, OH" action={<StatusBadge status={w.alerts.length > 0 ? "warning" : "info"} />} />
      <div className="flex items-center gap-4">
        <span className="text-3xl">⛅</span>
        <div>
          <span className="text-2xl font-bold text-white">{w.temperature}°F</span>
          <p className="text-[11px] text-white/40">{w.condition}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {[
          { label: "Wind", value: `${w.wind} mph` },
          { label: "Rain", value: `${w.rain}%` },
          { label: "Vis.", value: `${w.visibility} mi` },
        ].map((m) => (
          <div key={m.label} className="text-center p-2 rounded-xl bg-white/[0.03] border border-white/[0.04]">
            <p className="text-[9px] text-white/30 uppercase">{m.label}</p>
            <p className="text-xs font-semibold text-white/80 mt-0.5">{m.value}</p>
          </div>
        ))}
      </div>
      {w.alerts.length > 0 && (
        <div className="mt-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-medium">
          ⚠ {w.alerts[0].title}
        </div>
      )}
    </GlassCard>
  );
}