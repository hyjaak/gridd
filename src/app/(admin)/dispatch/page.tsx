"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CEO_UID, SERVICES } from "@/lib/constants";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { LoadingScreen } from "@/components/LoadingScreen";
import { HeaderStats } from "@/components/dispatch/HeaderStats";
import { PingToggle } from "@/components/dispatch/PingToggle";
import { PipelineTimeline } from "@/components/dispatch/PipelineTimeline";
import { DriverMode } from "@/components/dispatch/DriverMode";
import { JobCard } from "@/components/dispatch/JobCard";
import { FlashConfetti } from "@/components/dispatch/FlashConfetti";
import { DispatchErrorBoundary } from "@/components/dispatch/DispatchErrorBoundary";
import { AnimatePresence } from "framer-motion";
import type { DispatchJob } from "@/types/dispatch";

function todayRange(): { start: Timestamp; end: Timestamp } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(start.getTime() + 86_400_000);
  return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end) };
}

function isToday(t: Timestamp | null | undefined): boolean {
  if (!t) return false;
  const { start, end } = todayRange();
  return t.seconds >= start.seconds && t.seconds < end.seconds;
}

// BIZ phone list
const BIZ_PHONES = ["+14047834836", "+16783458153"];
function isBIZ(phone: string): boolean {
  return BIZ_PHONES.includes(phone);
}

// Sort helper: BIZ jobs float to top
function sortByBIZ(jobs: DispatchJob[]): DispatchJob[] {
  return [...jobs].sort((a, b) => {
    const aBiz = a.customerPhone ? isBIZ(a.customerPhone) : false;
    const bBiz = b.customerPhone ? isBIZ(b.customerPhone) : false;
    if (aBiz && !bBiz) return -1;
    if (!aBiz && bBiz) return 1;
    return 0;
  });
}

// Toast component
function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#101613] text-white px-5 py-3 rounded-full shadow-lg text-sm font-semibold animate-[fadeIn_0.3s_ease]">
      {message}
      <button onClick={onDismiss} className="ml-3 text-[#8fa096] hover:text-white">✕</button>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

