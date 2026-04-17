"use client";

import Link from "next/link";
import { doc, getDoc, getFirestore } from "firebase/firestore";
import { useEffect, useState } from "react";
import app, { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function DriverRejectedPage() {
  const db = getFirestore(app);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setReason(null);
        setLoading(false);
        return;
      }
      const snap = await getDoc(doc(db, "providers", u.uid));
      const r = (snap.data() as { rejectionReason?: string } | undefined)?.rejectionReason;
      setReason(r ?? "No reason on file.");
      setLoading(false);
    });
    return () => unsub();
  }, [db]);

  return (
    <main
      className="mx-auto flex min-h-full max-w-lg flex-col items-center px-6 pb-20 pt-20 text-center"
      style={{ background: "#060606", color: "#eee" }}
    >
      <div className="text-6xl">❌</div>
      <h1 className="mt-6 text-2xl font-bold text-zinc-100">Application Not Approved</h1>
      <p className="mt-4 text-sm text-zinc-400">
        We were unable to approve your application at this time.
      </p>
      {loading ? (
        <p className="mt-6 text-sm text-zinc-500">Loading…</p>
      ) : (
        <div className="mt-6 w-full max-w-md rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-left text-sm text-red-200">
          <div className="text-xs uppercase tracking-wide text-red-400">Reason</div>
          <p className="mt-2">{reason}</p>
        </div>
      )}

      <div className="mt-10 w-full max-w-sm space-y-3 text-left text-sm text-zinc-400">
        <p className="font-semibold text-zinc-300">What you can do</p>
        <ul className="list-inside list-disc space-y-1">
          <li>Fix the issue noted above</li>
          <li>Update your documents and resubmit</li>
          <li>Reach out to support if you need help</li>
        </ul>
      </div>

      <div className="mt-10 flex w-full max-w-sm flex-col gap-3">
        <Link
          href="/signup/driver-docs"
          className="rounded-xl bg-[#00FF88] px-4 py-3 text-center text-sm font-bold text-black"
        >
          Resubmit documents
        </Link>
        <a
          href="mailto:drivers@gridd.click"
          className="rounded-xl border border-zinc-700 py-3 text-center text-sm text-zinc-300"
        >
          Contact support
        </a>
      </div>
    </main>
  );
}
