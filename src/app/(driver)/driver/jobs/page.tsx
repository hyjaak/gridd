"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  arrayUnion,
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";
import { getUserRole } from "@/lib/userRole";
import { useAuth } from "@/hooks/useAuth";
import { DriverNav } from "@/components/DriverNav";
import { LogoutButton } from "@/components/LogoutButton";
import { money, payoutBaseCentsFromTotal } from "@/lib/job-tracking";
import { serviceMeta } from "@/lib/driver-service-meta";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Job } from "@/types";
import type { Provider } from "@/types";
import { Star } from "lucide-react";

function timeAgo(iso: string | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s} sec ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} d ago`;
}

function firstNameOnly(name: string | undefined): string {
  if (!name?.trim()) return "Customer";
  return name.trim().split(/\s+/)[0] ?? "Customer";
}

function payoutForJob(job: Job): number {
  if (typeof job.providerPayoutCents === "number") return job.providerPayoutCents;
  const total = job.chargedTotalCents ?? job.amountCents ?? 0;
  return payoutBaseCentsFromTotal(total);
}

function isUrgentNow(job: Job): boolean {
  const u = job.bookingDetails?.urgency;
  return u === "now";
}

async function notifyCustomer(jobId: string, kind: string) {
  const token = await firebaseAuth?.currentUser?.getIdToken();
  if (!token) return;
  await fetch(`/api/jobs/${jobId}/driver-notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ kind }),
  }).catch(() => {});
}

function Skeleton({ className }: { className: string }) {
  return (
    <div className={["animate-pulse rounded-2xl bg-white/5", className].join(" ")} />
  );
}

