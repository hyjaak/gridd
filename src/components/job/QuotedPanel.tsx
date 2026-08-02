"use client";

import type { DispatchJob } from "@/types/dispatch";

export default function QuotedPanel({ job, accepting, accepted, offerAmount, offerSending, offerSent, onAccept, onOfferChange, onSendOffer, onShowOfferInput }: {
  job: DispatchJob;
  accepting: boolean; accepted: boolean;
  offerAmount: string; offerSending: boolean; offerSent: boolean;
  onAccept: () => void; onOfferChange: (v: string) => void;
  onSendOffer: () => void; onShowOfferInput: () => void;
}) {
  const standing = job.offerAmount ?? job.quoteAmount;
  const standingBy = job.offerBy === "customer" ? "Your offer" : "Ibrahim's price";
  const log = job.offerLog ?? [];

  return (
    <div className="text-center">
      <div className="w-16 h-16 rounded-full bg-[#0e9f6e] text-white text-[28px] font-extrabold flex items-center justify-center mx-auto mb-4">$</div>
      <h1 className="text-[48px] font-[800] font-bricolage text-[#0e9f6e] mb-1">${standing?.toFixed(2)}</h1>
      <p className="text-[14px] text-[#5c6a62] font-semibold mb-2">{standingBy}</p>
      {job.offerBy === "customer" && (
        <p className="text-[14px] text-[#d9a441] font-bold mb-4 animate-pulse">Waiting on Ibrahim…</p>
      )}
      <div className="flex items-center gap-1 justify-center mb-6">
        {["Quoted", "Booked", "Rolling", "Photo", "Paid"].map((step, i) => (
          <div key={step} className="flex items-center gap-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold ${i === 0 ? "bg-[#0e9f6e] text-white animate-pulse" : "bg-[#d9d9d9] text-[#5c6a62]"}`}>{i === 0 ? "$" : i + 1}</div>
            {i < 4 && <div className="w-4 h-0.5 bg-[#d9d9d9]" />}
          </div>
        ))}
      </div>
      {job.offerBy === "customer" ? (
        <div key={job.offerLog?.length ?? 0}
          className="w-full bg-[#d9a441]/15 border border-[#d9a441] font-bold text-[17px] py-4 rounded-full mb-3 flex items-center justify-center gap-2 animate-pulse">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#d9a441] animate-ping" />
          <span>Waiting on Ibrahim…</span>
        </div>
      ) : (
        <button onClick={onAccept} disabled={accepting || accepted}
          className="w-full bg-[#0e9f6e] text-white font-bold text-[17px] py-4 rounded-full shadow-[0_12px_26px_rgba(14,159,110,.32)] hover:bg-[#0a7a54] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer border-none mb-3">
          {accepting ? "Booking..." : accepted ? "Booked ✓" : `YES — book it for $${standing?.toFixed(2)}`}
        </button>
      )}
      {accepted && <p className="text-[#0e9f6e] text-[14px] font-bold mb-3">We'll roll soon — watch your phone.</p>}
      {job.offerBy === "owner" && (job.offerLog?.length ?? 0) > 0 && (
        <div className="w-full bg-[#0e9f6e]/10 border border-[#0e9f6e]/40 rounded-2xl py-3 px-4 mb-3 animate-counter-in">
          <div className="text-[15px] font-extrabold text-[#0e9f6e]">Ibrahim countered: ${job.offerAmount?.toFixed(2)}</div>
          <div className="text-[12px] text-[#5c6a62] font-semibold mt-0.5">Your move — book it or offer another price.</div>
        </div>
      )}
      {!offerSent && (
        <div className="flex flex-col gap-2">
          <button onClick={onShowOfferInput}
            className="text-[13px] font-extrabold text-[#5c6a62] bg-transparent border-none cursor-pointer hover:text-[#101613] transition-colors">Offer a different price</button>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5c6a62] text-[14px] font-extrabold">$</span>
              <input type="number" step="5" min="20" max="500" value={offerAmount}
                onChange={(e) => onOfferChange(e.target.value)} placeholder="20–500"
                className="w-full border-2 border-[rgba(16,22,19,0.09)] rounded-xl px-3 py-3 text-[14px] bg-white focus:outline-none focus:border-[#0e9f6e] pl-7" />
            </div>
            <button onClick={onSendOffer} disabled={offerSending || !offerAmount.trim()}
              className="border-none font-inherit font-extrabold text-sm rounded-xl px-5 py-3 cursor-pointer bg-[#101613] text-white disabled:opacity-50">
              {offerSending ? "..." : "Send offer"}
            </button>
          </div>
        </div>
      )}
      {offerSent && <p className="text-[13px] text-[#0e9f6e] font-bold mt-2">Offer sent — Ibrahim sees it instantly.</p>}
      {log.length > 0 && (
        <div className="mt-4 text-[12px] text-[#5c6a62] font-semibold">
          {log.map((e, i) => <span key={i}>{i > 0 && " → "}${e.amount}</span>)}
        </div>
      )}
      <div className="mt-6 bg-white border border-[rgba(16,22,19,0.09)] rounded-2xl p-5 text-left">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0e9f6e] to-[#0a7a54] flex items-center justify-center text-white text-[18px] font-extrabold">I</div>
          <div><div className="font-extrabold text-[14px]">Ibrahim — owner, operator</div><div className="text-[12px] text-[#5c6a62]">The person who prices it is the person who shows up.</div></div>
        </div>
        <div className="space-y-1.5 text-[13px] text-[#5c6a62]">
          {["Flat price locked — not an estimate", "Pay after it's done — card, tap, or cash", "Photo proof sent to your phone"].map((p, i) => (
            <div key={i} className="flex items-center gap-2"><span className="text-[#0e9f6e] font-bold">✓</span>{p}</div>
          ))}
        </div>
      </div>
    </div>
  );
}