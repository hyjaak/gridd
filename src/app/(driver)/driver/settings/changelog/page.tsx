"use client";

import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { BackButton } from "@/components/BackButton";
import { DriverNav } from "@/components/DriverNav";

const BG = "#0a0a0a";

const ITEMS = [
  { title: "Driver settings hub", body: "Wallet, payouts, schedule, and notifications in one place." },
  { title: "Demo mode polish", body: "Trial drivers get a clear banner and wallet unlock path." },
];

export default function WhatsNewPage() {
  const { loading: gate, ok } = useRequireAuth(["driver"]);
  if (gate || !ok) return <LoadingScreen />;

  return (
    <main className="min-h-screen pb-36" style={{ background: BG }}>
      <header className="sticky top-0 z-20 border-b border-[#1a1a1a] px-5 py-4" style={{ background: BG }}>
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <BackButton href="/driver/settings" inline />
          <h1 className="text-lg font-semibold text-white">What&apos;s new</h1>
        </div>
      </header>
      <div className="mx-auto max-w-lg space-y-4 px-5 pt-6">
        {ITEMS.map((item) => (
          <div key={item.title} className="rounded-xl border border-[#1a1a1a] bg-[#111] px-4 py-3">
            <p className="text-sm font-semibold text-white">{item.title}</p>
            <p className="mt-1 text-sm text-zinc-400">{item.body}</p>
          </div>
        ))}
      </div>
      <DriverNav />
    </main>
  );
}
