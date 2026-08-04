"use client";

import { useState, useRef } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, firebaseAuth } from "@/lib/firebase";
import { mapsUrl } from "@/lib/dispatch-geo";
import SuggestLine from "@/components/dispatch/SuggestLine";
import CustomerMemory from "@/components/dispatch/CustomerMemory";
import type { DispatchJob } from "@/types/dispatch";

const STATUS_LABEL: Record<string, string> = {
  request: "NEW", quoted: "QUOTED", accepted: "BOOKED", assigned: "BOOKED",
  pickup: "PICKUP", in_progress: "EN ROUTE", proof: "PHOTO", paid: "PAID",
};

function relTime(ts: any): string {
  if (!ts) return "";
  const t = ts.seconds ? ts.seconds * 1000 : (ts.toMillis?.() ?? 0);
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function fmtTime(ts: any): string {
  if (!ts) return "";
  const t = ts.seconds ? ts.seconds * 1000 : (ts.toMillis?.() ?? 0);
  return new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function JobSheet({ job, onClose, quotePrice, onQuoteChange, onSendQuote, onAdvance, onPhotoUpload, onPaid, onSuggestion, quotingId, uploadingId }: {
  job: DispatchJob; onClose: () => void;
  quotePrice: string; onQuoteChange: (v: string) => void; onSendQuote: () => void;
  onAdvance: (s: string, e?: Record<string, unknown>) => void;
  onPhotoUpload: (f: File) => void; onPaid: (c?: boolean) => void;
  onSuggestion?: (price: number) => void;
  quotingId: string | null; uploadingId: string | null;
}) {
  const [advancing, setAdvancing] = useState(false);
  const [copiedQuote, setCopiedQuote] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [counterAmt, setCounterAmt] = useState("");
  const [countering, setCountering] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = advancing || quotingId === job.id || uploadingId === job.id;

  const doAdvance = async (s: string, e?: Record<string, unknown>) => {
    setAdvancing(true);
    try { await onAdvance(s, e); } finally { setAdvancing(false); }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPhotoUpload(f);
  };

  const copyQuote = async () => {
    const text = `GRIDD quote: $${job.quoteAmount?.toFixed(2)} flat. See your job & book: https://gridd.click/j/${job.id}`;
    try { await navigator.clipboard.writeText(text); setCopiedQuote(true); setTimeout(() => setCopiedQuote(false), 2000); } catch {}
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`https://gridd.click/j/${job.id}`); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); } catch {}
  };

  const handleCounter = async () => {
    const amt = Number(counterAmt);
    if (isNaN(amt) || amt < 20 || amt > 500) return;
    setCountering(true);
    try {
      const token = await firebaseAuth?.currentUser?.getIdToken();
      await fetch("/api/counter-offer", {
        method: "POST", headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ jobId: job.id, amount: amt, by: "owner" }),
      });
      setCounterAmt("");
    } catch {} finally { setCountering(false); }
  };

  const name = job.contactName || "Unknown";
  const pickup = job.pickupAddress;
  const dropoff = job.dropoffAddress;
  const notes = [pickup?.notes, dropoff?.notes].filter(Boolean);
  const log = job.offerLog ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-h-[92vh] overflow-y-auto bg-[#eef3ef] rounded-t-[24px] shadow-2xl animate-slide-up">
        <div className="sticky top-0 z-10 bg-[#eef3ef] flex items-center justify-between px-5 py-3 border-b border-[rgba(16,22,19,0.09)]">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[15px]">{name}</span>
            <span className="text-[9.5px] font-extrabold rounded-md px-1.5 py-0.5 bg-[#d9a441] text-white">{STATUS_LABEL[job.status] || job.status}</span>
          </div>
          <button onClick={onClose} className="text-[#5c6a62] hover:text-[#101613] text-[20px] font-bold bg-transparent border-none cursor-pointer">✕</button>
        </div>

        <div className="p-5 space-y-4 pb-8">
          {/* Phone + market */}
          <div className="flex items-center gap-2 flex-wrap">
            {job.customerPhone && <a href={`tel:${job.customerPhone}`} className="text-[13px] text-[#0e9f6e] font-extrabold no-underline">{job.customerPhone}</a>}
            {job.market && <span className="text-[10px] font-extrabold rounded-md px-1.5 py-0.5 bg-[#101613] text-white">{job.market}</span>}
          </div>

          {/* Addresses — tap to navigate */}
          <div className="text-[13px] text-[#5c6a62] font-semibold leading-snug">
            <div className="flex items-center gap-2">
              <b>Pickup:</b>
              <span>{pickup?.street ? `${pickup.street}, ` : ""}{pickup?.city}{pickup?.unit ? ` · Unit ${pickup.unit}` : ""}</span>
              <a href={mapsUrl(pickup?.street, pickup?.city)} target="_blank" rel="noopener noreferrer"
                className="ml-auto text-[10.5px] font-extrabold text-[#0e9f6e] no-underline hover:underline shrink-0">📍 Navigate</a>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <b>Drop:</b>
              <span>{dropoff?.street ? `${dropoff.street}, ` : ""}{dropoff?.city}{dropoff?.unit ? ` · Unit ${dropoff.unit}` : ""}</span>
              <a href={mapsUrl(dropoff?.street, dropoff?.city)} target="_blank" rel="noopener noreferrer"
                className="ml-auto text-[10.5px] font-extrabold text-[#0e9f6e] no-underline hover:underline shrink-0">📍 Navigate</a>
            </div>
          </div>

          {/* Notes */}
          {notes.length > 0 && notes.map((n, i) => n ? (
            <div key={i} className="text-[12px] text-[#d9a441] font-semibold">⚠ {n}</div>
          ) : null)}

          {/* City sanity — never quote blind */}
          {(pickup?.city === "Other (we'll confirm)" || dropoff?.city === "Other (we'll confirm)") && (
            <div className="text-[11px] text-[#d9a441] font-extrabold">☎ confirm address before rolling</div>
          )}

          {/* Window + rel time */}
          <div className="flex items-center gap-2 text-[12px] text-[#5c6a62] font-semibold">
            {job.timeWindow && <span className="font-bold rounded-md px-1.5 py-0.5 bg-[#eef3ef]">{job.timeWindow}</span>}
            <span className="text-[#8fa096]">{relTime(job.createdAt)}</span>
          </div>

          {/* Description */}
          <p className="text-[13px] text-[#5c6a62] leading-relaxed">{job.description}</p>

          {/* Item photo */}
          {job.itemPhotoUrl && (
            <a href={job.itemPhotoUrl} target="_blank" rel="noopener noreferrer" className="block">
              <img src={job.itemPhotoUrl} alt="" className="w-full max-h-64 object-contain rounded-xl border border-[rgba(16,22,19,0.09)]" />
            </a>
          )}

          {/* Est miles/price */}
          {(job.estPrice || job.estMiles) && (
            <div className="text-[12px] text-[#5c6a62] font-semibold">≈ ${job.estPrice} suggested{job.estMiles ? ` · ${job.estMiles} mi` : ""}</div>
          )}

          {/* Offer history */}
          {log.length > 0 && (
            <div className="text-[12px] text-[#5c6a62] font-semibold">
              Offers: {log.map((e, i) => <span key={i}>{i > 0 && " → "}${e.amount}</span>)}
            </div>
          )}

          {/* Times */}
          <div className="text-[11px] text-[#8fa096] font-semibold space-y-0.5">
            {job.createdAt && <div>Created: {fmtTime(job.createdAt)}</div>}
            {job.quotedAt && <div>Quoted: {fmtTime(job.quotedAt)}</div>}
            {job.acceptedAt && <div>Accepted: {fmtTime(job.acceptedAt)}</div>}
            {job.paidAt && <div>Paid: {fmtTime(job.paidAt)}</div>}
          </div>

          {/* Copy link */}
          <button onClick={copyLink} className="text-[12px] font-extrabold text-[#0e9f6e] bg-transparent border-none cursor-pointer hover:underline">
            {copiedLink ? "✓ Copied" : "🔗 Copy job link"}
          </button>

          {/* Quote amount + tip/rating */}
          {job.quoteAmount != null && (
            <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[22px] text-[#0e9f6e]">
              ${(job.agreedAmount ?? job.quoteAmount).toFixed(2)}
              {job.tipAmount ? <span className="text-[13px] text-[#0e9f6e]"> +${job.tipAmount} tip</span> : null}
              {job.rating != null && <span className="text-[13px] text-[#d9a441]"> ★{job.rating}</span>}
            </div>
          )}

          {/* Actions — same as card */}
          {job.status === "request" && (
            <div className="space-y-2">
              <CustomerMemory phone={job.customerPhone} onPrefill={(amt) => onQuoteChange(String(amt))} />
              <SuggestLine pickup={job.pickupAddress} dropoff={job.dropoffAddress} jobType={job.jobType}
                market={job.market} onSuggestion={(p) => onSuggestion?.(p)} />
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5c6a62] text-[13.5px] font-extrabold">$</span>
                  <input type="number" step="0.01" min="1" placeholder={String(job.estPrice ?? "0")}
                    value={quotePrice} onChange={(e) => onQuoteChange(e.target.value)}
                    className="w-full border-2 border-[rgba(16,22,19,0.09)] rounded-xl px-2.5 py-2.5 text-sm bg-[#eef3ef] focus:outline-none focus:border-[#0e9f6e] pl-6" />
                </div>
                <button onClick={onSendQuote} disabled={busy || !quotePrice.trim()}
                  className="border-none font-extrabold text-sm rounded-xl px-4 py-2.5 cursor-pointer bg-[#0e9f6e] text-white disabled:opacity-50">{quotingId === job.id ? "..." : "Send"}</button>
                <button onClick={() => { if (confirm("Decline?")) doAdvance("declined"); }}
                  className="border-none font-extrabold text-[11.5px] px-1 cursor-pointer bg-transparent text-[#5c6a62] hover:text-[#c0392b]">Decline</button>
              </div>
            </div>
          )}

          {job.status === "quoted" && (
            <div className="space-y-3">
              {job.offerBy === "customer" && (
                <div className="bg-[#d9a441]/20 border border-[#d9a441] rounded-xl p-3">
                  <div className="text-[13px] font-extrabold text-[#d9a441]">COUNTER: ${job.offerAmount?.toFixed(2)}</div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => doAdvance("accepted", { agreedAmount: job.offerAmount, acceptedAt: new Date().toISOString() })} disabled={busy}
                      className="flex-1 border-none font-extrabold text-xs rounded-xl px-3 py-2 cursor-pointer bg-[#0e9f6e] text-white">✅ Accept ${job.offerAmount?.toFixed(2)}</button>
                    <button onClick={() => { const m = Math.round(((job.quoteAmount ?? 0) + (job.offerAmount ?? 0)) / 2 / 5) * 5; setCounterAmt(String(m)); }}
                      className="border-none font-extrabold text-xs rounded-xl px-3 py-2 cursor-pointer bg-[#101613] text-white">↩ Counter</button>
                    <button onClick={() => doAdvance("quoted", { offerAmount: job.quoteAmount, offerBy: "owner" })}
                      className="border-none font-extrabold text-xs rounded-xl px-3 py-2 cursor-pointer bg-transparent text-[#5c6a62] border border-[rgba(16,22,19,0.09)]">✋ Hold</button>
                  </div>
                  {counterAmt && (
                    <div className="flex gap-2 mt-2">
                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#5c6a62] text-[12px] font-extrabold">$</span>
                        <input type="number" value={counterAmt} onChange={(e) => setCounterAmt(e.target.value)}
                          className="w-full border rounded-xl px-2 py-1.5 text-[12px] bg-white pl-5 focus:outline-none focus:border-[#0e9f6e]" />
                      </div>
                      <button onClick={handleCounter} disabled={countering}
                        className="border-none font-extrabold text-xs rounded-xl px-3 py-1.5 cursor-pointer bg-[#0e9f6e] text-white">{countering ? "..." : "Send"}</button>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={copyQuote} className="border-none font-extrabold text-xs rounded-xl px-3 py-2 cursor-pointer bg-[#5c6a62] text-white">{copiedQuote ? "✓" : "📋 Copy quote"}</button>
                <button onClick={copyLink} className="border-none font-extrabold text-xs rounded-xl px-3 py-2 cursor-pointer bg-[#5c6a62] text-white">{copiedLink ? "✓" : "🔗 Copy link"}</button>
              </div>
            </div>
          )}

          {["accepted", "assigned"].includes(job.status) && (
            <button onClick={() => doAdvance("pickup")} disabled={busy}
              className="w-full border-none font-extrabold text-xs rounded-xl px-3 py-2.5 cursor-pointer bg-[#101613] text-white disabled:opacity-50">{busy ? "..." : "📌 Arrived at pickup"}</button>
          )}

          {job.status === "pickup" && (
            <button onClick={() => doAdvance("in_progress")} disabled={busy}
              className="w-full border-none font-extrabold text-xs rounded-xl px-3 py-2.5 cursor-pointer bg-[#101613] text-white disabled:opacity-50">{busy ? "..." : "🚚 Loaded — rolling"}</button>
          )}

          {job.status === "in_progress" && (
            <div className="flex flex-col gap-2">
              <button onClick={() => fileRef.current?.click()} disabled={busy}
                className="w-full border-none font-extrabold text-xs rounded-xl px-3 py-2.5 cursor-pointer bg-[#101613] text-white disabled:opacity-50">
                {uploadingId === job.id ? "📸 Uploading..." : "📸 Arrived — take photo"}</button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
            </div>
          )}

          {job.status === "proof" && (
            <div className="flex gap-2">
              <button onClick={() => onPaid()} disabled={busy}
                className="flex-1 border-none font-extrabold text-xs rounded-xl px-3 py-2.5 cursor-pointer bg-[#0e9f6e] text-white disabled:opacity-50">{busy ? "..." : "💰 Mark paid"}</button>
              <button onClick={() => onPaid(true)} disabled={busy}
                className="flex-1 border-none font-extrabold text-xs rounded-xl px-3 py-2.5 cursor-pointer bg-[#d9a441] text-white disabled:opacity-50">{busy ? "..." : "💵 Paid cash"}</button>
            </div>
          )}
        </div>

        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } } .animate-slide-up { animation: slideUp 0.25s ease-out; }`}</style>
      </div>
    </div>
  );
}