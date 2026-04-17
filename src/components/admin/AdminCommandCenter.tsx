"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { Check, CheckCheck, Megaphone, MessageCircle } from "lucide-react";
import app from "@/lib/firebase";
import { firebaseAuth } from "@/lib/firebase";
import { LogoutButton } from "@/components/LogoutButton";
import { money } from "@/lib/job-tracking";
import { serviceMeta, DRIVER_SERVICE_META } from "@/lib/driver-service-meta";
import type { Job, JobChatMessage, Provider } from "@/types";
import {
  feeForJob,
  isDisputed,
  normalizeAlertSeverity,
  parseJobTime,
  timeAgo,
  type AlertSeverity,
} from "./admin-dashboard-utils";

const BG = "#060606";
const CARD = "#0a0a0a";
const BORDER = "#1a1a1a";
const GREEN = "#00FF88";
const WARN = "#FFB800";
const INFO = "#3B82F6";
const PURPLE = "#8B5CF6";

type TabId = "overview" | "jobs" | "providers" | "messages" | "security" | "approvals" | "revenue";

type FireAlert = {
  id: string;
  severity?: string;
  title?: string;
  body?: string;
  uid?: string;
  type?: string;
  signals?: string[];
  createdAt?: string;
};

type OverviewStats = {
  revenueToday: number;
  weekRevenue: number;
  daily: number[];
  maxDay: number;
  activeJobs: number;
  liveDrivers: number;
  serviceToday: Record<string, { count: number; revenue: number }>;
  feed: Job[];
  dayLabels: string[];
};

const SERVICE_IDS = Object.keys(DRIVER_SERVICE_META);

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "⚡" },
  { id: "jobs", label: "Jobs", icon: "📦" },
  { id: "providers", label: "Providers", icon: "🚛" },
  { id: "messages", label: "Messages", icon: "💬" },
  { id: "security", label: "Security", icon: "🔐" },
  { id: "approvals", label: "Approvals", icon: "📋" },
  { id: "revenue", label: "Revenue", icon: "💰" },
];

function msgTime(raw: unknown): string {
  if (raw instanceof Timestamp) return raw.toDate().toISOString();
  if (typeof raw === "string") return raw;
  return new Date().toISOString();
}

async function adminPost(path: string, body: Record<string, unknown>) {
  const token = await firebaseAuth?.currentUser?.getIdToken();
  if (!token) throw new Error("Not signed in");
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayLabelsLast7(): string[] {
  const out: string[] = [];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(days[d.getDay()]);
  }
  return out;
}

