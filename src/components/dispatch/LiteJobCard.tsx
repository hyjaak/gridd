"use client";

import { useState, useRef } from "react";
import { firebaseAuth } from "@/lib/firebase";
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

function addrStr(a: { street?: string; city: string } | undefined): string {
  if (!a) return "—";
  return a.street ? `${a.street}, ${a.city}` : a.city;
}

export default function LiteJobCard({ job, quotePrice, onQuoteChange, onSendQuote, onAdvance, onPhotoUpload, onPaid, onOpenSheet, quotingId, uploadingId }: {
  job: DispatchJob; quotePrice: string;
  onQuoteChange: (v: string) => void; onSendQuote: () => void;
  onAdvance: (s: string, e?: Record<string, unknown>) => void;
  onPhotoUpload: (f: File) => void; onPaid: (c?: boolean) => void;
  onOpenSheet?: () => void;
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

  const copyQuote = async () => {
    const text = `GRIDD quote: $${job.quoteAmount?.toFixed(2)} flat — locked, not an estimate. See your job & book: https://gridd.click/j/${job.id}`;
    try { await navigator.clipboard.writeText(text); setCopiedQuote(true); setTimeout(() => setCopiedQuote(false), 2000); } catch {}
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`https://gridd.click/j/${job.id}`); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); } catch {}
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, a, select, textarea")) return;
    onOpenSheet?.();
  };

  const name = job.contactName || "Unknown";
  const pickup = job.pickupAddress;
  const dropoff = job.dropoffAddress;
  const notes = [pickup?.notes, dropoff?.notes].filter(Boolean);

  return (
    <div onClick={handleCardClick} className="bg-white border border-[rgba(16,22,19,0.09)] rounded-[18px] p-[15px_15px_13px] shadow-[0_10px_30px_rgba(16,22,19,0.06)] cursor-pointer transition-shadow duration-200 hover:shadow-[0_10px_30px_rgba(16,22,19,0.1)]">
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className="font-extrabold text-[14px] truncate max-w-[140px]">{name}</span>
        {job.customerPhone && (
          <a href={`tel:${job.customerPhone}`} className="text-[11px] text-[#0e9f6e] font-bold no-underline hover:underline shrink-0">{job.customerPhone}</a>
        )}
        {job.market && <span className="text-[9.5px] font-extrabold rounded-md px-1.5 py-0.5 bg-[#101613] text-white">{job.market}</span>}
        <span className="text-[9.5px] font-extrabold rounded-md px-1.5 py-0.5 bg-[#d9a441] text-white ml-auto">{STATUS_LABEL[job.status] || job.status}</span>
        {job.status === "request" && (
          <button onClick={copyLink} title="Copy job link"
            className="text-[11px] font-extrabold bg-transparent border-none cursor-pointer text-[#0e9f6e] hover:text-[#0a7a54] p-0.5">
            {copiedLink ? "✓" : "🔗"}
          </button>
        )}
      </div>

      <div className="text-[12.5px] text-[#5c6a62] font-semibold mb-1 leading-snug">
        {job.jobType} · {addrStr(pickup)}<span className="text-[#0e9f6e] mx-1">→</span>{addrStr(dropoff)}
      </div>

      <div className="flex items-center gap-2 mb-1.5">
        {job.timeWindow && <span className="text-[10.5px] font-bold rounded-md px-1.5 py-0.5 bg-[#eef3ef] text-[#5c6a62]">{job.timeWindow}</span>}
        <span className="text-[10.5px] text-[#8fa096] font-semibold">{relTime(job.createdAt)}</span>
      </div>

      <p className="text-[12.5px] text-[#5c6a62] leading-relaxed mb-1.5">{job.description}</p>

      {notes.length > 0 && notes.map((n, i) => n ? (
        <div key={i} className="text-[11px] text-[#d9a441] font-semibold mb-0.5">⚠ {n}</div>
      ) : null)}

      {job.itemPhotoUrl && (
        <a href={job.itemPhotoUrl} target="_blank" rel="noopener noreferrer"
          className="inline-block w-16 h-16 rounded-lg overflow-hidden border border-[rgba(16,22,19,0.09)] mb-2">
          <img src={job.itemPhotoUrl} alt="" className="w-full h-full object-cover" />
        </a>
      )}

      {(job.estPrice || job.estMiles) && (
        <div className="text-[11px] text-[#5c6a62] font-semibold mb-2">
          ≈ ${job.estPrice} suggested{job.estMiles ? ` · ${job.estMiles} mi` : ""}
        </div>
      )}

      {job.quoteAmount != null && (
        <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[19px] text-[#0e9f6e] mb-2">
          ${job.quoteAmount.toFixed(2)}
        </div>
      )}

      {/* Customer counter-offer banner */}
      {job.status === "quoted" && job.offerBy === "customer" && (
        <div className="bg-[#d9a441]/20 border border-[#d9a441] rounded-xl p-2.5 mb-2">
          <div className="text-[12px] font-extrabold text-[#d9a441]">COUNTER: ${job.offerAmount?.toFixed(2)}</div>
          <div className="text-[10.5px] text-[#5c6a62] font-semibold mt-0.5 mb-1.5">
            {job.offerLog?.map((e, i) => <span key={i}>{i > 0 && " → "}${e.amount}</span>)}
          </div>
          <div className="flex gap-1.5 mt-1.5">
            <button onClick={() => doAdvance("accepted", { agreedAmount: job.offerAmount, acceptedAt: new Date().toISOString() })} disabled={busy}
              className="flex-1 border-none font-extrabold text-[10.5px] rounded-lg px-2 py-1.5 cursor-pointer bg-[#0e9f6e] text-white disabled:opacity-50">✅ Accept ${job.offerAmount?.toFixed(2)}</button>
            <button onClick={() => {
              const mid = Math.round(((job.quoteAmount ?? 0) + (job.offerAmount ?? job.quoteAmount ?? 0)) / 2 / 5) * 5;
              setCounterAmt(String(mid));
            }} disabled={busy}
              className="border-none font-extrabold text-[10.5px] rounded-lg px-2 py-1.5 cursor-pointer bg-[#101613] text-white">↩ Counter</button>
            <button onClick={() => doAdvance("quoted", { offerAmount: job.quoteAmount, offerBy: "owner" })}
              className="border-none font-extrabold text-[10.5px] rounded-lg px-2 py-1.5 cursor-pointer bg-transparent text-[#5c6a62] border border-[rgba(16,22,19,0.09)]">✋ Hold</button>
          </div>
          {counterAmt && (
            <div className="flex gap-1.5 mt-1.5">
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#5c6a62] text-[11px] font-extrabold">$</span>
                <input type="number" value={counterAmt} onChange={(e) => setCounterAmt(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-[11.5px] bg-white pl-5 focus:outline-none focus:border-[#0e9f6e]" />
              </div>
              <button onClick={handleCounter} disabled={countering}
                className="border-none font-extrabold text-[10.5px] rounded-lg px-3 py-1.5 cursor-pointer bg-[#0e9f6e] text-white">{countering ? "..." : "Send"}</button>
            </div>
          )}
        </div>
      )}

      {/* NEW */}
      {job.status === "request" && (
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5c6a62] text-[13.5px] font-extrabold">$</span>
            <input type="number" step="0.01" min="1" placeholder={String(job.estPrice ?? "0")}
              value={quotePrice} onChange={(e) => onQuoteChange(e.target.value)}
              className="w-full border-2 border-[rgba(16,22,19,0.09)] rounded-xl px-2.5 py-2.5 text-sm text-[#101613] bg-[#eef3ef] focus:outline-none focus:border-[#0e9f6e] focus:bg-white transition-colors pl-6" />
          </div>
          <button onClick={onSendQuote} disabled={busy || !quotePrice.trim()}
            className="border-none font-inherit font-extrabold text-sm rounded-xl px-4 py-2.5 cursor-pointer bg-[#0e9f6e] text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-200">
            {quotingId === job.id ? "..." : "Send"}
          </button>
          <button onClick={() => { if (confirm("Decline this request?")) doAdvance("declined"); }}
            className="border-none font-inherit font-extrabold text-[11.5px] px-1 py-1.5 cursor-pointer bg-transparent text-[#5c6a62] hover:text-[#c0392b] transition-colors duration-200">
            Decline
          </button>
        </div>
      )}

      {/* QUOTED (no customer counter) */}
      {job.status === "quoted" && job.offerBy !== "customer" && (
        <div className="flex flex-col gap-1.5 mb-2">
          <div className="text-[12px] text-[#5c6a62] font-semibold">${job.quoteAmount?.toFixed(2)} · waiting on YES</div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={onSendQuote} disabled={busy}
              className="border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2 cursor-pointer bg-[#101613] text-white disabled:opacity-50 transition-opacity duration-200">
              {quotingId === job.id ? "..." : "Resend"}
            </button>
            <button onClick={() => doAdvance("accepted", { agreedAmount: job.quoteAmount, acceptedAt: new Date().toISOString() })}
              className="border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2 cursor-pointer bg-[#0e9f6e] text-white">
              Mark accepted
            </button>
            <button onClick={copyQuote} title="Copy quote text"
              className="border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2 cursor-pointer bg-[#5c6a62] text-white">
              {copiedQuote ? "✓ Copied" : "📋 Copy quote"}
            </button>
          </div>
        </div>
      )}

      {/* ACCEPTED / ASSIGNED */}
      {["accepted", "assigned"].includes(job.status) && (
        <button onClick={() => doAdvance("pickup")} disabled={busy}
          className="w-full border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2.5 cursor-pointer bg-[#101613] text-white disabled:opacity-50 transition-opacity duration-200">
          {busy ? "..." : "📌 Arrived at pickup"}
        </button>
      )}

      {/* PICKUP */}
      {job.status === "pickup" && (
        <button onClick={() => doAdvance("in_progress")} disabled={busy}
          className="w-full border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2.5 cursor-pointer bg-[#101613] text-white disabled:opacity-50 transition-opacity duration-200">
          {busy ? "..." : "🚚 Loaded — rolling"}
        </button>
      )}

      {/* IN_PROGRESS */}
      {job.status === "in_progress" && (
        <div className="flex flex-col gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="w-full border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2.5 cursor-pointer bg-[#101613] text-white disabled:opacity-50 transition-opacity duration-200">
            {uploadingId === job.id ? "📸 Uploading..." : "📸 Arrived — take photo"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
        </div>
      )}

      {/* PROOF */}
      {job.status === "proof" && (
        <div className="flex gap-2">
          <button onClick={() => onPaid()} disabled={busy}
            className="flex-1 border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2.5 cursor-pointer bg-[#0e9f6e] text-white disabled:opacity-50 transition-opacity duration-200">
            {busy ? "..." : "💰 Mark paid"}
          </button>
          <button onClick={() => onPaid(true)} disabled={busy}
            className="flex-1 border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2.5 cursor-pointer bg-[#d9a441] text-white disabled:opacity-50 transition-opacity duration-200">
            {busy ? "..." : "💵 Paid cash"}
          </button>
        </div>
      )}
    </div>
  );
}