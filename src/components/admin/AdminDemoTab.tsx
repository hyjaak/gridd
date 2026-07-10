"use client";

import type { Provider } from "@/types";

type Props = {
  providers: Provider[];
  onOpenProvider: (uid: string) => void;
};

/** Drivers currently in CEO-granted demo trial — quick access from Command Center. */
export function AdminDemoTab({ providers, onOpenProvider }: Props) {
  const demo = providers.filter((p) => p.demoMode === true);

  if (demo.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-8 text-center text-sm text-zinc-500">
        No drivers are in demo mode right now. Enable demo from <strong className="text-zinc-300">Approvals</strong> or a
        driver card.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        🎮 <span className="font-semibold text-zinc-300">Demo mode</span> — trial jobs before full CEO approval. Uses
        count vs limit from each driver profile.
      </p>
      <ul className="space-y-2">
        {demo.map((p) => (
          <li
            key={p.uid}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3"
          >
            <div>
              <div className="font-medium text-zinc-200">{p.name ?? p.uid}</div>
              <div className="font-mono text-xs text-zinc-500">
                {p.demoJobsUsed ?? 0} / {p.demoJobsLimit ?? 3} demo jobs · {p.driverTier ?? "starter"}
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg border border-[#3dff7a]/40 px-3 py-1.5 text-xs font-semibold text-[#3dff7a] hover:bg-[#3dff7a]/10"
              onClick={() => onOpenProvider(p.uid)}
            >
              View in Providers
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
