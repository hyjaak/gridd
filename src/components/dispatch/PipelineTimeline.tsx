"use client";

import React from "react";
import type { DispatchJob } from "@/types/dispatch";

const STAGES = ["REQUEST", "QUOTED", "BOOKED", "PICKUP", "EN ROUTE", "PHOTO", "PAID"] as const;

interface PipelineTimelineProps {
  jobs: DispatchJob[];
}

const STATUS_TO_STAGE: Record<string, number> = {
  request: 0,
  quoted: 1,
  accepted: 2,
  assigned: 2,
  pickup: 3,
  in_progress: 4,
  proof: 5,
  paid: 6,
};

export function PipelineTimeline({ jobs }: PipelineTimelineProps) {
  const activeJobs = jobs.filter((j) => j.status !== "paid");

  return (
    <div className="fixed bottom-13 left-0 right-0 z-25 bg-white/94 backdrop-blur border-t border-[rgba(16,22,19,0.09)] px-[4vw] py-3">
      <div className="relative h-8.5">
        <div className="absolute top-5.5 left-0 right-0 h-0.5 bg-[rgba(16,22,19,0.12)]" />
        
        {STAGES.map((stage, i) => {
          const left = `${4 + (i * 92 / 6)}%`;
          return (
            <React.Fragment key={stage}>
              <span
                className="absolute top-0 -translate-x-1/2 text-[8.5px] font-extrabold tracking-widest text-[#5c6a62] uppercase"
                style={{ left }}
              >
                {stage}
              </span>
              <span
                className="absolute top-4.5 w-2 h-2 rounded-full bg-white border-2 border-[rgba(16,22,19,0.2)] -translate-x-1/2"
                style={{ left }}
              />
            </React.Fragment>
          );
        })}

        {activeJobs.map((job) => {
          const stageIndex = STATUS_TO_STAGE[job.status];
          const left = `${4 + (stageIndex * 92 / 6)}%`;
          return (
            <span
              key={job.id}
              className="absolute top-3.5 w-4 h-4 rounded-full bg-[#0e9f6e] border-3 border-white shadow-[0_3px_10px_rgba(14,159,110,0.45)] -translate-x-1/2 transition-all duration-700 ease-out"
              style={{ left }}
              title={job.contactName || "Unknown"}
            />
          );
        })}
      </div>
    </div>
  );
}
