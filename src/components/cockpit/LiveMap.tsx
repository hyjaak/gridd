"use client";

import { GlassCard, StatusBadge, PulseDot } from "./ui";
import { useDrivers, useDispatch } from "@/lib/cockpit/hooks";

export default function LiveMap() {
  const { data: drivers } = useDrivers();
  const { data: jobs } = useDispatch();

  const activeDrivers = drivers.filter((d) => d.status === "online" || d.status === "en-route");
  const activeJobs = jobs.filter((j) => j.status !== "delivered" && j.status !== "cancelled");

  return (
    <GlassCard className="lg:col-span-2 xl:col-span-3 min-h-[400px] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-white">Live Map</h3>
          <div className="flex items-center gap-3 text-[11px] text-white/40">
            <span className="flex items-center gap-1.5">
              <PulseDot /> {activeDrivers.length} drivers
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> {activeJobs.length} jobs
            </span>
          </div>
        </div>
        <StatusBadge status="active" />
      </div>

      {/* Map placeholder — real Mapbox integration marked TODO */}
      <div className="flex-1 rounded-2xl bg-gradient-to-br from-zinc-900/80 via-zinc-800/60 to-zinc-900/80 border border-white/[0.04] relative overflow-hidden min-h-[300px]">
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }} />

        {/* Animated driver dots */}
        {activeDrivers.slice(0, 8).map((d, i) => (
          <div
            key={d.id}
            className="absolute w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(52,211,153,0.5)] animate-pulse"
            style={{
              left: `${15 + ((i * 37) % 70)}%`,
              top: `${15 + ((i * 53) % 70)}%`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}

        {/* Job pins */}
        {activeJobs.slice(0, 6).map((j, i) => (
          <div
            key={j.id}
            className="absolute w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)] flex items-center justify-center"
            style={{
              left: `${25 + ((i * 29) % 50)}%`,
              top: `${20 + ((i * 41) % 60)}%`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
          </div>
        ))}

        {/* Center badge */}
        <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center">
          <span className="text-[10px] text-white/20 font-mono">Dayton, OH · Zoom 13</span>
          {/* TODO: Replace with Mapbox GL live map */}
          <span className="text-[10px] text-amber-400/50">Mapbox integration TODO</span>
        </div>

        {/* Driver list overlay */}
        <div className="absolute top-3 right-3 space-y-1.5">
          {activeDrivers.slice(0, 4).map((d) => (
            <div key={d.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur border border-white/[0.06]">
              <PulseDot />
              <span className="text-[11px] text-white/80 font-medium">{d.name}</span>
              <span className="text-[10px] text-white/40">{d.speed} mph</span>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}