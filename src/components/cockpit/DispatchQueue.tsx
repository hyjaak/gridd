"use client";

import { useDispatch } from "@/lib/cockpit/hooks";
import { GlassCard, StatusBadge, SectionTitle } from "./ui";

export default function DispatchQueue() {
  const { data: jobs } = useDispatch();

  return (
    <GlassCard className="lg:col-span-2 xl:col-span-3">
      <SectionTitle
        title="Dispatch Queue"
        subtitle={`${jobs.filter(j => j.status === "pending").length} pending`}
        action={<StatusBadge status={jobs.length > 0 ? "active" : "info"} />}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] text-white/30 uppercase tracking-wider border-b border-white/[0.04]">
              <th className="pb-2 pr-4 font-medium">Job</th>
              <th className="pb-2 pr-4 font-medium">Priority</th>
              <th className="pb-2 pr-4 font-medium">Customer</th>
              <th className="pb-2 pr-4 font-medium hidden md:table-cell">Vehicle</th>
              <th className="pb-2 pr-4 font-medium hidden md:table-cell">ETA</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 font-medium">AI</th>
            </tr>
          </thead>
          <tbody>
            {jobs.slice(0, 8).map((job) => (
              <tr key={job.id} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                <td className="py-3 pr-4">
                  <span className="text-sm text-white/80 font-mono">{job.id}</span>
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge status={job.priority} />
                </td>
                <td className="py-3 pr-4">
                  <div>
                    <p className="text-sm text-white/80">{job.customer}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{job.pickup.split(",")[0]}</p>
                  </div>
                </td>
                <td className="py-3 pr-4 hidden md:table-cell">
                  <span className="text-sm text-white/60 capitalize">{job.vehicle}</span>
                </td>
                <td className="py-3 pr-4 hidden md:table-cell">
                  <span className="text-sm text-white/60 font-mono">{job.eta} min</span>
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge status={job.status} />
                </td>
                <td className="py-3">
                  {job.aiConfidence ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-400 text-[10px] font-bold">{job.aiConfidence}%</span>
                      <span className="text-[9px] text-white/30">⚡</span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-white/20">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}