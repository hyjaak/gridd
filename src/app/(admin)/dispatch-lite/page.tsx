"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
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

function isToday(ts: any): boolean {
  if (!ts) return false;
  const t = ts.seconds ? ts.seconds * 1000 : (ts.toMillis?.() ?? 0);
  return t >= todayStart() && t < todayStart() + 86_400_000;
}

function relTime(ts: any): string {
  if (!ts) return "";
  const t = ts.seconds ? ts.seconds * 1000 : (ts.toMillis?.() ?? 0);
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtTime(ts: any): string {
  if (!ts) return "";
  const t = ts.seconds ? ts.seconds * 1000 : (ts.toMillis?.() ?? 0);
  return new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function addrStr(a: { street?: string; city: string } | undefined): string {
  if (!a) return "—";
  return a.street ? `${a.street}, ${a.city}` : a.city;
}

export default function DispatchLitePage() {
  const router = useRouter();
  const { loading, ok, user } = useRequireAuth(["ceo"], { redirectTo: undefined });
  const [jobs, setJobs] = useState<DispatchJob[]>([]);
  const [quotePrices, setQuotePrices] = useState<Record<string, string>>({});
  const [quotingId, setQuotingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
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

  const optimisticUpdate = useCallback((jobId: string, patch: Partial<DispatchJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...patch } : j)));
  }, []);

  const rollback = useCallback(() => setJobs(jobsRef.current), []);

  const handleSendQuote = async (jobId: string) => {
    const price = quotePrices[jobId]?.trim();
    if (!price || isNaN(Number(price))) return;
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    setQuotingId(jobId);
    setError(null);
    optimisticUpdate(jobId, { status: "quoted", quoteAmount: Number(price) });
    try {
      const res = await fetch("/api/send-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, amount: Number(price), phone: job.customerPhone }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      await updateDoc(doc(db, "dispatchJobs", jobId), { status: "quoted", quoteAmount: Number(price), quotedAt: serverTimestamp() });
      setQuotePrices((p) => ({ ...p, [jobId]: "" }));
    } catch (e) {
      rollback();
      setError(e instanceof Error ? e.message : "Failed to send quote");
    } finally {
      setQuotingId(null);
    }
  };

  const handleAdvance = async (jobId: string, nextStatus: string, extra?: Record<string, unknown>) => {
    optimisticUpdate(jobId, { status: nextStatus as any, ...extra } as any);
    try {
      await updateDoc(doc(db, "dispatchJobs", jobId), { status: nextStatus, ...extra });
    } catch (e) {
      rollback();
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const handlePhotoUpload = async (jobId: string, file: File) => {
    setUploadingId(jobId);
    setError(null);
    try {
      const storageRef = ref(storage, `proof/${jobId}.jpg`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await handleAdvance(jobId, "proof", { proofPhotoUrl: url });
    } catch (e) {
      // Still advance even if photo fails
      await handleAdvance(jobId, "proof", {});
      setError("Photo upload failed — tap to retry");
    } finally {
      setUploadingId(null);
    }
  };

  const handlePaid = async (jobId: string, cash?: boolean) => {
    await handleAdvance(jobId, "paid", {
      paidAt: new Date().toISOString(),
      ...(cash ? { paymentMethod: "cash" } : {}),
    });
  };

  if (loading) return <LoadingScreen />;
  if (!user) {
    return (
      <main className="min-h-screen bg-[#eef3ef] flex flex-col items-center justify-center px-6">
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
  const active = jobs.filter((j) => ["quoted", "accepted", "assigned", "pickup", "in_progress", "proof"].includes(j.status));
  const doneToday = jobs.filter((j) => j.status === "paid" && isToday(j.paidAt));
  const open = jobs.filter((j) => !["paid", "declined", "cancelled"].includes(j.status));
  const todayTotal = doneToday.reduce((s, j) => s + (j.quoteAmount ?? 0), 0);

  return (
    <main className="min-h-screen bg-[#eef3ef] font-['Inter',sans-serif] text-[#101613]">
      <header className="sticky top-0 z-20 bg-[rgba(238,243,239,0.92)] backdrop-blur border-b border-[rgba(16,22,19,0.09)] px-[4vw] py-3 flex items-center justify-between">
        <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[22px] text-[#0e9f6e]">gridd</div>
        <div className="flex items-center gap-4 text-[13px] font-extrabold text-[#5c6a62]">
          <span>${todayTotal.toFixed(0)} <span className="text-[10px] font-bold">today</span></span>
          <span>{doneToday.length} <span className="text-[10px] font-bold">runs</span></span>
          <span>{newReqs.length} <span className="text-[10px] font-bold">waiting</span></span>
          <span>{open.length} <span className="text-[10px] font-bold">open</span></span>
        </div>
      </header>

      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#101613] text-white px-5 py-3 rounded-full text-sm font-semibold shadow-lg">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-[#8fa096] hover:text-white">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 pb-10 max-w-[1400px] mx-auto">
        <Column title="New requests" count={newReqs.length}>
          {newReqs.length === 0 && <Empty>No new requests.</Empty>}
          {newReqs.map((job) => (
            <JobCard key={job.id} job={job}
              quotePrice={quotePrices[job.id] ?? ""}
              onQuoteChange={(v) => setQuotePrices((p) => ({ ...p, [job.id]: v }))}
              onSendQuote={() => handleSendQuote(job.id)}
              onAdvance={(s, e) => handleAdvance(job.id, s, e)}
              onPhotoUpload={(f) => handlePhotoUpload(job.id, f)}
              onPaid={(c) => handlePaid(job.id, c)}
              quotingId={quotingId} uploadingId={uploadingId} />
          ))}
        </Column>
        <Column title="Active" count={active.length}>
          {active.length === 0 && <Empty>Nothing in motion.</Empty>}
          {active.map((job) => (
            <JobCard key={job.id} job={job}
              quotePrice={quotePrices[job.id] ?? ""}
              onQuoteChange={(v) => setQuotePrices((p) => ({ ...p, [job.id]: v }))}
              onSendQuote={() => handleSendQuote(job.id)}
              onAdvance={(s, e) => handleAdvance(job.id, s, e)}
              onPhotoUpload={(f) => handlePhotoUpload(job.id, f)}
              onPaid={(c) => handlePaid(job.id, c)}
              quotingId={quotingId} uploadingId={uploadingId} />
          ))}
        </Column>
        <Column title="Done today" count={doneToday.length}>
          {doneToday.length === 0 && <Empty>Nothing banked yet.</Empty>}
          {doneToday.map((job) => (
            <div key={job.id} className="bg-white border border-[rgba(16,22,19,0.09)] rounded-[18px] p-[15px] shadow-[0_10px_30px_rgba(16,22,19,0.06)]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold text-[14px]">{job.contactName || job.contactName || "Unknown"}</span>
                <span className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[19px] text-[#0e9f6e]">${job.quoteAmount?.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[#5c6a62] font-semibold mt-1">
                <span>{fmtTime(job.paidAt)}</span>
                {job.paymentMethod === "cash" && <span className="text-[#d9a441] font-extrabold">CASH</span>}
                {job.proofPhotoUrl && (
                  <a href={job.proofPhotoUrl} target="_blank" rel="noopener noreferrer"
                    className="ml-auto w-8 h-8 rounded-lg overflow-hidden border border-[rgba(16,22,19,0.09)] flex-shrink-0">
                    <img src={job.proofPhotoUrl} alt="" className="w-full h-full object-cover" />
                  </a>
                )}
              </div>
            </div>
          ))}
          {doneToday.length > 0 && (
            <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[16px] text-[#0e9f6e] text-right mt-2 px-1">
              Total: ${todayTotal.toFixed(2)}
            </div>
          )}
        </Column>
      </div>
    </main>
  );
}

function Column({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3">
        <h2 className="text-[12px] font-extrabold tracking-widest uppercase text-[#5c6a62]">{title}</h2>
        <span className="bg-white border border-[rgba(16,22,19,0.09)] rounded-full text-[11px] font-extrabold px-2.5 py-0.5">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="border-2 border-dashed border-[rgba(16,22,19,0.14)] rounded-[18px] p-6 text-center text-[13px] text-[#5c6a62] font-semibold">{children}</div>;
}

function JobCard({ job, quotePrice, onQuoteChange, onSendQuote, onAdvance, onPhotoUpload, onPaid, quotingId, uploadingId }: {
  job: DispatchJob; quotePrice: string;
  onQuoteChange: (v: string) => void; onSendQuote: () => void;
  onAdvance: (s: string, e?: Record<string, unknown>) => void;
  onPhotoUpload: (f: File) => void; onPaid: (c?: boolean) => void;
  quotingId: string | null; uploadingId: string | null;
}) {
  const [advancing, setAdvancing] = useState(false);
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

  const name = job.contactName || job.contactName || "Unknown";
  const market = job.market;
  const pickup = job.pickupAddress;
  const dropoff = job.dropoffAddress;
  const notes = [pickup?.notes, dropoff?.notes].filter(Boolean);

  return (
    <div className="bg-white border border-[rgba(16,22,19,0.09)] rounded-[18px] p-[15px_15px_13px] shadow-[0_10px_30px_rgba(16,22,19,0.06)] transition-shadow duration-200 hover:shadow-[0_10px_30px_rgba(16,22,19,0.1)]">
      {/* Row 1: Name · phone · market · status */}
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className="font-extrabold text-[14px] truncate max-w-[140px]">{name}</span>
        {job.customerPhone && (
          <a href={`tel:${job.customerPhone}`} className="text-[11px] text-[#0e9f6e] font-bold no-underline hover:underline shrink-0">
            {job.customerPhone}
          </a>
        )}
        {market && (
          <span className="text-[9.5px] font-extrabold rounded-md px-1.5 py-0.5 bg-[#101613] text-white">{market}</span>
        )}
        <span className="text-[9.5px] font-extrabold rounded-md px-1.5 py-0.5 bg-[#d9a441] text-white ml-auto">
          {STATUS_LABEL[job.status] || job.status}
        </span>
      </div>

      {/* Row 2: jobType → pickup → dropoff */}
      <div className="text-[12.5px] text-[#5c6a62] font-semibold mb-1 leading-snug">
        {job.jobType} · {addrStr(pickup)}
        <span className="text-[#0e9f6e] mx-1">→</span>
        {addrStr(dropoff)}
      </div>

      {/* Row 3: timeWindow + rel time */}
      <div className="flex items-center gap-2 mb-1.5">
        {job.timeWindow && (
          <span className="text-[10.5px] font-bold rounded-md px-1.5 py-0.5 bg-[#eef3ef] text-[#5c6a62]">{job.timeWindow}</span>
        )}
        <span className="text-[10.5px] text-[#8fa096] font-semibold">{relTime(job.createdAt)}</span>
      </div>

      {/* Description — full text */}
      <p className="text-[12.5px] text-[#5c6a62] leading-relaxed mb-1.5">{job.description}</p>

      {/* Per-stop notes */}
      {notes.length > 0 && notes.map((n, i) => n ? (
        <div key={i} className="text-[11px] text-[#d9a441] font-semibold mb-0.5">⚠ {n}</div>
      ) : null)}

      {/* Item photo */}
      {job.itemPhotoUrl && (
        <a href={job.itemPhotoUrl} target="_blank" rel="noopener noreferrer"
          className="inline-block w-16 h-16 rounded-lg overflow-hidden border border-[rgba(16,22,19,0.09)] mb-2">
          <img src={job.itemPhotoUrl} alt="" className="w-full h-full object-cover" />
        </a>
      )}

      {/* Est price / miles */}
      {(job.estPrice || job.estMiles) && (
        <div className="text-[11px] text-[#5c6a62] font-semibold mb-2">
          ≈ ${job.estPrice} suggested{job.estMiles ? ` · ${job.estMiles} mi` : ""}
        </div>
      )}

      {/* Quote amount display */}
      {job.quoteAmount != null && (
        <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[19px] text-[#0e9f6e] mb-2">
          ${job.quoteAmount.toFixed(2)}
        </div>
      )}

      {/* ── NEW: quote input + send ── */}
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

      {/* ── QUOTED: waiting + resend + mark accepted ── */}
      {job.status === "quoted" && (
        <div className="flex flex-col gap-1.5 mb-2">
          <div className="text-[12px] text-[#5c6a62] font-semibold">${job.quoteAmount?.toFixed(2)} · waiting on YES</div>
          <div className="flex gap-2">
            <button onClick={onSendQuote} disabled={busy}
              className="border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2 cursor-pointer bg-[#101613] text-white disabled:opacity-50 transition-opacity duration-200">
              {quotingId === job.id ? "..." : "Resend"}
            </button>
            <button onClick={() => doAdvance("accepted")}
              className="border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2 cursor-pointer bg-[#0e9f6e] text-white">
              Mark accepted
            </button>
          </div>
        </div>
      )}

      {/* ── ACCEPTED / ASSIGNED ── */}
      {["accepted", "assigned"].includes(job.status) && (
        <button onClick={() => doAdvance("pickup")} disabled={busy}
          className="w-full border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2.5 cursor-pointer bg-[#101613] text-white disabled:opacity-50 transition-opacity duration-200">
          {busy ? "..." : "📌 Arrived at pickup"}
        </button>
      )}

      {/* ── PICKUP ── */}
      {job.status === "pickup" && (
        <button onClick={() => doAdvance("in_progress")} disabled={busy}
          className="w-full border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2.5 cursor-pointer bg-[#101613] text-white disabled:opacity-50 transition-opacity duration-200">
          {busy ? "..." : "🚚 Loaded — rolling"}
        </button>
      )}

      {/* ── IN_PROGRESS: photo upload ── */}
      {job.status === "in_progress" && (
        <div className="flex flex-col gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="w-full border-none font-inherit font-extrabold text-xs rounded-xl px-3 py-2.5 cursor-pointer bg-[#101613] text-white disabled:opacity-50 transition-opacity duration-200">
            {uploadingId === job.id ? "📸 Uploading..." : "📸 Arrived — take photo"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            onChange={handleFile} className="hidden" />
        </div>
      )}

      {/* ── PROOF: mark paid + cash ── */}
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