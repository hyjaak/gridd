"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { money } from "@/lib/job-tracking";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { BackButton } from "@/components/BackButton";
import { DriverNav } from "@/components/DriverNav";
import type { Job } from "@/types";

const BG = "#0a0a0a";

export default function EarningsHistoryPage() {
  const { loading: gate, ok } = useRequireAuth(["driver"]);
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<"all" | "week" | "month">("all");

  useEffect(() => {
    if (!firebaseApp || !user?.uid) return;
    const db = getFirestore(firebaseApp);
    void (async () => {
      const qs = query(collection(db, "jobs"), where("providerUid", "==", user.uid), limit(200));
      const snap = await getDocs(qs);
      const rows: Job[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Job, "id">) }));
      setJobs(rows.filter((j) => j.status === "completed"));
    })();
  }, [user?.uid]);

  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const monthAgo = now - 30 * 86400000;

  const filtered = useMemo(() => {
    const list = [...jobs].sort((a, b) => {
      const ta = new Date(a.completedAt ?? a.createdAt ?? 0).getTime();
      const tb = new Date(b.completedAt ?? b.createdAt ?? 0).getTime();
      return tb - ta;
    });
    if (filter === "all") return list;
    return list.filter((j) => {
      const t = new Date(j.completedAt ?? j.createdAt ?? 0).getTime();
      return filter === "week" ? t >= weekAgo : t >= monthAgo;
    });
  }, [jobs, filter, weekAgo, monthAgo]);

  const totalCents = useMemo(
    () => filtered.reduce((s, j) => s + (j.providerPayoutCents ?? j.amountCents ?? 0), 0),
    [filtered],
  );

  if (gate || !ok) return <LoadingScreen />;

  return (
    <main className="min-h-screen pb-36" style={{ background: BG }}>
      <header className="sticky top-0 z-20 border-b border-[#1a1a1a] px-5 py-4" style={{ background: BG }}>
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <BackButton href="/driver/settings" inline />
          <h1 className="text-lg font-semibold text-white">Earnings history</h1>
        </div>
      </header>
      <div className="mx-auto max-w-lg px-5 pt-4">
        <div className="mb-4 flex gap-2">
          {(
            [
              ["all", "All time"],
              ["month", "30 days"],
              ["week", "7 days"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                filter === k ? "border-[#3dff7a] bg-[#3dff7a]/15 text-[#3dff7a]" : "border-[#1a1a1a] text-zinc-500",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mb-4 text-sm text-zinc-400">
          Total (filtered): <span className="font-semibold text-[#00FF88]">{money(totalCents)}</span>
        </p>
        <ul className="space-y-2">
          {filtered.map((j) => (
            <li
              key={j.id}
              className="flex items-center justify-between rounded-xl border border-[#1a1a1a] bg-[#111] px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium text-white">{j.serviceName ?? "Job"}</div>
                <div className="text-xs text-zinc-500">
                  {j.completedAt ? new Date(j.completedAt as string).toLocaleString() : "—"}
                </div>
              </div>
              <div className="text-sm font-semibold text-[#00FF88]">
                {money(j.providerPayoutCents ?? j.amountCents ?? 0)}
              </div>
            </li>
          ))}
        </ul>
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">No completed jobs yet.</p>
        ) : null}
      </div>
      <DriverNav />
    </main>
  );
}