export default function DriverJobsPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [myCompleted, setMyCompleted] = useState<Job[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = user;
      if (!u) return;
      const r = await getUserRole(u.uid);
      if (cancelled) return;
      if (r === "customer") router.replace("/home");
      else if (r === "admin") router.replace("/admin/dashboard");
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) return;
    const db = getFirestore(firebaseApp);
    const pref = doc(db, "providers", user.uid);
    const unsub = onSnapshot(
      pref,
      (snap) => {
        if (!snap.exists()) {
          setOnline(false);
          setProvider(null);
          return;
        }
        const data = { uid: snap.id, ...(snap.data() as Omit<Provider, "uid">) };
        setProvider(data);
        setOnline(data.status !== "offline");
      },
      () => setOnline(false),
    );
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) {
      setMyCompleted([]);
      return;
    }
    const db = getFirestore(firebaseApp);
    const q = query(collection(db, "jobs"), where("providerUid", "==", user.uid), limit(200));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Job, "id">),
          }))
          .filter((j) => j.status === "completed") as Job[];
        setMyCompleted(rows);
      },
      () => setMyCompleted([]),
    );
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!firebaseApp) return;
    const db = getFirestore(firebaseApp);
    const q = query(
      collection(db, "jobs"),
      where("status", "in", ["pending", "requested"]),
      limit(50),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Job, "id">) }))
          .sort((a, b) => {
            const ta = new Date(a.createdAt).getTime();
            const tb = new Date(b.createdAt).getTime();
            return tb - ta;
          }) as Job[];
        setJobs(rows);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  const visibleJobs = useMemo(() => {
    return jobs.filter((j) => !(j.declinedByUids ?? []).includes(user?.uid ?? ""));
  }, [jobs, user?.uid]);

  const earningsToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const t0 = start.getTime();
    let sum = 0;
    let count = 0;
    for (const j of myCompleted) {
      const ct = new Date(j.completedAt ?? j.createdAt).getTime();
      if (ct >= t0) {
        sum += payoutForJob(j);
        count += 1;
      }
    }
    return { cents: sum, jobsDone: count };
  }, [myCompleted]);

  const earningsWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let sum = 0;
    for (const j of myCompleted) {
      const ct = new Date(j.completedAt ?? j.createdAt).getTime();
      if (ct >= weekAgo) sum += payoutForJob(j);
    }
    return sum;
  }, [myCompleted]);

  const rating = provider?.rating ?? 0;

  const setOnlineStatus = useCallback(
    async (next: boolean) => {
      if (!firebaseApp || !user?.uid) return;
      const db = getFirestore(firebaseApp);
      await setDoc(
        doc(db, "providers", user.uid),
        {
          uid: user.uid,
          name: profile?.name ?? user.email?.split("@")[0] ?? "Driver",
          status: next ? "active" : "offline",
          rating: provider?.rating ?? 5,
          city: provider?.city ?? "",
        },
        { merge: true },
      );
    },
    [firebaseApp, user?.uid, user?.email, profile?.name, provider?.rating, provider?.city],
  );

  const acceptJob = useCallback(
    async (job: Job) => {
      if (!firebaseApp || !user) return;
      setAccepting(job.id);
      try {
        const db = getFirestore(firebaseApp);
        const now = new Date().toISOString();
        await updateDoc(doc(db, "jobs", job.id), {
          providerId: user.uid,
          providerUid: user.uid,
          providerName: profile?.name ?? user.email?.split("@")[0] ?? "Driver",
          status: "active",
          acceptedAt: now,
        });
        await notifyCustomer(job.id, "accepted");
        router.push("/active");
      } finally {
        setAccepting(null);
      }
    },
    [firebaseApp, user, profile?.name, profile, router],
  );

  const declineJob = useCallback(
    async (job: Job) => {
      if (!firebaseApp || !user) return;
      setDeclining(job.id);
      try {
        const db = getFirestore(firebaseApp);
        await updateDoc(doc(db, "jobs", job.id), {
          declinedByUids: arrayUnion(user.uid),
        });
      } finally {
        setDeclining(null);
      }
    },
    [firebaseApp, user],
  );

  const driverName = profile?.name ?? user?.email?.split("@")[0] ?? "Driver";

  return (
    <main className="min-h-full bg-[#060606] pb-40">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#060606]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-lg font-semibold text-[#00FF88]">GRIDD Driver</div>
            <div className="text-sm text-[var(--text)]">{driverName}</div>
          </div>
          <div className="flex items-center gap-3">
            <LogoutButton />
            <span className="text-xs text-[var(--sub)]">Status</span>
            <button
              type="button"
              onClick={() => void setOnlineStatus(!online)}
              className={[
                "relative flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                online
                  ? "border-[#00FF88]/50 bg-[#00FF88]/10 text-[#00FF88]"
                  : "border-white/15 bg-[#0a0a0a] text-[var(--sub)]",
              ].join(" ")}
            >
              {online ? (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00FF88] opacity-40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00FF88]" />
                </span>
              ) : (
                <span className="h-2 w-2 rounded-full bg-[var(--sub)]" />
              )}
              {online ? "Online" : "Offline"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-4">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <div className="text-[10px] uppercase tracking-wide text-[var(--sub)]">Today</div>
            <div className="mt-1 text-lg font-semibold text-[#00FF88]">
              {money(earningsToday.cents)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-[10px] uppercase tracking-wide text-[var(--sub)]">This week</div>
            <div className="mt-1 text-lg font-semibold text-[#00FF88]">{money(earningsWeek)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-[10px] uppercase tracking-wide text-[var(--sub)]">Jobs today</div>
            <div className="mt-1 text-lg font-semibold text-[var(--text)]">{earningsToday.jobsDone}</div>
          </Card>
          <Card className="p-4">
            <div className="text-[10px] uppercase tracking-wide text-[var(--sub)]">Rating</div>
            <div className="mt-1 flex items-center gap-1 text-lg font-semibold text-[#FFB800]">
              <Star className="h-5 w-5 fill-current" aria-hidden />
              {rating.toFixed(1)}
            </div>
          </Card>
        </section>

        {!online ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#0a0a0a] px-4 py-12 text-center">
            <p className="text-lg font-medium text-[var(--text)]">You&apos;re offline</p>
            <p className="mt-2 text-sm text-[var(--sub)]">
              Go online to see incoming jobs in your area.
            </p>
            <Button className="mt-6 min-h-[48px] w-full max-w-xs" type="button" onClick={() => void setOnlineStatus(true)}>
              Go Online
            </Button>
          </div>
        ) : null}

        {online ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text)]">Open jobs</h2>
              <Link
                href="/active"
                className="text-sm font-medium text-[#00FF88] underline-offset-4 hover:underline"
              >
                Active job
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
              </div>
            ) : visibleJobs.length === 0 ? (
              <Card className="p-6">
                <p className="text-sm text-[var(--text)]">No open jobs right now.</p>
                <p className="mt-1 text-xs text-[var(--sub)]">New requests appear here instantly.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {visibleJobs.map((job) => {
                  const meta = serviceMeta(job.serviceId, job.serviceName);
                  const payout = payoutForJob(job);
                  return (
                    <Card
                      key={job.id}
                      className="overflow-hidden border-l-4 p-4"
                      style={{ borderLeftColor: meta.color }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="text-3xl">{meta.icon}</span>
                          <div className="min-w-0">
                            <div className="font-semibold text-[var(--text)]" style={{ color: meta.color }}>
                              {meta.label}
                            </div>
                            <div className="mt-1 text-sm text-[var(--text)]">
                              {firstNameOnly(job.customerName)}
                            </div>
                            <div className="mt-1 text-xs text-[var(--sub)]">
                              {job.city}
                              {job.zip ? ` · ${job.zip}` : ""}
                            </div>
                            <div className="mt-1 text-xs text-[var(--sub)]">
                              {timeAgo(job.createdAt)}
                            </div>
                            {isUrgentNow(job) ? (
                              <span className="mt-2 inline-block rounded-full bg-red-600/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                🔴 URGENT
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-[var(--sub)]">Payout</div>
                          <div className="text-xl font-bold text-[#00FF88]">{money(payout)}</div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-[48px] w-full flex-1 border-red-500/30 text-red-400"
                          disabled={declining === job.id}
                          onClick={() => void declineJob(job)}
                        >
                          {declining === job.id ? "…" : "✕ Decline"}
                        </Button>
                        <Button
                          type="button"
                          className="min-h-[48px] w-full flex-1"
                          disabled={accepting === job.id}
                          onClick={() => void acceptJob(job)}
                        >
                          {accepting === job.id ? "Accepting…" : "✅ Accept"}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </div>

      <DriverNav />
    </main>
  );
}
