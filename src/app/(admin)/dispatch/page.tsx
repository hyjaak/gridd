"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CEO_UID, SERVICES } from "@/lib/constants";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { LoadingScreen } from "@/components/LoadingScreen";

type JobStatus = "request" | "quoted" | "accepted" | "assigned" | "in_progress" | "proof" | "paid" | "declined" | "cancelled";
type JobType = "delivery" | "errand" | "hauling";
type Market = "DAY" | "ATL";
type Source = "form" | "sms" | "call";

type DispatchJob = {
  id: string;
  market: Market;
  status: JobStatus;
  customerName: string;
  customerPhone: string;
  jobType: JobType;
  pickupCity: string;
  dropoffCity: string;
  description: string;
  source: Source;
  quoteAmount?: number;
  assignedTo?: string;
  payoutPct: number;
  proofPhotoUrl?: string;
  createdAt?: Timestamp | null;
  quotedAt?: Timestamp | null;
  acceptedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  paidAt?: Timestamp | null;
};

const STATUS_BADGE_COLORS: Record<JobStatus, string> = {
  request: "bg-yellow-100 text-yellow-800",
  quoted: "bg-blue-100 text-blue-800",
  accepted: "bg-purple-100 text-purple-800",
  assigned: "bg-indigo-100 text-indigo-800",
  in_progress: "bg-orange-100 text-orange-800",
  proof: "bg-pink-100 text-pink-800",
  paid: "bg-green-100 text-green-800",
  declined: "bg-gray-100 text-gray-500",
  cancelled: "bg-red-100 text-red-800",
};

const MARKET_BADGE_COLORS: Record<Market, string> = {
  DAY: "bg-emerald-100 text-emerald-700",
  ATL: "bg-violet-100 text-violet-700",
};

const JOB_TYPE_LABELS: Record<JobType, string> = Object.fromEntries(
  SERVICES.map((s) => [s.id, `📦 ${s.label}`])
) as Record<JobType, string>;

function todayRange(): { start: Timestamp; end: Timestamp } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(start.getTime() + 86_400_000);
  return {
    start: Timestamp.fromDate(start),
    end: Timestamp.fromDate(end),
  };
}

