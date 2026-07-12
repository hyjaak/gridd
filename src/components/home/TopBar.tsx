"use client";

import { PHONE, PHONE_HREF, MARKETS } from "@/lib/constants";
import type { MarketKey } from "@/lib/constants";

type Props = {
  market: MarketKey;
  onMarketChange: (m: MarketKey) => void;
};

export default function TopBar({ market, onMarketChange }: Props) {
  return (
    <header className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-[5vw] py-4">
      <div className="text-[22px] font-[800] text-[#0e9f6e] font-bricolage">
        gridd
      </div>
      <div className="flex gap-1 bg-white/80 backdrop-blur-md border border-black/10 rounded-full p-1 shadow-lg">
        {(Object.keys(MARKETS) as MarketKey[]).map((key) => (
          <button
            key={key}
            onClick={() => onMarketChange(key)}
            className={`font-bold text-[13px] px-4 py-2 rounded-full transition-colors ${
              market === key
                ? "bg-[#0e9f6e] text-white"
                : "text-[#5c6a62] hover:text-[#101613]"
            }`}
          >
            {MARKETS[key].label}
          </button>
        ))}
      </div>
      <a
        href={PHONE_HREF}
        className="bg-[#101613] text-white font-bold text-[14px] px-5 py-2.5 rounded-full shadow-lg hover:bg-black transition-colors no-underline"
      >
        {PHONE}
      </a>
    </header>
  );
}