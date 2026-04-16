"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { Camera, CheckCircle2 } from "lucide-react";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import {
  driverNextStatus,
  driverStepLabel,
  driverStepTitle,
  money,
  payoutBaseCentsFromTotal,
} from "@/lib/job-tracking";
import { serviceMeta } from "@/lib/driver-service-meta";
import { uploadJobStepPhoto } from "@/lib/upload-job-photo";
import type { Job, JobStatus } from "@/types";

const ACTIVE: JobStatus[] = ["active", "assigned", "en_route", "arrived", "in_progress"];

function firstNameOnly(name: string | undefined): string {
  if (!name?.trim()) return "Customer";
  return name.trim().split(/\s+/)[0] ?? "Customer";
}

function stepKeyForStatus(s: JobStatus): string {
  switch (s) {
    case "active":
      return "head_to_customer";
    case "assigned":
      return "head_out";
    case "en_route":
      return "en_route";
    case "arrived":
      return "arrived";
    case "in_progress":
      return "working";
    default:
      return "other";
  }
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

export default function DriverActiveJobPage() {
  const { user } = useAuth();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeSummary, setCompleteSummary] = useState<{
    payout: number;
    tierBonus: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) return;
    const db = getFirestore(firebaseApp);
    const q = query(
      collection(db, "jobs"),
      where("providerUid", "==", user.uid),
      limit(15),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Job, "id">),
        })) as Job[];
        const active = rows.find((j) => ACTIVE.includes(j.status));
        setJob(active ?? null);
      },
      () => setJob(null),
    );
    return () => unsub();
  }, [user?.uid]);

  const totalCents = job?.chargedTotalCents ?? job?.amountCents ?? 0;
  const payoutCents =
    typeof job?.providerPayoutCents === "number"
      ? job.providerPayoutCents
      : payoutBaseCentsFromTotal(totalCents);

  const advance = useCallback(async () => {
    if (!firebaseApp || !user || !job) return;
    const db = getFirestore(firebaseApp);
    const next = driverNextStatus(job.status);
    if (!next) return;

    setBusy(true);
    try {
      const stepKey = stepKeyForStatus(job.status);
      let patch: Partial<Job> = {};

      if (photoFile) {
        const url = await uploadJobStepPhoto(job.id, stepKey, photoFile);
        patch = {
          jobPhotos: { ...(job.jobPhotos ?? {}), [stepKey]: url },
        };
        setPhotoFile(null);
      }

      const extra: Partial<Job> = {};
      if (next === "en_route") {
        extra.etaAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        extra.etaMinutes = 15;
      }

      await updateDoc(doc(db, "jobs", job.id), {
        ...patch,
        status: next,
        ...extra,
      });

      if (next === "en_route") {
        await notifyCustomer(job.id, "en_route");
      } else if (next === "arrived") {
        await notifyCustomer(job.id, "arrived");
      } else if (next === "in_progress") {
        await notifyCustomer(job.id, "started");
      }
    } finally {
      setBusy(false);
    }
  }, [firebaseApp, user, job, photoFile]);

  const completeJob = useCallback(async () => {
    if (!job) return;
    const token = await firebaseAuth?.currentUser?.getIdToken();
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/complete`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        payoutCents?: number;
        tierBonusCents?: number;
        totalPayoutCents?: number;
      };
      if (res.ok && data?.ok) {
        setCompleteSummary({
          payout: data.payoutCents ?? payoutCents,
          tierBonus: data.tierBonusCents ?? 0,
          total: data.totalPayoutCents ?? payoutCents,
        });
        setCompleteOpen(true);
      }
    } finally {
      setBusy(false);
    }
  }, [job, payoutCents]);

  const nextLabel = job ? driverStepLabel(job.status) : null;
  const stepTitle = job ? driverStepTitle(job.status) : null;
  const showAdvance =
    job && job.status !== "in_progress" && nextLabel && nextLabel !== "Complete Job";
  const showComplete = job?.status === "in_progress";

  const address = useMemo(() => {
    if (!job) return "";
    return job.addressLine ?? [job.city, job.zip].filter(Boolean).join(", ");
  }, [job]);

  const meta = job
    ? serviceMeta(job.serviceId, job.serviceName)
    : { icon: "✨", color: "#00FF88", label: "Job" };

  if (job === undefined) {
    return (
      <main className="min-h-full bg-[#060606] px-4 pb-28 pt-16 sm:pt-10">
        <BackButton href="/jobs" />
        <div className="mx-auto max-w-xl animate-pulse rounded-2xl bg-white/5 p-24" />
      </main>
    );
  }

  if (!job) {
    return (
      <main className="min-h-full bg-[#060606] px-4 pb-28 pt-16 sm:pt-10">
        <BackButton href="/jobs" />
        <div className="mx-auto max-w-xl space-y-4 text-center">
          <h1 className="text-xl font-semibold text-[var(--text)]">No active job</h1>
          <p className="text-sm text-[var(--sub)]">Pick one from the job board when you&apos;re ready.</p>
          <Link href="/jobs" className="inline-block text-[#00FF88] underline">
            Go to jobs
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-[#060606] px-4 pb-32 pt-16 sm:pt-10">
      <BackButton href="/jobs" />

      <div className="mx-auto max-w-xl space-y-5">
        <div
          className="rounded-2xl border-l-4 bg-[#0a0a0a] p-5 pl-6"
          style={{ borderColor: meta.color }}
        >
          <div className="flex items-center gap-3">
            <span className="text-4xl">{meta.icon}</span>
            <div>
              <div className="text-xs uppercase tracking-widest text-[var(--sub)]">Active job</div>
              <h1 className="text-2xl font-semibold" style={{ color: meta.color }}>
                {meta.label}
              </h1>
            </div>
          </div>
          <p className="mt-3 text-lg text-[var(--text)]">{firstNameOnly(job.customerName)}</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--sub)]">{address || "—"}</p>
          <div className="mt-4 text-3xl font-bold text-[#00FF88]">{money(payoutCents)}</div>
          <div className="text-xs text-[var(--sub)]">Your payout</div>
        </div>

        {stepTitle ? (
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wider text-[var(--sub)]">Current step</div>
            <div className="mt-1 text-lg font-semibold text-[#00FF88]">{stepTitle}</div>
          </Card>
        ) : null}

        <Card className="space-y-2 p-5 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--sub)]">Status</span>
            <span className="text-right text-[var(--text)]">{job.status.replace("_", " ")}</span>
          </div>
        </Card>

        <div className="rounded-2xl border border-dashed border-white/15 bg-[#0a0a0a] p-4">
          <label
            htmlFor="active-job-photo"
            className="flex min-h-[44px] cursor-pointer flex-col items-center justify-center gap-2 text-sm text-[var(--sub)]"
          >
            <Camera className="h-8 w-8 text-[#00FF88]" />
            <span>
              Photo at this step{" "}
              {photoFile ? `— ${photoFile.name}` : "(optional but recommended)"}
            </span>
            <input
              id="active-job-photo"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <Link href={`/messages/${job.id}`}>
            <Button className="min-h-[48px] w-full" variant="secondary" type="button">
              Message customer
            </Button>
          </Link>

          {showAdvance ? (
            <Button
              className="min-h-[52px] w-full text-base"
              type="button"
              disabled={busy}
              onClick={() => void advance()}
            >
              {busy ? "Updating…" : nextLabel}
            </Button>
          ) : null}

          {showComplete ? (
            <Button
              className="min-h-[52px] w-full bg-[#00FF88] text-base text-black hover:bg-[#00dd77]"
              type="button"
              disabled={busy}
              onClick={() => void completeJob()}
            >
              {busy ? "Completing…" : "Complete Job"}
            </Button>
          ) : null}
        </div>

        <p className="text-center text-[10px] text-[var(--sub)]">
          Completing confirms the job and credits your payout per GRIDD policy.
        </p>
      </div>

      {completeOpen && completeSummary ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4">
          <Card className="w-full max-w-md space-y-4 p-6">
            <div className="flex items-center gap-2 text-[#00FF88]">
              <CheckCircle2 className="h-8 w-8" />
              <span className="text-lg font-semibold">Job Complete! 💰</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--sub)]">Payout</span>
                <span>{money(completeSummary.payout)}</span>
              </div>
              <div className="flex justify-between text-[var(--sub)]">
                <span>Tier bonus</span>
                <span>+{money(completeSummary.tierBonus)}</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-2 text-lg font-semibold text-[#00FF88]">
                <span>Total</span>
                <span>{money(completeSummary.total)}</span>
              </div>
            </div>
            <Link href="/jobs" className="block">
              <Button className="min-h-[48px] w-full" type="button">
                Back to Jobs
              </Button>
            </Link>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