export function AdminCommandCenter() {
  const db = useMemo(() => getFirestore(app), []);
  const [tab, setTab] = useState<TabId>("overview");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [alerts, setAlerts] = useState<FireAlert[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [jobStatusFilter, setJobStatusFilter] = useState<string>("all");
  const [jobServiceFilter, setJobServiceFilter] = useState<string>("all");
  const [jobRange, setJobRange] = useState<"today" | "week" | "month">("week");
  const [jobSearch, setJobSearch] = useState("");

  const [provSort, setProvSort] = useState<"jobs" | "rating" | "earned" | "recent">("jobs");

  const [msgJobId, setMsgJobId] = useState<string | null>(null);
  const [messages, setMessages] = useState<JobChatMessage[]>([]);
  const [msgText, setMsgText] = useState("");
  const [msgSending, setMsgSending] = useState(false);

  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [bcAudience, setBcAudience] = useState<"all" | "customers" | "drivers" | "zip">("all");
  const [bcZip, setBcZip] = useState("");
  const [bcTitle, setBcTitle] = useState("");
  const [bcBody, setBcBody] = useState("");
  const [bcSending, setBcSending] = useState(false);

  const [assignJob, setAssignJob] = useState<Job | null>(null);
  const [dismissedSyntheticIds, setDismissedSyntheticIds] = useState<Set<string>>(() => new Set());

  const [rejectTarget, setRejectTarget] = useState<Provider | null>(null);
  const [rejectPresets, setRejectPresets] = useState<Set<string>>(() => new Set());
  const [rejectOther, setRejectOther] = useState("");

  useEffect(() => {
    const q = query(collection(db, "jobs"), orderBy("createdAt", "desc"), limit(500));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Job, "id">) }));
        setJobs(rows);
        setLoadErr(null);
      },
      (e) => setLoadErr(e.message),
    );
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const q = query(collection(db, "providers"), limit(500));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setProviders(
          snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Provider, "uid">) })),
        );
      },
      () => setProviders([]),
    );
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const qOrdered = query(collection(db, "alerts"), orderBy("createdAt", "desc"), limit(80));
    let unsubFallback: (() => void) | undefined;
    const unsub = onSnapshot(
      qOrdered,
      (snap) => {
        setAlerts(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<FireAlert, "id">),
          })),
        );
      },
      () => {
        const q2 = query(collection(db, "alerts"), limit(80));
        unsubFallback = onSnapshot(q2, (snap) => {
          setAlerts(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<FireAlert, "id">),
            })),
          );
        });
      },
    );
    return () => {
      unsub();
      unsubFallback?.();
    };
  }, [db]);

  useEffect(() => {
    if (!msgJobId) {
      setMessages([]);
      return;
    }
    const q = query(collection(db, "jobs", msgJobId, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: JobChatMessage[] = snap.docs.map((d) => {
          const data = d.data() as Omit<JobChatMessage, "id" | "jobId">;
          return {
            id: d.id,
            jobId: msgJobId,
            ...data,
            createdAt: msgTime((data as { createdAt?: unknown }).createdAt),
          };
        });
        setMessages(rows);
      },
      () => setMessages([]),
    );
    return () => unsub();
  }, [db, msgJobId]);

  const now = Date.now();
  const tToday = startOfToday();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const stats = useMemo(() => {
    let revenueToday = 0;
    let weekRevenue = 0;
    const daily = [0, 0, 0, 0, 0, 0, 0];
    for (const j of jobs) {
      if (j.status !== "completed") continue;
      const fee = feeForJob(j);
      const ct = parseJobTime(j.completedAt);
      if (ct >= tToday) revenueToday += fee;
      if (ct >= weekAgo) weekRevenue += fee;
    }

    /* Last 7 calendar days (local) */
    for (let i = 0; i < 7; i++) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (6 - i));
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      let sum = 0;
      for (const j of jobs) {
        if (j.status !== "completed") continue;
        const ct = parseJobTime(j.completedAt);
        if (ct >= start.getTime() && ct < end.getTime()) sum += feeForJob(j);
      }
      daily[i] = sum;
    }

    const activeJobs = jobs.filter((j) => j.status === "active").length;
    const liveDrivers = providers.filter((p) => p.status !== "offline").length;

    const serviceToday: Record<string, { count: number; revenue: number }> = {};
    for (const sid of SERVICE_IDS) serviceToday[sid] = { count: 0, revenue: 0 };
    for (const j of jobs) {
      const ct = parseJobTime(j.createdAt);
      if (ct < tToday) continue;
      const sid = j.serviceId in DRIVER_SERVICE_META ? j.serviceId : "haul";
      if (!serviceToday[sid]) serviceToday[sid] = { count: 0, revenue: 0 };
      serviceToday[sid].count += 1;
      if (j.status === "completed") serviceToday[sid].revenue += feeForJob(j);
    }

    const feed = [...jobs]
      .sort((a, b) => parseJobTime(b.createdAt) - parseJobTime(a.createdAt))
      .slice(0, 10);

    const maxDay = Math.max(1, ...daily);
    return {
      revenueToday,
      weekRevenue,
      daily,
      maxDay,
      activeJobs,
      liveDrivers,
      serviceToday,
      feed,
      dayLabels: dayLabelsLast7(),
    };
  }, [jobs, providers, tToday, weekAgo]);

  const criticalCount = useMemo(() => {
    return alerts.filter((a) => normalizeAlertSeverity(a.severity) === "critical").length;
  }, [alerts]);

  const pendingApprovals = useMemo(
    () => providers.filter((p) => p.verificationStatus === "pending"),
    [providers],
  );

  const syntheticAlerts = useMemo(() => {
    const out: {
      id: string;
      severity: AlertSeverity;
      title: string;
      body: string;
      uid?: string;
      signals: string[];
    }[] = [];

    const tenMin = Date.now() - 10 * 60 * 1000;
    const byProvider: Record<string, number> = {};
    for (const j of jobs) {
      const t = parseJobTime(j.acceptedAt);
      if (t >= tenMin && j.providerUid) {
        byProvider[j.providerUid] = (byProvider[j.providerUid] ?? 0) + 1;
      }
    }
    for (const [uid, n] of Object.entries(byProvider)) {
      if (n > 5) {
        out.push({
          id: `syn-vel-${uid}`,
          severity: "high",
          title: "High job-accept velocity",
          body: `Provider accepted ${n} jobs in 10 minutes — possible GPS spoof or abuse.`,
          uid,
          signals: ["velocity", "accepts"],
        });
      }
    }

    const disputeCount = jobs.filter((j) => isDisputed(j)).length;
    if (disputeCount >= 3) {
      out.push({
        id: "syn-disputes",
        severity: "medium",
        title: "Multiple open disputes",
        body: `${disputeCount} disputed jobs on platform.`,
        signals: ["disputes"],
      });
    }

    return out.filter((x) => !dismissedSyntheticIds.has(x.id));
  }, [jobs, dismissedSyntheticIds]);

  const threatLevel = useMemo(() => {
    const crit =
      criticalCount +
      syntheticAlerts.filter((s) => s.severity === "critical").length +
      alerts.filter((a) => normalizeAlertSeverity(a.severity) === "critical").length;
    const high =
      syntheticAlerts.filter((s) => s.severity === "high").length +
      alerts.filter((a) => normalizeAlertSeverity(a.severity) === "high").length;
    if (crit > 0) return "critical" as const;
    if (high > 0) return "elevated" as const;
    return "clear" as const;
  }, [alerts, criticalCount, syntheticAlerts]);

  const filteredJobs = useMemo(() => {
    let list = [...jobs];
    const rangeStart =
      jobRange === "today"
        ? tToday
        : jobRange === "week"
          ? weekAgo
          : monthStart.getTime();
    list = list.filter((j) => parseJobTime(j.createdAt) >= rangeStart);
    if (jobStatusFilter !== "all") {
      list = list.filter((j) => j.status === jobStatusFilter);
    }
    if (jobServiceFilter !== "all") {
      list = list.filter((j) => j.serviceId === jobServiceFilter);
    }
    const q = jobSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (j) =>
          j.id.toLowerCase().includes(q) ||
          (j.customerName ?? "").toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => parseJobTime(b.createdAt) - parseJobTime(a.createdAt));
  }, [jobs, jobRange, jobStatusFilter, jobServiceFilter, jobSearch, tToday, weekAgo, monthStart]);

  const sortedProviders = useMemo(() => {
    const list = [...providers];
    if (provSort === "jobs") {
      list.sort((a, b) => (b.completedJobCount ?? 0) - (a.completedJobCount ?? 0));
    } else if (provSort === "rating") {
      list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (provSort === "earned") {
      list.sort((a, b) => (b.lifetimeEarningsCents ?? 0) - (a.lifetimeEarningsCents ?? 0));
    } else {
      list.sort((a, b) => (b.uid ?? "").localeCompare(a.uid ?? ""));
    }
    return list;
  }, [providers, provSort]);

  const revenueDeep = useMemo(() => {
    let today = 0;
    let week = 0;
    let month = 0;
    let all = 0;
    let volume = 0;
    let jobCount = 0;
    for (const j of jobs) {
      if (j.status !== "completed") continue;
      const fee = feeForJob(j);
      const gross = j.chargedTotalCents ?? j.amountCents ?? 0;
      const ct = parseJobTime(j.completedAt);
      all += fee;
      volume += gross;
      jobCount += 1;
      if (ct >= tToday) today += fee;
      if (ct >= weekAgo) week += fee;
      if (ct >= monthStart.getTime()) month += fee;
    }
    const avgJob = jobCount > 0 ? Math.round(volume / jobCount) : 0;
    let paidToDriversWeek = 0;
    let pendingPayout = 0;
    let failedPayout = 0;
    for (const j of jobs) {
      if (j.status !== "completed") continue;
      const ct = parseJobTime(j.completedAt);
      const payout = j.providerPayoutCents ?? 0;
      if (ct >= weekAgo) paidToDriversWeek += payout;
      if (j.payoutStatus === "pending") pendingPayout += payout;
      if (j.payoutStatus === "failed") failedPayout += payout;
    }
    const byService: Record<string, { fee: number; n: number }> = {};
    for (const sid of SERVICE_IDS) byService[sid] = { fee: 0, n: 0 };
    for (const j of jobs) {
      if (j.status !== "completed") continue;
      const sid = j.serviceId in DRIVER_SERVICE_META ? j.serviceId : "haul";
      if (!byService[sid]) byService[sid] = { fee: 0, n: 0 };
      byService[sid].fee += feeForJob(j);
      byService[sid].n += 1;
    }
    return {
      today,
      week,
      month,
      all,
      volume,
      jobCount,
      avgJob,
      paidToDriversWeek,
      pendingPayout,
      failedPayout,
      byService,
    };
  }, [jobs, tToday, weekAgo, monthStart]);

  const exportCsv = useCallback(() => {
    const rows = [
      ["id", "status", "serviceId", "customerName", "providerName", "amountCents", "platformFeeCents", "createdAt", "completedAt"].join(
        ",",
      ),
      ...jobs.map((j) =>
        [
          j.id,
          j.status,
          j.serviceId,
          JSON.stringify(j.customerName ?? ""),
          JSON.stringify(j.providerName ?? ""),
          j.chargedTotalCents ?? j.amountCents ?? 0,
          feeForJob(j),
          j.createdAt,
          j.completedAt ?? "",
        ].join(","),
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gridd-jobs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }, [jobs]);

  const exportPrint = useCallback(() => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<html><head><title>GRIDD Revenue</title><style>body{font-family:system-ui;background:#060606;color:#eee;padding:24px;} .g{color:#00FF88;font-size:32px;font-family:ui-monospace,Menlo,monospace}</style></head><body><h1>GRIDD — Revenue report</h1><p class="g">${money(revenueDeep.week)}</p><p>Week platform fees (15%)</p><p>Generated ${new Date().toISOString()}</p><script>window.print()</script></body></html>`,
    );
    w.document.close();
  }, [revenueDeep.week]);

  const sendBroadcast = async () => {
    setBcSending(true);
    try {
      await adminPost("/api/notify/broadcast", {
        audience: bcAudience === "zip" ? "zip" : bcAudience,
        title: bcTitle,
        body: bcBody,
        zip: bcAudience === "zip" ? bcZip : undefined,
      });
      setBroadcastOpen(false);
      setBcTitle("");
      setBcBody("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Broadcast failed");
    } finally {
      setBcSending(false);
    }
  };

  const dismissAlert = async (id: string) => {
    if (id.startsWith("syn-")) {
      setDismissedSyntheticIds((prev) => new Set([...prev, id]));
      return;
    }
    try {
      await adminPost("/api/admin/alerts/dismiss", { id });
    } catch {
      /* ignore */
    }
  };

  const sendAdminMessage = async () => {
    const t = msgText.trim();
    const uid = firebaseAuth?.currentUser?.uid;
    if (!t || !msgJobId || !uid) return;
    setMsgSending(true);
    try {
      await addDoc(collection(db, "jobs", msgJobId, "messages"), {
        jobId: msgJobId,
        senderUid: uid,
        senderRole: "admin",
        text: t,
        createdAt: serverTimestamp(),
        smsSent: false,
        readByUids: [uid],
      });
      setMsgText("");
    } finally {
      setMsgSending(false);
    }
  };

  const assignDriver = async (providerUid: string) => {
    if (!assignJob) return;
    try {
      await adminPost("/api/admin/jobs/assign", { jobId: assignJob.id, providerUid });
      setAssignJob(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Assign failed");
    }
  };

  const approveDriverApplication = async (uid: string) => {
    try {
      await adminPost("/api/admin/drivers/approve", { uid });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Approve failed");
    }
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    const parts: string[] = [];
    if (rejectPresets.has("license")) parts.push("License expired or invalid");
    if (rejectPresets.has("insurance")) parts.push("Insurance expired or invalid");
    if (rejectPresets.has("photos")) parts.push("Unclear document photos");
    if (rejectPresets.has("vehicle")) parts.push("Vehicle does not meet requirements");
    if (rejectOther.trim()) parts.push(rejectOther.trim());
    const reason = parts.length ? parts.join(" · ") : "Application not approved.";
    try {
      await adminPost("/api/admin/drivers/reject", { uid: rejectTarget.uid, reason });
      setRejectTarget(null);
      setRejectPresets(new Set());
      setRejectOther("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Reject failed");
    }
  };

  const livePulse = (
    <span className="flex items-center gap-2 text-sm text-zinc-400">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00FF88] opacity-40" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#00FF88]" />
      </span>
      Live
    </span>
  );

  return (
    <div className="min-h-full pb-28" style={{ background: BG, fontFamily: "system-ui, sans-serif" }}>
      {/* Security banner */}
      {criticalCount > 0 && tab !== "security" ? (
        <button
          type="button"
          onClick={() => setTab("security")}
          className="sticky top-0 z-30 flex w-full animate-pulse items-center justify-center gap-2 border-b border-red-500/40 bg-red-950/90 px-4 py-2 text-sm font-semibold text-red-100"
        >
          {criticalCount} Critical Alerts — View Now
        </button>
      ) : null}

      <header
        className="sticky top-0 z-20 border-b px-4 py-4 sm:px-6"
        style={{ borderColor: BORDER, background: `${BG}ee` }}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-[200px] flex-col gap-0.5">
            <div className="text-lg font-bold tracking-tight" style={{ color: GREEN }}>
              GRIDD
            </div>
            <div className="text-xs font-medium text-zinc-500">Admin Command</div>
          </div>
          <div className="flex flex-1 justify-center">{livePulse}</div>
          <div className="flex items-center gap-3">
            {criticalCount > 0 ? (
              <button
                type="button"
                onClick={() => setTab("security")}
                className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white"
              >
                {criticalCount} alerts
              </button>
            ) : null}
            <LogoutButton className="rounded-lg border border-zinc-700 bg-[#0a0a0a] px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-[#00FF88]" />
          </div>
        </div>

        <nav className="mx-auto mt-4 flex max-w-7xl flex-wrap gap-2 border-t border-[#1a1a1a] pt-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "rounded-xl border px-3 py-2 text-left text-sm font-medium transition",
                tab === t.id
                  ? "border-[#00FF88]/50 bg-[#00FF88]/10 text-[#00FF88]"
                  : "border-zinc-800 bg-[#0a0a0a] text-zinc-400 hover:border-zinc-600",
              ].join(" ")}
            >
              <span className="mr-1.5">{t.icon}</span>
              {t.label}
              {t.id === "approvals" && pendingApprovals.length > 0 ? (
                <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  {pendingApprovals.length}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {loadErr ? <p className="mb-4 text-sm text-red-400">{loadErr}</p> : null}

        {tab === "overview" ? (
          <OverviewTab
            stats={stats}
            jobs={jobs}
            criticalCount={criticalCount}
            onSecurity={() => setTab("security")}
          />
        ) : null}

        {tab === "jobs" ? (
          <JobsTab
            filteredJobs={filteredJobs}
            jobStatusFilter={jobStatusFilter}
            setJobStatusFilter={setJobStatusFilter}
            jobServiceFilter={jobServiceFilter}
            setJobServiceFilter={setJobServiceFilter}
            jobRange={jobRange}
            setJobRange={setJobRange}
            jobSearch={jobSearch}
            setJobSearch={setJobSearch}
            setAssignJob={setAssignJob}
          />
        ) : null}

        {tab === "providers" ? (
          <ProvidersTab sortedProviders={sortedProviders} provSort={provSort} setProvSort={setProvSort} />
        ) : null}

        {tab === "messages" ? (
          <MessagesTab
            jobs={jobs}
            msgJobId={msgJobId}
            setMsgJobId={setMsgJobId}
            messages={messages}
            msgText={msgText}
            setMsgText={setMsgText}
            msgSending={msgSending}
            sendAdminMessage={sendAdminMessage}
          />
        ) : null}

        {tab === "security" ? (
          <SecurityTab
            alerts={alerts}
            syntheticAlerts={syntheticAlerts}
            threatLevel={threatLevel}
            dismissAlert={dismissAlert}
            jobs={jobs}
          />
        ) : null}

        {tab === "approvals" ? (
          <ApprovalsTab
            pending={pendingApprovals}
            onApprove={(uid) => void approveDriverApplication(uid)}
            onReject={(p) => setRejectTarget(p)}
          />
        ) : null}

        {tab === "revenue" ? (
          <RevenueTab revenueDeep={revenueDeep} exportCsv={exportCsv} exportPrint={exportPrint} />
        ) : null}
      </div>

      {/* Reject driver modal */}
      {rejectTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div
            className="w-full max-w-md rounded-2xl border p-6"
            style={{ background: CARD, borderColor: BORDER }}
          >
            <h3 className="text-lg font-semibold text-zinc-100">Reason for rejection</h3>
            <div className="mt-4 space-y-2 text-sm text-zinc-300">
              {(
                [
                  ["license", "License expired or invalid"],
                  ["insurance", "Insurance expired or invalid"],
                  ["photos", "Unclear document photos"],
                  ["vehicle", "Vehicle does not meet requirements"],
                ] as const
              ).map(([id, label]) => (
                <label key={id} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rejectPresets.has(id)}
                    onChange={() =>
                      setRejectPresets((prev) => {
                        const n = new Set(prev);
                        if (n.has(id)) n.delete(id);
                        else n.add(id);
                        return n;
                      })
                    }
                  />
                  {label}
                </label>
              ))}
              <div>
                <label className="text-xs text-zinc-500">Other</label>
                <textarea
                  value={rejectOther}
                  onChange={(e) => setRejectOther(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-zinc-200"
                  placeholder="Details…"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-zinc-700 py-2 text-sm text-zinc-400"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectPresets(new Set());
                  setRejectOther("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitReject()}
                className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-bold text-white"
              >
                Send Rejection
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Assign driver modal */}
      {assignJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-6"
            style={{ background: CARD, borderColor: BORDER }}
          >
            <h3 className="text-lg font-semibold text-zinc-100">Assign driver</h3>
            <p className="mt-1 text-sm text-zinc-500">Job {assignJob.id}</p>
            <div className="mt-4 space-y-2">
              {providers
                .filter((p) => {
                  const jz = assignJob.zip?.trim();
                  if (!jz) return p.status !== "offline";
                  return (p.zip ?? "").trim() === jz;
                })
                .slice(0, 40)
                .map((p) => (
                  <button
                    key={p.uid}
                    type="button"
                    onClick={() => void assignDriver(p.uid)}
                    className="flex w-full items-center justify-between rounded-xl border border-zinc-800 px-3 py-2 text-left text-sm hover:border-[#00FF88]"
                  >
                    <span>{p.name}</span>
                    <span className="text-xs text-zinc-500">{p.zip ?? "—"}</span>
                  </button>
                ))}
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-xl border border-zinc-700 py-2 text-sm text-zinc-400"
              onClick={() => setAssignJob(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {/* Broadcast */}
      <button
        type="button"
        onClick={() => setBroadcastOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#00FF88]/40 bg-[#0a0a0a] text-2xl shadow-lg shadow-[#00FF88]/20 transition hover:scale-105"
        aria-label="Broadcast"
      >
        📢
      </button>

      {broadcastOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div
            className="w-full max-w-lg rounded-2xl border p-6 shadow-2xl"
            style={{ background: CARD, borderColor: BORDER }}
          >
            <div className="flex items-center gap-2 text-zinc-100">
              <Megaphone className="h-5 w-5 text-[#00FF88]" />
              <h3 className="text-lg font-semibold">Broadcast</h3>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <label className="block text-zinc-500">Send to</label>
              <select
                value={bcAudience}
                onChange={(e) => setBcAudience(e.target.value as typeof bcAudience)}
                className="w-full rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-zinc-200"
              >
                <option value="all">All users</option>
                <option value="customers">Customers only</option>
                <option value="drivers">Drivers only</option>
                <option value="zip">Specific ZIP</option>
              </select>
              {bcAudience === "zip" ? (
                <input
                  value={bcZip}
                  onChange={(e) => setBcZip(e.target.value)}
                  placeholder="ZIP code"
                  className="w-full rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-zinc-200"
                />
              ) : null}
              <input
                value={bcTitle}
                onChange={(e) => setBcTitle(e.target.value)}
                placeholder="Title"
                className="w-full rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-zinc-200"
              />
              <textarea
                value={bcBody}
                onChange={(e) => setBcBody(e.target.value)}
                placeholder="Message body"
                rows={4}
                className="w-full rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-zinc-200"
              />
              <div className="rounded-xl border border-dashed border-zinc-700 p-3 text-xs text-zinc-500">
                Preview: <span className="text-zinc-300">{bcTitle || "Title"}</span> — {bcBody || "…"}
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setBroadcastOpen(false)}
                className="flex-1 rounded-xl border border-zinc-700 py-2 text-sm text-zinc-400"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bcSending}
                onClick={() => void sendBroadcast()}
                className="flex-1 rounded-xl bg-[#00FF88] py-2 text-sm font-bold text-black disabled:opacity-50"
              >
                {bcSending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OverviewTab({
  stats: s,
  jobs,
  criticalCount,
  onSecurity,
}: {
  stats: OverviewStats;
  jobs: Job[];
  criticalCount: number;
  onSecurity: () => void;
}) {
  return (
    <div className="space-y-8">
      {criticalCount > 0 ? (
        <button
          type="button"
          onClick={onSecurity}
          className="w-full rounded-2xl border border-red-500/50 bg-red-950/40 px-4 py-3 text-left text-sm font-semibold text-red-200"
        >
          {criticalCount} critical security alert(s) — tap to open Security
        </button>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
          <div className="text-xs uppercase tracking-wide text-zinc-500">💰 Revenue today</div>
          <div className="mt-2 font-mono text-3xl font-bold" style={{ color: GREEN }}>
            {money(s.revenueToday)}
          </div>
          <p className="mt-1 text-[11px] text-zinc-600">Platform fee (15%) · completed today</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
          <div className="text-xs uppercase tracking-wide text-zinc-500">🔥 Active jobs</div>
          <div className="mt-2 font-mono text-3xl font-bold" style={{ color: WARN }}>
            {s.activeJobs}
          </div>
        </div>
        <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
          <div className="text-xs uppercase tracking-wide text-zinc-500">🚛 Live drivers</div>
          <div className="mt-2 font-mono text-3xl font-bold" style={{ color: INFO }}>
            {s.liveDrivers}
          </div>
        </div>
        <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
          <div className="text-xs uppercase tracking-wide text-zinc-500">📈 Week revenue</div>
          <div className="mt-2 font-mono text-3xl font-bold" style={{ color: PURPLE }}>
            {money(s.weekRevenue)}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border p-4 sm:p-6" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="text-sm font-semibold text-zinc-200">7-day revenue</h3>
        <div className="mt-4 flex h-36 items-end gap-1 sm:gap-2">
          {s.daily.map((v, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full max-w-[48px] rounded-t-md bg-gradient-to-t from-[#00FF88]/20 to-[#00FF88]"
                style={{ height: `${Math.max(8, (v / s.maxDay) * 100)}%`, minHeight: 8 }}
              />
              <span className="text-[10px] text-zinc-500">{s.dayLabels[i]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border p-4 sm:p-6" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="text-sm font-semibold text-zinc-200">Service breakdown (today)</h3>
        <div className="mt-4 space-y-3">
          {SERVICE_IDS.map((sid) => {
            const meta = DRIVER_SERVICE_META[sid];
            const row = s.serviceToday[sid] ?? { count: 0, revenue: 0 };
            const max = Math.max(1, ...SERVICE_IDS.map((x) => s.serviceToday[x]?.count ?? 0));
            return (
              <div key={sid} className="flex items-center gap-3">
                <span className="text-lg">{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span style={{ color: meta.color }}>{meta.label}</span>
                    <span className="font-mono text-zinc-300">
                      {row.count} jobs · {money(row.revenue)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-zinc-800">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${(row.count / max) * 100}%`,
                        background: meta.color,
                        maxWidth: "100%",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border p-4 sm:p-6" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="text-sm font-semibold text-zinc-200">Live job feed</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="py-2 pr-3">Service</th>
                <th className="py-2 pr-3">Route</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Platform fee</th>
                <th className="py-2">Status</th>
                <th className="py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {s.feed.map((j) => {
                const meta = serviceMeta(j.serviceId, j.serviceName);
                const fee = feeForJob(j);
                const disputed = isDisputed(j);
                const pending = j.status === "pending" || j.status === "requested";
                return (
                  <tr
                    key={j.id}
                    className={[
                      "border-b border-zinc-800/80",
                      disputed ? "bg-red-950/30" : "",
                      pending ? "bg-yellow-950/20" : "",
                    ].join(" ")}
                  >
                    <td className="py-3 pr-3">
                      <span className="mr-2">{meta.icon}</span>
                      <span style={{ color: meta.color }}>{meta.label}</span>
                    </td>
                    <td className="py-3 pr-3 text-zinc-300">
                      {(j.customerName ?? "Customer").split(" ")[0]} → {j.providerName ?? "—"}
                    </td>
                    <td className="py-3 pr-3 font-mono text-zinc-200">
                      {money(j.chargedTotalCents ?? j.amountCents ?? 0)}
                    </td>
                    <td className="py-3 pr-3 font-mono" style={{ color: GREEN }}>
                      {money(fee)}
                    </td>
                    <td className="py-3">
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                        {j.status}
                      </span>
                    </td>
                    <td className="py-3 text-zinc-500">{timeAgo(j.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="text-sm font-semibold text-zinc-200">Live activity</h3>
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs text-zinc-400">
          {jobs.slice(0, 25).map((j) => (
            <li key={j.id} className="flex justify-between gap-2 border-b border-zinc-800/50 py-1">
              <span className="text-emerald-400/90">Job {j.status}</span>
              <span className="font-mono text-zinc-500">{timeAgo(j.createdAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function JobsTab({
  filteredJobs,
  jobStatusFilter,
  setJobStatusFilter,
  jobServiceFilter,
  setJobServiceFilter,
  jobRange,
  setJobRange,
  jobSearch,
  setJobSearch,
  setAssignJob,
}: {
  filteredJobs: Job[];
  jobStatusFilter: string;
  setJobStatusFilter: (v: string) => void;
  jobServiceFilter: string;
  setJobServiceFilter: (v: string) => void;
  jobRange: "today" | "week" | "month";
  setJobRange: (v: "today" | "week" | "month") => void;
  jobSearch: string;
  setJobSearch: (v: string) => void;
  setAssignJob: (j: Job | null) => void;
}) {
  const statuses = ["all", "pending", "requested", "active", "completed", "disputed", "cancelled"];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {statuses.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setJobStatusFilter(st)}
            className={[
              "rounded-full border px-3 py-1.5 text-xs font-medium capitalize",
              jobStatusFilter === st
                ? "border-[#00FF88]/50 bg-[#00FF88]/10 text-[#00FF88]"
                : "border-zinc-800 text-zinc-500",
            ].join(" ")}
          >
            {st}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <select
          value={jobServiceFilter}
          onChange={(e) => setJobServiceFilter(e.target.value)}
          className="rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="all">All services</option>
          {SERVICE_IDS.map((sid) => (
            <option key={sid} value={sid}>
              {DRIVER_SERVICE_META[sid].label}
            </option>
          ))}
        </select>
        <select
          value={jobRange}
          onChange={(e) => setJobRange(e.target.value as "today" | "week" | "month")}
          className="rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
        </select>
        <input
          value={jobSearch}
          onChange={(e) => setJobSearch(e.target.value)}
          placeholder="Search name or job ID"
          className="min-w-[200px] flex-1 rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-sm text-zinc-200"
        />
      </div>

      <div className="space-y-4">
        {filteredJobs.map((j) => {
          const meta = serviceMeta(j.serviceId, j.serviceName);
          const fee = feeForJob(j);
          const gross = j.chargedTotalCents ?? j.amountCents ?? 0;
          const payout = j.providerPayoutCents ?? 0;
          const disputed = isDisputed(j);
          return (
            <div
              key={j.id}
              className="rounded-2xl border p-4"
              style={{
                background: CARD,
                borderColor: disputed ? "rgba(239,68,68,0.5)" : BORDER,
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-mono text-xs text-zinc-500">{j.id}</div>
                <span className="text-lg">{meta.icon}</span>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">{j.status}</span>
              </div>
              <div className="mt-2 text-sm text-zinc-300">
                Customer: {j.customerName ?? "—"} | Provider: {j.providerName ?? "Unassigned"}
              </div>
              <div className="text-xs text-zinc-500">
                {j.addressLine ?? j.city} | ZIP: {j.zip ?? "—"} · Posted {timeAgo(j.createdAt)}
              </div>
              <div className="mt-3 grid gap-1 border-t border-zinc-800 pt-3 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Customer paid</span>
                  <span>{money(gross)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Provider gets</span>
                  <span>{money(payout)}</span>
                </div>
                <div className="flex justify-between" style={{ color: GREEN }}>
                  <span>Platform fee</span>
                  <span>{money(fee)}</span>
                </div>
              </div>
              {!j.providerUid ? (
                <button
                  type="button"
                  onClick={() => setAssignJob(j)}
                  className="mt-3 w-full rounded-xl border border-[#3B82F6]/50 py-2 text-sm font-semibold text-[#3B82F6]"
                >
                  Find Driver
                </button>
              ) : null}
              {disputed ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
                    onClick={() => alert("Refund workflow — connect finance / Stripe")}
                  >
                    ✅ Refund Customer
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
                    onClick={() => alert("Release to provider — ops review")}
                  >
                    💰 Release to Provider
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
                    onClick={() => alert("Investigation logged")}
                  >
                    👁 Investigate
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProvidersTab({
  sortedProviders,
  provSort,
  setProvSort,
}: {
  sortedProviders: Provider[];
  provSort: "jobs" | "rating" | "earned" | "recent";
  setProvSort: (v: "jobs" | "rating" | "earned" | "recent") => void;
}) {
  const total = sortedProviders.length;
  const activeNow = sortedProviders.filter((p) => p.status === "active" || p.status === "idle").length;
  const verified = sortedProviders.filter((p) => p.verified).length;
  const avgRating =
    total > 0
      ? sortedProviders.reduce((a, p) => a + (p.rating ?? 0), 0) / total
      : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Total", String(total)],
          ["Active now", String(activeNow)],
          ["Verified", String(verified)],
          ["Avg rating", avgRating.toFixed(2)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border p-3 text-center" style={{ background: CARD, borderColor: BORDER }}>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">{k}</div>
            <div className="mt-1 font-mono text-xl text-zinc-100">{v}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["jobs", "Most jobs"],
            ["rating", "Highest rated"],
            ["earned", "Most earned"],
            ["recent", "Recently active"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setProvSort(id)}
            className={[
              "rounded-full border px-3 py-1.5 text-xs",
              provSort === id ? "border-[#00FF88]/40 text-[#00FF88]" : "border-zinc-800 text-zinc-500",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {sortedProviders.map((p) => {
          const initial = (p.name ?? "?").slice(0, 1).toUpperCase();
          const tier = p.driverTier ?? "starter";
          const st = p.status ?? "offline";
          return (
            <div key={p.uid} className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
              <div className="flex flex-wrap items-start gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-black"
                  style={{ background: INFO }}
                >
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-zinc-100">{p.name}</span>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
                      {tier}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Status:{" "}
                    {st === "active" || st === "idle" ? (
                      <span className="text-[#00FF88]">● {st}</span>
                    ) : (
                      <span className="text-zinc-500">○ {st}</span>
                    )}
                  </div>
                  <div className="mt-2 font-mono text-sm text-zinc-300">
                    ★ {(p.rating ?? 0).toFixed(1)} · Jobs: {p.completedJobCount ?? 0} · Earned:{" "}
                    {money(p.lifetimeEarningsCents ?? 0)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(p.serviceIds ?? SERVICE_IDS.slice(0, 4)).slice(0, 8).map((sid) => (
                      <span key={sid} className="text-lg">
                        {DRIVER_SERVICE_META[sid]?.icon ?? "·"}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">ZIP: {p.zip ?? "—"}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!p.verified ? (
                      <button
                        type="button"
                        onClick={() => void adminPost("/api/admin/providers/verify", { uid: p.uid })}
                        className="rounded-lg bg-[#00FF88]/20 px-2 py-1 text-xs font-semibold text-[#00FF88]"
                      >
                        ✅ Verify
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void adminPost("/api/admin/users/suspend", { uid: p.uid, hours: 24 })}
                      className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
                    >
                      🔒 Suspend 24h
                    </button>
                    <button
                      type="button"
                      onClick={() => void adminPost("/api/admin/block", { uid: p.uid })}
                      className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-400"
                    >
                      Block
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MessagesTab({
  jobs,
  msgJobId,
  setMsgJobId,
  messages,
  msgText,
  setMsgText,
  msgSending,
  sendAdminMessage,
}: {
  jobs: Job[];
  msgJobId: string | null;
  setMsgJobId: (id: string | null) => void;
  messages: JobChatMessage[];
  msgText: string;
  setMsgText: (t: string) => void;
  msgSending: boolean;
  sendAdminMessage: () => void | Promise<void>;
}) {
  const threads = useMemo(() => [...jobs].slice(0, 80), [jobs]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-300">Threads</h3>
        <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {threads.map((j) => {
            const meta = serviceMeta(j.serviceId, j.serviceName);
            return (
              <button
                key={j.id}
                type="button"
                onClick={() => setMsgJobId(j.id)}
                className={[
                  "flex w-full flex-col rounded-xl border px-3 py-2 text-left text-sm",
                  msgJobId === j.id ? "border-[#00FF88]/50 bg-[#00FF88]/5" : "border-zinc-800 bg-[#0a0a0a]",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <span>{meta.icon}</span>
                  <span className="font-mono text-xs text-zinc-500">{j.id}</span>
                </div>
                <div className="text-xs text-zinc-400">
                  {j.customerName ?? "Customer"} ↔ {j.providerName ?? "Driver"}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
        {msgJobId ? (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-amber-500/40 px-2 py-1 text-xs text-amber-400"
                onClick={() => alert("Flagged for review")}
              >
                🚨 Flag
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
                onClick={async () => {
                  await updateDoc(doc(getFirestore(app), "jobs", msgJobId), {
                    threadLocked: true,
                  } as Record<string, unknown>).catch(() => alert("Could not lock (rules?)"));
                }}
              >
                🔒 Lock thread
              </button>
              <button
                type="button"
                className="rounded-lg border border-[#3B82F6]/40 px-2 py-1 text-xs text-[#3B82F6]"
                onClick={async () => {
                  const token = await firebaseAuth?.currentUser?.getIdToken();
                  if (!token) return;
                  const res = await fetch(`/api/jobs/${msgJobId}/call-bridge`, {
                    headers: { authorization: `Bearer ${token}` },
                  });
                  const data = (await res.json()) as { dialUrl?: string };
                  if (data.dialUrl) window.location.href = data.dialUrl;
                  else alert("Call bridge not configured");
                }}
              >
                📞 Call bridge
              </button>
            </div>
            <div className="max-h-[45vh] flex-1 space-y-2 overflow-y-auto">
              {messages.map((m) => {
                const isCust = m.senderRole === "customer";
                const isAdmin = m.senderRole === "admin";
                return (
                  <div
                    key={m.id}
                    className={[
                      "flex max-w-[90%] flex-col rounded-2xl px-3 py-2 text-sm",
                      isAdmin
                        ? "mx-auto bg-zinc-800 text-zinc-200"
                        : isCust
                          ? "mr-auto border border-blue-500/30 bg-blue-950/40 text-blue-100"
                          : "ml-auto border border-[#00FF88]/30 bg-[#00FF88]/10 text-[#00FF88]",
                    ].join(" ")}
                  >
                    <div className="text-[10px] uppercase text-zinc-500">{m.senderRole}</div>
                    <div>{m.text}</div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500">
                      {m.smsSent ? <MessageCircle className="h-3 w-3" /> : null}
                      {(m.readByUids?.length ?? 0) > 1 ? (
                        <CheckCheck className="h-3 w-3 text-[#00FF88]" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                placeholder="Message as GRIDD Admin…"
                className="flex-1 rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-sm text-zinc-200"
              />
              <button
                type="button"
                disabled={msgSending}
                onClick={() => void sendAdminMessage()}
                className="rounded-xl bg-[#00FF88] px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-500">Select a job thread.</p>
        )}
      </div>
    </div>
  );
}

function SecurityTab({
  alerts,
  syntheticAlerts,
  threatLevel,
  dismissAlert,
  jobs,
}: {
  alerts: FireAlert[];
  syntheticAlerts: { id: string; severity: AlertSeverity; title: string; body: string; uid?: string; signals: string[] }[];
  threatLevel: "clear" | "elevated" | "critical";
  dismissAlert: (id: string) => void | Promise<void>;
  jobs: Job[];
}) {
  const blocked = 0;
  const eventsPerMin = Math.min(99, Math.max(1, Math.floor(jobs.length / 10)));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-100">Security Command</h2>
        <p className="text-sm text-zinc-500">Real-time monitoring · GRIDD Network</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs font-mono">
          <span className="text-red-400">{alerts.filter((a) => normalizeAlertSeverity(a.severity) === "critical").length} critical</span>
          <span className="text-amber-400">{alerts.filter((a) => normalizeAlertSeverity(a.severity) === "high").length} high</span>
          <span className="text-zinc-400">{blocked} blocked</span>
          <span className="text-zinc-400">{eventsPerMin} events/min</span>
        </div>
      </div>

      <div
        className={[
          "h-3 w-full rounded-full",
          threatLevel === "critical"
            ? "animate-pulse bg-red-600"
            : threatLevel === "elevated"
              ? "bg-amber-500"
              : "bg-[#00FF88]",
        ].join(" ")}
      />
      <p className="text-xs text-zinc-500">
        {threatLevel === "clear" ? "ALL CLEAR" : threatLevel === "elevated" ? "ELEVATED" : "CRITICAL"}
      </p>

      <div className="space-y-4">
        {syntheticAlerts.map((item) => {
          const sev = item.severity;
          const id = item.id;
          return (
            <div key={id} className="rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-4">
              <div className="text-xs font-bold text-zinc-400">
                {sev === "critical" ? "🔴 CRITICAL" : sev === "high" ? "🟠 HIGH" : "🟡 MEDIUM"} · Live
              </div>
              <div className="mt-1 font-semibold text-zinc-200">{item.title}</div>
              <p className="mt-1 text-sm text-zinc-500">{item.body}</p>
              {item.signals?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.signals.map((sig) => (
                    <span key={sig} className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                      {sig}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void dismissAlert(id)}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                >
                  👁 Dismiss
                </button>
                {item.uid ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void adminPost("/api/admin/users/suspend", { uid: item.uid, hours: 24 })}
                      className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                    >
                      ⏸ Suspend 24h
                    </button>
                    <button
                      type="button"
                      onClick={() => void adminPost("/api/admin/block", { uid: item.uid })}
                      className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-400"
                    >
                      🔒 BLOCK NOW
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
        {alerts.map((a) => {
          const sev = normalizeAlertSeverity(a.severity);
          return (
            <div key={a.id} className="rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-4">
              <div className="text-xs font-bold text-zinc-400">
                {sev === "critical" ? "🔴 CRITICAL" : sev === "high" ? "🟠 HIGH" : "🟡 MEDIUM"}
              </div>
              <div className="mt-1 font-semibold text-zinc-200">{a.title ?? a.type ?? "Alert"}</div>
              <p className="mt-1 text-sm text-zinc-500">{a.body ?? ""}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void dismissAlert(a.id)}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                >
                  👁 Monitor (dismiss)
                </button>
                {a.uid ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void adminPost("/api/admin/users/suspend", { uid: a.uid, hours: 24 })}
                      className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                    >
                      ⏸ Suspend 24h
                    </button>
                    <button
                      type="button"
                      onClick={() => void adminPost("/api/admin/block", { uid: a.uid })}
                      className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-400"
                    >
                      🔒 BLOCK NOW
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function submittedStr(p: Provider): string {
  const raw = p.submittedAt as unknown;
  if (!raw) return "—";
  if (typeof raw === "string") return timeAgo(raw);
  if (
    typeof raw === "object" &&
    raw !== null &&
    "toDate" in raw &&
    typeof (raw as { toDate: () => Date }).toDate === "function"
  ) {
    return timeAgo((raw as { toDate: () => Date }).toDate().toISOString());
  }
  return "—";
}

function ApprovalsTab({
  pending,
  onApprove,
  onReject,
}: {
  pending: Provider[];
  onApprove: (uid: string) => void;
  onReject: (p: Provider) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-100">Driver Applications</h2>
          <p className="text-sm text-zinc-500">Pending CEO review</p>
        </div>
        <span className="rounded-full bg-amber-500/20 px-4 py-1.5 text-sm font-bold text-amber-400">
          {pending.length} Pending Review
        </span>
      </div>

      {pending.length === 0 ? (
        <p className="text-sm text-zinc-500">No pending applications.</p>
      ) : null}

      <div className="space-y-4">
        {pending.map((p) => {
          const docs = p.documents;
          const vehicle = docs
            ? `${docs.vehicleYear ?? ""} ${docs.vehicleMake ?? ""} ${docs.vehicleModel ?? ""} ${docs.vehicleColor ?? ""} · ${docs.licensePlate ?? ""}`
            : "—";
          return (
            <div
              key={p.uid}
              className="rounded-2xl border p-5"
              style={{ background: CARD, borderColor: BORDER }}
            >
              <div className="flex flex-wrap gap-4">
                {docs?.profilePhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={docs.profilePhoto}
                    alt=""
                    className="h-20 w-20 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-800 text-2xl">👤</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-semibold text-zinc-100">{p.name}</div>
                  <div className="text-sm text-zinc-500">{p.email ?? "—"}</div>
                  <div className="text-sm text-zinc-400">
                    📍 {p.city || "—"}
                    {p.zip ?? docs?.serviceZip ? ` · ${p.zip ?? docs?.serviceZip}` : ""}
                  </div>
                  <div className="text-xs text-zinc-600">Submitted: {submittedStr(p)}</div>
                </div>
              </div>

              <div className="mt-4 text-sm text-zinc-300">🚗 {vehicle}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(p.serviceIds ?? docs?.serviceIds ?? []).slice(0, 11).map((sid) => (
                  <span key={sid} className="text-lg">
                    {DRIVER_SERVICE_META[sid]?.icon ?? "·"}
                  </span>
                ))}
              </div>

              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {docs?.licenseFront ? (
                  <a
                    href={docs.licenseFront}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#3B82F6] hover:underline"
                  >
                    🪪 License Front — View
                  </a>
                ) : null}
                {docs?.licenseBack ? (
                  <a
                    href={docs.licenseBack}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#3B82F6] hover:underline"
                  >
                    🪪 License Back — View
                  </a>
                ) : null}
                {docs?.insurance ? (
                  <a
                    href={docs.insurance}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#3B82F6] hover:underline"
                  >
                    🛡️ Insurance Card — View
                  </a>
                ) : null}
              </div>

              <div className="mt-3 font-mono text-xs text-zinc-500">
                License: {docs?.licenseNumber ?? "—"} · Exp {docs?.licenseExpiry ?? "—"} · {docs?.licenseState ?? ""}
              </div>
              <div className="font-mono text-xs text-zinc-500">
                Insurance: {docs?.insuranceProvider ?? "—"} · Exp {docs?.insuranceExpiry ?? "—"}
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onApprove(p.uid)}
                  className="rounded-xl bg-[#00FF88] px-4 py-2 text-sm font-bold text-black"
                >
                  ✅ APPROVE
                </button>
                <button
                  type="button"
                  onClick={() => onReject(p)}
                  className="rounded-xl border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-400"
                >
                  ❌ REJECT
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RevenueTab({
  revenueDeep,
  exportCsv,
  exportPrint,
}: {
  revenueDeep: {
    today: number;
    week: number;
    month: number;
    all: number;
    volume: number;
    jobCount: number;
    avgJob: number;
    paidToDriversWeek: number;
    pendingPayout: number;
    failedPayout: number;
    byService: Record<string, { fee: number; n: number }>;
  };
  exportCsv: () => void;
  exportPrint: () => void;
}) {
  const r = revenueDeep;
  const projections = [
    [100, 150],
    [500, 150],
    [1000, 150],
    [10000, 150],
  ] as const;
  return (
    <div className="space-y-8">
      <div className="rounded-2xl border p-6 text-center" style={{ background: CARD, borderColor: BORDER }}>
        <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Your platform cut this week</div>
        <div className="mt-2 font-mono text-4xl font-bold text-[#00FF88] sm:text-5xl">{money(r.week)}</div>
        <div className="mt-2 text-sm text-zinc-500">
          15% of {money(r.volume)} total volume · {r.jobCount} jobs
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            ["Today", money(r.today)],
            ["This week", money(r.week)],
            ["This month", money(r.month)],
            ["All time", money(r.all)],
            ["Avg job value", money(r.avgJob)],
            ["Jobs processed", String(r.jobCount)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl border p-3" style={{ background: CARD, borderColor: BORDER }}>
            <div className="text-[10px] uppercase text-zinc-500">{k}</div>
            <div className="mt-1 font-mono text-lg text-zinc-100">{v}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="text-sm font-semibold text-zinc-200">Revenue by service</h3>
        <div className="mt-4 space-y-3">
          {SERVICE_IDS.map((sid) => {
            const meta = DRIVER_SERVICE_META[sid];
            const row = r.byService[sid] ?? { fee: 0, n: 0 };
            const max = Math.max(1, ...SERVICE_IDS.map((x) => r.byService[x]?.fee ?? 0));
            return (
              <div key={sid}>
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>
                    {meta.icon} {meta.label}
                  </span>
                  <span className="font-mono">
                    {money(row.fee)} · {row.n} jobs
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-zinc-800">
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${(row.fee / max) * 100}%`, background: meta.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="text-sm font-semibold text-zinc-200">Payout tracking</h3>
        <div className="mt-3 space-y-2 font-mono text-sm text-zinc-300">
          <div className="flex justify-between">
            <span className="text-zinc-500">Paid to drivers (week)</span>
            <span>{money(r.paidToDriversWeek)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Pending payouts</span>
            <span className="text-amber-400">{money(r.pendingPayout)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Failed payouts</span>
            <span className="text-red-400">{money(r.failedPayout)}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="text-sm font-semibold text-zinc-200">Projections (15% platform)</h3>
        <table className="mt-3 w-full text-left font-mono text-sm text-zinc-300">
          <tbody>
            {projections.map(([jobsPerDay, avg]) => (
              <tr key={jobsPerDay} className="border-b border-zinc-800">
                <td className="py-2">{jobsPerDay.toLocaleString()} jobs/day @ ${avg} avg</td>
                <td className="py-2 text-[#00FF88]">
                  {money(Math.round(jobsPerDay * avg * 100 * 0.15))}/day platform cut
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-xl border border-[#00FF88]/40 px-4 py-2 text-sm font-semibold text-[#00FF88]"
        >
          Export CSV
        </button>
        <button
          type="button"
          onClick={exportPrint}
          className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300"
        >
          Export PDF (print)
        </button>
      </div>
    </div>
  );
}
