"use client";

import Link from "next/link";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useGriddWalletData } from "@/hooks/useGriddWalletData";
import { GriddWalletBody } from "@/components/wallet/GriddWalletBody";
import { NotificationBell } from "@/components/NotificationBell";
import { CustomerNav } from "@/components/CustomerNav";
import { BackButton } from "@/components/BackButton";

export default function CustomerWalletPage() {
  const { loading: gateLoading, ok } = useRequireAuth(["customer"]);
  const data = useGriddWalletData();

  if (gateLoading || !ok) {
    return <LoadingScreen />;
  }

  return (
    <main className="min-h-full bg-[#060606]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[#060606]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-6 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <BackButton href="/home" inline />
            <Link href="/home" className="truncate text-lg font-semibold tracking-tight text-[#00FF88]">
              GRIDD
            </Link>
          </div>
          <NotificationBell />
        </div>
      </header>

      <GriddWalletBody {...data} walletUnlocked={true} cashOutHref="/profile" />

      <CustomerNav />
    </main>
  );
}
