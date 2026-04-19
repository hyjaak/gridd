"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuth } from "@/hooks/useAuth";
import { useGriddWalletData } from "@/hooks/useGriddWalletData";
import { GriddWalletBody } from "@/components/wallet/GriddWalletBody";
import { canGoOnline } from "@/lib/driver-gate";
import type { Provider } from "@/types";
import { DriverNav } from "@/components/DriverNav";
import { BackButton } from "@/components/BackButton";
import { LogoutButton } from "@/components/LogoutButton";

export default function DriverWalletPage() {
  const { loading: gateLoading, ok } = useRequireAuth(["driver"]);
  const { user, profile } = useAuth();
  const data = useGriddWalletData();
  const [provider, setProvider] = useState<Provider | null>(null);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) return;
    const db = getFirestore(firebaseApp);
    const unsub = onSnapshot(doc(db, "providers", user.uid), (snap) => {
      if (!snap.exists()) {
        setProvider(null);
        return;
      }
      setProvider({ uid: snap.id, ...(snap.data() as Omit<Provider, "uid">) });
    });
    return () => unsub();
  }, [user?.uid]);

  const walletUnlocked = canGoOnline(provider);

  if (gateLoading || !ok) {
    return <LoadingScreen />;
  }

  const driverName = profile?.name ?? user?.email?.split("@")[0] ?? "Driver";

  return (
    <main className="min-h-full bg-[#060606] pb-36">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#060606]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <BackButton href="/driver/jobs" inline />
            <div>
              <Link href="/driver/jobs" className="text-lg font-semibold text-[#00FF88]">
                GRIDD Driver
              </Link>
              <div className="text-xs text-[var(--sub)]">{driverName}</div>
            </div>
          </div>
          <LogoutButton />
        </div>
      </header>

      <GriddWalletBody {...data} walletUnlocked={walletUnlocked} cashOutHref="/driver/earnings" />

      <DriverNav />
    </main>
  );
}
