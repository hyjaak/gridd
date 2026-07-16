"use client";

import { GlassCard, SectionTitle, MetricTile } from "./ui";
import { useAnalytics, useDrivers } from "@/lib/cockpit/hooks";

export default function AnalyticsPanel() {
  const { data: a } = useAnalytics();
  const { data: drivers } = useDrivers();
  const active = drivers.filter((d) => d.status === "online" || d.status === "en-route").length;

  return (
    <GlassCard className="lg:col-span-2 xl:col-span-3">
      <SectionTitle title="Live Analytics" subtitle="Real-time metrics" />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
        <MetricTile label="Revenue" value={`$${a.revenue.value.toLocaleString()}`} change={`+${a.revenue.change}%`} />
        <MetricTile label="Jobs" value={`${a.jobs.completed}`} change={`${a.jobs.total} total`} />
        <MetricTile label="Acceptance" value={`${a.acceptanceRate}%`} change={`+2.1%`} />
        <MetricTile label="Completion" value={`${a.completionRate}%`} change={`+0.8%`} />
        <MetricTile label="Active Drivers" value={`${active}`} change={`${drivers.length} total`} />
        <MetricTile label="Fleet Utili." value={`${a.fleetUtilization}%`} change={`+5.2%`} />
        <MetricTile label="Avg ETA" value={`${a.avgEta} min`} change={`-1.2 min`} />
        <MetricTile label="Satisfaction" value={`${a.customerSatisfaction}★`} change={`+0.1`} />
      </div>

      {/* Mini chart bars */}
      <div className="mt-4 grid grid-cols-7 gap-1">
        {[65, 78, 82, 71, 88, 92, 85].map((v, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-full rounded-full bg-gradient-to-t from-emerald-500 to-emerald-400" style={{ height: `${v}px`, opacity: 0.7 }} />
            <span className="text-[8px] text-white/20">D{i + 1}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}