"use client";

import type { MarketKey } from "@/lib/constants";
import { MARKETS } from "@/lib/constants";

type Props = {
  market: MarketKey;
};

export default function UtilityBar({ market }: Props) {
  const m = MARKETS[market];
  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-[#101613] text-white/80 text-[11px] font-semibold tracking-wide px-[5vw] py-1.5 flex items-center justify-center gap-1.5 sm:gap-3 flex-wrap">
      <span>{m.city}, {m.state}</span>
      <span className="hidden sm:inline" aria-hidden="true">·</span>
      <span>Mon–Sat 8am–7pm</span>
      <span className="hidden sm:inline" aria-hidden="true">·</span>
      <span>Same-day — call before 2pm</span>
    </div>
  );
}