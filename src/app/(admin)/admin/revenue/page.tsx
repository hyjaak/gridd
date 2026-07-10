"use client";

import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { money } from "@/lib/job-tracking";
import { serviceMeta } from "@/lib/driver-service-meta";
import { feeForJob, parseJobTime } from "@/components/admin/admin-dashboard-utils";
import type { Job } from "@/types";

type RevenuePayload = {
  ok?: boolean;
  allTimeRevenueCents?: number;
  monthRevenueCents?: number;
  topServices?: { serviceId: string; platformFeeCents: number }[];
  projectionNextMonthCents?: number;
};

function completedTimeMs(job: Job): number {
  const c = job.completedAt as unknown;
  if (c instanceof Timestamp) return c.toMillis();
  if (typeof c === "string") return parseJobTime(c);
  return 0;
}

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);

    const compute = (jobs: Job[]) => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const tMonth = monthStart.getTime();

      let allTime = 0;
      let monthTotal = 0;
      const byService: Record<string, number> = {};

      for (const j of jobs) {
        if (j.status !== "completed") continue;
        const fee = feeForJob(j);
        allTime += fee;
        const ct = completedTimeMs(j);
        if (ct >= tMonth) monthTotal += fee;
        const sid = j.serviceId ?? "other";
        byService[sid] = (byService[sid] ?? 0) + fee;
      }

      const ranked = Object.entries(byService)
        .map(([serviceId, platformFeeCents]) => ({ serviceId, platformFeeCents }))
        .sort((a, b) => b.platformFeeCents - a.platformFeeCents);

      setData({
        ok: true,
        allTimeRevenueCents: allTime,
        monthRevenueCents: monthTotal,
        topServices: ranked.slice(0, 12),
        projectionNextMonthCents: Math.round(monthTotal * 1.05),
      });
      setLoading(false);
    };

    const handle = (snap: { docs: { id: string; data: () => unknown }[] }) => {
      const jobs: Job[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Job, "id">),
      }));
      compute(jobs);
    };

    let unsubFallback: (() => void) | undefined;
    const unsub = onSnapshot(
      query(collection(db, "jobs"), orderBy("createdAt", "desc"), limit(800)),
      handle,
      () => {
        unsubFallback = onSnapshot(
          query(collection(db, "jobs"), limit(800)),
          handle,
          (e) => {
            setErr(e instanceof Error ? e.message : "Failed to load revenue");
            setData(null);
            setLoading(false);
          },
        );
      },
    );

    return () => {
      unsub();
      unsubFallback?.();
    };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">CEO · Revenue</h1>
        <p className="mt-1 text-sm text-zinc-400">Platform fees (CEO only)</p>
      </div>

      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-zinc-800/80" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="text-xs uppercase tracking-wide text-zinc-500">All time</div>
              <div className="mt-2 text-3xl font-semibold text-[#00FF88]">
                {money(data?.allTimeRevenueCents ?? 0)}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="text-xs uppercase tracking-wide text-zinc-500">This month</div>
              <div className="mt-2 text-3xl font-semibold text-zinc-100">
                {money(data?.monthRevenueCents ?? 0)}
              </div>
            </div>
          </div>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="text-lg font-semibold text-zinc-100">Top services (by platform fee)</h2>
            <ul className="mt-4 space-y-2">
              {(data?.topServices ?? []).map((row, i) => {
                const meta = serviceMeta(row.serviceId, row.serviceId);
                return (
                  <li
                    key={row.serviceId}
                    className="flex items-center justify-between rounded-xl border border-zinc-800/80 px-3 py-2"
                  >
                    <span className="text-zinc-300">
                      {(i + 1).toString()}. {meta.icon} {meta.label}
                    </span>
                    <span className="font-mono text-amber-300/90">{money(row.platformFeeCents)}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="text-lg font-semibold text-zinc-100">Projection</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Next month (simple heuristic +5% vs month-to-date):{" "}
              <span className="font-semibold text-[#00FF88]">
                {money(data?.projectionNextMonthCents ?? 0)}
              </span>
            </p>
          </section>
        </>
      )}
    </main>
  );
}
