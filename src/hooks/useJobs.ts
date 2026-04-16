"use client";

import { useEffect, useState } from "react";
import type { Job } from "@/types";

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      const res = await fetch("/api/jobs", { cache: "no-store" });
      const json = (await res.json()) as { items?: Job[] };
      if (!cancelled) setJobs(json.items ?? []);
      if (!cancelled) setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { jobs, loading };
}

