"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, serverTimestamp, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CEO_UID, SERVICES } from "@/lib/constants";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { LoadingScreen } from "@/components/LoadingScreen";
import LiteJobCard from "@/components/dispatch/LiteJobCard";
import JobSheet from "@/components/dispatch/JobSheet";
import HistorySection from "@/components/dispatch/HistorySection";
import SuggestLine from "@/components/dispatch/SuggestLine";
import VoiceInput from "@/components/dispatch/VoiceInput";
import TodayGrid, { type GridFilter } from "@/components/dispatch/TodayGrid";
import { MARKETS } from "@/lib/constants";
import type { DispatchJob } from "@/types/dispatch";

function todayStart(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

function tsMs(ts: any): number {
  if (!ts) return 0;
  return ts.seconds ? ts.seconds * 1000 : (ts.toMillis?.() ?? 0);
}

function isToday(ts: any): boolean {
  const t = tsMs(ts);
  return t >= todayStart() && t < todayStart() + 86_400_000;
}

function fmtTime(ts: any): string {
  if (!ts) return "";
  return new Date(tsMs(ts)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function paidStamp(j: DispatchJob): any {
  return j.paidAt ?? j.updatedAt ?? j.createdAt;
}

export default function DispatchLitePage() {
  const router = useRouter();
  const { loading, ok, user } = useRequireAuth(["ceo"], { redirectTo: undefined });
  const [jobs, setJobs] = useState<DispatchJob[]>([]);
  const [quotePrices, setQuotePrices] = useState<Record<string, string>>({});
  const [quotingId, setQuotingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [showNewJob, setShowNewJob] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newJobType, setNewJobType] = useState("delivery");
  const [newPickup, setNewPickup] = useState("");
  const [newDropoff, setNewDropoff] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newWindow, setNewWindow] = useState("");
  const [newSubmitting, setNewSubmitting] = useState(false);
  const [sheetJobId, setSheetJobId] = useState<string | null>(null);
  const [filter, setFilter] = useState<GridFilter>(null);
  const [reading, setReading] = useState(false);
  const jobsRef = useRef<DispatchJob[]>([]);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const towns = MARKETS.OH.towns.map((t) => t.toLowerCase());

  useEffect(() => {
    if (!ok || user?.uid !== CEO_UID) return;
    const q = query(collection(db, "dispatchJobs"), orderBy("createdAt", "desc"), limit(200));
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, amount: Number(price), phone: job.customerPhone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && data.error !== "Twilio not configured") throw new Error(data.error || "Failed");
      await updateDoc(doc(db, "dispatchJobs", jobId), { status: "quoted", quoteAmount: Number(price), quotedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setQuotePrices((p) => ({ ...p, [jobId]: "" }));
      if (data.error === "Twilio not configured") setError("SMS off — copy & text it yourself");
    } catch (e) {
      rollback();
      setError(e instanceof Error ? e.message : "Failed to send quote");
    } finally {
      setQuotingId(null);
    }
  };

  /** Shared state machine — every card + sheet action flows through here. */
  const handleAdvance = async (jobId: string, nextStatus: string, extra?: Record<string, unknown>) => {
    optimisticUpdate(jobId, { status: nextStatus as any, ...extra } as any);
    try {
      await updateDoc(doc(db, "dispatchJobs", jobId), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
        ...extra,
      });
    } catch (e) {
      rollback();
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  /** ONE paid path — card, sheet, cash all land here. paidAt is ALWAYS serverTimestamp. */
  const handlePaid = async (jobId: string, cash?: boolean) => {
    const patch: Record<string, unknown> = {
      status: "paid",
      paidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...(cash ? { paymentMethod: "cash" } : {}),
    };
    optimisticUpdate(jobId, {
      status: "paid",
      paidAt: new Date(),
      ...(cash ? { paymentMethod: "cash" } : {}),
    } as any);
    try {
      await updateDoc(doc(db, "dispatchJobs", jobId), patch);
    } catch (e) {
      rollback();
      setError(e instanceof Error ? e.message : "Failed to mark paid");
    }
  };

  const handlePhotoUpload = async (jobId: string, file: File) => {
    setUploadingId(jobId);
    setError(null);
    try {
      const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
      const { storage } = await import("@/lib/firebase");
      const storageRef = ref(storage, `proof/${jobId}.jpg`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await handleAdvance(jobId, "proof", { proofPhotoUrl: url });
    } catch {
      await handleAdvance(jobId, "proof", {});
      setError("Photo upload failed — tap to retry");
    } finally {
      setUploadingId(null);
    }
  };

  const handleVoice = (text: string) => {
    setNewDesc((prev) => (prev ? `${prev} ${text}` : text));
    // Parse-lite: "from X to Y" → prefill cities when they match known towns
    const m = text.toLowerCase().match(/from\s+([a-z\s]+?)\s+to\s+([a-z\s]+?)(?:\.|$)/i);
    if (m) {
      const from = m[1].trim();
      const to = m[2].trim();
      if (towns.includes(from)) setNewPickup(from.charAt(0).toUpperCase() + from.slice(1));
      if (towns.includes(to)) setNewDropoff(to.charAt(0).toUpperCase() + to.slice(1));
    }
  };

  const readBoard = () => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synthRef.current = synth;
    if (reading) { synth.cancel(); setReading(false); return; }
    const waiting = newReqs.length;
    const booked = jobs.filter((j) => ["accepted", "assigned", "pickup"].includes(j.status)).length;
    const paidToday = doneToday.length;
    const paidTotal = todayTotal;
    const lines = [
      `${waiting} waiting.`,
      ...jobs.filter((j) => ["accepted", "assigned", "pickup"].includes(j.status)).slice(0, 3).map((j) =>
        `${j.contactName || "Someone"}, ${j.jobType}, ${j.pickupAddress?.city ?? "?"} to ${j.dropoffAddress?.city ?? "?"}, ${j.agreedAmount ?? j.quoteAmount ?? 0} dollars, booked.`),
      `One paid today, ${paidTotal.toFixed(0)} dollars.`,
    ];
    const utter = new SpeechSynthesisUtterance(lines.join(" "));
    utter.onend = () => setReading(false);
    utter.onerror = () => setReading(false);
    setReading(true);
    synth.speak(utter);
  };

  const handleNewJob = async () => {
    if (!newPhone.trim()) return;
    setNewSubmitting(true);
    setError(null);
    try {
      await addDoc(collection(db, "dispatchJobs"), {
        jobType: newJobType, status: "request", source: "call",
        customerPhone: newPhone.replace(/\D/g, "").length === 10 ? `+1${newPhone.replace(/\D/g, "")}` : newPhone,
        contactName: newName.trim() || "", description: newDesc.trim() || "",
        timeWindow: newWindow, market: "DAY",
        pickupAddress: { city: newPickup.trim() || "Dayton", street: "" },
        dropoffAddress: { city: newDropoff.trim() || "Dayton", street: "" },
        createdAt: new Date(),
      });
      setShowNewJob(false); setNewName(""); setNewPhone(""); setNewPickup(""); setNewDropoff(""); setNewDesc(""); setNewWindow(""); setNewJobType("delivery");
    } catch { setError("Failed to create job"); } finally { setNewSubmitting(false); }
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
            className="bg-[#0e9f6e] text-white font-bold text-[16px] px-8 py-3 rounded-full hover:bg-[#0a7a54] transition-colors cursor-pointer border-none">Sign in</button>
        </div>
      </main>
    );
  }
  if (user?.uid !== CEO_UID) { router.replace("/"); return <LoadingScreen />; }

  const now = Date.now();
  const twoHrs = 2 * 60 * 60 * 1000;
  const filterMatch = (j: DispatchJob): boolean => {
    if (filter === "needs") return j.status === "request";
    if (filter === "waiting") return j.status === "quoted" && tsMs(j.quotedAt ?? j.createdAt) < now - twoHrs;
    if (filter === "due") return ["accepted", "assigned", "pickup", "in_progress"].includes(j.status) && ((j.timeWindow?.toLowerCase().includes("today") ?? false) || (j.timeWindow?.toLowerCase().includes("asap") ?? false));
    if (filter === "unpaid") return j.status === "proof";
    return true;
  };
  const newReqs = jobs.filter((j) => j.status === "request" && filterMatch(j));
  const active = jobs.filter((j) => ["quoted", "accepted", "assigned", "pickup", "in_progress", "proof"].includes(j.status) && filterMatch(j));
  // Hardened Done Today: paid AND stamped today (paidAt or backfilled updatedAt today).
  const doneToday = jobs.filter((j) => j.status === "paid" && isToday(paidStamp(j)));
  const doneAll = jobs.filter((j) => j.status === "paid");
  const history = jobs
    .filter((j) => ["paid", "declined", "cancelled"].includes(j.status))
    .filter((j) => !doneToday.some((d) => d.id === j.id))
    .sort((a, b) => tsMs(paidStamp(b)) - tsMs(paidStamp(a)))
    .slice(0, 100);
  const open = jobs.filter((j) => !["paid", "declined", "cancelled"].includes(j.status));
  const todayTotal = doneToday.reduce((s, j) => s + (j.agreedAmount ?? j.quoteAmount ?? 0) + (j.tipAmount ?? 0), 0);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const weekTotal = doneAll
    .filter((j) => tsMs(paidStamp(j)) >= weekAgo)
    .reduce((s, j) => s + (j.agreedAmount ?? j.quoteAmount ?? 0) + (j.tipAmount ?? 0), 0);
  const allTimeRuns = doneAll.length;
  const sheetJob = sheetJobId ? jobs.find((j) => j.id === sheetJobId) ?? null : null;
  const sheetOnSuggest = (p: number) => {
    if (sheetJob) setQuotePrices((prev) => ({ ...prev, [sheetJob.id]: String(p) }));
  };
  const newFormPickup = { city: newPickup.trim() || "Dayton", street: "" };
  const newFormDropoff = { city: newDropoff.trim() || "Dayton", street: "" };

  return (
    <main className="min-h-screen bg-[#eef3ef] font-['Inter',sans-serif] text-[#101613]">
      <header className="sticky top-0 z-20 bg-[rgba(238,243,239,0.92)] backdrop-blur border-b border-[rgba(16,22,19,0.09)] px-[4vw] py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[22px] text-[#0e9f6e]">gridd</div>
          <button onClick={() => setShowNewJob(!showNewJob)}
            className="text-[11px] font-extrabold bg-[#0e9f6e] text-white rounded-full px-3 py-1.5 border-none cursor-pointer hover:bg-[#0a7a54] transition-colors">+ New job</button>
        </div>
        <div className="flex items-center gap-4 text-[13px] font-extrabold text-[#5c6a62]">
          <span>${todayTotal.toFixed(0)} <span className="text-[10px] font-bold">today</span></span>
          <span>{doneToday.length} <span className="text-[10px] font-bold">runs</span></span>
          <span>{newReqs.length} <span className="text-[10px] font-bold">waiting</span></span>
          <span>{open.length} <span className="text-[10px] font-bold">open</span></span>
          <span className="hidden sm:inline text-[12px] font-bold text-[#8fa096]">${weekTotal.toFixed(0)} <span className="text-[10px]">wk</span> · {allTimeRuns} <span className="text-[10px]">all-time</span></span>
        </div>
      </header>

      <TodayGrid jobs={jobs} filter={filter} onFilter={setFilter} onRead={readBoard} reading={reading} />

      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#101613] text-white px-5 py-3 rounded-full text-sm font-semibold shadow-lg">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-[#8fa096] hover:text-white">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 pb-10 max-w-[1400px] mx-auto">
        <Column title="New requests" count={newReqs.length}>
          {showNewJob && (
            <div className="bg-white border border-[#0e9f6e] rounded-[18px] p-4 space-y-2">
              <div className="text-[12px] font-extrabold text-[#0e9f6e] mb-1">+ New job (phone booking)</div>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="w-full border border-[rgba(16,22,19,0.09)] rounded-xl px-3 py-2 text-[13px] bg-[#eef3ef] focus:outline-none focus:border-[#0e9f6e]" />
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone *" required className="w-full border border-[rgba(16,22,19,0.09)] rounded-xl px-3 py-2 text-[13px] bg-[#eef3ef] focus:outline-none focus:border-[#0e9f6e]" />
              <select value={newJobType} onChange={(e) => setNewJobType(e.target.value)} className="w-full border border-[rgba(16,22,19,0.09)] rounded-xl px-3 py-2 text-[13px] bg-[#eef3ef] focus:outline-none focus:border-[#0e9f6e]">
                {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <div className="flex gap-2">
                <input value={newPickup} onChange={(e) => setNewPickup(e.target.value)} placeholder="Pickup city" className="flex-1 border border-[rgba(16,22,19,0.09)] rounded-xl px-3 py-2 text-[13px] bg-[#eef3ef] focus:outline-none focus:border-[#0e9f6e]" />
                <input value={newDropoff} onChange={(e) => setNewDropoff(e.target.value)} placeholder="Drop city" className="flex-1 border border-[rgba(16,22,19,0.09)] rounded-xl px-3 py-2 text-[13px] bg-[#eef3ef] focus:outline-none focus:border-[#0e9f6e]" />
              </div>
              <div className="flex gap-1 flex-wrap">
                {["ASAP", "This afternoon", "Tomorrow"].map((w) => (
                  <button key={w} type="button" onClick={() => setNewWindow(newWindow === w ? "" : w)}
                    className={`text-[10px] font-bold rounded-full px-2 py-1 border transition-colors ${newWindow === w ? "bg-[#0e9f6e] text-white border-[#0e9f6e]" : "bg-white text-[#5c6a62] border-black/12"}`}>{w}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description" rows={2} className="flex-1 border border-[rgba(16,22,19,0.09)] rounded-xl px-3 py-2 text-[13px] bg-[#eef3ef] focus:outline-none focus:border-[#0e9f6e] resize-none" />
                <VoiceInput onTranscript={handleVoice} label="🎤" />
              </div>
              <SuggestLine pickup={newFormPickup} dropoff={newFormDropoff} jobType={newJobType}
                onSuggestion={(p) => setQuotePrices((prev) => ({ ...prev, ["__new"]: String(p) }))} />
              <button onClick={handleNewJob} disabled={newSubmitting || !newPhone.trim()}
                className="w-full bg-[#0e9f6e] text-white font-bold text-[13px] py-2.5 rounded-full border-none cursor-pointer disabled:opacity-50">{newSubmitting ? "Creating..." : "Create job"}</button>
            </div>
          )}
          {newReqs.length === 0 && !showNewJob && <Empty>No new requests.</Empty>}
          {newReqs.map((job) => (
            <LiteJobCard key={job.id} job={job} quotePrice={quotePrices[job.id] ?? ""}
              onQuoteChange={(v) => setQuotePrices((p) => ({ ...p, [job.id]: v }))}
              onSendQuote={() => handleSendQuote(job.id)}
              onAdvance={(s, e) => handleAdvance(job.id, s, e)}
              onPhotoUpload={(f) => handlePhotoUpload(job.id, f)}
              onPaid={(c) => handlePaid(job.id, c)}
              onOpenSheet={() => setSheetJobId(job.id)}
              quotingId={quotingId} uploadingId={uploadingId} />
          ))}
        </Column>
        <Column title="Active" count={active.length}>
          {active.length === 0 && <Empty>Nothing in motion.</Empty>}
          {active.map((job) => (
            <LiteJobCard key={job.id} job={job} quotePrice={quotePrices[job.id] ?? ""}
              onQuoteChange={(v) => setQuotePrices((p) => ({ ...p, [job.id]: v }))}
              onSendQuote={() => handleSendQuote(job.id)}
              onAdvance={(s, e) => handleAdvance(job.id, s, e)}
              onPhotoUpload={(f) => handlePhotoUpload(job.id, f)}
              onPaid={(c) => handlePaid(job.id, c)}
              onOpenSheet={() => setSheetJobId(job.id)}
              quotingId={quotingId} uploadingId={uploadingId} />
          ))}
        </Column>
        <div>
          <Column title="Done today" count={doneToday.length}>
            {doneToday.length === 0 && <Empty>Nothing banked yet.</Empty>}
            {doneToday.map((job) => (
              <div key={job.id} className="bg-white border border-[rgba(16,22,19,0.09)] rounded-[18px] p-[15px] shadow-[0_10px_30px_rgba(16,22,19,0.06)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-[14px]">{job.contactName || "Unknown"}</span>
                  <span className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[19px] text-[#0e9f6e]">
                    ${(job.agreedAmount ?? job.quoteAmount)?.toFixed(2)}
                    {job.tipAmount ? <span className="text-[12px] text-[#0e9f6e]"> +${job.tipAmount} tip</span> : null}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[#5c6a62] font-semibold mt-1">
                  <span>{fmtTime(paidStamp(job))}</span>
                  {job.rating != null && <span className="text-[#d9a441] font-extrabold">★{job.rating}</span>}
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
          <div className="mt-4">
            <HistorySection jobs={history} onOpenSheet={(id) => setSheetJobId(id)} />
          </div>
        </div>
      </div>

      {sheetJob && (
        <JobSheet job={sheetJob} onClose={() => setSheetJobId(null)}
          quotePrice={quotePrices[sheetJob.id] ?? ""}
          onQuoteChange={(v) => setQuotePrices((p) => ({ ...p, [sheetJob.id]: v }))}
          onSuggestion={sheetOnSuggest}
          onSendQuote={() => handleSendQuote(sheetJob.id)}
          onAdvance={(s, e) => handleAdvance(sheetJob.id, s, e)}
          onPhotoUpload={(f) => handlePhotoUpload(sheetJob.id, f)}
          onPaid={(c) => handlePaid(sheetJob.id, c)}
          quotingId={quotingId} uploadingId={uploadingId} />
      )}
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