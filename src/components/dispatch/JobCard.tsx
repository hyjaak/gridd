"use client";

import React from "react";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import { MiniRail } from "./MiniRail";
import type { DispatchJob } from "@/types/dispatch";

interface JobCardProps {
  job: DispatchJob;
  quotePrice: string;
  onQuoteChange: (jobId: string, value: string) => void;
  onSendQuote: (jobId: string) => void;
  onDecline: (jobId: string) => void;
  onAdvance: (jobId: string, nextStatus: string) => Promise<void>;
  quotingId: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  request: "bg-[#faf1dd] text-[#8a6410]",
  quoted: "bg-[#e3ecf7] text-[#2c5d9c]",
  accepted: "bg-[#e2f4ec] text-[#0a7a54]",
  assigned: "bg-[#e2f4ec] text-[#0a7a54]",
  pickup: "bg-[#e2f4ec] text-[#0a7a54]",
  in_progress: "bg-[#e2f4ec] text-[#0a7a54]",
  proof: "bg-[#e2f4ec] text-[#0a7a54]",
  paid: "bg-[#0e9f6e] text-white",
};

const STATUS_LABEL: Record<string, string> = {
  request: "NEW",
  quoted: "QUOTED",
  accepted: "BOOKED",
  assigned: "BOOKED",
  pickup: "PICKUP",
  in_progress: "EN ROUTE",
  proof: "PHOTO",
  paid: "PAID",
};

