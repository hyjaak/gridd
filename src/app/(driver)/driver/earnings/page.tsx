"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuth } from "@/hooks/useAuth";
import { DriverNav } from "@/components/DriverNav";
import { money, payoutBaseCentsFromTotal } from "@/lib/job-tracking";
import { Card } from "@/components/ui/Card";
import type { Job } from "@/types";
import type { Provider } from "@/types";
import type { DriverTier } from "@/types";

function payoutForJob(job: Job): number {
  if (typeof job.providerPayoutCents === "number") return job.providerPayoutCents;
  const total = job.chargedTotalCents ?? job.amountCents ?? 0;
  return payoutBaseCentsFromTotal(total);
}

function nextFridayLabel(): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntilFri = (5 - day + 7) % 7 || 7;
  const fri = new Date(d);
  fri.setDate(d.getDate() + daysUntilFri);
  return fri.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

const TIER_ORDER: DriverTier[] = ["starter", "bronze", "silver", "gold"];

function jobsToNextTier(tier: DriverTier | undefined, completed: number): number {
  const t = tier ?? "starter";
  const targets: Record<DriverTier, number> = {
    starter: 10,
    bronze: 50,
    silver: 150,
    gold: 99999,
  };
  const target = targets[t] ?? 10;
  return Math.max(0, target - completed);
}

export default function DriverEarningsPage() {
  const { loading: gateLoading, ok } = useRequireAuth(["driver"]);
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) return;
    const db = getFirestore(firebaseApp);
    const q = query(collection(db, "jobs"), where("providerUid", "==", user.uid), limit(400));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Job, "id">) }))
          .filter((j) => j.status === "completed") as Job[];
        setJobs(rows);
      },
      () => setJobs([]),
    );
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) return;
    const db = getFirestore(firebaseApp);
    const unsub = onSnapshot(doc(db, "providers", user.uid), (snap) => {
      if (!snap.exists()) {
        setProvider(null);
        return;
      }
      setProvider({ uid: snap.id, ...(snap.data() as Omit<Provider, "uid">) });
    });
    return () => unsub();
  }, [user?.uid]);

  const week = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let sum = 0;
    for (const j of jobs) {
      const ct = new Date(j.completedAt ?? j.createdAt).getTime();
      if (ct >= weekAgo) sum += payoutForJob(j);
    }
    return sum;
  }, [jobs]);

  const month = useMemo(() => {
    const ms = new Date();
    ms.setDate(1);
    ms.setHours(0, 0, 0, 0);
    const t0 = ms.getTime();
    let sum = 0;
    for (const j of jobs) {
      const ct = new Date(j.completedAt ?? j.createdAt).getTime();
      if (ct >= t0) sum += payoutForJob(j);
    }
    return sum;
  }, [jobs]);

  const allTime = useMemo(() => jobs.reduce((s, j) => s + payoutForJob(j), 0), [jobs]);

  const weeklyBars = useMemo(() => {
    const bars: { label: string; cents: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      let cents = 0;
      for (const j of jobs) {
        const ct = new Date(j.completedAt ?? j.createdAt).getTime();
        if (ct >= day.getTime() && ct < next.getTime()) cents += payoutForJob(j);
      }
      bars.push({
        label: day.toLocaleDateString(undefined, { weekday: "short" }),
        cents,
      });
    }
    return bars;
  }, [jobs]);

  const maxBar = Math.max(1, ...weeklyBars.map((b) => b.cents));
  const completedCount = provider?.completedJobCount ?? jobs.length;
  const tier = provider?.driverTier ?? "starter";
  const needNext = jobsToNextTier(tier, completedCount);
  const tierIdx = TIER_ORDER.indexOf(tier);
  const nextTier =
    tierIdx >= 0 && tierIdx < TIER_ORDER.length - 1 ? TIER_ORDER[tierIdx + 1] : null;
  const bankOk = Boolean(provider?.stripeConnectId || provider?.bankConnected);

  if (gateLoading || !ok) {
    return <LoadingScreen />;
  }

  return (
    <main className="min-h-full bg-[#060606] px-4 pb-36 pt-16 sm:pt-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text)]">Earnings</h1>
          <p className="mt-1 text-sm text-[var(--sub)]">Payouts from completed jobs</p>
        </div>

        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-[var(--sub)]">This week</div>
          <div className="mt-2 text-4xl font-bold text-[#00FF88]">{money(week)}</div>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="text-xs text-[var(--sub)]">This month</div>
            <div className="mt-1 text-xl font-semibold text-[var(--text)]">{money(month)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-[var(--sub)]">All time</div>
            <div className="mt-1 text-xl font-semibold text-[var(--text)]">{money(allTime)}</div>
          </Card>
        </div>

        <Card className="p-5">
          <div className="text-sm font-semibold text-[var(--text)]">Last 7 days</div>
          <div className="mt-4 flex h-40 items-end justify-between gap-1">
            {weeklyBars.map((b) => (
              <div key={b.label} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full max-w-[40px] rounded-t bg-[#00FF88]/80"
                  style={{ height: `${Math.max(8, (b.cents / maxBar) * 100)}%` }}
                  title={money(b.cents)}
                />
                <span className="text-[10px] text-[var(--sub)]">{b.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-2 p-5">
          <div className="text-sm font-semibold text-[var(--text)]">Tier progress</div>
          <div className="text-sm text-[var(--sub)]">
            Current tier: <span className="capitalize text-[#00FF88]">{tier}</span>
          </div>
          <div className="text-sm text-[var(--sub)]">
            {nextTier
              ? `~${needNext} more completed jobs to reach ${nextTier}`
              : "Top tier reached"}
          </div>
        </Card>

        <Card className="space-y-2 p-5">
          <div className="text-sm font-semibold text-[var(--text)]">Payout schedule</div>
          <div className="text-sm text-[var(--sub)]">
            Next payout: <span className="text-[var(--text)]">{nextFridayLabel()}</span>
          </div>
          <div className="text-sm text-[var(--sub)]">
            Bank account:{" "}
            <span className={bankOk ? "text-[#00FF88]" : "text-amber-400"}>
              {bankOk ? "Connected" : "Not connected"}
            </span>
          </div>
        </Card>

        <Link href="/jobs" className="inline-block text-sm text-[#00FF88] underline">
          ← Back to jobs
        </Link>
      </div>

      <DriverNav />
    </main>
  );
}
