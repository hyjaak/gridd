"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { completeGoogleSignUpAs, logOut } from "@/lib/auth";

/**
 * Full-screen first-time Google account type (replaces in-modal role pick).
 */
export default function GoogleRoleChoicePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"pick" | "error">("pick");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Auth presence check only — no Firestore reads. The role picker is shown
  // instantly because users only land here when `googleSignIn()` already
  // determined the account is new (via `GoogleNeedsRoleChoiceError`).
  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) router.replace("/?modal=login");
    });
    return () => unsub();
  }, [router]);

  const choose = useCallback(async (role: "customer" | "driver") => {
    console.log("[google-role] role selected:", role);
    setBusy(true);
    setMessage(null);
    try {
      await completeGoogleSignUpAs(role);
    } catch (e) {
      console.error("[google-role] completeGoogleSignUpAs:", e);
      setBusy(false);
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    }
  }, []);

  if (phase === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#060606] px-6 text-center">
        <p className="text-sm text-red-400">{message}</p>
        <Link href="/" className="text-sm text-[#00FF88] underline">
          Back to GRIDD
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#060606] px-4 py-10 text-[#eee] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div
          className="mb-10 text-center text-4xl font-black tracking-tighter text-[#00FF88]"
          style={{ animation: "gridd-pulse-logo 2s ease-in-out infinite" }}
        >
          GRIDD
        </div>
        <h1 className="text-center text-2xl font-bold text-white sm:text-3xl">Welcome to GRIDD! 👋</h1>
        <p className="mx-auto mt-3 max-w-lg text-center text-base text-zinc-400">
          How do you want to use GRIDD?
        </p>

        <SignupProgress step={busy ? 3 : 2} />

        {message ? <p className="mt-6 text-center text-sm text-red-400">{message}</p> : null}

        <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          <button
            type="button"
            disabled={busy}
            onClick={() => void choose("customer")}
            className="flex flex-col items-center rounded-2xl border border-[#1e1e1e] bg-[#111] p-8 text-center transition hover:border-[#00FF88]/50 hover:bg-[#151515] disabled:opacity-50"
          >
            <span className="text-5xl" aria-hidden>
              🛍️
            </span>
            <span className="mt-4 text-xl font-bold text-white">Customer</span>
            <span className="mt-2 text-sm leading-relaxed text-zinc-500">Book rides, food, home services</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void choose("driver")}
            className="flex flex-col items-center rounded-2xl border border-[#ff6b00] bg-[#111] p-8 text-center transition hover:bg-[#1a1008] disabled:opacity-50"
          >
            <span className="text-5xl" aria-hidden>
              🚛
            </span>
            <span className="mt-4 text-xl font-bold text-white">Provider</span>
            <span className="mt-2 text-sm leading-relaxed text-zinc-500">Earn money on your schedule</span>
          </button>
        </div>

        <p className="mt-8 text-center text-xs text-zinc-600">
          {busy ? "Setting up your account…" : "You can only choose once for a new Google account on GRIDD."}
        </p>

        <div className="mt-8 flex justify-center">
          <button
            type="button"
            disabled={busy}
            className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline"
            onClick={() => void logOut()}
          >
            Use a different Google account
          </button>
        </div>
      </div>
    </main>
  );
}

/** 3-step signup progress indicator: Sign in — Choose role — Setup. */
function SignupProgress({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["Sign in", "Choose role", "Setup"];
  return (
    <div className="mx-auto mt-6 flex max-w-sm items-center justify-between gap-2">
      {labels.map((label, i) => {
        const idx = (i + 1) as 1 | 2 | 3;
        const done = idx < step;
        const active = idx === step;
        return (
          <div key={label} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={
                "h-2.5 w-full rounded-full transition-colors " +
                (done ? "bg-[#00FF88]" : active ? "bg-[#00FF88]/60" : "bg-zinc-800")
              }
            />
            <span
              className={
                "text-[10px] uppercase tracking-wider " +
                (done || active ? "text-zinc-300" : "text-zinc-600")
              }
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
