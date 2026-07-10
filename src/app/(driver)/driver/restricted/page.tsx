"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { LoadingScreen } from "@/components/LoadingScreen";
import { LogoutButton } from "@/components/LogoutButton";
import type { Provider } from "@/types";

const SUPPORT = "support@gridd.click";

function DriverRestrictedPage() {
  const { loading, ok, user } = useRequireAuth(["driver"]);
  const searchParams = useSearchParams();
  const state = searchParams.get("state") ?? "hold";
  const [provider, setProvider] = useState<Provider | null>(null);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) return;
    const db = getFirestore(firebaseApp);
    return onSnapshot(doc(db, "providers", user.uid), (snap) => {
      if (!snap.exists()) {
        setProvider(null);
        return;
      }
      setProvider({ uid: snap.id, ...(snap.data() as Omit<Provider, "uid">) });
    });
  }, [user?.uid]);

  const body = useMemo(() => {
    if (state === "banned") {
      return {
        title: "Account removed",
        desc: "This driver account has been permanently restricted. If you believe this is a mistake, contact support.",
      };
    }
    if (state === "suspended") {
      return {
        title: "Account suspended",
        desc: `Your account is temporarily suspended.${provider?.suspensionReason ? ` Reason: ${provider.suspensionReason}` : ""}`,
      };
    }
    return {
      title: "Account on hold",
      desc: `Your account is temporarily on hold. Contact ${SUPPORT} for assistance.${provider?.holdReason ? ` Note: ${provider.holdReason}` : ""}`,
    };
  }, [state, provider?.holdReason, provider?.suspensionReason]);

  if (loading || !ok) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4 py-12 text-center">
      <div className="max-w-md rounded-2xl border border-[#2a2a2a] bg-[#111] p-8">
        <div className="text-4xl" aria-hidden>
          {state === "banned" ? "⛔" : state === "suspended" ? "🔴" : "⏸️"}
        </div>
        <h1 className="mt-4 text-xl font-bold text-white">{body.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">{body.desc}</p>
        <p className="mt-6 text-sm text-[#3dff7a]">
          <a href={`mailto:${SUPPORT}`} className="underline">
            {SUPPORT}
          </a>
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <LogoutButton className="rounded-xl border border-zinc-700 bg-zinc-900 py-3 text-sm font-semibold text-zinc-200" />
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function DriverRestrictedPageWrapper() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DriverRestrictedPage />
    </Suspense>
  );
}
