"use client";

import { BackButton } from "@/components/BackButton";
import { CustomerNav } from "@/components/CustomerNav";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function CustomerHistoryPage() {
  const { loading: gateLoading, ok } = useRequireAuth(["customer"]);

  if (gateLoading || !ok) {
    return <LoadingScreen />;
  }

  return (
    <>
      <BackButton href="/home" />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-6 pb-36 pt-16 sm:pt-10">
        <h1 className="text-2xl font-semibold tracking-tight">Customer · History</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Past jobs and receipts — full history coming soon.
        </p>
      </main>
      <CustomerNav />
    </>
  );
}
