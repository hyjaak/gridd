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
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuth } from "@/hooks/useAuth";
import { DriverNav } from "@/components/DriverNav";
import { LogoutButton } from "@/components/LogoutButton";
import { money, payoutBaseCentsFromTotal } from "@/lib/job-tracking";
import { serviceMeta } from "@/lib/driver-service-meta";
import { canGoOnline, demoExhausted, getDriverAccess } from "@/lib/driver-gate";
import { useDriverApprovalRedirect } from "@/hooks/useDriverApprovalRedirect";
import { useDriverLocationBroadcast } from "@/hooks/useDriverLocationBroadcast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { GriddPulsePanel } from "@/components/driver/GriddPulsePanel";
import { ShipdayCoachPanel } from "@/components/driver/ShipdayCoachPanel";
import {
  isOnTheGridd,
  isProviderBusy,
  presenceWriteOffline,
  presenceWriteOnline,
} from "@/lib/provider-status";
import type { Job } from "@/types";
import type { Provider } from "@/types";
import { Star } from "lucide-react";

const GREEN = "#3dff7a";
const OFF_BTN = "#333333";

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

const DRIVER_ONLY = ["driver"] as const;

export default function DriverJobsPage() {
  const router = useRouter();
  const { loading: gateLoading, ok, profile } = useRequireAuth([...DRIVER_ONLY]);
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [myCompleted, setMyCompleted] = useState<Job[]>([]);
  const [activeJobRow, setActiveJobRow] = useState<Job | null>(null);
  const [ripple, setRipple] = useState(false);
  const [offlineFlash, setOfflineFlash] = useState(false);
  const [gigCompleteToast, setGigCompleteToast] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("gigComplete") === "1") {
      setGigCompleteToast(true);
      router.replace("/driver/jobs", { scroll: false });
    }
  }, [router]);

  useEffect(() => {
    if (gateLoading || !ok || !profile) return;
    const onboardingDone =
      profile.onboardingComplete === true || provider?.onboardingComplete === true;
    if (onboardingDone) return;
    // Wait for `providers` snapshot — avoids /driver/jobs → /onboarding loop right after finishing onboarding
    // when Auth context has updated but this page's `provider` state has not caught up yet.
    if (!provider) return;
    router.replace("/onboarding");
  }, [gateLoading, ok, profile, provider, router]);

  useDriverApprovalRedirect(provider, !gateLoading && ok);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) return;
    const db = getFirestore(firebaseApp);
    const pref = doc(db, "providers", user.uid);
    const unsub = onSnapshot(
      pref,
      (snap) => {
        if (!snap.exists()) {
          setProvider(null);
          return;
        }
        const data = { uid: snap.id, ...(snap.data() as Omit<Provider, "uid">) };
        setProvider(data);
      },
      () => setProvider(null),
    );
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!firebaseApp || !user?.uid || !provider?.zip) return;
    const db = getFirestore(firebaseApp);
    const z = provider.zip.replace(/\D/g, "").slice(0, 5);
    if (z.length === 5) {
      void updateDoc(doc(db, "providers", user.uid), { currentZip: z }).catch(() => {});
    }
  }, [firebaseApp, user?.uid, provider?.zip]);

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
    if (!firebaseApp || !provider?.activeJob) {
      setActiveJobRow(null);
      return;
    }
    const db = getFirestore(firebaseApp);
    const id = provider.activeJob;
    const unsub = onSnapshot(doc(db, "jobs", id), (snap) => {
      if (!snap.exists()) {
        setActiveJobRow(null);
        return;
      }
      setActiveJobRow({ id: snap.id, ...(snap.data() as Omit<Job, "id">) } as Job);
    });
    return () => unsub();
  }, [firebaseApp, provider?.activeJob]);

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

  const onTheGridd = provider ? isOnTheGridd(provider) : false;
  const busy = provider ? isProviderBusy(provider) : false;

  useDriverLocationBroadcast(
    Boolean(provider && onTheGridd && canGoOnline(provider) && user?.uid),
    user?.uid,
  );

  const visibleJobs = useMemo(() => {
    if (!provider || !canGoOnline(provider)) return [];
    if (provider.activeJob) return [];
    return jobs.filter((j) => !(j.declinedByUids ?? []).includes(user?.uid ?? ""));
  }, [jobs, user?.uid, provider]);

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
      if (next && provider && !canGoOnline(provider)) {
        const access = getDriverAccess(provider);
        const hint =
          access === "upload"
            ? "Finish your driver application and upload documents first."
            : access === "pending"
              ? "Your documents are in review — you’ll get a text when you’re cleared."
              : access === "demo" && demoExhausted(provider)
                ? "Demo job limit reached — complete full approval to go online."
                : "We need CEO-approved status (or an active demo) before you can go ON THE GRIDD.";
        alert(`⏳ Can’t go online yet\n\n${hint}`);
        return;
      }
      const db = getFirestore(firebaseApp);
      try {
        await setDoc(
          doc(db, "providers", user.uid),
          {
            uid: user.uid,
            name: profile?.name ?? user.email?.split("@")[0] ?? "Driver",
            ...(next ? presenceWriteOnline() : presenceWriteOffline()),
            rating: provider?.rating ?? 5,
            city: provider?.city ?? "",
          },
          { merge: true },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        alert(
          `Could not update your status (${msg}).\n\n` +
            "If you’re approved in the app but this still fails, Firestore rules require CEO approval or an active demo before going online.",
        );
      }
    },
    [firebaseApp, user?.uid, user?.email, profile?.name, provider, provider?.rating, provider?.city],
  );

  const togglePresence = useCallback(() => {
    if (!provider || busy) return;
    if (!canGoOnline(provider)) {
      const access = getDriverAccess(provider);
      const hint =
        access === "upload"
          ? "Finish your driver application and upload documents first."
          : access === "pending"
            ? "Your documents are in review."
            : access === "demo" && demoExhausted(provider)
              ? "Demo job limit reached."
              : "CEO approval or an active demo is required.";
      alert(`⏳ Can’t go online yet\n\n${hint}`);
      return;
    }
    const next = !onTheGridd;
    if (next) {
      setRipple(true);
      window.setTimeout(() => setRipple(false), 900);
    } else {
      setOfflineFlash(true);
      window.setTimeout(() => setOfflineFlash(false), 700);
    }
    void setOnlineStatus(next);
  }, [provider, busy, onTheGridd, setOnlineStatus]);

  const acceptJob = useCallback(
    async (job: Job) => {
      if (!user) return;
      if (provider && !canGoOnline(provider)) {
        alert("Complete verification and CEO approval before accepting jobs.");
        return;
      }
      if (provider?.activeJob) {
        alert("Complete your current gig before grabbing another 💪");
        return;
      }
      setAccepting(job.id);
      try {
        const token = await firebaseAuth?.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`/api/jobs/${job.id}/accept`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
        if (!res.ok || !data?.ok) {
          alert(data?.error ?? "Could not accept job.");
          return;
        }
        await notifyCustomer(job.id, "accepted");
        const needsQuote = Boolean(
          (job.bookingDetails as { needsQuote?: boolean } | undefined)?.needsQuote,
        );
        router.push(needsQuote ? `/chat/${job.id}` : "/active");
      } finally {
        setAccepting(null);
      }
    },
    [user, profile?.name, profile, router, provider],
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
  const driverZip = provider?.currentZip ?? provider?.zip;
  const approvedGate = provider && canGoOnline(provider);

  if (gateLoading || !ok) {
    return <LoadingScreen />;
  }

  return (
    <main className="relative min-h-full bg-[#060606] pb-40">
      <div
        className={[
          "pointer-events-none fixed inset-0 z-[4] bg-black/35 transition-opacity duration-[700ms]",
          offlineFlash ? "opacity-100" : "opacity-0",
        ].join(" ")}
        aria-hidden
      />

      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#060606]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-lg font-semibold text-[#00FF88]">GRIDD Driver</div>
            <div className="text-sm text-[var(--text)]">{driverName}</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LogoutButton />
            {busy ? (
              <div className="rounded-full border border-amber-500/40 bg-amber-950/50 px-4 py-2 text-sm font-medium text-amber-100">
                🔥 Busy on a gig
              </div>
            ) : approvedGate ? (
              <div className="relative flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => togglePresence()}
                  className={[
                    "relative flex min-h-[48px] min-w-[200px] flex-col items-center justify-center overflow-hidden rounded-2xl border px-5 py-2 text-left transition-colors",
                  ].join(" ")}
                  style={{
                    borderColor: onTheGridd ? `${GREEN}66` : "#444",
                    backgroundColor: onTheGridd ? `${GREEN}18` : OFF_BTN,
                    color: onTheGridd ? GREEN : "#bbb",
                  }}
                >
                  {ripple ? (
                    <span
                      className="pointer-events-none absolute inset-0 flex items-center justify-center"
                      aria-hidden
                    >
                      <span
                        className="h-24 w-24 rounded-full bg-[#3dff7a]/30"
                        style={{ animation: "gridd-go-online-ripple 0.85s ease-out forwards" }}
                      />
                    </span>
                  ) : null}
                  <span className="relative z-10 text-sm font-bold">
                    {onTheGridd ? "⚡ ON THE GRIDD" : "🌑 GO OFF GRIDD"}
                  </span>
                  <span className="relative z-10 mt-0.5 max-w-[220px] text-center text-[11px] leading-tight text-white/80">
                    {onTheGridd
                      ? "You're live — jobs incoming"
                      : "You're hidden from all jobs"}
                  </span>
                  {onTheGridd ? (
                    <span className="absolute right-3 top-1/2 z-10 flex h-2 w-2 -translate-y-1/2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ backgroundColor: GREEN }} />
                      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: GREEN }} />
                    </span>
                  ) : null}
                </button>
              </div>
            ) : (
              <div className="max-w-xs rounded-xl border border-amber-500/30 bg-amber-950/40 px-3 py-2 text-xs leading-snug text-amber-100">
                ⏳ Pending CEO approval to go ON THE GRIDD
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-4xl space-y-4 px-4 py-4">
        {gigCompleteToast ? (
          <div className="rounded-2xl border border-[#3dff7a]/40 bg-[#0a1a12] px-4 py-3 text-sm text-[#3dff7a]">
            <div className="font-semibold">Gig complete! ⚡</div>
            <div className="mt-1 text-white/90">Ready for the next one?</div>
            <button
              type="button"
              className="mt-2 text-xs underline"
              onClick={() => setGigCompleteToast(false)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {provider?.activeJob && activeJobRow ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-orange-500/50 bg-gradient-to-r from-orange-950/80 to-[#1a0a00] px-4 py-3 text-center text-sm font-semibold text-orange-100">
              🔥 Active Gig — Stay focused
            </div>
            {(() => {
              const job = activeJobRow;
              const meta = serviceMeta(job.serviceId, job.serviceName);
              const payout = payoutForJob(job);
              return (
                <Card className="overflow-hidden border-l-4 p-4" style={{ borderLeftColor: meta.color }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="text-3xl">{meta.icon}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--sub)]">
                          Your active gig
                        </div>
                        <div className="font-semibold text-[var(--text)]" style={{ color: meta.color }}>
                          {meta.label}
                        </div>
                        <div className="mt-1 text-sm text-[var(--text)]">{firstNameOnly(job.customerName)}</div>
                        <div className="mt-1 text-xs text-[var(--sub)]">
                          {job.city}
                          {job.zip ? ` · ${job.zip}` : ""}
                        </div>
                        <div className="mt-1 text-xs text-[var(--sub)]">{timeAgo(job.createdAt)}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-[var(--sub)]">Payout</div>
                      <div className="text-xl font-bold text-[#00FF88]">{money(payout)}</div>
                    </div>
                  </div>
                  <Link href="/active" className="mt-4 block">
                    <Button className="min-h-[48px] w-full" type="button">
                      Open active gig
                    </Button>
                  </Link>
                </Card>
              );
            })()}
          </div>
        ) : provider?.activeJob ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
            <div className="font-semibold">🔥 Active Gig — Stay focused</div>
            <Link
              href="/active"
              className="mt-3 inline-block rounded-xl bg-[#00FF88] px-4 py-2 text-sm font-bold text-black"
            >
              Open active gig
            </Link>
          </div>
        ) : null}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <div className="text-[10px] uppercase tracking-wide text-[var(--sub)]">Today</div>
            <div className="mt-1 text-lg font-semibold text-[#00FF88]">{money(earningsToday.cents)}</div>
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

        <GriddPulsePanel driverZip={driverZip} />

        <ShipdayCoachPanel />

        {!onTheGridd && !busy && approvedGate ? (
          <div className="flex min-h-[28vh] flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#0a0a0a] px-4 py-10 text-center">
            <p className="text-lg font-medium text-[var(--text)]">You&apos;re off the GRIDD</p>
            <p className="mt-2 text-sm text-[var(--sub)]">Go ON THE GRIDD to see incoming jobs in your area.</p>
            <Button
              className="mt-6 min-h-[48px] w-full max-w-xs font-bold"
              type="button"
              style={{ backgroundColor: GREEN, color: "#000" }}
              onClick={() => {
                setRipple(true);
                window.setTimeout(() => setRipple(false), 900);
                void setOnlineStatus(true);
              }}
            >
              ⚡ ON THE GRIDD
            </Button>
          </div>
        ) : null}

        {busy ? null : onTheGridd && approvedGate ? (
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
                            <div className="mt-1 text-sm text-[var(--text)]">{firstNameOnly(job.customerName)}</div>
                            <div className="mt-1 text-xs text-[var(--sub)]">
                              {job.city}
                              {job.zip ? ` · ${job.zip}` : ""}
                            </div>
                            <div className="mt-1 text-xs text-[var(--sub)]">{timeAgo(job.createdAt)}</div>
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
                      {job.providerUid === user?.uid ? (
                        <Link href={`/chat/${job.id}`} className="mb-2 block">
                          <Button
                            type="button"
                            variant="secondary"
                            className="min-h-[48px] w-full border-[#00FF88]/30 text-[#00FF88]"
                          >
                            💬 Message customer
                          </Button>
                        </Link>
                      ) : null}
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
