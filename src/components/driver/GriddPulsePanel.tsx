"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getFirestore, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";

type Heat = "low" | "medium" | "high";

type DemandRow = {
  id: string;
  signalCount?: number;
  heatLevel?: Heat;
};

function heartsForHeat(h: Heat | undefined): string {
  if (h === "high") return "🫀🫀🫀🫀";
  if (h === "medium") return "🫀🫀";
  return "🫀";
}

function labelForHeat(h: Heat | undefined): string {
  if (h === "high") return "HIGH";
  if (h === "medium") return "MEDIUM";
  return "LOW";
}

function dotForHeat(h: Heat | undefined): string {
  if (h === "high") return "🔴";
  if (h === "medium") return "🟡";
  return "🟢";
}

function pulseDurationSec(h: Heat | undefined, visible: boolean): number {
  if (!visible) return 0;
  if (h === "high") return 0.25;
  if (h === "medium") return 0.5;
  return 1;
}

function openMapsToZip(zip: string) {
  const q = encodeURIComponent(`${zip} USA`);
  window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank", "noopener,noreferrer");
}

export function GriddPulsePanel({ driverZip }: { driverZip?: string }) {
  const [rows, setRows] = useState<DemandRow[]>([]);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    onVis();
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!firebaseApp) return;
    const db = getFirestore(firebaseApp);
    const q = query(collection(db, "demandSignals"), orderBy("signalCount", "desc"), limit(48));
    return onSnapshot(
      q,
      (snap) => {
        setRows(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<DemandRow, "id">),
          })),
        );
      },
      () => setRows([]),
    );
  }, []);

  const prefix = useMemo(() => {
    const z = driverZip?.replace(/\D/g, "").slice(0, 5);
    return z && z.length >= 3 ? z.slice(0, 3) : null;
  }, [driverZip]);

  const shown = useMemo(() => {
    if (!prefix) return rows.slice(0, 12);
    const near = rows.filter((r) => r.id.startsWith(prefix));
    if (near.length >= 3) return near.slice(0, 12);
    const rest = rows.filter((r) => !near.some((n) => n.id === r.id));
    return [...near, ...rest].slice(0, 12);
  }, [rows, prefix]);

  if (shown.length === 0) {
    return (
      <section className="rounded-2xl border border-[#ff6b00]/20 bg-[#0a0a0a] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <PulseOrb heat="low" running={visible} />
          <span>🫀 GRIDD Pulse — Live Demand</span>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Demand hotspots appear as customers open booking near a ZIP. Stay on the GRIDD to catch the wave.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#ff6b00]/25 bg-[#0a0a0a] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <PulseOrb heat={shown[0]?.heatLevel ?? "medium"} running={visible} />
        <span>🫀 GRIDD Pulse — Live Demand</span>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        Nearby ZIPs from customer booking activity. Heat cools when signals go quiet.
      </p>
      <ul className="mt-3 space-y-2">
        {shown.map((r) => {
          const h = r.heatLevel ?? "low";
          const dur = pulseDurationSec(h, visible);
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0">{dotForHeat(h)}</span>
                <span className="font-mono text-white">{r.id}</span>
                <span
                  className="min-w-0 truncate text-[#ff6b00]"
                  style={
                    dur > 0
                      ? {
                          animation: `gridd-pulse-heart ${dur}s linear infinite`,
                        }
                      : undefined
                  }
                >
                  {heartsForHeat(h)}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  {labelForHeat(h)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => openMapsToZip(r.id)}
                className="shrink-0 rounded-lg border border-[#ff6b00]/40 bg-[#ff6b00]/10 px-2 py-1 text-[11px] font-medium text-[#ff6b00] active:bg-[#ff6b00]/20"
              >
                Drive to hot zone
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PulseOrb({ heat, running }: { heat: Heat; running: boolean }) {
  const dur = pulseDurationSec(heat, running);
  return (
    <span
      className="relative flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-[#ff6b00]/90"
      style={
        dur > 0
          ? {
              animation: `gridd-pulse-heart ${dur}s linear infinite`,
            }
          : { opacity: 0.85 }
      }
    />
  );
}
