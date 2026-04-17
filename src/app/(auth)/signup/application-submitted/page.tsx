"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SubmittedBody() {
  const search = useSearchParams();
  const email = search.get("email") ?? "your email";

  return (
    <main
      className="mx-auto flex min-h-full max-w-lg flex-col items-center px-6 pb-20 pt-16 text-center"
      style={{ background: "#060606", color: "#eee" }}
    >
      <div className="text-7xl" aria-hidden>
        ✅
      </div>
      <h1 className="mt-6 text-2xl font-bold" style={{ color: "#00FF88" }}>
        Application Submitted!
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-zinc-400">
        Your documents are under review. We&apos;ll email you at <span className="text-zinc-200">{email}</span> within
        24–48 hours with your approval status.
      </p>
      <p className="mt-2 text-xs text-zinc-600">
        You&apos;ll receive messages from <span className="text-[#00FF88]">noreply@gridd.click</span>
      </p>
      <p className="mt-6 text-sm text-zinc-500">
        We also sent a <strong className="text-zinc-300">verification link</strong> to your email — please verify to
        secure your account.
      </p>

      <div className="mt-10 flex w-full max-w-sm flex-col gap-3">
        <Link
          href="/porch"
          className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] px-4 py-3 text-sm font-semibold text-zinc-200 hover:border-[#00FF88]"
        >
          Browse The Porch 🪑
        </Link>
        <Link
          href="/"
          className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] px-4 py-3 text-sm font-semibold text-zinc-200 hover:border-[#00FF88]"
        >
          Learn how GRIDD works
        </Link>
        <Link href="/verify-email" className="text-sm font-medium text-[#00FF88] hover:underline">
          Verify your email
        </Link>
      </div>

      <p className="mt-12 text-xs text-zinc-600">
        Questions?{" "}
        <a href="mailto:drivers@gridd.click" className="text-[#00FF88]">
          drivers@gridd.click
        </a>
      </p>
    </main>
  );
}

export default function ApplicationSubmittedPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#060606] px-6 py-24 text-center text-zinc-500">Loading…</main>
      }
    >
      <SubmittedBody />
    </Suspense>
  );
}
