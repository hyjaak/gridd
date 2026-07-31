"use client";

import { useState } from "react";
import { suggestForStops } from "@/lib/dispatch-suggest";
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

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={run} disabled={disabled}
        className="text-[10.5px] font-extrabold rounded-lg px-2.5 py-1.5 bg-[#101613] text-white border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
        {busy ? "…" : "⚡ Suggest"}
      </button>
      {failed && <span className="text-[10.5px] text-[#c0392b] font-semibold">No route found — manual</span>}
      {result && <span className="text-[10.5px] text-[#5c6a62] font-semibold">⚡ ${result.price} suggested · {result.miles} mi</span>}
    </div>
  );
}