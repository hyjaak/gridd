"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { MiniRail } from "./MiniRail";
import { ItemPhotoLightbox } from "./ItemPhotoLightbox";
import type { DispatchJob } from "@/types/dispatch";

interface JobCardProps {
  job: DispatchJob;
  quotePrice: string;
  onQuoteChange: (jobId: string, value: string) => void;
  onSendQuote: (jobId: string) => void;
  onDecline: (jobId: string) => void;
  onAdvance: (jobId: string, nextStatus: string, extraFields?: Record<string, unknown>) => Promise<void>;
  quotingId: string | null;
  onToast?: (msg: string) => void;
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
  request: "NEW", quoted: "QUOTED", accepted: "BOOKED", assigned: "BOOKED",
  pickup: "PICKUP", in_progress: "EN ROUTE", proof: "PHOTO", paid: "PAID",
};

const BIZ_PHONES = ["+14047834836", "+16783458153"];
function isBIZ(phone: string): boolean { return BIZ_PHONES.includes(phone); }

export function JobCard({ job, quotePrice, onQuoteChange, onSendQuote, onDecline, onAdvance, quotingId, onToast }: JobCardProps) {
  const [uploading, setUploading] = useState(false);
  const biz = job.customerPhone ? isBIZ(job.customerPhone) : false;

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const storageRef = ref(storage, `proof/${job.id}.jpg`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await onAdvance(job.id, "proof", { proofPhotoUrl: url });
      const flash = document.createElement("div");
      flash.className = "fixed inset-0 bg-white opacity-80 pointer-events-none z-55";
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 90);
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handlePaid = async () => {
    try {
      const extra: Record<string, unknown> = { paidAt: new Date().toISOString() };
      if (job.status === "proof" && window.confirm("Mark as Cash?")) extra.paymentMethod = "cash";
      await onAdvance(job.id, "paid", extra);
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : "Failed to mark paid");
    }
  };

  const formatEst = () => {
    if (job.estPrice && job.estMiles) return `≈ $${job.estPrice} suggested · ${job.estMiles} mi`;
    if (job.estPrice) return `≈ $${job.estPrice} suggested`;
    if (job.estMiles) return `≈ ${job.estMiles} mi`;
    return null;
  };

  return (
    <motion.div
      layout
      initial={{ y: -14, scale: 0.97, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      exit={{ x: 28, scale: 0.95, opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 0.9, 0.25, 1.1] }}
      className={clsx(
        "bg-white border border-[rgba(16,22,19,0.09)] rounded-[18px] p-[15px_15px_13px] mb-3 shadow-[0_10px_30px_rgba(16,22,19,0.06)]",
        biz && "border-[#d9a441] shadow-[0_4px_18px_rgba(217,164,65,0.2)]"
      )}
    >
      {/* Header */}
      <div className="flex justify-between items-center gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {biz && <span className="text-[11px] font-extrabold text-[#d9a441] bg-[#faf6eb] rounded-md px-1.5 py-0.5">🏢 BIZ</span>}
          <a href={`tel:${job.customerPhone}`} className="font-extrabold text-[15px] text-[#101613] no-underline hover:underline">
            {job.contactName || "Unknown"}
          </a>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <span className={clsx("text-[9.5px] font-extrabold rounded-md px-1.5 py-0.5", STATUS_BADGE[job.status])}>{STATUS_LABEL[job.status]}</span>
          <span className="text-[9.5px] font-extrabold rounded-md px-1.5 py-0.5 bg-[#101613] text-white">{job.market}</span>
        </div>
      </div>

      <div className="text-[12.5px] text-[#5c6a62] font-semibold mb-1">
        <b>{job.jobType}</b> · {job.pickupAddress.city} → {job.dropoffAddress.city}
      </div>

      {job.timeWindow && <div className="text-[11px] font-bold text-[#0e9f6e] bg-[#f2faf6] rounded-md px-2 py-0.5 mb-1 inline-block">⏱ {job.timeWindow}</div>}

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

      <ItemPhotoLightbox url={job.itemPhotoUrl} />

      <p className="text-[12.5px] text-[#5c6a62] leading-relaxed line-clamp-2 mb-2">{job.description}</p>

      {job.status === "request" && formatEst() && (
        <div className="text-[11px] font-semibold text-[#5c6a62] mb-2 italic">{formatEst()}</div>
      )}

      {/* NEW REQUESTS */}
      {job.status === "request" && (
        <>
          <MiniRail status={job.status} />
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5c6a62] text-[13.5px] font-extrabold">$</span>
              <input type="number" step="0.01" min="1" placeholder={job.estPrice ? String(job.estPrice) : "0"}
                value={quotePrice} onChange={(e) => onQuoteChange(job.id, e.target.value)}
                className="w-full border-2 border-[rgba(16,22,19,0.09)] rounded-xl px-2.5 py-2.5 text-sm text-[#101613] bg-[#eef3ef] focus:outline-none focus:border-[#0e9f6e] focus:bg-white transition-colors pl-6" />
            </div>
            <button onClick={() => onSendQuote(job.id)} disabled={quotingId === job.id || !quotePrice.trim()}
              className="border-none font-inherit font-extrabold text-sm rounded-xl px-4 py-2.5 cursor-pointer bg-[#0e9f6e] text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.96] transition-transform">
              {quotingId === job.id ? "Sending..." : "Send quote"}
            </button>
          </div>
          <button onClick={() => onDecline(job.id)} className="border-none font-inherit font-extrabold text-[11.5px] px-1 py-1.5 cursor-pointer bg-transparent text-[#5c6a62] hover:text-[#c0392b]">Decline</button>
        </>
      )}

      {/* QUOTED */}
      {job.status === "quoted" && (
        <>
          <MiniRail status={job.status} />
          <div className="flex gap-2 items-center">
            <span className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[19px] text-[#0e9f6e]">${job.quoteAmount?.toFixed(2) || "0.00"}</span>
            <span className="text-[11.5px] font-extrabold text-[#2c5d9c] bg-[#e3ecf7] rounded-xl px-3 py-2 text-center flex-1">Waiting on YES…</span>
          </div>
        </>
      )}

      {/* PAID */}
      {job.status === "paid" && (
        <div className="flex gap-3 items-center">
          <div className="w-14 h-14 flex-none bg-gradient-to-br from-[#dfe9e1] to-[#c9dfd2] border-3 border-white rounded-md shadow-[0_5px_14px_rgba(16,22,19,0.18)] -rotate-3 flex items-center justify-center text-[19px]">
            {job.proofPhotoUrl ? <img src={job.proofPhotoUrl} alt="Proof" className="w-full h-full object-cover rounded-[3px]" /> : "📦"}
          </div>
          <div>
            <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[19px] text-[#0e9f6e]">${job.quoteAmount?.toFixed(2) || "0.00"}</div>
            <div className="text-[11.5px] text-[#5c6a62] font-semibold">{job.paymentMethod === "cash" ? "Paid — Cash" : "Paid"}</div>
          </div>
        </div>
      )}

      {/* ACTIVE STAGES */}
      {["accepted", "assigned", "pickup", "in_progress", "proof"].includes(job.status) && (
        <>
          <MiniRail status={job.status} />
          {job.status === "in_progress" && (
            <div className="mb-3">
              <label className={clsx("flex items-center justify-center gap-2 w-full border-none font-inherit font-extrabold text-sm rounded-xl px-4 py-3 cursor-pointer bg-[#0e9f6e] text-white active:scale-[0.96] transition-transform", uploading && "opacity-50 cursor-not-allowed")}>
                {uploading ? "Uploading..." : "📸 Arrived — take photo"}
                <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploading} onChange={handleProofUpload} />
              </label>
            </div>
          )}
          {job.status === "proof" && (
            <div className="flex gap-2 items-center mb-3">
              <button onClick={handlePaid} className="flex-1 border-none font-inherit font-extrabold text-sm rounded-xl px-4 py-3 cursor-pointer bg-[#0e9f6e] text-white active:scale-[0.96] transition-transform">💰 Mark paid</button>
              <button onClick={() => onAdvance(job.id, "paid", { paidAt: new Date().toISOString(), paymentMethod: "cash" })}
                className="border-none font-inherit font-extrabold text-sm rounded-xl px-4 py-3 cursor-pointer bg-[#e3ecf7] text-[#2c5d9c] active:scale-[0.96] transition-transform">Cash 💵</button>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[19px] text-[#0e9f6e]">${job.quoteAmount?.toFixed(2) || "0.00"}</span>
            {!["in_progress", "proof"].includes(job.status) && (
              <button onClick={() => onAdvance(job.id, job.status === "accepted" || job.status === "assigned" ? "pickup" : "in_progress")}
                className="border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2 cursor-pointer bg-[#101613] text-white active:scale-[0.96] transition-transform">
                {job.status === "accepted" || job.status === "assigned" ? "📌 Arrived at pickup" : "🚚 Loaded — rolling"}
              </button>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}