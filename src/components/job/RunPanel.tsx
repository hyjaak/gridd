"use client";

import { useState } from "react";
import { PHONE, SMS_HREF, REVIEW_URL } from "@/lib/constants";
import type { DispatchJob } from "@/types/dispatch";

const TIP_CHIPS = [5, 10, 20];

export function TipRow({ job, onTip }: { job: DispatchJob; onTip: (amt: number) => void }) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async (amt: number) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/tip", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, amount: amt }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      onTip(amt);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save tip");
    } finally {
      setBusy(false);
    }
  };

  const customAmt = Number(custom);
  const customValid = customAmt >= 1 && customAmt <= 200;

  return (
    <div className="bg-white border border-[rgba(16,22,19,0.09)] rounded-2xl p-4 text-left">
      <div className="text-[13px] font-extrabold text-[#101613] mb-2">Add a tip for Ibrahim?</div>
      <div className="flex gap-2 flex-wrap">
        {TIP_CHIPS.map((c) => (
          <button key={c} onClick={() => send(c)} disabled={busy}
            className="border-none font-extrabold text-[12px] rounded-full px-4 py-2 bg-[#0e9f6e] text-white cursor-pointer disabled:opacity-50">${c}</button>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-extrabold text-[#5c6a62]">$</span>
          <input type="number" min="1" max="200" value={custom} onChange={(e) => setCustom(e.target.value)}
            placeholder="Custom" className="w-20 border border-[rgba(16,22,19,0.09)] rounded-full px-3 py-2 text-[12px] bg-[#eef3ef] focus:outline-none focus:border-[#0e9f6e]" />
          {customValid && (
            <button onClick={() => send(customAmt)} disabled={busy}
              className="border-none font-extrabold text-[12px] rounded-full px-4 py-2 bg-[#101613] text-white cursor-pointer disabled:opacity-50">{busy ? "…" : "Add"}</button>
          )}
        </div>
        <button onClick={() => send(0)} disabled={busy}
          className="border-none font-extrabold text-[12px] rounded-full px-4 py-2 bg-transparent text-[#5c6a62] border border-[rgba(16,22,19,0.09)] cursor-pointer disabled:opacity-50">No tip</button>
      </div>
      {err && <div className="text-[11px] text-[#c0392b] font-semibold mt-1.5">{err}</div>}
    </div>
  );
}

export function RatingRow({ job, onRated }: { job: DispatchJob; onRated: (r: number) => void }) {
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rating = job.rating;
  const rated = rating != null;

  const submit = async (r: number) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/rate-job", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, rating: r, comment }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      onRated(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save rating");
    } finally {
      setBusy(false);
    }
  };

  if (rated) {
    return (
      <div className="bg-white border border-[rgba(16,22,19,0.09)] rounded-2xl p-4 text-left">
        <div className="text-[13px] font-extrabold text-[#101613] mb-1">Thanks for the {rating}★</div>
        {rating >= 4 && (
          <a href={REVIEW_URL} target="_blank" rel="noopener noreferrer"
            className="inline-block text-[12px] font-extrabold text-[#0e9f6e] no-underline hover:underline">Tell Dayton on Google ⭐</a>
        )}
        {rating <= 3 && (
          <a href={SMS_HREF} className="inline-block text-[12px] font-extrabold text-[#0e9f6e] no-underline hover:underline">Tell Ibrahim directly</a>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-[rgba(16,22,19,0.09)] rounded-2xl p-4 text-left">
      <div className="text-[13px] font-extrabold text-[#101613] mb-2">How'd we do?</div>
      <div className="flex gap-1 mb-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => submit(n)} disabled={busy}
            onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            className="text-[26px] bg-transparent border-none cursor-pointer disabled:opacity-50">
            <span className={n <= (hover || 0) ? "opacity-100" : "opacity-40"}>★</span>
          </button>
        ))}
      </div>
      <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="One line (optional)"
        className="w-full border border-[rgba(16,22,19,0.09)] rounded-xl px-3 py-2 text-[12px] bg-[#eef3ef] focus:outline-none focus:border-[#0e9f6e]" />
      {err && <div className="text-[11px] text-[#c0392b] font-semibold mt-1.5">{err}</div>}
    </div>
  );
}

export function AfterParty({ job }: { job: DispatchJob }) {
  return (
    <div className="space-y-3">
      <a href={`/?rebook=${job.id}`}
        className="block w-full text-center bg-[#101613] text-white font-bold text-[14px] py-3 rounded-full no-underline hover:bg-[#1a1a1a] transition-colors">
        Run it back
      </a>
      <a href="/api/vcard"
        className="block w-full text-center bg-white border border-[rgba(16,22,19,0.09)] text-[#101613] font-bold text-[14px] py-3 rounded-full no-underline hover:bg-[#eef3ef] transition-colors">
        Save GRIDD to contacts
      </a>
      <p className="text-[12px] text-[#5c6a62] font-semibold text-center">Questions? Text or call {PHONE}</p>
    </div>
  );
}