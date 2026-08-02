"use client";

import MiniRun, { type RunStage } from "@/components/job/MiniRun";
import type { DispatchJob } from "@/types/dispatch";

const COPY: Record<RunStage, string> = {
  booked: "Locked in. The SUV rolls soon — we'll be moving before you know it.",
  rolling: "Ibrahim is on the road with your run 🚚",
  arrived: "Pulling up now.",
  delivered: "Handled. Proof incoming…",
  done: "All set. Thanks for running with GRIDD.",
};

function tsMs(ts: any): number {
  if (!ts) return 0;
  return ts.seconds ? ts.seconds * 1000 : (ts.toMillis?.() ?? 0);
}

export function statusToStage(s: string): RunStage {
  if (["accepted", "assigned", "pickup"].includes(s)) return "booked";
  if (s === "in_progress") return "rolling";
  if (s === "proof") return "delivered";
  if (s === "paid") return "done";
  return "booked";
}

export default function RunHero({ job, stage }: { job: DispatchJob; stage: RunStage }) {
  const etaMs = job.etaSetAt ? tsMs(job.etaSetAt) + (job.etaMinutes ?? 0) * 60_000 : 0;
  const remaining = etaMs ? Math.ceil((etaMs - Date.now()) / 60_000) : null;
  const showEta = stage === "rolling" && remaining != null && remaining > 0;

  return (
    <div className="mb-5">
      <MiniRun stage={stage} />
      <div className="text-center mt-3">
        <div className="text-[15px] font-extrabold text-[#101613]">{COPY[stage]}</div>
        {showEta && (
          <div className="text-[12px] text-[#0e9f6e] font-bold mt-0.5">About {remaining} min</div>
        )}
      </div>
    </div>
  );
}