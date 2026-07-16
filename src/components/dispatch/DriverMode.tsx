"use client";

import React from "react";
import { MiniRail } from "./MiniRail";
import type { DispatchJob } from "@/types/dispatch";

interface DriverModeProps {
  jobs: DispatchJob[];
  onAdvance: (jobId: string, nextStatus: string) => Promise<void>;
  onClose: () => void;
}

export function DriverMode({ jobs, onAdvance, onClose }: DriverModeProps) {
  const currentJob = jobs.find((j) => ["accepted", "pickup", "in_progress", "proof"].includes(j.status));

  if (!currentJob) {
    return (
      <div className="fixed inset-0 z-40 bg-[#101613] text-white flex flex-col p-[18px_5vw_20px]">
        <div className="flex justify-between items-center mb-2">
          <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[22px] text-[#0e9f6e]">
            gridd · driving
          </div>
          <button
            onClick={onClose}
            className="bg-white/12 border-none text-white font-inherit font-extrabold text-xs rounded-full px-4 py-2 cursor-pointer"
          >
            Dispatch ↩
          </button>
        </div>
        <div className="m-auto text-center text-[#8fa096] font-semibold">
          No booked jobs.<br />Quote something and get a YES 💬
        </div>
      </div>
    );
  }

  const stage =
    currentJob.status === "accepted"
      ? "HEAD TO PICKUP"
      : currentJob.status === "pickup"
      ? "AT PICKUP"
      : currentJob.status === "in_progress"
      ? "EN ROUTE TO DROP-OFF"
      : "AT DROP-OFF";

  const place =
    currentJob.status === "accepted" || currentJob.status === "pickup"
      ? currentJob.pickupAddress.street || currentJob.pickupAddress.city
      : currentJob.dropoffAddress.street || currentJob.dropoffAddress.city;

  const mainAction =
    currentJob.status === "accepted"
      ? { label: "📍 Arrived at pickup", next: "pickup" }
      : currentJob.status === "pickup"
      ? { label: "🚚 Loaded — start driving", next: "in_progress" }
      : currentJob.status === "in_progress"
      ? { label: "📍 Arrived at drop-off", next: "proof" }
      : { label: "📸 Take photo & complete", next: "paid" };

  const firstName = currentJob.contactName?.split(" ")[0] || "Customer";

  return (
    <div className="fixed inset-0 z-40 bg-[#101613] text-white flex flex-col p-[18px_5vw_20px]">
      <div className="flex justify-between items-center mb-2">
        <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[22px] text-[#0e9f6e]">
          gridd · driving
        </div>
        <button
          onClick={onClose}
          className="bg-white/12 border-none text-white font-inherit font-extrabold text-xs rounded-full px-4 py-2 cursor-pointer"
        >
          Dispatch ↩
        </button>
      </div>

      <div className="text-[11px] tracking-[0.2em] font-extrabold text-[#7cc7a8] uppercase mb-1.5">
        {stage}
      </div>
      <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[clamp(28px,7vw,44px)] leading-tight mb-1.5">
        {currentJob.contactName || "Customer"}
      </div>
      <div className="text-base text-[#b9c8bf] font-semibold mb-1">{place}</div>
      <div className="text-sm text-[#8fa096] leading-relaxed mb-3.5">
        {currentJob.description}
      </div>
      <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[30px] text-[#0e9f6e] mb-auto">
        ${currentJob.quoteAmount?.toFixed(2) || "0.00"}
      </div>

      <MiniRail status={currentJob.status} dark />

      <div className="grid gap-3">
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(place)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="border-none font-inherit font-extrabold text-lg rounded-[18px] py-5 cursor-pointer flex items-center justify-center gap-3 bg-white text-[#101613] active:scale-[0.97] transition-transform"
        >
          🧭 Navigate
        </a>
        <a
          href={`tel:${currentJob.customerPhone}`}
          className="border-none font-inherit font-extrabold text-lg rounded-[18px] py-5 cursor-pointer flex items-center justify-center gap-3 bg-white/12 text-white active:scale-[0.97] transition-transform"
        >
          📞 Call {firstName}
        </a>
        <button
          onClick={() => onAdvance(currentJob.id, mainAction.next)}
          className="border-none font-inherit font-extrabold text-xl rounded-[18px] py-6 cursor-pointer flex items-center justify-center gap-3 bg-[#0e9f6e] text-white active:scale-[0.97] transition-transform"
        >
          {mainAction.label}
        </button>
      </div>
    </div>
  );
}
