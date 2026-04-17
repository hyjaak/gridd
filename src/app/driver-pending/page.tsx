"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

function PendingBody() {
  const search = useSearchParams();
  const qEmail = search.get("email");
  const [email, setEmail] = useState(qEmail ?? "");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u?.email) setEmail(u.email);
    });
    return () => unsub();
  }, []);

  return (
    <main
      className="mx-auto flex min-h-full max-w-lg flex-col items-center px-6 pb-20 pt-20 text-center"
      style={{ background: "#060606", color: "#eee" }}
    >
      <div className="text-6xl">⏳</div>
      <h1 className="mt-6 text-2xl font-bold text-zinc-100">Application Under Review</h1>
      <p className="mt-4 text-sm leading-relaxed text-zinc-400">
        Your documents are being reviewed by our team. You&apos;ll receive an email at{" "}
        <span className="text-zinc-200">{email || "your inbox"}</span> within 24–48 hours.
      </p>

      <ol className="mt-10 w-full max-w-sm space-y-3 text-left text-sm text-zinc-400">
        <li className="flex gap-2">
          <span className="text-[#00FF88]">1.</span>
          <span>✅ Application submitted</span>
        </li>
        <li className="flex gap-2">
          <span className="text-[#00FF88]">2.</span>
          <span>⏳ Under review (current)</span>
        </li>
        <li className="flex gap-2">
          <span className="text-zinc-600">3.</span>
          <span>○ Approved &amp; activated</span>
        </li>
      </ol>

      <p className="mt-10 text-xs text-zinc-600">
        Questions?{" "}
        <a href="mailto:drivers@gridd.click" className="text-[#00FF88]">
          drivers@gridd.click
        </a>
      </p>
      <Link href="/login" className="mt-6 text-sm text-zinc-500 hover:text-[#00FF88]">
        Back to sign in
      </Link>
    </main>
  );
}

export default function DriverPendingPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#060606]" />}>
      <PendingBody />
    </Suspense>
  );
}