export function JobCard({
  job,
  quotePrice,
  onQuoteChange,
  onSendQuote,
  onDecline,
  onAdvance,
  quotingId,
}: JobCardProps) {
  const getAction = (): { label: string; next: any } | null => {
    switch (job.status) {
      case "accepted":
        return { label: "▶ Start job", next: "pickup" };
      case "assigned":
        return { label: "▶ Start job", next: "pickup" };
      case "pickup":
        return { label: "🚚 Loaded — start driving", next: "in_progress" };
      case "in_progress":
        return { label: "📍 Arrived at drop-off", next: "proof" };
      case "proof":
        return { label: "💰 Mark paid", next: "paid" };
      default:
        return null;
    }
  };

  const action = getAction();

  return (
    <motion.div
      initial={{ y: -14, scale: 0.97, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      exit={{ x: 28, scale: 0.95, opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 0.9, 0.25, 1.1] }}
      className="bg-white border border-[rgba(16,22,19,0.09)] rounded-[18px] p-[15px_15px_13px] mb-3 shadow-[0_10px_30px_rgba(16,22,19,0.06)]"
    >
      <div className="flex justify-between items-center gap-2 mb-1">
        <span className="font-extrabold text-[15px]">{job.contactName || "Unknown"}</span>
        <div className="flex gap-1">
          <span className={clsx("text-[9.5px] font-extrabold rounded-md px-1.5 py-0.5", STATUS_BADGE[job.status])}>
            {STATUS_LABEL[job.status]}
          </span>
          <span className="text-[9.5px] font-extrabold rounded-md px-1.5 py-0.5 bg-[#101613] text-white">
            {job.market}
          </span>
        </div>
      </div>

      <div className="text-[12.5px] text-[#5c6a62] font-semibold mb-1">
        <b>{job.jobType}</b> · {job.pickupAddress.city} → {job.dropoffAddress.city}
      </div>

      {/* Time window chip */}
      {job.timeWindow && (
        <div className="text-[11px] font-bold text-[#0e9f6e] bg-[#f2faf6] rounded-md px-2 py-0.5 mb-1 inline-block">
          {job.timeWindow}
        </div>
      )}

      {/* Address details */}
      <div className="text-[11.5px] text-[#5c6a62] mb-1">
        <div className="flex items-start gap-1">
          <span className="text-[#0e9f6e]">📍</span>
          <div>
            <div>{job.pickupAddress.street || job.pickupAddress.city}</div>
            {job.pickupAddress.unit && <div className="text-[10.5px]">Unit {job.pickupAddress.unit}</div>}
            {job.pickupAddress.notes && <div className="text-[10.5px] text-[#8a6410]">{job.pickupAddress.notes}</div>}
          </div>
        </div>
        <div className="flex items-start gap-1 mt-1">
          <span className="text-[#0e9f6e]">🏁</span>
          <div>
            <div>{job.dropoffAddress.street || job.dropoffAddress.city}</div>
            {job.dropoffAddress.unit && <div className="text-[10.5px]">Unit {job.dropoffAddress.unit}</div>}
            {job.dropoffAddress.notes && <div className="text-[10.5px] text-[#8a6410]">{job.dropoffAddress.notes}</div>}
          </div>
        </div>
      </div>

      {/* Item photo thumbnail */}
      {job.itemPhotoUrl && (
        <div className="mb-2">
          <img
            src={job.itemPhotoUrl}
            alt="Item"
            className="w-16 h-16 object-cover rounded-lg border border-black/10 cursor-pointer hover:opacity-80"
            onClick={() => window.open(job.itemPhotoUrl, '_blank')}
          />
        </div>
      )}

      <p className="text-[12.5px] text-[#5c6a62] leading-relaxed line-clamp-2 mb-2">
        {job.description}
      </p>

      {job.status === "request" && (
        <>
          <MiniRail status={job.status} />
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5c6a62] text-[13.5px] font-extrabold">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="1"
                placeholder="0"
                value={quotePrice}
                onChange={(e) => onQuoteChange(job.id, e.target.value)}
                className="w-full border-2 border-[rgba(16,22,19,0.09)] rounded-xl px-2.5 py-2.5 text-sm text-[#101613] bg-[#eef3ef] focus:outline-none focus:border-[#0e9f6e] focus:bg-white transition-colors pl-6"
              />
            </div>
            <button
              onClick={() => onSendQuote(job.id)}
              disabled={quotingId === job.id || !quotePrice.trim()}
              className="border-none font-inherit font-extrabold text-sm rounded-xl px-4 py-2.5 cursor-pointer bg-[#0e9f6e] text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.96] transition-transform"
            >
              {quotingId === job.id ? "Sending..." : "Send quote"}
            </button>
          </div>
          <button
            onClick={() => onDecline(job.id)}
            className="border-none font-inherit font-extrabold text-[11.5px] px-1 py-1.5 cursor-pointer bg-transparent text-[#5c6a62]"
          >
            Decline
          </button>
        </>
      )}

      {job.status === "quoted" && (
        <>
          <MiniRail status={job.status} />
          <div className="flex gap-2">
            <span className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[19px] text-[#0e9f6e]">
              ${job.quoteAmount?.toFixed(2) || "0.00"}
            </span>
            <span className="text-[11.5px] font-extrabold text-[#2c5d9c] bg-[#e3ecf7] rounded-xl px-3 py-2 text-center flex-1">
              Waiting on YES…
            </span>
          </div>
        </>
      )}

      {job.status === "paid" && (
        <div className="flex gap-3 items-center">
          <div className="w-14 h-14 flex-none bg-gradient-to-br from-[#dfe9e1] to-[#c9dfd2] border-3 border-white rounded-md shadow-[0_5px_14px_rgba(16,22,19,0.18)] -rotate-3 flex items-center justify-center text-[19px]">
            📦
          </div>
          <div>
            <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[19px] text-[#0e9f6e]">
              ${job.quoteAmount?.toFixed(2) || "0.00"}
            </div>
            <div className="text-[11.5px] text-[#5c6a62] font-semibold">
              Photo sent · paid
            </div>
          </div>
        </div>
      )}

      {["accepted", "pickup", "in_progress", "proof"].includes(job.status) && (
        <>
          <MiniRail status={job.status} />
          <div className="flex justify-between items-center">
            <span className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[19px] text-[#0e9f6e]">
              ${job.quoteAmount?.toFixed(2) || "0.00"}
            </span>
            <span className="text-[11.5px] font-extrabold text-[#5c6a62]">
              In Driver Mode 🚚
            </span>
          </div>
        </>
      )}
    </motion.div>
  );
}
