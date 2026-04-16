"use client";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { Job } from "@/types";

export function JobCard({ job }: { job: Job }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            {job.serviceName}
          </div>
          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            {job.status} · {job.city}
          </div>
        </div>
        <Badge>{job.tier}</Badge>
      </div>
    </Card>
  );
}

