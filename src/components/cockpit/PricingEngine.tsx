"use client";

import { useState } from "react";
import { GlassCard, StatusBadge, SectionTitle, ProgressBar } from "./ui";
import { usePricing } from "@/lib/cockpit/hooks";
import type { PricingInput, VehicleType } from "@/lib/cockpit/types";

export default function PricingEngine() {
  const [input, setInput] = useState<PricingInput>({
    distance: 10, time: 30, vehicle: "suv", weight: 50, volume: 10,
    stops: 1, fuelPrice: 3.5, traffic: "moderate", weather: "clear", demand: 50, tolls: 0,
  });
  const { estimate, loading } = usePricing(input);

  const update = <K extends keyof PricingInput>(key: K, value: PricingInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  return (
    <GlassCard className="lg:col-span-1 xl:col-span-2">
      <SectionTitle title="Smart Pricing" subtitle="Live calculator" action={<StatusBadge status="active" />} />

      <div className="grid grid-cols-3 gap-2 mb-4">
        {(["suv", "van", "truck", "box-truck"] as VehicleType[]).map((v) => (
          <button key={v} onClick={() => update("vehicle", v)}
            className={`px-2 py-1.5 rounded-xl text-[11px] font-semibold capitalize transition-colors ${
              input.vehicle === v ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06]"
            }`}
          >{v}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Distance</label>
          <input type="number" value={input.distance} onChange={(e) => update("distance", +e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/80 text-sm outline-none focus:border-white/20" />
        </div>
        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Stops</label>
          <input type="number" value={input.stops} onChange={(e) => update("stops", +e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/80 text-sm outline-none focus:border-white/20" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-4 text-white/30 text-sm">Calculating...</div>
      ) : estimate ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <p className="text-[10px] text-white/30 uppercase">Base</p>
              <p className="text-sm font-semibold text-white">${estimate.basePrice}</p>
            </div>
            <div className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <p className="text-[10px] text-white/30 uppercase">Fuel</p>
              <p className="text-sm font-semibold text-white">${estimate.fuelCost}</p>
            </div>
            <div className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <p className="text-[10px] text-white/30 uppercase">Labor</p>
              <p className="text-sm font-semibold text-white">${estimate.laborCost}</p>
            </div>
            <div className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <p className="text-[10px] text-white/30 uppercase">Fees</p>
              <p className="text-sm font-semibold text-white">${estimate.fees}</p>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/15">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-white/30 uppercase">AI Suggested</span>
              <span className="text-[10px] text-emerald-400">{estimate.confidence}% confidence</span>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-bold text-white">${estimate.aiSuggested}</span>
              <span className="text-sm text-emerald-400">+{estimate.margin}% margin</span>
            </div>
            <ProgressBar value={estimate.margin} max={50} color="bg-emerald-500" />
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-white/30 text-sm">Adjust inputs to calculate</div>
      )}
    </GlassCard>
  );
}