function isToday(t: Timestamp | null | undefined): boolean {
  if (!t) return false;
  const { start, end } = todayRange();
  return t.seconds >= start.seconds && t.seconds < end.seconds;
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `+${d.slice(0, 1)} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

function formatTime(t: Timestamp | null | undefined): string {
  if (!t) return "";
  return t.toDate().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function DispatchPage() {
  const { loading, ok, user } = useRequireAuth(["ceo"]);
  const [jobs, setJobs] = useState<DispatchJob[]>([]);
  const [quotingId, setQuotingId] = useState<string | null>(null);
  const [quotePrices, setQuotePrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ok || user?.uid !== CEO_UID) return;
    const q = query(collection(db, "dispatchJobs"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: DispatchJob[] = [];
      snap.forEach((d) => {
        const data = d.data() as Omit<DispatchJob, "id">;
        list.push({ id: d.id, ...data });
      });
      setJobs(list);
    }, (err) => {
      console.error("dispatchJobs snapshot error:", err);
      setError("Failed to load jobs");
    });
    return unsub;
  }, [ok, user?.uid]);

  const newRequests = jobs.filter((j) => j.status === "request");
  const active = jobs.filter((j) => ["quoted", "accepted", "assigned", "in_progress", "proof"].includes(j.status));
  const doneToday = jobs.filter((j) => j.status === "paid" && isToday(j.paidAt));
  const todayRevenue = doneToday.reduce((sum, j) => sum + (j.quoteAmount ?? 0), 0);

  const handleSendQuote = useCallback(async (jobId: string) => {
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
  }, [quotePrices, jobs]);

  const handleDecline = useCallback(async (jobId: string) => {
    await updateDoc(doc(db, "dispatchJobs", jobId), {
      status: "declined",
    });
  }, []);

  const handleAdvance = useCallback(async (jobId: string, nextStatus: JobStatus, extraFields?: Record<string, unknown>) => {
    await updateDoc(doc(db, "dispatchJobs", jobId), {
      status: nextStatus,
      ...extraFields,
    });
  }, []);

  const getAction = (job: DispatchJob): { label: string; handler: () => void; disabled?: boolean } | null => {
    switch (job.status) {
      case "accepted":
      case "assigned":
        return {
          label: "▶ Start job",
          handler: () => handleAdvance(job.id, "in_progress"),
        };
      case "in_progress":
        return {
          label: "✅ Mark done",
          handler: () => handleAdvance(job.id, "proof", { completedAt: serverTimestamp() }),
        };
      case "proof":
        return {
          label: "💰 Mark paid",
          handler: () => handleAdvance(job.id, "paid", { paidAt: serverTimestamp() }),
        };
      case "quoted":
        return { label: "⏳ Waiting on customer YES", handler: () => {}, disabled: true };
      default:
        return null;
    }
  };

  if (loading || !ok) return <LoadingScreen />;

  if (user?.uid !== CEO_UID) {
    return (
      <div className="p-6 text-center text-red-600">
        Unauthorized — CEO access only
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dispatch Cockpit</h1>
        <div className="flex gap-4 mt-2 text-sm text-gray-600">
          <span>🆕 {newRequests.length} new</span>
          <span>⚡ {active.length} active</span>
          <span>✅ {doneToday.length} done today</span>
          <span className="font-semibold text-green-700">💰 ${todayRevenue.toFixed(2)} rev</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {/* 3-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Column 1: New Requests */}
        <Column title="🆕 New Requests" count={newRequests.length} color="border-yellow-400">
          {newRequests.length === 0 && <EmptyState />}
          {newRequests.map((job) => (
            <JobCard key={job.id} job={job}>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="0.00"
                    value={quotePrices[job.id] ?? ""}
                    onChange={(e) =>
                      setQuotePrices((prev) => ({ ...prev, [job.id]: e.target.value }))
                    }
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSendQuote(job.id)}
                    disabled={quotingId === job.id || !quotePrices[job.id]?.trim()}
                    className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {quotingId === job.id ? "Sending..." : "Send quote"}
                  </button>
                  <button
                    onClick={() => handleDecline(job.id)}
                    className="px-3 py-2 text-sm text-gray-500 hover:text-red-600 transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </div>
            </JobCard>
          ))}
        </Column>

        {/* Column 2: Active */}
        <Column title="⚡ Active" count={active.length} color="border-blue-400">
          {active.length === 0 && <EmptyState />}
          {active.map((job) => {
            const action = getAction(job);
            return (
              <JobCard key={job.id} job={job}>
                <div className="mt-3 space-y-2">
                  {job.quoteAmount != null && (
                    <div className="text-lg font-bold text-gray-900">
                      ${job.quoteAmount.toFixed(2)}
                    </div>
                  )}
                  {action && (
                    <button
                      onClick={action.handler}
                      disabled={action.disabled}
                      className={`w-full rounded-lg py-2 text-sm font-medium transition-colors ${
                        action.disabled
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {action.label}
                    </button>
                  )}
                </div>
              </JobCard>
            );
          })}
        </Column>

        {/* Column 3: Done Today */}
        <Column title="✅ Done Today" count={doneToday.length} color="border-green-400">
          {doneToday.length === 0 && <EmptyState />}
          {doneToday.map((job) => (
            <JobCard key={job.id} job={job}>
              <div className="mt-3 space-y-1">
                <div className="text-xl font-bold text-green-700">
                  ${job.quoteAmount?.toFixed(2) ?? "0.00"}
                </div>
                <div className="text-xs text-gray-400">
                  Paid {job.paidAt ? formatTime(job.paidAt) : ""}
                </div>
              </div>
            </JobCard>
          ))}
        </Column>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function Column({
  title,
  count,
  color,
  children,
}: {
  title: string;
  count: number;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border-t-4 ${color} p-4`}>
      <h2 className="text-lg font-semibold text-gray-800 mb-3">
        {title} <span className="text-gray-400 text-base font-normal">({count})</span>
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function JobCard({ job, children }: { job: DispatchJob; children?: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-semibold text-gray-900 text-sm truncate">{job.customerName}</span>
        <div className="flex gap-1 shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${MARKET_BADGE_COLORS[job.market]}`}>
            {job.market}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE_COLORS[job.status]}`}>
            {job.status}
          </span>
        </div>
      </div>
      <div className="text-xs text-gray-500 mb-1">
        {JOB_TYPE_LABELS[job.jobType]}
      </div>
      <div className="text-xs text-gray-600 mb-1 truncate">
        {job.pickupCity} → {job.dropoffCity}
      </div>
      <p className="text-sm text-gray-700 line-clamp-2 mb-2">
        {job.description}
      </p>
      <div className="flex items-center justify-between text-xs">
        <a
          href={`tel:${job.customerPhone}`}
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          {formatPhone(job.customerPhone)}
        </a>
        <span className="text-gray-400">
          {job.createdAt ? formatTime(job.createdAt) : ""}
        </span>
      </div>
      <div className="text-xs text-gray-400 mt-1">
        via {job.source}
      </div>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-8 text-gray-400 text-sm">
      Nothing here yet
    </div>
  );
}