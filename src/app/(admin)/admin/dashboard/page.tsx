"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { firebaseAuth } from "@/lib/firebase";
import { money } from "@/lib/job-tracking";
import { serviceMeta } from "@/lib/driver-service-meta";
import type { Job } from "@/types";

function platformFeeCentsFromTotal(totalCents: number) {
  return Math.round(totalCents * 0.15);
}

function feeForJob(job: Job): number {
  if (typeof job.platformFeeCents === "number") return job.platformFeeCents;
  const gross = job.amountCents ?? job.chargedTotalCents ?? 0;
  return platformFeeCentsFromTotal(gross);
}

type StatsPayload = {
  ok?: boolean;
  revenueTodayCents?: number;
  weekRevenueCents?: number;
  monthRevenueCents?: number;
  allTimeRevenueCents?: number;
  activeJobsCount?: number;
  liveDriversCount?: number;
  feed?: Job[];
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const token = await firebaseAuth?.currentUser?.getIdToken();
      if (!token) {
        setErr("Not signed in.");
        return;
      }
      const res = await fetch("/api/admin/stats", {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => null)) as StatsPayload;
      if (!res.ok || !data?.ok) {
        setErr("Could not load dashboard.");
        return;
      }
      setStats(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 pb-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Admin · Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">Platform overview (fees visible to admins only)</p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link className="rounded-lg border border-zinc-700 px-3 py-2 text-zinc-200 hover:border-[#00FF88]" href="/admin/security">
            Security
          </Link>
          <Link className="rounded-lg border border-zinc-700 px-3 py-2 text-zinc-200 hover:border-[#00FF88]" href="/admin/revenue">
            Revenue
          </Link>
        </div>
      </div>

      {err ? (
        <p className="text-sm text-red-400">{err}</p>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-800/80" />
          ))}
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Revenue today</div>
            <div className="mt-2 text-2xl font-semibold text-[#00FF88]">
              {money(stats?.revenueTodayCents ?? 0)}
            </div>
            <div className="mt-1 text-[10px] text-zinc-500">Platform fees (15%)</div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Week revenue</div>
            <div className="mt-2 text-2xl font-semibold text-zinc-100">
              {money(stats?.weekRevenueCents ?? 0)}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Active jobs</div>
            <div className="mt-2 text-2xl font-semibold text-zinc-100">{stats?.activeJobsCount ?? 0}</div>
            <div className="mt-1 text-[10px] text-zinc-500">status = active</div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Live drivers</div>
            <div className="mt-2 text-2xl font-semibold text-zinc-100">{stats?.liveDriversCount ?? 0}</div>
            <div className="mt-1 text-[10px] text-zinc-500">status ≠ offline</div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-100">Live job feed</h2>
        <p className="mt-1 text-sm text-zinc-500">Last 10 jobs · newest first</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="py-2 pr-4">Service</th>
                <th className="py-2 pr-4">Route</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Platform fee</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.feed ?? []).map((j) => {
                const meta = serviceMeta(j.serviceId, j.serviceName);
                const fee = feeForJob(j);
                return (
                  <tr key={j.id} className="border-b border-zinc-800/80">
                    <td className="py-3 pr-4">
                      <span className="mr-2">{meta.icon}</span>
                      <span style={{ color: meta.color }}>{meta.label}</span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      {(j.customerName ?? "Customer").split(" ")[0]} → {j.providerName ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-200">{money(j.amountCents ?? 0)}</td>
                    <td className="py-3 pr-4 font-mono text-amber-300/90">{money(fee)}</td>
                    <td className="py-3">
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                        {j.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && (stats?.feed?.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">No jobs yet.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
