"use client";

import React, { useEffect, useRef, useState } from "react";

interface HeaderStatsProps {
  waitingCount: number;
  todayRevenue: number;
  avgQuoteTime: number | null;
}

export function HeaderStats({ waitingCount, todayRevenue, avgQuoteTime }: HeaderStatsProps) {
  const [displayRevenue, setDisplayRevenue] = useState(0);
  const revenueRef = useRef(0);

  useEffect(() => {
    if (todayRevenue !== revenueRef.current) {
      const from = revenueRef.current;
      const to = todayRevenue;
      const duration = 600;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        setDisplayRevenue(Math.round(from + (to - from) * easeOut));

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          revenueRef.current = to;
        }
      };

      requestAnimationFrame(animate);
    }
  }, [todayRevenue]);

  const formatAvgTime = (ms: number | null): string => {
    if (ms === null) return "—";
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.round(seconds / 60)}m`;
  };

  return (
    <div className="flex items-center gap-3.5 flex-wrap">
      <div className="text-right">
        <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[21px] leading-none text-[#0e9f6e]">
          ${displayRevenue}
        </div>
        <div className="text-[10px] font-extrabold tracking-widest uppercase text-[#5c6a62]">
          Today
        </div>
      </div>
      <div className="text-right">
        <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[21px] leading-none text-[#0e9f6e]">
          {formatAvgTime(avgQuoteTime)}
        </div>
        <div className="text-[10px] font-extrabold tracking-widest uppercase text-[#5c6a62]">
          Avg quote
        </div>
      </div>
    </div>
  );
}
