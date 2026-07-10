"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import app from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { canGoOnline } from "@/lib/driver-gate";
import type { Provider, ProviderDocuments } from "@/types";
import { useRouter } from "next/navigation";

function Check({ ok }: { ok: boolean }) {
  return <span className={ok ? "text-[#00FF88]" : "text-zinc-600"}>{ok ? "✅" : "○"}</span>;
}

function PendingBody() {
  const router = useRouter();
  const search = useSearchParams();
  const qEmail = search.get("email");
  const { user, loading: authLoading } = useAuth();
  const [prov, setProv] = useState<Provider | null>(null);

  useEffect(() => {
    if (!user) return;
    const db = getFirestore(app);
    const unsub = onSnapshot(
      doc(db, "providers", user.uid),
      (snap) => {
        if (!snap.exists()) {
          setProv(null);
          return;
        }
        setProv({ uid: snap.id, ...(snap.data() as Omit<Provider, "uid">) });
      },
      () => setProv(null),
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (authLoading || !user || !prov) return;
    if (canGoOnline(prov)) {
      router.replace("/driver/jobs");
    }
  }, [authLoading, user, prov, router]);

  const docs = prov?.documents as ProviderDocuments | undefined;

  const checklist = useMemo(
    () => [
      { label: "Driver's License (front + back)", ok: !!(docs?.licenseFront && docs?.licenseBack) },
      { label: "Personal auto insurance", ok: !!docs?.insurance },
      { label: "Commercial auto insurance (or rider/endorsement)", ok: !!docs?.commercialAuto },
      { label: "Vehicle registration", ok: !!docs?.registration },
      { label: "Live selfie", ok: !!docs?.selfie },
      { label: "Background check consent", ok: !!docs?.backgroundConsent },
    ],
    [docs],
  );

  if (authLoading || !user) {
    return (
      <main className="min-h-full bg-[#060606] px-6 py-20 text-center text-zinc-500">
        Loading…
      </main>
    );
  }

  if (!prov || prov.documentsSubmitted !== true) {
    return (
      <main
        className="mx-auto flex min-h-full max-w-lg flex-col px-6 pb-20 pt-16 text-center"
        style={{ background: "#060606", color: "#eee" }}
      >
        <p className="text-sm text-zinc-400">Complete your document upload to continue.</p>
        <Link href="/signup/driver-docs" className="mt-6 text-[#00FF88] underline">
          Go to documents
        </Link>
      </main>
    );
  }

  const st = prov.accountStatus;
  const rejected = st === "rejected";
  const more = st === "more_info_needed";

  if (rejected) {
    return (
      <main
        className="mx-auto flex min-h-full max-w-lg flex-col px-6 pb-20 pt-16 text-center"
        style={{ background: "#060606", color: "#eee" }}
      >
        <div className="text-5xl">❌</div>
        <h1 className="mt-6 text-2xl font-bold text-zinc-100">Application not approved</h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          {prov.rejectionReason ?? "Your application was not approved."}
        </p>
        <p className="mt-6 text-sm text-zinc-500">
          Please contact{" "}
          <a href="mailto:support@gridd.click" className="text-[#00FF88]">
            support@gridd.click
          </a>{" "}
          to resolve this.
        </p>
        <Link href="/?modal=login" className="mt-8 text-sm text-zinc-500 hover:text-[#00FF88]">
          Back to sign in
        </Link>
      </main>
    );
  }

  return (
    <main
      className="mx-auto flex min-h-full max-w-lg flex-col px-6 pb-24 pt-16 text-center"
      style={{ background: "#060606", color: "#eee" }}
    >
      <div className="text-6xl">⏳</div>
      <h1 className="mt-6 text-2xl font-bold text-zinc-100">
        {more ? "More information needed" : "Documents submitted"}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-zinc-400">
        {more
          ? prov.requestNote ?? "Please upload additional documents requested by our team."
          : "Your account is being reviewed by the GRIDD team. This usually takes 1–3 business days."}
      </p>
      {more ? (
        <Link
          href="/signup/driver-docs"
          className="mt-6 inline-block rounded-xl bg-[#00FF88] px-6 py-3 text-sm font-bold text-black"
        >
          Re-upload documents
        </Link>
      ) : null}

      <div className="mt-10 w-full max-w-sm space-y-2 text-left text-sm text-zinc-300">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Submitted checklist</p>
        {checklist.map((c) => (
          <div key={c.label} className="flex items-center gap-2">
            <Check ok={c.ok} />
            <span>{c.label}</span>
          </div>
        ))}
      </div>

      <p className="mt-10 text-xs text-zinc-500">
        {qEmail ? (
          <>
            We&apos;ll email updates at <span className="text-zinc-300">{qEmail}</span>.
            <br />
          </>
        ) : null}
        Questions?{" "}
        <a href="mailto:support@gridd.click" className="text-[#00FF88]">
          support@gridd.click
        </a>
      </p>
      <Link href="/?modal=login" className="mt-6 text-sm text-zinc-500 hover:text-[#00FF88]">
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
