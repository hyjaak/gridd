"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { money } from "@/lib/job-tracking";
import {
  demoExhausted,
  demoJobLimit,
  demoJobsUsedCount,
  getDriverAccess,
  isFullyApprovedDriver,
} from "@/lib/driver-gate";
import type { Provider } from "@/types";

/**
 * Demo trial: orange banner on driver surfaces + fullscreen prompt when trial jobs are exhausted.
 */
export function DriverDemoChrome() {
  const router = useRouter();
  const { user, role } = useAuth();
  const [p, setP] = useState<Provider | null>(null);

  useEffect(() => {
    if (!firebaseApp || !user?.uid || role !== "driver") {
      setP(null);
      return;
    }
    const db = getFirestore(firebaseApp);
    const unsub = onSnapshot(
      doc(db, "providers", user.uid),
      (snap) => {
        if (!snap.exists()) {
          setP(null);
          return;
        }
        setP({ uid: snap.id, ...(snap.data() as Omit<Provider, "uid">) });
      },
      () => setP(null),
    );
    return () => unsub();
  }, [user?.uid, role]);

  if (!p) return null;

  if (isFullyApprovedDriver(p)) return null;

  const exhausted = p.demoMode === true && demoExhausted(p);
  const limit = demoJobLimit(p);
  const used = demoJobsUsedCount(p);
  const jobsLeft = Math.max(0, limit - used);
  const earnings = money(p.lifetimeEarningsCents ?? 0);

  if (exhausted) {
    return (
      <div
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black px-6 text-center"
        role="alertdialog"
        aria-modal="true"
      >
        <p className="text-4xl" aria-hidden>
          🎮
        </p>
        <h2 className="mt-4 text-2xl font-bold text-white">Demo complete!</h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-300">
          You completed {limit} trial jobs.
        </p>
        <p className="mt-3 max-w-md text-base font-semibold text-[#ffb870]">
          Your earned {earnings} is waiting.
        </p>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-400">
          Submit documents to unlock payouts and full access to GRIDD.
        </p>
        <Link
          href="/signup/driver-docs"
          className="mt-8 flex min-h-[52px] w-full max-w-sm items-center justify-center rounded-[22px] px-6 text-base font-bold text-black"
          style={{
            fontFamily: "var(--font-syne), ui-sans-serif, system-ui, sans-serif",
            background: "linear-gradient(180deg, #ff6b00 0%, #ff9500 100%)",
            boxShadow: "0 8px 24px rgba(255, 107, 0, 0.35)",
          }}
        >
          Submit documents now 🚀
        </Link>
        <p className="mt-6 max-w-sm text-[11px] text-zinc-600">
          Contact{" "}
          <a href="mailto:support@gridd.click" className="text-[#00FF88] underline underline-offset-2">
            support@gridd.click
          </a>{" "}
          if you need help.
        </p>
      </div>
    );
  }

  if (getDriverAccess(p) !== "demo") return null;

  return (
    <>
      <div className="h-[52px] w-full shrink-0" aria-hidden />
      <div
        className="fixed left-0 right-0 top-0 z-[70] flex items-center justify-between gap-3 px-5 py-2.5 shadow-lg"
        style={{
          background: "linear-gradient(135deg, #ff6b00, #ff9500)",
        }}
      >
        <span className="text-[12px] font-bold text-white">
          🎮 Demo Mode — {jobsLeft} trial job{jobsLeft === 1 ? "" : "s"} left
        </span>
        <button
          type="button"
          onClick={() => router.push("/driver/documents")}
          className="shrink-0 cursor-pointer rounded-[20px] border-0 bg-white px-3 py-1 text-[11px] font-extrabold text-[#ff6b00]"
        >
          Go Live →
        </button>
      </div>
    </>
  );
}