export default function DispatchPage() {
  const router = useRouter();
  const { loading, ok, user, role } = useRequireAuth(["ceo"], { redirectTo: undefined });
  const [jobs, setJobs] = useState<DispatchJob[]>([]);
  const [quotingId, setQuotingId] = useState<string | null>(null);
  const [quotePrices, setQuotePrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [driverMode, setDriverMode] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [prevJobCount, setPrevJobCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const pingRef = useRef<{ chime: () => void }>({ chime: () => {} });
  const jobsRef = useRef<DispatchJob[]>([]);

  // Track online/offline
  useEffect(() => {
    const onOff = () => setOffline(!navigator.onLine);
    window.addEventListener("online", onOff);
    window.addEventListener("offline", onOff);
    setOffline(!navigator.onLine);
    return () => {
      window.removeEventListener("online", onOff);
      window.removeEventListener("offline", onOff);
    };
  }, []);

  // Redirect wrong-role accounts
  useEffect(() => {
    if (!loading && user && role && role !== "ceo") {
      router.replace("/");
    }
  }, [loading, user, role, router]);

  // Render CEO sign-in when unauthenticated
  if (loading) return <LoadingScreen />;
  if (!user) {
    return (
      <main className="min-h-screen bg-[#101613] flex flex-col items-center justify-center px-6">
        <div className="text-center">
          <div className="text-[48px] font-[800] font-bricolage text-[#0e9f6e] mb-4">gridd</div>
          <h1 className="text-white text-[24px] font-bold mb-2">Owner sign-in</h1>
          <p className="text-[#9db3a8] text-[14px] mb-6">Sign in to access the dispatch board</p>
          <button
            onClick={() => router.replace("/login?next=/dispatch")}
            className="bg-[#0e9f6e] text-white font-bold text-[16px] px-8 py-3 rounded-full hover:bg-[#0a7a54] transition-colors cursor-pointer border-none"
          >
            Sign in
          </button>
        </div>
      </main>
    );
  }

  useEffect(() => {
    if (!ok || user?.uid !== CEO_UID) return;
    const q = query(collection(db, "dispatchJobs"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: DispatchJob[] = [];
      snap.forEach((d) => {
        const data = d.data() as Omit<DispatchJob, "id">;
        list.push({ id: d.id, ...data });
      });
      jobsRef.current = list;
      setJobs(list);
      
      // Chime on new request
      const currentRequestCount = list.filter((j) => j.status === "request").length;
      if (currentRequestCount > prevJobCount) {
        pingRef.current?.chime();
      }
      setPrevJobCount(currentRequestCount);
    }, (err) => {
      console.error("dispatchJobs snapshot error:", err);
      setError("Failed to load jobs — check connection");
      setOffline(true);
    });
    return unsub;
  }, [ok, user?.uid, prevJobCount]);

  // Optimistic UI helper
  const optimisticAdvance = useCallback((jobId: string, nextStatus: string, extraFields?: Record<string, unknown>) => {
    setJobs((prev) => prev.map((j) => {
      if (j.id !== jobId) return j;
      return { ...j, status: nextStatus as any, ...extraFields };
    }));
  }, []);

  const rollbackJobs = useCallback(() => {
    setJobs(jobsRef.current);
  }, []);

  const handleAdvance = useCallback(async (jobId: string, nextStatus: string, extraFields?: Record<string, unknown>) => {
    // Optimistic update
    optimisticAdvance(jobId, nextStatus, extraFields);
    
    try {
      await updateDoc(doc(db, "dispatchJobs", jobId), { 
        status: nextStatus, 
        ...extraFields,
      });
      
      // Trigger confetti on paid
      if (nextStatus === "paid") {
        setConfettiTrigger(true);
        setTimeout(() => setConfettiTrigger(false), 100);
      }
    } catch (e) {
      // Rollback on failure
      rollbackJobs();
      setToast(e instanceof Error ? e.message : "Failed to update");
    }
  }, [optimisticAdvance, rollbackJobs]);

  const handleSendQuote = useCallback(async (jobId: string) => {
    const price = quotePrices[jobId]?.trim();
    if (!price || isNaN(Number(price))) return;
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    setQuotingId(jobId);
    setError(null);
    
    // Optimistic
    optimisticAdvance(jobId, "quoted", { quoteAmount: Number(price), quotedAt: new Date().toISOString() });
    
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
      rollbackJobs();
      setError(e instanceof Error ? e.message : "Failed to send quote");
    } finally {
      setQuotingId(null);
    }
  }, [quotePrices, jobs, optimisticAdvance, rollbackJobs]);

  const handleDecline = useCallback(async (jobId: string) => {
    optimisticAdvance(jobId, "declined");
    try {
      await updateDoc(doc(db, "dispatchJobs", jobId), { status: "declined" });
    } catch {
      rollbackJobs();
      setToast("Failed to decline");
    }
  }, [optimisticAdvance, rollbackJobs]);

  // Assigned is treated same as accepted
  const newRequests = sortByBIZ(jobs.filter((j) => j.status === "request"));
  const active = sortByBIZ(jobs.filter((j) => ["quoted", "accepted", "assigned", "pickup", "in_progress", "proof"].includes(j.status)));
  const doneToday = jobs.filter((j) => j.status === "paid" && isToday(j.paidAt));
  
  const todayRevenue = doneToday.reduce((sum, j) => sum + (j.quoteAmount ?? 0), 0);
  const runsCount = doneToday.length;
  const openCount = jobs.filter((j) => ["request", "quoted", "accepted", "assigned", "pickup", "in_progress", "proof"].includes(j.status)).length;
  
  // Calculate avg quote time (quotedAt - createdAt for today's jobs)
  const quoteTimes = doneToday
    .filter((j) => j.quotedAt && j.createdAt)
    .map((j) => (j.quotedAt!.toMillis() - j.createdAt!.toMillis()));
  const avgQuoteTime = quoteTimes.length > 0
    ? quoteTimes.reduce((a, b) => a + b, 0) / quoteTimes.length
    : null;

  if (loading || !ok) return <LoadingScreen />;
  if (user?.uid !== CEO_UID) {
    router.replace("/");
    return <LoadingScreen />;
  }

  return (
    <DispatchErrorBoundary jobs={jobs}>
      <div className="min-h-screen bg-[#eef3ef] font-['Inter',sans-serif] text-[#101613]">
        {/* Offline strip */}
        {offline && (
          <div className="bg-[#d9a441] text-[#101613] text-center text-xs font-extrabold py-1.5 tracking-wider">
            ⚠ RECONNECTING… CACHED DATA
          </div>
        )}

        {/* Header */}
        <header className="sticky top-0 z-20 bg-[rgba(238,243,239,0.92)] backdrop-blur border-b border-[rgba(16,22,19,0.09)] px-[4vw] py-3 flex items-center justify-between gap-2.5 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[22px] text-[#0e9f6e]">
              gridd
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-[rgba(16,22,19,0.09)] rounded-full px-3 py-1.5 text-[11.5px] font-extrabold">
              <span className="w-2 h-2 rounded-full bg-[#0e9f6e] animate-pulse" />
              <span>DISPATCH · {newRequests.length} waiting</span>
            </div>
            <PingToggle onPingRef={pingRef} />
          </div>
          <div className="flex items-center gap-3.5 flex-wrap">
            <HeaderStats
              todayRevenue={todayRevenue}
              runsCount={runsCount}
              avgQuoteTime={avgQuoteTime}
              openCount={openCount}
            />
            <button
              onClick={() => setDriverMode(!driverMode)}
              className={`border-none font-inherit font-extrabold text-xs rounded-full px-4 py-2 cursor-pointer ${
                driverMode ? "bg-[#0e9f6e] text-white" : "bg-[#101613] text-white"
              }`}
            >
              {driverMode ? "📋 Dispatch" : "🚚 Drive"}
            </button>
          </div>
        </header>

        {error && (
          <div className="mx-[4vw] mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
        )}

        {/* Board */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5 p-5 pb-32 max-w-[1400px] mx-auto">
          {/* Column 1: New Requests */}
          <Column title="New requests" count={newRequests.length} dotColor="bg-[#d9a441]">
            <AnimatePresence>
              {newRequests.length === 0 && <EmptyState message="No new requests." />}
              {newRequests.map((job) => (
                <div key={job.id} id={`job-${job.id}`}>
                  <JobCard
                    job={job}
                    quotePrice={quotePrices[job.id] ?? ""}
                    onQuoteChange={(id, val) => setQuotePrices((prev) => ({ ...prev, [id]: val }))}
                    onSendQuote={handleSendQuote}
                    onDecline={handleDecline}
                    onAdvance={handleAdvance}
                    quotingId={quotingId}
                    onToast={setToast}
                  />
                </div>
              ))}
            </AnimatePresence>
          </Column>

          {/* Column 2: Active */}
          <Column title="Active" count={active.length} dotColor="bg-[#0e9f6e]">
            <AnimatePresence>
              {active.length === 0 && <EmptyState message="Nothing in motion." />}
              {active.map((job) => (
                <div key={job.id} id={`job-${job.id}`}>
                  <JobCard
                    job={job}
                    quotePrice={quotePrices[job.id] ?? ""}
                    onQuoteChange={(id, val) => setQuotePrices((prev) => ({ ...prev, [id]: val }))}
                    onSendQuote={handleSendQuote}
                    onDecline={handleDecline}
                    onAdvance={handleAdvance}
                    quotingId={quotingId}
                    onToast={setToast}
                  />
                </div>
              ))}
            </AnimatePresence>
          </Column>

          {/* Column 3: Done Today */}
          <Column title="Done today" count={doneToday.length} dotColor="bg-[#101613]">
            <AnimatePresence>
              {doneToday.length === 0 && <EmptyState message="Nothing banked yet." />}
              {doneToday.map((job) => (
                <div key={job.id} id={`job-${job.id}`}>
                  <JobCard
                    job={job}
                    quotePrice={quotePrices[job.id] ?? ""}
                    onQuoteChange={(id, val) => setQuotePrices((prev) => ({ ...prev, [id]: val }))}
                    onSendQuote={handleSendQuote}
                    onDecline={handleDecline}
                    onAdvance={handleAdvance}
                    quotingId={quotingId}
                    onToast={setToast}
                  />
                </div>
              ))}
            </AnimatePresence>
          </Column>
        </div>

        {/* Pipeline Timeline */}
        <PipelineTimeline jobs={jobs} />
      </div>

      {/* Toast */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      {/* Driver Mode Overlay */}
      {driverMode && (
        <DriverMode jobs={jobs} onAdvance={handleAdvance} onClose={() => setDriverMode(false)} onToast={setToast} />
      )}

      {/* Flash + Confetti */}
      <FlashConfetti trigger={confettiTrigger} />
    </DispatchErrorBoundary>
  );
}

/* ── Sub-components ── */

function Column({ title, count, dotColor, children }: { title: string; count: number; dotColor: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <h2 className="text-[12.5px] font-extrabold tracking-widest uppercase text-[#5c6a62]">{title}</h2>
        <span className="bg-white border border-[rgba(16,22,19,0.09)] rounded-full text-xs font-extrabold px-2.5 py-0.5">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border-2 border-dashed border-[rgba(16,22,19,0.14)] rounded-[18px] p-6 text-center text-[13px] text-[#5c6a62] font-semibold">
      {message}
    </div>
  );
}