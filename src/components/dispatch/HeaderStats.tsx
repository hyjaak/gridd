"use client";

import React, { useEffect, useRef, useState } from "react";

interface HeaderStatsProps {
  todayRevenue: number;
  runsCount: number;
  avgQuoteTime: number | null;
  openCount: number;
}

function useCountUp(value: number): number {
  const [display, setDisplay] = useState(value);
  const ref = useRef(value);

  useEffect(() => {
    if (value !== ref.current) {
      const from = ref.current;
      const to = value;
      const duration = 600;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        setDisplay(Math.round(from + (to - from) * easeOut));

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          ref.current = to;
        }
      };

      requestAnimationFrame(animate);
    }
  }, [value]);

  return display;
}

function formatAvgTime(ms: number | null): string {
  if (ms === null) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

export function HeaderStats({ todayRevenue, runsCount, avgQuoteTime, openCount }: HeaderStatsProps) {
  const rev = useCountUp(todayRevenue);
  const runs = useCountUp(runsCount);
  const open = useCountUp(openCount);

  return (
    <div className="flex items-center gap-3.5 flex-wrap">
      <div className="text-right">
        <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[21px] leading-none text-[#0e9f6e]">
          ${rev}
        </div>
        <div className="text-[10px] font-extrabold tracking-widest uppercase text-[#5c6a62]">
          Today
        </div>
      </div>
      <div className="text-right">
        <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[21px] leading-none text-[#0e9f6e]">
          {runs}
        </div>
        <div className="text-[10px] font-extrabold tracking-widest uppercase text-[#5c6a62]">
          Runs
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
      <div className="text-right">
        <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[21px] leading-none text-[#0e9f6e]">
          {open}
        </div>
        <div className="text-[10px] font-extrabold tracking-widest uppercase text-[#5c6a62]">
          Open
        </div>
      </div>
    </div>
  );
}