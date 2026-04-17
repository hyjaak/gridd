"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  increment,
  onSnapshot,
  runTransaction,
  updateDoc,
} from "firebase/firestore";
import { MapPin, Phone, Star } from "lucide-react";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";
import { BackButton } from "@/components/BackButton";
import { CustomerNav } from "@/components/CustomerNav";
import { getUserRole } from "@/lib/userRole";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import {
  customerCanCancel,
  money,
  TRACKING_STEP_DEFS,
  trackingStepIndex,
} from "@/lib/job-tracking";
import type { Job } from "@/types";

function etaCountdown(etaIso: string | undefined): string | null {
  if (!etaIso) return null;
  const t = new Date(etaIso).getTime();
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.floor((t - Date.now()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function TrackJobPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = String(params.jobId ?? "");
  const { user, profile } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = user;
      if (!u) return;
      const r = await getUserRole(u.uid);
      if (cancelled) return;
      if (r === "driver") router.replace("/jobs");
      else if (r === "admin") router.replace("/admin/dashboard");
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [pointsToast, setPointsToast] = useState<number | null>(null);
  const completionCelebrationRef = useRef(false);

  useEffect(() => {
    if (!firebaseApp || !jobId) return;
    const db = getFirestore(firebaseApp);
    const unsub = onSnapshot(
      doc(db, "jobs", jobId),
      (snap) => {
        if (!snap.exists()) {
          setJob(null);
          return;
        }
        const data = snap.data() as Omit<Job, "id">;
        setJob({ id: snap.id, ...data });
      },
      () => setJob(null),
    );
    return () => unsub();
  }, [jobId]);

  const isCustomer = user && job && job.customerUid === user.uid;

  useEffect(() => {
    completionCelebrationRef.current = false;
  }, [jobId]);

  useEffect(() => {
    if (
      !job ||
      job.status !== "completed" ||
      job.reviewSubmittedAt ||
      !isCustomer ||
      completionCelebrationRef.current
    ) {
      return;
    }
    completionCelebrationRef.current = true;
    setCelebrate(true);
    const t = window.setTimeout(() => {
      setCelebrate(false);
      setReviewOpen(true);
    }, 2200);
    return () => window.clearTimeout(t);
  }, [job, isCustomer]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const etaLabel = useMemo(() => {
    void tick;
    if (!job?.etaAt && job?.etaMinutes != null) {
      return `~${job.etaMinutes} min`;
    }
    return etaCountdown(job?.etaAt) ?? "—";
  }, [job?.etaAt, job?.etaMinutes, tick]);

  const currentStep = job ? trackingStepIndex(job.status) : -1;

  const cancelJob = useCallback(async () => {
    if (!job || !customerCanCancel(job.status)) return;
    const token = await firebaseAuth?.currentUser?.getIdToken();
    if (!token) return;
    setCancelBusy(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/cancel`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !data?.ok) {
        alert(data?.error ?? "Could not cancel.");
      }
    } finally {
      setCancelBusy(false);
    }
  }, [job]);

  const callDriver = useCallback(async () => {
    setCallError(null);
    const token = await firebaseAuth?.currentUser?.getIdToken();
    if (!token) return;
    const res = await fetch(`/api/jobs/${jobId}/call-bridge`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      dialUrl?: string;
      error?: string;
      hint?: string;
    };
    if (!res.ok || !data?.ok || !data.dialUrl) {
      setCallError(data?.error ?? data?.hint ?? "Call unavailable.");
      return;
    }
    window.location.href = data.dialUrl;
  }, [jobId]);

  const submitReview = useCallback(async () => {
    if (!firebaseApp || !user || !job?.providerUid) return;
    setReviewBusy(true);
    setReviewError(null);
    const db = getFirestore(firebaseApp);
    const authorName = profile?.name ?? user.email ?? "Customer";
    try {
      await addDoc(collection(db, "porch"), {
        type: "review",
        title: `${job.serviceName} — ${job.providerName ?? "Provider"}`,
        body: reviewText.trim() || "Great service.",
        rating: reviewStars,
        authorUid: user.uid,
        authorName,
        authorRole: "customer",
        createdAt: new Date().toISOString(),
        jobId: job.id,
        providerUid: job.providerUid,
      });

      const pref = doc(db, "providers", job.providerUid);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(pref);
        if (!snap.exists()) {
          tx.set(pref, { uid: job.providerUid, rating: reviewStars, reviewCount: 1 }, { merge: true });
          return;
        }
        const prevRating = (snap.data()?.rating as number | undefined) ?? 5;
        const count = (snap.data()?.reviewCount as number | undefined) ?? 0;
        const newCount = count + 1;
        const newAvg = (prevRating * count + reviewStars) / newCount;
        tx.set(pref, { rating: newAvg, reviewCount: newCount }, { merge: true });
      });

      await updateDoc(doc(db, "jobs", job.id), {
        reviewSubmittedAt: new Date().toISOString(),
      });

      const pointsAward = 15 * reviewStars;
      await updateDoc(doc(db, "users", user.uid), {
        points: increment(pointsAward),
      });

      setReviewOpen(false);
      setPointsToast(pointsAward);
      window.setTimeout(() => setPointsToast(null), 5000);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "Could not save review.");
    } finally {
      setReviewBusy(false);
    }
  }, [firebaseApp, user, job, profile?.name, reviewStars, reviewText]);

  if (job === undefined) {
    return (
      <main className="min-h-full bg-[#060606] px-6 pb-36 pt-16 sm:pt-10">
        <BackButton href="/track" />
        <div className="mx-auto max-w-xl">
          <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
        </div>
        <CustomerNav />
      </main>
    );
  }

  if (!job) {
    return (
      <main className="min-h-full bg-[#060606] px-6 pb-36 pt-16 sm:pt-10">
        <BackButton href="/track" />
        <p className="text-sm text-[var(--sub)]">Job not found.</p>
        <CustomerNav />
      </main>
    );
  }

  const totalCents = job.chargedTotalCents ?? job.amountCents ?? 0;
  const displayAddress = job.addressLine ?? [job.city, job.zip].filter(Boolean).join(", ");

  return (
    <main className="min-h-full bg-[#060606] px-6 pb-36 pt-16 sm:pt-10">
      <BackButton href="/track" />

      <div className="mx-auto max-w-xl space-y-5">
        <div>
          <div className="text-xs uppercase tracking-widest text-[var(--sub)]">Live tracking</div>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--text)]">{job.serviceName}</h1>
          <p className="mt-1 text-sm text-[var(--sub)]">{displayAddress}</p>
        </div>

        {/* Google Maps hook: replace inner div with <GoogleMap> when API key is set */}
        <div
          className="relative h-48 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-inner"
          data-map-placeholder="google-maps-ready"
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <MapPin className="h-10 w-10 text-[#00FF88]/80" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--sub)]">
              Map preview
            </span>
            <span className="text-[11px] text-[var(--sub)]">
              Live map connects here — tracking updates below in real time.
            </span>
          </div>
        </div>

        {job.providerUid ? (
          <Card className="flex items-center gap-4 p-4">
            <div
              className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5"
              style={{
                backgroundImage: job.providerPhotoUrl ? `url(${job.providerPhotoUrl})` : undefined,
                backgroundSize: "cover",
              }}
            >
              {!job.providerPhotoUrl ? (
                <div className="flex h-full w-full items-center justify-center text-xl text-[var(--sub)]">
                  {(job.providerName ?? "D").slice(0, 1)}
                </div>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-[var(--text)]">
                {job.providerName ?? "Your driver"}
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-sm text-[#FFB800]">
                <Star className="h-4 w-4 fill-current" aria-hidden />
                {(job.providerRating ?? 5).toFixed(1)} rating
              </div>
              <div className="mt-1 text-xs text-[var(--sub)]">ETA {etaLabel}</div>
            </div>
          </Card>
        ) : (
          <Card className="p-4 text-sm text-[var(--sub)]">Matching you with a driver…</Card>
        )}

        <Card className="p-5">
          <div className="text-xs uppercase tracking-wider text-[var(--sub)]">Status</div>
          <div className="mt-4 space-y-3">
            {TRACKING_STEP_DEFS.map((step, idx) => {
              const active = currentStep >= idx;
              const current = currentStep === idx;
              return (
                <div key={step.status} className="flex items-start gap-3">
                  <div
                    className={[
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      active
                        ? current
                          ? "bg-[#00FF88] text-black"
                          : "bg-[#00FF88]/25 text-[#00FF88]"
                        : "bg-white/5 text-[var(--sub)]",
                    ].join(" ")}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <div
                      className={[
                        "text-sm font-medium",
                        current ? "text-[#00FF88]" : "text-[var(--text)]",
                      ].join(" ")}
                    >
                      {step.label}
                    </div>
                    {step.status === "en_route" && current ? (
                      <div className="text-xs text-[var(--sub)]">ETA {etaLabel}</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Link href={`/messages/${jobId}`}>
            <Button className="w-full" variant="secondary" type="button">
              Message
            </Button>
          </Link>
          <Button
            className="w-full"
            variant="secondary"
            type="button"
            onClick={() => void callDriver()}
          >
            <Phone className="mr-2 h-4 w-4" aria-hidden />
            Call driver
          </Button>
        </div>
        {callError ? (
          <p className="text-center text-xs text-amber-400/90">{callError}</p>
        ) : null}

        <Card className="space-y-2 p-5 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--sub)]">Service</span>
            <span className="text-right text-[var(--text)]">{job.serviceName}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--sub)]">Address</span>
            <span className="text-right text-[var(--text)]">{displayAddress || "—"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--sub)]">Amount</span>
            <span className="font-semibold text-[#00FF88]">{money(totalCents)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--sub)]">Payment</span>
            <span className="text-[var(--text)]">{job.paymentStatus ?? "—"}</span>
          </div>
        </Card>

        {isCustomer && customerCanCancel(job.status) ? (
          <Button
            variant="secondary"
            className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10"
            disabled={cancelBusy}
            onClick={() => void cancelJob()}
          >
            {cancelBusy ? "Cancelling…" : "Cancel job"}
          </Button>
        ) : null}

        {job.status === "cancelled" ? (
          <p className="text-center text-sm text-[var(--sub)]">This job was cancelled.</p>
        ) : null}
      </div>

      {celebrate && job.status === "completed" && isCustomer ? (
        <div className="pointer-events-none fixed inset-0 z-[190] flex items-center justify-center bg-black/60">
          <div className="animate-bounce text-center">
            <div className="text-6xl">🎉</div>
            <p className="mt-4 text-lg font-semibold text-[#00FF88]">Job complete!</p>
          </div>
        </div>
      ) : null}

      {pointsToast != null ? (
        <div className="fixed bottom-24 left-1/2 z-[210] -translate-x-1/2 rounded-full border border-[#00FF88]/40 bg-[#0a0a0a] px-5 py-3 text-sm font-medium text-[#00FF88] shadow-lg">
          +{pointsToast} Ditch Points earned! 🎉
        </div>
      ) : null}

      {reviewOpen && isCustomer ? (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111] p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-[var(--text)]">How was your service?</h2>
            <p className="mt-1 text-sm text-[var(--sub)]">
              Your review appears on The Porch and updates your driver&apos;s rating.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} stars`}
                  className="rounded-lg p-1 text-[#FFB800] transition hover:scale-110"
                  onClick={() => setReviewStars(n)}
                >
                  <Star
                    className={[
                      "h-9 w-9",
                      n <= reviewStars ? "fill-current" : "text-white/20",
                    ].join(" ")}
                  />
                </button>
              ))}
            </div>
            <label className="mt-4 block text-xs text-[var(--sub)]">
              Written review (optional)
              <Input
                className="mt-1"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Tell neighbors what stood out…"
              />
            </label>
            {reviewError ? (
              <p className="mt-2 text-sm text-red-400">{reviewError}</p>
            ) : null}
            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                type="button"
                disabled={reviewBusy}
                onClick={() => setReviewOpen(false)}
              >
                Later
              </Button>
              <Button
                className="flex-1"
                type="button"
                disabled={reviewBusy}
                onClick={() => void submitReview()}
              >
                {reviewBusy ? "Saving…" : "Submit review"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <CustomerNav />
    </main>
  );
}
