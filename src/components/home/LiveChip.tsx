"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getCountFromServer, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { MarketKey } from "@/lib/constants";

type Props = {
  market: MarketKey;
  className?: string;
};

export default function LiveChip({ market, className = "" }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const [city, setCity] = useState("Dayton");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    async function fetchCount() {
      try {
        const weekAgo = Timestamp.fromMillis(Date.now() - 7 * 86400000);
        const q = query(
          collection(db, "dispatchJobs"),
          where("status", "==", "paid"),
          where("createdAt", ">=", weekAgo)
        );
        const snap = await getCountFromServer(q);
        if (!cancelled) setCount(snap.data().count);
      } catch {
        if (!cancelled) setCount(null);
      }
    }
    fetchCount();
    import("@/lib/constants").then(({ MARKETS }) => {
      if (!cancelled) setCity(MARKETS[market].city);
    });
    return () => {
      cancelled = true;
    };
  }, [market, mounted]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed left-5 bottom-5 z-25 flex items-center gap-2 bg-white/85 backdrop-blur-md border border-black/10 rounded-full px-4 py-2.5 text-[12.5px] font-bold text-[#101613] shadow-lg ${
        count === null ? "hidden" : ""
      } ${className}`}
    >
      <span className="w-2 h-2 rounded-full bg-[#0e9f6e] animate-pulse shadow-[0_0_0_0_rgba(14,159,110,.5)]" />
      <span>LIVE · Run #{count ?? "?"} this week in {city}</span>
    </div>
  );
}