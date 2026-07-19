"use client";

import React, { useEffect, useRef, useState } from "react";
import { MiniRail } from "./MiniRail";
import { RoadStripSUV } from "./RoadStripSUV";
import type { DispatchJob } from "@/types/dispatch";

interface DriverModeProps {
  jobs: DispatchJob[];
  onAdvance: (jobId: string, nextStatus: string, extraFields?: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  onToast?: (msg: string) => void;
}

function getNextJob(jobs: DispatchJob[]): DispatchJob | null {
  const priority = ["accepted", "assigned", "pickup", "in_progress", "proof"];
  for (const s of priority) {
    const found = jobs.find((j) => j.status === s);
    if (found) return found;
  }
  return null;
}

function getStage(job: DispatchJob): string {
  switch (job.status) {
    case "accepted":
    case "assigned":
      return "HEAD TO PICKUP";
    case "pickup":
      return "AT PICKUP";
    case "in_progress":
      return "EN ROUTE TO DROP-OFF";
    case "proof":
      return "AT DROP-OFF";
    default:
      return "";
  }
}

function getPlace(job: DispatchJob): string {
  if (job.status === "accepted" || job.status === "assigned" || job.status === "pickup") {
    return job.pickupAddress.street || job.pickupAddress.city;
  }
  return job.dropoffAddress.street || job.dropoffAddress.city;
}

function getMainAction(job: DispatchJob): { label: string; next: string } {
  switch (job.status) {
    case "accepted":
    case "assigned":
      return { label: "📍 Arrived at pickup", next: "pickup" };
    case "pickup":
      return { label: "🚚 Loaded — rolling", next: "in_progress" };
    case "in_progress":
      return { label: "📍 Arrived — take photo", next: "proof" };
    case "proof":
      return { label: "📸 Photo & complete", next: "paid" };
    default:
      return { label: "", next: "" };
  }
}

export function DriverMode({ jobs, onAdvance, onClose, onToast }: DriverModeProps) {
  const [currentJob, setCurrentJob] = useState<DispatchJob | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    const next = getNextJob(jobs);
    setCurrentJob(next);
  }, [jobs]);

  useEffect(() => {
    if (!currentJob) return;
    let released = false;
    const acquireWakeLock = async () => {
      try {
        // Safari doesn't support wakeLock API - skip silently
        if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
          const wl = await (navigator as any).wakeLock.request("screen");
          wakeLockRef.current = wl;
          wl.addEventListener("release", () => {
            if (!released) acquireWakeLock();
          });
        }
      } catch { /* silent - wakeLock not supported or denied */ }
    };
    acquireWakeLock();
    return () => {
      released = true;
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [currentJob?.id]);

  const handleAdvance = async () => {
    if (!currentJob || advancing) return;
    setAdvancing(true);
    try {
      const action = getMainAction(currentJob);
      const extra: Record<string, unknown> = {};
      if (action.next === "proof") {
        const input = document.getElementById("driver-camera-input") as HTMLInputElement;
        if (input) { input.click(); return; }
      }
      if (action.next === "paid") extra.paidAt = new Date().toISOString();
      await onAdvance(currentJob.id, action.next, extra);
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : "Failed to advance");
    } finally {
      setAdvancing(false);
    }
  };

  const handleCameraUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentJob) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setAdvancing(true);
    try {
      const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
      const { storage } = await import("@/lib/firebase");
      const storageRef = ref(storage, `proof/${currentJob.id}.jpg`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await onAdvance(currentJob.id, "proof", { proofPhotoUrl: url });
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setAdvancing(false);
      e.target.value = "";
    }
  };

  const handlePaid = async () => {
    if (!currentJob || advancing) return;
    setAdvancing(true);
    try {
      await onAdvance(currentJob.id, "paid", { paidAt: new Date().toISOString() });
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : "Failed");
    } finally {
      setAdvancing(false);
    }
  };

  if (!currentJob) {
    return (
      <div className="fixed inset-0 z-40 bg-[#101613] text-white flex flex-col p-[18px_5vw_20px]">
        <div className="flex justify-between items-center mb-2">
          <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[22px] text-[#0e9f6e]">
            gridd · driving
          </div>
          <button onClick={onClose} className="bg-white/12 border-none text-white font-inherit font-extrabold text-xs rounded-full px-4 py-2 cursor-pointer">
            Dispatch ↩
          </button>
        </div>
        <div className="m-auto text-center">
          <div className="text-[48px] mb-3">🏁</div>
          <div className="text-[22px] font-extrabold text-[#0e9f6e] mb-2">Board's clear.</div>
          <div className="text-[#8fa096] font-semibold">No booked runs.</div>
          <button onClick={onClose} className="mt-6 bg-white/12 border-none text-white font-inherit font-extrabold text-sm rounded-full px-6 py-3 cursor-pointer">
            Exit driving
          </button>
        </div>
      </div>
    );
  }

  const stage = getStage(currentJob);
  const place = getPlace(currentJob);
  const action = getMainAction(currentJob);
  const firstName = currentJob.contactName?.split(" ")[0] || "Customer";

  const suvPositions: Record<string, number> = { accepted: 5, assigned: 5, pickup: 5, in_progress: 50, proof: 92 };
  const suvPos = suvPositions[currentJob.status] ?? 50;

  const stopNotes = ["accepted", "assigned", "pickup"].includes(currentJob.status)
    ? currentJob.pickupAddress.notes
    : currentJob.dropoffAddress.notes;

  return (
    <div className="fixed inset-0 z-40 bg-[#101613] text-white flex flex-col p-[18px_5vw_20px]">
      <div className="flex justify-between items-center mb-2">
        <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[22px] text-[#0e9f6e]">
          gridd · driving
        </div>
        <button onClick={onClose} className="bg-white/12 border-none text-white font-inherit font-extrabold text-xs rounded-full px-4 py-2 cursor-pointer">
          Dispatch ↩
        </button>
      </div>

      <div className="text-[11px] tracking-[0.2em] font-extrabold text-[#7cc7a8] uppercase mb-1.5">{stage}</div>
      <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[clamp(28px,7vw,44px)] leading-tight mb-1.5">
        {currentJob.contactName || "Customer"}
      </div>
      <div className="text-base text-[#b9c8bf] font-semibold mb-1">{place}</div>

      {stopNotes && (
        <div className="text-sm text-[#d9a441] bg-[rgba(217,164,65,0.12)] rounded-lg px-3 py-2 mb-2">📝 {stopNotes}</div>
      )}
      {currentJob.timeWindow && (
        <div className="text-sm text-[#0e9f6e] font-bold mb-1">⏱ {currentJob.timeWindow}</div>
      )}
      <div className="text-sm text-[#8fa096] leading-relaxed mb-3.5">{currentJob.description}</div>
      <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[30px] text-[#0e9f6e] mb-3">
        ${currentJob.quoteAmount?.toFixed(2) || "0.00"}
      </div>

      <RoadStripSUV position={suvPos} />
      <MiniRail status={currentJob.status} dark />

      <input id="driver-camera-input" type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraUpload} />

      <div className="grid gap-3 mt-auto">
        <a href={`https://maps.google.com/?q=${encodeURIComponent(place)}`} target="_blank" rel="noopener noreferrer"
          className="border-none font-inherit font-extrabold text-lg rounded-[18px] py-5 cursor-pointer flex items-center justify-center gap-3 bg-white text-[#101613] active:scale-[0.97] transition-transform no-underline">
          🧭 Navigate
        </a>
        <a href={`tel:${currentJob.customerPhone}`}
          className="border-none font-inherit font-extrabold text-lg rounded-[18px] py-5 cursor-pointer flex items-center justify-center gap-3 bg-white/12 text-white active:scale-[0.97] transition-transform no-underline">
          📞 Call {firstName}
        </a>

        {currentJob.status === "proof" ? (
          <button onClick={handlePaid} disabled={advancing}
            className="border-none font-inherit font-extrabold text-xl rounded-[18px] py-6 cursor-pointer flex items-center justify-center gap-3 bg-[#0e9f6e] text-white active:scale-[0.97] transition-transform disabled:opacity-50">
            {advancing ? "Marking..." : "💰 Mark paid"}
          </button>
        ) : currentJob.status === "in_progress" ? (
          <label className="border-none font-inherit font-extrabold text-xl rounded-[18px] py-6 cursor-pointer flex items-center justify-center gap-3 bg-[#0e9f6e] text-white active:scale-[0.97] transition-transform">
            {advancing ? "Uploading..." : "📸 Take photo"}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraUpload} />
          </label>
        ) : (
          <button onClick={handleAdvance} disabled={advancing}
            className="border-none font-inherit font-extrabold text-xl rounded-[18px] py-6 cursor-pointer flex items-center justify-center gap-3 bg-[#0e9f6e] text-white active:scale-[0.97] transition-transform disabled:opacity-50">
            {advancing ? "..." : action.label}
          </button>
        )}
      </div>
    </div>
  );
}