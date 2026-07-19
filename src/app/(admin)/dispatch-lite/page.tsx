"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CEO_UID } from "@/lib/constants";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { DispatchJob } from "@/types/dispatch";

const STATUS_LABEL: Record<string, string> = {
  request: "NEW", quoted: "QUOTED", accepted: "BOOKED", assigned: "BOOKED",
  pickup: "PICKUP", in_progress: "EN ROUTE", proof: "PHOTO", paid: "PAID",
};

function todayStart(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

function isToday(ts: { seconds?: number; toMillis?: () => number } | null | undefined): boolean {
  if (!ts) return false;
  const t = ts.seconds ? ts.seconds * 1000 : (ts.toMillis?.() ?? 0);
  return t >= todayStart() && t < todayStart() + 86_400_000;
}

export default function DispatchLitePage() {
  const router = useRouter();
  const { loading, ok, user, role } = useRequireAuth(["ceo"], { redirectTo: undefined });
  const [jobs, setJobs] = useState<DispatchJob[]>([]);
  const [quotePrices, setQuotePrices] = useState<Record<string, string>>({});
  const [quotingId, setQuotingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const jobsRef = useRef<DispatchJob[]>([]);

  useEffect(() => {
    if (!ok || user?.uid !== CEO_UID) return;
    const q = query(collection(db, "dispatchJobs"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: DispatchJob[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as DispatchJob));
      jobsRef.current = list;
      setJobs(list);
    }, (err) => {
      console.error("dispatchJobs snapshot error:", err);
      setError("Failed to load jobs — check connection");
    });
    return unsub;
  }, [ok, user?.uid]);

  const handleSendQuote = async (jobId: string) => {
    const price = quotePrices[jobId]?.trim();
    if (!price || isNaN(Number(price))) return;
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    setQuotingId(jobId);
    setError(null);
    try {
      const res = await fetch("/api/send-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, amount: Number(price), phone: job.customerPhone }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send quote");
      }
      await updateDoc(doc(db, "dispatchJobs", jobId), {
        status: "quoted",
        quoteAmount: Number(price),
        quotedAt: serverTimestamp(),
      });
      setQuotePrices((prev) => ({ ...prev, [jobId]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send quote");
    } finally {
      setQuotingId(null);
    }
  };

  const handleAdvance = async (jobId: string, nextStatus: string) => {
    try {
      const extra: Record<string, unknown> = {};
      if (nextStatus === "paid") extra.paidAt = new Date().toISOString();
      await updateDoc(doc(db, "dispatchJobs", jobId), { status: nextStatus, ...extra });
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const handleDecline = async (jobId: string) => {
    try {
      await updateDoc(doc(db, "dispatchJobs", jobId), { status: "declined" });
    } catch {
      setToast("Failed to decline");
    }
  };

  if (loading) return <LoadingScreen />;
  if (!user) {
    return (
      <main className="min-h-screen bg-[#101613] flex flex-col items-center justify-center px-6">
        <div className="text-center">
          <div className="text-[48px] font-[800] font-bricolage text-[#0e9f6e] mb-4">gridd</div>
          <h1 className="text-white text-[24px] font-bold mb-2">Owner sign-in</h1>
          <p className="text-[#9db3a8] text-[14px] mb-6">Sign in to access the dispatch board</p>
          <button onClick={() => router.replace("/login?next=/dispatch-lite")}
            className="bg-[#0e9f6e] text-white font-bold text-[16px] px-8 py-3 rounded-full hover:bg-[#0a7a54] transition-colors cursor-pointer border-none">
            Sign in
          </button>
        </div>
      </main>
    );
  }
  if (user?.uid !== CEO_UID) { router.replace("/"); return <LoadingScreen />; }

  const newReqs = jobs.filter((j) => j.status === "request");
  const active = jobs.filter((j) => ["quoted","accepted","assigned","pickup","in_progress","proof"].includes(j.status));
  const doneToday = jobs.filter((j) => j.status === "paid" && isToday(j.paidAt));

  return (
    <main className="min-h-screen bg-[#eef3ef] font-['Inter',sans-serif] text-[#101613]">
      <header className="sticky top-0 z-20 bg-[rgba(238,243,239,0.92)] backdrop-blur border-b border-[rgba(16,22,19,0.09)] px-[4vw] py-3 flex items-center justify-between">
        <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[22px] text-[#0e9f6e]">gridd</div>
        <div className="flex items-center gap-3 text-[12px] font-extrabold text-[#5c6a62]">
          <span>${doneToday.reduce((s,j)=>s+(j.quoteAmount??0),0)} today</span>
          <span>{doneToday.length} runs</span>
          <span>{newReqs.length} waiting</span>
        </div>
      </header>

      {error && <div className="mx-[4vw] mt-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#101613] text-white px-5 py-3 rounded-full text-sm font-semibold">
          {toast}
          <button onClick={() => setToast(null)} className="ml-3 text-[#8fa096] hover:text-white">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 pb-10 max-w-[1400px] mx-auto">
        {/* New Requests */}
        <div>
          <h2 className="text-[12.5px] font-extrabold tracking-widest uppercase text-[#5c6a62] mb-3">New requests ({newReqs.length})</h2>
          <div className="space-y-3">
            {newReqs.length === 0 && <p className="text-[#5c6a62] text-[13px] font-semibold italic">No new requests.</p>}
            {newReqs.map((job) => (
              <JobRow key={job.id} job={job} quotePrice={quotePrices[job.id]??""}
                onQuoteChange={(v)=>setQuotePrices((p)=>({...p,[job.id]:v}))}
                onSendQuote={()=>handleSendQuote(job.id)} onDecline={()=>handleDecline(job.id)}
                onAdvance={(s)=>handleAdvance(job.id,s)} quotingId={quotingId} />
            ))}
          </div>
        </div>

        {/* Active */}
        <div>
          <h2 className="text-[12.5px] font-extrabold tracking-widest uppercase text-[#5c6a62] mb-3">Active ({active.length})</h2>
          <div className="space-y-3">
            {active.length === 0 && <p className="text-[#5c6a62] text-[13px] font-semibold italic">Nothing in motion.</p>}
            {active.map((job) => (
              <JobRow key={job.id} job={job} quotePrice={quotePrices[job.id]??""}
                onQuoteChange={(v)=>setQuotePrices((p)=>({...p,[job.id]:v}))}
                onSendQuote={()=>handleSendQuote(job.id)} onDecline={()=>handleDecline(job.id)}
                onAdvance={(s)=>handleAdvance(job.id,s)} quotingId={quotingId} />
            ))}
          </div>
        </div>

        {/* Done Today */}
        <div>
          <h2 className="text-[12.5px] font-extrabold tracking-widest uppercase text-[#5c6a62] mb-3">Done today ({doneToday.length})</h2>
          <div className="space-y-3">
            {doneToday.length === 0 && <p className="text-[#5c6a62] text-[13px] font-semibold italic">Nothing banked yet.</p>}
            {doneToday.map((job) => (
              <JobRow key={job.id} job={job} quotePrice={quotePrices[job.id]??""}
                onQuoteChange={(v)=>setQuotePrices((p)=>({...p,[job.id]:v}))}
                onSendQuote={()=>handleSendQuote(job.id)} onDecline={()=>handleDecline(job.id)}
                onAdvance={(s)=>handleAdvance(job.id,s)} quotingId={quotingId} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

/* ── Single job row — plain div, zero animations ── */
function JobRow({ job, quotePrice, onQuoteChange, onSendQuote, onDecline, onAdvance, quotingId }: {
  job: DispatchJob; quotePrice: string;
  onQuoteChange: (v: string) => void; onSendQuote: () => void; onDecline: () => void;
  onAdvance: (s: string) => void; quotingId: string | null;
}) {
  const [advancing, setAdvancing] = useState(false);

  const handleAdvance = async (next: string) => {
    setAdvancing(true);
    try { await onAdvance(next); } finally { setAdvancing(false); }
  };

  return (
    <div className="bg-white border border-[rgba(16,22,19,0.09)] rounded-[18px] p-[15px_15px_13px] shadow-[0_10px_30px_rgba(16,22,19,0.06)]">
      <div className="flex justify-between items-center gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <a href={`tel:${job.customerPhone}`} className="font-extrabold text-[15px] text-[#101613] no-underline hover:underline">
            {job.contactName || "Unknown"}
          </a>
          {job.customerPhone && (
            <a href={`tel:${job.customerPhone}`} className="text-[11px] text-[#0e9f6e] font-bold no-underline">📞</a>
          )}
        </div>
        <span className="text-[9.5px] font-extrabold rounded-md px-1.5 py-0.5 bg-[#101613] text-white">
          {STATUS_LABEL[job.status] || job.status}
        </span>
      </div>

      <div className="text-[12.5px] text-[#5c6a62] font-semibold mb-1">
        {job.jobType} · {job.pickupAddress.city} → {job.dropoffAddress.city}
      </div>

      <p className="text-[12px] text-[#5c6a62] leading-relaxed line-clamp-2 mb-2">{job.description}</p>

      {job.quoteAmount != null && (
        <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[19px] text-[#0e9f6e] mb-2">
          ${job.quoteAmount.toFixed(2)}
        </div>
      )}

      {/* New request: quote input + send */}
      {job.status === "request" && (
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5c6a62] text-[13.5px] font-extrabold">$</span>
            <input type="number" step="0.01" min="1" placeholder={job.estPrice ? String(job.estPrice) : "0"}
              value={quotePrice} onChange={(e) => onQuoteChange(e.target.value)}
              className="w-full border-2 border-[rgba(16,22,19,0.09)] rounded-xl px-2.5 py-2.5 text-sm text-[#101613] bg-[#eef3ef] focus:outline-none focus:border-[#0e9f6e] focus:bg-white transition-colors pl-6" />
          </div>
          <button onClick={onSendQuote} disabled={quotingId === job.id || !quotePrice.trim()}
            className="border-none font-inherit font-extrabold text-sm rounded-xl px-4 py-2.5 cursor-pointer bg-[#0e9f6e] text-white disabled:opacity-50 disabled:cursor-not-allowed">
            {quotingId === job.id ? "Sending..." : "Send quote"}
          </button>
        </div>
      )}

      {/* Status advance buttons */}
      <div className="flex gap-2 flex-wrap mt-2">
        {job.status === "request" && (
          <button onClick={onDecline} className="border-none font-inherit font-extrabold text-[11.5px] px-1 py-1.5 cursor-pointer bg-transparent text-[#5c6a62] hover:text-[#c0392b]">Decline</button>
        )}
        {["accepted","assigned"].includes(job.status) && (
          <button onClick={() => handleAdvance("pickup")} disabled={advancing}
            className="border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2 cursor-pointer bg-[#101613] text-white disabled:opacity-50">
            {advancing ? "..." : "📌 Arrived at pickup"}
          </button>
        )}
        {job.status === "pickup" && (
          <button onClick={() => handleAdvance("in_progress")} disabled={advancing}
            className="border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2 cursor-pointer bg-[#101613] text-white disabled:opacity-50">
            {advancing ? "..." : "🚚 Loaded — rolling"}
          </button>
        )}
        {job.status === "in_progress" && (
          <button onClick={() => handleAdvance("proof")} disabled={advancing}
            className="border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2 cursor-pointer bg-[#101613] text-white disabled:opacity-50">
            {advancing ? "..." : "📸 Arrived — mark proof"}
          </button>
        )}
        {job.status === "proof" && (
          <button onClick={() => handleAdvance("paid")} disabled={advancing}
            className="border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2 cursor-pointer bg-[#0e9f6e] text-white disabled:opacity-50">
            {advancing ? "..." : "💰 Mark paid"}
          </button>
        )}
      </div>
    </div>
  );
}