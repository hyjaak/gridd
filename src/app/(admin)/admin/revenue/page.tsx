"use client";

import { useCallback, useEffect, useState } from "react";
import { firebaseAuth } from "@/lib/firebase";
import { money } from "@/lib/job-tracking";
import { serviceMeta } from "@/lib/driver-service-meta";

type RevenuePayload = {
  ok?: boolean;
  allTimeRevenueCents?: number;
  monthRevenueCents?: number;
  topServices?: { serviceId: string; platformFeeCents: number }[];
  projectionNextMonthCents?: number;
};

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenuePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await firebaseAuth?.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch("/api/admin/revenue-detail", {
        headers: { authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => null)) as RevenuePayload;
      if (res.ok && json?.ok) setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Admin · Revenue</h1>
        <p className="mt-1 text-sm text-zinc-400">Platform fees (admin only)</p>
      </div>

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
