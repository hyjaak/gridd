"use client";

import { useState } from "react";
import { suggestForStops } from "@/lib/dispatch-suggest";
import { suggestPrice, loadDispatchRates, type DispatchServiceId } from "@/lib/dispatch-pricing";
import type { StopAddress } from "@/types/dispatch";

export default function SuggestLine({ pickup, dropoff, jobType, market, onSuggestion }: {
  pickup?: StopAddress;
  dropoff?: StopAddress;
  jobType: string;
  market?: string;
  onSuggestion: (price: number, miles: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ price: number; miles: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [miles, setMiles] = useState("");
  const [pricing, setPricing] = useState(false);
  const p = pickup?.street || pickup?.city || "";
  const d = dropoff?.street || dropoff?.city || "";
  const disabled = !p || !d || busy;

  const run = async () => {
    if (disabled) return;
    setBusy(true);
    setFailed(false);
    const r = await suggestForStops(pickup, dropoff, jobType, market);
    setBusy(false);
    if (!r) { setFailed(true); return; }
    setResult(r);
    onSuggestion(r.price, r.miles);
  };

  const priceByMiles = async () => {
    const mi = Number(miles);
    if (isNaN(mi) || mi < 1) return;
    setPricing(true);
    try {
      const rates = await loadDispatchRates();
      const type = (["delivery", "errand", "hauling"].includes(jobType) ? jobType : "delivery") as DispatchServiceId;
      const { price } = suggestPrice(type, mi, 0, rates);
      setResult({ price, miles: mi });
      onSuggestion(price, mi);
      setFailed(false);
    } finally {
      setPricing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={run} disabled={disabled}
        className="text-[10.5px] font-extrabold rounded-lg px-2.5 py-1.5 bg-[#101613] text-white border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
        {busy ? "…" : "⚡ Suggest"}
      </button>
      {failed && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] text-[#5c6a62] font-semibold">Miles:</span>
          <input type="number" min="1" value={miles} onChange={(e) => setMiles(e.target.value)}
            placeholder="0" className="w-14 border border-[rgba(16,22,19,0.09)] rounded-lg px-2 py-1 text-[11px] bg-white focus:outline-none focus:border-[#0e9f6e]" />
          <button onClick={priceByMiles} disabled={pricing || !miles.trim()}
            className="text-[10.5px] font-extrabold rounded-lg px-2.5 py-1.5 bg-[#0e9f6e] text-white border-none cursor-pointer disabled:opacity-40">
            {pricing ? "…" : "⚡ price it"}
          </button>
        </div>
      )}
      {result && <span className="text-[10.5px] text-[#5c6a62] font-semibold">⚡ ${result.price} suggested · {result.miles} mi</span>}
    </div>
  );
}