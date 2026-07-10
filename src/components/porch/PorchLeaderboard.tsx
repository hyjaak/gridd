"use client";

import { useEffect, useState } from "react";

type NeighborRow = { uid: string; name: string; griddScore: number; griddTier: string };
type DriverRow = {
  uid: string;
  name: string;
  rating: number;
  jobs: number;
  griddScore: number;
  griddTier: string;
};
type GriddPost = { id: string; title: string; authorName: string; gridditCount: number };

type Tab = "neighbors" | "drivers" | "griddit" | "week";

export function PorchLeaderboard() {
  const [tab, setTab] = useState<Tab>("neighbors");
  const [neighbors, setNeighbors] = useState<NeighborRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [griddit, setGriddit] = useState<GriddPost[]>([]);
  const [featured, setFeatured] = useState<{ uid: string; label: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/community/leaderboard");
        const j = (await res.json()) as {
          ok?: boolean;
          neighbors?: NeighborRow[];
          drivers?: DriverRow[];
          gridditThisWeek?: GriddPost[];
          featured?: { uid: string; label: string } | null;
        };
        if (cancelled || !j.ok) {
          if (!cancelled) setErr("Could not load leaderboard");
          return;
        }
        setNeighbors(j.neighbors ?? []);
        setDrivers(j.drivers ?? []);
        setGriddit(j.gridditThisWeek ?? []);
        setFeatured(j.featured ?? null);
        setErr(null);
      } catch {
        if (!cancelled) setErr("Leaderboard unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "neighbors", label: "Top Neighbors" },
    { id: "drivers", label: "Top Drivers" },
    { id: "griddit", label: "Most GRIDD IT" },
    { id: "week", label: "This Week" },
  ];

  function medal(i: number) {
    if (i === 0) return "🥇";
    if (i === 1) return "🥈";
    if (i === 2) return "🥉";
    return `${i + 1}.`;
  }

  return (
    <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[#0a0a0a] p-4">
      <h2 className="mb-3 text-sm font-semibold text-[#D4A574]">Leaderboard 🏆</h2>
      {featured ? (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          ⭐ Featured: <span className="font-semibold">{featured.label}</span>
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              "rounded-full border px-2.5 py-1 text-[10px]",
              tab === t.id ? "border-[#D4A574] text-[#D4A574]" : "border-[var(--border)] text-[var(--sub)]",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {err ? <p className="text-xs text-red-400">{err}</p> : null}
      {!err && tab === "neighbors" ? (
        <ul className="space-y-2">
          {neighbors.slice(0, 10).map((n, i) => (
            <li key={n.uid} className="flex items-center justify-between gap-2 text-xs text-zinc-200">
              <span className="min-w-0 truncate">
                {medal(i)} {n.name}
              </span>
              <span className="shrink-0 text-[10px] text-zinc-500">
                {Math.round(n.griddScore)} pts {n.griddTier ? `· ${n.griddTier}` : ""}
              </span>
            </li>
          ))}
          {neighbors.length === 0 ? <p className="text-xs text-zinc-500">No scores yet.</p> : null}
        </ul>
      ) : null}
      {!err && tab === "drivers" ? (
        <ul className="space-y-2">
          {drivers.slice(0, 10).map((d, i) => (
            <li key={d.uid} className="flex items-center justify-between gap-2 text-xs text-zinc-200">
              <span className="min-w-0 truncate">
                {medal(i)} {d.name}
              </span>
              <span className="shrink-0 text-[10px] text-emerald-300/90">
                {d.rating.toFixed(1)}⭐ · {d.jobs} jobs
              </span>
            </li>
          ))}
          {drivers.length === 0 ? <p className="text-xs text-zinc-500">No driver stats yet.</p> : null}
        </ul>
      ) : null}
      {!err && tab === "griddit" ? (
        <ul className="space-y-2">
          {griddit.slice(0, 10).map((g, i) => (
            <li key={g.id} className="flex items-start justify-between gap-2 text-xs text-zinc-200">
              <span className="min-w-0">
                {medal(i)} {g.title}
                <span className="block text-[10px] text-zinc-500">by {g.authorName}</span>
              </span>
              <span className="shrink-0 text-amber-300">‼️ {g.gridditCount}</span>
            </li>
          ))}
          {griddit.length === 0 ? <p className="text-xs text-zinc-500">No ‼️ counts yet.</p> : null}
        </ul>
      ) : null}
      {!err && tab === "week" ? (
        <div className="space-y-2 text-xs text-zinc-400">
          <p className="text-[11px] leading-relaxed">Most ‼️&apos;d Porch posts in the last 7 days.</p>
          <ul className="space-y-1.5">
            {griddit.slice(0, 8).map((g, i) => (
              <li key={g.id} className="flex justify-between gap-2">
                <span className="min-w-0 truncate text-zinc-200">
                  {medal(i)} {g.title}
                </span>
                <span className="shrink-0 text-amber-300">‼️ {g.gridditCount}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
