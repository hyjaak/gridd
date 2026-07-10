"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import type { User } from "@/types";
import { countSignupsToday } from "@/lib/admin-dashboard-stats";
import { AdminTopStatsBar, type AdminTopNavTarget } from "@/components/admin/AdminTopStatsBar";
import { AdminGriddEyeTab, type GriddEyeFilter } from "@/components/admin/AdminGriddEyeTab";
import { AdminCeoAlertsBell, type CeoAlertRow } from "@/components/admin/AdminCeoAlertsBell";
import { Check, CheckCheck, Megaphone, MessageCircle } from "lucide-react";
import app from "@/lib/firebase";
import { firebaseAuth } from "@/lib/firebase";
import { LogoutButton } from "@/components/LogoutButton";
import { money } from "@/lib/job-tracking";
import { serviceMeta, DRIVER_SERVICE_META } from "@/lib/driver-service-meta";
import type { Job, JobChatMessage, Provider } from "@/types";
import { normalizeChatDocToJobMessage } from "@/lib/chat-message-normalize";
import {
  feeForJob,
  isDisputed,
  normalizeAlertSeverity,
  parseJobTime,
  timeAgo,
  type AlertSeverity,
} from "./admin-dashboard-utils";
import { canGoOnline, demoJobLimit, demoJobsUsedCount } from "@/lib/driver-gate";
import { isProviderAvailableForMatching, isProviderLiveOnPlatform } from "@/lib/provider-status";
import { useAuth } from "@/hooks/useAuth";
import { AdminPorchReportsTab } from "@/components/admin/AdminPorchReportsTab";
import { AdminDmReportsTab } from "@/components/admin/AdminDmReportsTab";
import { AdminLiveFeedTab } from "@/components/admin/AdminLiveFeedTab";
import { AdminPlatformDmsTab } from "@/components/admin/AdminPlatformDmsTab";
import { AdminBintaVaultTab } from "@/components/admin/AdminBintaVaultTab";
import { AdminComingSoonTab } from "@/components/admin/AdminComingSoonTab";
import { AdminDemoTab } from "@/components/admin/AdminDemoTab";
import { AdminDiscountsTab } from "@/components/admin/AdminDiscountsTab";
import { AdminPricingTab } from "@/components/admin/AdminPricingTab";
import { AdminPriceIqTab } from "@/components/admin/AdminPriceIqTab";
import { AdminBitesTab } from "@/components/admin/AdminBitesTab";
import { EmptyState } from "@/components/admin/EmptyState";
import {
  addCeoCustomerNote,
  addCeoDriverNote,
  approveDriverApplication as commitDriverApproval,
  assignJobToProvider,
  banCustomerAccount,
  banDriverAccount,
  blockUser,
  dismissAlertDoc,
  rejectDriverApplication,
  releaseDriverHold,
  requestDriverDocs,
  sendAdminJobChatMessage,
  setCustomerAccountHold,
  setDriverHold,
  suspendCustomerAccount,
  suspendDriverAccount,
  suspendUser,
  verifyDriverLicense,
  verifyProvider,
} from "@/lib/admin-firestore";

const BG = "#0a0a0a";
const CARD = "#111";
const BORDER = "#1e1e1e";
const GREEN = "#3dff7a";
const HEADER_GREEN = "#3dff7a";
const WARN = "#FFB800";
const INFO = "#3B82F6";
const PURPLE = "#8B5CF6";

type TabId =
  | "overview"
  | "jobs"
  | "providers"
  | "customers"
  | "messages"
  | "security"
  | "approvals"
  | "revenue"
  | "reports"
  | "dm-reports"
  | "live-feed"
  | "platform-dms"
  | "pricing"
  | "price-iq"
  | "discounts"
  | "vault"
  | "demo"
  | "partner"
  | "gridd-eye"
  | "bites";

type TabDef = { id: TabId; label: string; icon: string; vaultCeoOnly?: boolean };

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

const TABS: TabDef[] = [
  { id: "overview", label: "Overview", icon: "⚡" },
  { id: "jobs", label: "Jobs", icon: "📦" },
  { id: "providers", label: "Providers", icon: "🚛" },
  { id: "messages", label: "Messages", icon: "💬" },
  { id: "gridd-eye", label: "GRIDD Eye", icon: "👁️" },
  { id: "security", label: "Security", icon: "🔐" },
  { id: "approvals", label: "Approvals", icon: "📋" },
  { id: "revenue", label: "Revenue", icon: "💰" },
  { id: "bites", label: "Bites", icon: "🍗" },
  { id: "pricing", label: "Pricing", icon: "💲" },
  { id: "price-iq", label: "PriceIQ™", icon: "📊" },
  { id: "vault", label: "Vault", icon: "🏦", vaultCeoOnly: true },
  { id: "demo", label: "Demo", icon: "🎮" },
  { id: "reports", label: "Reports", icon: "🚩" },
  { id: "dm-reports", label: "DM Reports", icon: "🛡️" },
  { id: "partner", label: "Partner", icon: "🤝" },
  { id: "customers", label: "Customers", icon: "👤" },
  { id: "platform-dms", label: "All DMs", icon: "📨" },
  { id: "live-feed", label: "Live Feed", icon: "🔴" },
  { id: "discounts", label: "Discounts", icon: "🎁" },
];

const TAB_ID_SET: ReadonlySet<string> = new Set(TABS.map((t) => t.id));

function msgTime(raw: unknown): string {
  if (raw instanceof Timestamp) return raw.toDate().toISOString();
  if (typeof raw === "string") return raw;
  return new Date().toISOString();
}

async function postNotifyBroadcast(body: Record<string, unknown>) {
  const token = await firebaseAuth?.currentUser?.getIdToken();
  if (!token) throw new Error("Not signed in");
  const res = await fetch("/api/notify/broadcast", {
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
  const [requestDocsTarget, setRequestDocsTarget] = useState<Provider | null>(null);
  const [requestDocsNote, setRequestDocsNote] = useState("");

  /** Optimistic demo toggle until Firestore snapshot catches up */
  const [demoOptimistic, setDemoOptimistic] = useState<Record<string, boolean | undefined>>({});
  const [demoToast, setDemoToast] = useState<string | null>(null);

  const [userRows, setUserRows] = useState<(User & { uid: string })[]>([]);
  const [ceoAlertRows, setCeoAlertRows] = useState<CeoAlertRow[]>([]);
  const [porchReportRows, setPorchReportRows] = useState<{ id: string; status?: string }[]>([]);
  const [griddEyeFilter, setGriddEyeFilter] = useState<GriddEyeFilter>("all");
  const [securityLogs, setSecurityLogs] = useState<
    {
      id: string;
      uid?: string;
      email?: string;
      kind?: string;
      ip?: string;
      userAgent?: string;
      createdAt?: unknown;
    }[]
  >([]);
  const [failedLoginRows, setFailedLoginRows] = useState<
    { id: string; email?: string; ip?: string; userAgent?: string; createdAt?: unknown }[]
  >([]);

  // Live stat cards (do not derive from cached arrays)
  const [userCountLive, setUserCountLive] = useState(0);
  const [jobsTodayLive, setJobsTodayLive] = useState(0);
  const [liveDriversOnline, setLiveDriversOnline] = useState(0);
  const [revenueTodayLive, setRevenueTodayLive] = useState(0);
  const [pendingApprovalsLive, setPendingApprovalsLive] = useState(0);

  const { isCEO, role: userRoleAuth, user: authUser } = useAuth();
  const canAccessApprovals = isCEO === true || userRoleAuth === "ceo";

  const [adminDoc, setAdminDoc] = useState<{ role?: string; isCEO?: boolean } | null | undefined>(undefined);
  useEffect(() => {
    if (!db || !firebaseAuth?.currentUser) {
      setAdminDoc(null);
      return;
    }
    const u = firebaseAuth.currentUser;
    return onSnapshot(
      doc(db, "admins", u.uid),
      (snap) => {
        if (!snap.exists()) setAdminDoc(null);
        else {
          const d = snap.data() as { role?: string; isCEO?: boolean };
          setAdminDoc(d);
        }
      },
      () => setAdminDoc(null),
    );
  }, [db, authUser?.uid]);

  const showCeoOnlyVault = useMemo(() => {
    if (!canAccessApprovals) return false;
    if (adminDoc === undefined) return false;
    if (adminDoc === null) return false;
    return adminDoc.role === "ceo" && adminDoc.isCEO === true;
  }, [canAccessApprovals, adminDoc]);

  const visibleTabs = useMemo(() => {
    let list = canAccessApprovals ? TABS : TABS.filter((t) => t.id !== "approvals" && t.id !== "price-iq");
    if (!showCeoOnlyVault) {
      list = list.filter((t) => !t.vaultCeoOnly);
    }
    return list;
  }, [canAccessApprovals, showCeoOnlyVault]);

  useEffect(() => {
    if (!canAccessApprovals && (tab === "approvals" || tab === "price-iq")) setTab("overview");
  }, [canAccessApprovals, tab]);

  useEffect(() => {
    if (tab === "vault" && canAccessApprovals && adminDoc !== undefined && !showCeoOnlyVault) {
      setTab("overview");
    }
  }, [tab, canAccessApprovals, adminDoc, showCeoOnlyVault]);

  /** Open a tab from URL: /admin/dashboard?tab=vault */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("tab");
    if (raw && TAB_ID_SET.has(raw)) setTab(raw as TabId);
  }, []);

  useEffect(() => {
    if (!demoToast) return;
    const t = setTimeout(() => setDemoToast(null), 4500);
    return () => clearTimeout(t);
  }, [demoToast]);

  useEffect(() => {
    setDemoOptimistic((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const uid of Object.keys(next)) {
        const p = providers.find((x) => x.uid === uid);
        if (p && p.demoMode === next[uid]) {
          delete next[uid];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [providers]);

  const displayProviders = useMemo(
    () =>
      providers.map((p) => ({
        ...p,
        demoMode:
          demoOptimistic[p.uid] !== undefined ? (demoOptimistic[p.uid] as boolean) : p.demoMode,
      })),
    [providers, demoOptimistic],
  );

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
    const qOrdered = query(collection(db, "providers"), orderBy("createdAt", "desc"), limit(500));
    let unsubFallback: (() => void) | undefined;
    const unsub = onSnapshot(
      qOrdered,
      (snap) => {
        setProviders(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Provider, "uid">) })));
      },
      () => {
        const q2 = query(collection(db, "providers"), limit(500));
        unsubFallback = onSnapshot(
          q2,
          (snap) => {
            setProviders(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Provider, "uid">) })));
          },
          () => setProviders([]),
        );
      },
    );
    return () => {
      unsub();
      unsubFallback?.();
    };
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
    const q = query(collection(db, "chats", msgJobId, "messages"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const sorted = snap.docs.slice().sort((a, b) => {
          const ca = a.data().createdAt as { toMillis?: () => number } | undefined;
          const cb = b.data().createdAt as { toMillis?: () => number } | undefined;
          return (ca?.toMillis?.() ?? 0) - (cb?.toMillis?.() ?? 0);
        });
        setMessages(sorted.map((d) => normalizeChatDocToJobMessage(d, msgJobId)));
      },
      () => setMessages([]),
    );
    return () => unsub();
  }, [db, msgJobId]);

  useEffect(() => {
    const qOrdered = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(4000));
    let unsubFallback: (() => void) | undefined;
    const unsub = onSnapshot(
      qOrdered,
      (snap) => {
        setUserRows(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<User, "uid">) }) as User & { uid: string }));
      },
      () => {
        const q2 = query(collection(db, "users"), limit(4000));
        unsubFallback = onSnapshot(
          q2,
          (snap) => {
            setUserRows(
              snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<User, "uid">) }) as User & { uid: string }),
            );
          },
          () => setUserRows([]),
        );
      },
    );
    return () => {
      unsub();
      unsubFallback?.();
    };
  }, [db]);

  // ── Live stat listeners (real-time, independent of UI state) ────────────────
  useEffect(() => {
    return onSnapshot(collection(db, "users"), (snap) => setUserCountLive(snap.size), () => setUserCountLive(0));
  }, [db]);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return onSnapshot(
      query(collection(db, "jobs"), where("createdAt", ">=", today)),
      (snap) => setJobsTodayLive(snap.size),
      () => setJobsTodayLive(0),
    );
  }, [db]);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "providers"), where("isOnline", "==", true), where("accountStatus", "==", "approved")),
      (snap) => setLiveDriversOnline(snap.size),
      () => setLiveDriversOnline(0),
    );
  }, [db]);

  useEffect(() => {
    return onSnapshot(
      doc(db, "revenue", "today"),
      (snap) => setRevenueTodayLive((snap.data() as { total?: number } | undefined)?.total ?? 0),
      () => setRevenueTodayLive(0),
    );
  }, [db]);

  useEffect(() => {
    // Prefer IN query; fall back to two listeners if needed.
    const qIn = query(
      collection(db, "providers"),
      where("accountStatus", "in", ["pending", "pending_review"]),
      where("documentsSubmitted", "==", true),
    );
    let unsub2: (() => void) | undefined;
    let unsub3: (() => void) | undefined;
    const unsub = onSnapshot(
      qIn,
      (snap) => setPendingApprovalsLive(snap.size),
      () => {
        const qA = query(
          collection(db, "providers"),
          where("accountStatus", "==", "pending"),
          where("documentsSubmitted", "==", true),
        );
        const qB = query(
          collection(db, "providers"),
          where("accountStatus", "==", "pending_review"),
          where("documentsSubmitted", "==", true),
        );
        let a = 0;
        let b = 0;
        const update = () => setPendingApprovalsLive(a + b);
        unsub2 = onSnapshot(
          qA,
          (snap) => {
            a = snap.size;
            update();
          },
          () => {
            a = 0;
            update();
          },
        );
        unsub3 = onSnapshot(
          qB,
          (snap) => {
            b = snap.size;
            update();
          },
          () => {
            b = 0;
            update();
          },
        );
      },
    );
    return () => {
      unsub();
      unsub2?.();
      unsub3?.();
    };
  }, [db]);

  useEffect(() => {
    const qOrd = query(collection(db, "ceoAlerts"), orderBy("createdAt", "desc"), limit(80));
    let unsubFallback: (() => void) | undefined;
    const unsub = onSnapshot(
      qOrd,
      (snap) => {
        setCeoAlertRows(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CeoAlertRow, "id">) })),
        );
      },
      () => {
        const q2 = query(collection(db, "ceoAlerts"), limit(80));
        unsubFallback = onSnapshot(q2, (snap) => {
          setCeoAlertRows(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CeoAlertRow, "id">) })),
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
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(200));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPorchReportRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as { status?: string }) })));
      },
      () => setPorchReportRows([]),
    );
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const qOrd = query(collection(db, "securityLogs"), orderBy("createdAt", "desc"), limit(100));
    let unsubFallback: (() => void) | undefined;
    const unsub = onSnapshot(
      qOrd,
      (snap) => {
        setSecurityLogs(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })),
        );
      },
      () => {
        const q2 = query(collection(db, "securityLogs"), limit(60));
        unsubFallback = onSnapshot(q2, (snap) => {
          setSecurityLogs(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })),
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
    const qOrd = query(collection(db, "failedLogins"), orderBy("createdAt", "desc"), limit(80));
    let unsubFallback: (() => void) | undefined;
    const unsub = onSnapshot(
      qOrd,
      (snap) => {
        setFailedLoginRows(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })),
        );
      },
      () => {
        const q2 = query(collection(db, "failedLogins"), limit(40));
        unsubFallback = onSnapshot(q2, (snap) => {
          setFailedLoginRows(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })),
          );
        });
      },
    );
    return () => {
      unsub();
      unsubFallback?.();
    };
  }, [db]);

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

    const activeJobs = jobs.filter((j) =>
      ["active", "assigned", "en_route", "arrived", "in_progress"].includes(j.status),
    ).length;
    const liveDrivers = providers.filter((p) => isProviderLiveOnPlatform(p)).length;

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
    () =>
      providers.filter((p) => {
        if (p.documentsSubmitted !== true) return false;
        const s = p.accountStatus;
        if (s === "pending_review" || s === "pending") return true;
        if (p.verificationStatus === "pending" && s !== "approved" && s !== "rejected") return true;
        return false;
      }),
    [providers],
  );

  const pendingReportsCount = useMemo(
    () => porchReportRows.filter((r) => r.status !== "dismissed").length,
    [porchReportRows],
  );

  const signupsToday = useMemo(() => countSignupsToday(userRows, tToday), [userRows, tToday]);

  const failedPaymentsCount = useMemo(
    () => jobs.filter((j) => j.paymentStatus === "failed").length,
    [jobs],
  );

  const avgRatingDrivers = useMemo(() => {
    if (providers.length === 0) return 0;
    return providers.reduce((s, p) => s + (p.rating ?? 0), 0) / providers.length;
  }, [providers]);

  const navigateTop = useCallback((target: AdminTopNavTarget) => {
    if (target === "overview") setTab("overview");
    else if (target === "jobs") setTab("jobs");
    else if (target === "providers") setTab("providers");
    else if (target === "customers") setTab("customers");
    else if (target === "reports") setTab("reports");
    else if (target === "approvals") setTab("approvals");
    else if (target === "revenue") setTab("revenue");
    else if (target === "security") setTab("security");
    else if (target === "gridd-eye") setTab("gridd-eye");
    else if (target === "binta-vault" || target === "vault") setTab("vault");
  }, []);

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
    const hourlyFeesToday = Array.from({ length: 24 }, () => 0);
    for (const j of jobs) {
      if (j.status !== "completed" || !j.completedAt) continue;
      const ct = parseJobTime(j.completedAt);
      if (ct < tToday) continue;
      const h = new Date(ct).getHours();
      hourlyFeesToday[h] += feeForJob(j);
    }
    const maxHr = Math.max(1, ...hourlyFeesToday);
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
      hourlyFeesToday,
      maxHourlyFee: maxHr,
      platformShareWeek70: week * 0.7,
      platformShareWeek30: week * 0.3,
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
      await postNotifyBroadcast({
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
      await dismissAlertDoc(id);
    } catch {
      /* ignore */
    }
  };

  const sendAdminMessage = async () => {
    const t = msgText.trim();
    if (!t || !msgJobId) return;
    setMsgSending(true);
    try {
      await sendAdminJobChatMessage(msgJobId, t);
      setMsgText("");
    } finally {
      setMsgSending(false);
    }
  };

  const assignDriver = async (providerUid: string) => {
    if (!assignJob) return;
    try {
      await assignJobToProvider(assignJob.id, providerUid);
      setAssignJob(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Assign failed");
    }
  };

  const runApproveDriver = async (uid: string) => {
    try {
      await commitDriverApproval(uid);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Approve failed");
    }
  };

  const submitRequestDocs = async () => {
    if (!requestDocsTarget || !requestDocsNote.trim()) return;
    try {
      await requestDriverDocs(requestDocsTarget.uid, requestDocsNote.trim());
      setRequestDocsTarget(null);
      setRequestDocsNote("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Request failed");
    }
  };

  const toggleDriverDemo = async (uid: string, enabled: boolean, driverName?: string) => {
    const ceoUid = firebaseAuth?.currentUser?.uid;
    if (!ceoUid) {
      alert("Not signed in");
      return;
    }
    setDemoOptimistic((o) => ({ ...o, [uid]: enabled }));
    try {
      if (enabled) {
        await updateDoc(doc(db, "providers", uid), {
          demoMode: true,
          demoJobsUsed: 0,
          demoJobsLimit: 3,
          demoActivatedAt: serverTimestamp(),
          demoActivatedBy: ceoUid,
          accountStatus: "demo",
        });
      } else {
        await updateDoc(doc(db, "providers", uid), {
          demoMode: false,
          demoActivatedAt: deleteField(),
          demoActivatedBy: deleteField(),
          accountStatus: deleteField(),
        });
      }
      const check = await getDoc(doc(db, "providers", uid));
      console.log("Demo mode saved:", check.data()?.demoMode);
      setDemoToast(
        enabled
          ? "🎮 Demo enabled — driver can now access the app!"
          : "Demo disabled",
      );
    } catch (e) {
      setDemoOptimistic((o) => {
        const next = { ...o };
        delete next[uid];
        return next;
      });
      const msg = e instanceof Error ? e.message : "Demo toggle failed";
      setDemoToast(`❌ Failed: ${msg}`);
      console.error(e);
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
      await rejectDriverApplication(rejectTarget.uid, reason);
      setRejectTarget(null);
      setRejectPresets(new Set());
      setRejectOther("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Reject failed");
    }
  };

  const livePulse = (
    <span className="flex items-center gap-2 text-sm text-black/80">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-black opacity-35" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-black" />
      </span>
      Live
    </span>
  );

  return (
    <div className="w-full min-h-min overflow-x-hidden pb-28" style={{ background: BG, fontFamily: "system-ui, sans-serif" }}>
      <AdminTopStatsBar
        revenueToday={revenueTodayLive || stats.revenueToday}
        activeJobs={jobsTodayLive}
        userCount={userCountLive}
        liveDrivers={liveDriversOnline}
        avgRating={avgRatingDrivers}
        signupsToday={signupsToday}
        pendingReports={pendingReportsCount}
        pendingApprovals={pendingApprovalsLive || pendingApprovals.length}
        failedPayments={failedPaymentsCount}
        onNavigate={navigateTop}
        showBintaVaultLink={showCeoOnlyVault}
      />
      {demoToast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[100] max-w-md -translate-x-1/2 rounded-2xl border border-[#00FF88]/40 bg-[#0a1a12] px-4 py-3 text-center text-sm font-semibold text-[#00FF88] shadow-lg"
          role="status"
        >
          {demoToast}
        </div>
      ) : null}
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
        className="sticky top-0 z-20 border-b border-black/20 px-4 py-3 sm:px-6"
        style={{ background: HEADER_GREEN }}
      >
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,auto)_1fr_auto] sm:gap-4">
          <div className="relative z-10 min-w-0 shrink-0">
            <div className="text-lg font-bold tracking-tight text-black">GRIDD</div>
            <div className="text-xs font-medium text-black/70">CEO · Command Center</div>
            {showCeoOnlyVault ? (
              <button
                type="button"
                onClick={() => setTab("vault")}
                className="mt-1.5 flex w-full max-w-[11rem] items-center justify-center gap-1.5 rounded-lg border border-black/25 bg-black/10 px-2 py-1 text-left text-xs font-bold text-black hover:bg-black/20 sm:max-w-none"
              >
                <span aria-hidden>🏦</span>
                BINTA Vault
              </button>
            ) : null}
          </div>
          <div className="flex min-w-0 justify-center sm:justify-center">{livePulse}</div>
          <div className="flex shrink-0 items-center justify-end gap-3">
            <AdminCeoAlertsBell alerts={ceoAlertRows} />
            {criticalCount > 0 ? (
              <button
                type="button"
                onClick={() => setTab("security")}
                className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white"
              >
                {criticalCount} alerts
              </button>
            ) : null}
            <LogoutButton className="rounded-lg border border-black/30 bg-black/10 px-3 py-2 text-xs font-semibold text-black hover:bg-black/20" />
          </div>
        </div>

        <nav className="mx-auto mt-3 flex max-w-7xl gap-2 overflow-x-auto border-t border-black/20 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "shrink-0 rounded-xl border px-3 py-2 text-left text-sm font-medium transition",
                tab === t.id
                  ? "border-black/40 bg-black/15 text-black"
                  : "border-black/20 bg-black/5 text-black/80 hover:bg-black/10",
              ].join(" ")}
            >
              <span className="mr-1.5 inline-flex items-center gap-1">
                {t.icon}
                {t.id === "gridd-eye" && stats.liveDrivers > 0 ? (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
                  </span>
                ) : null}
              </span>
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

      <main className="mx-auto min-h-0 w-full max-w-7xl overflow-x-hidden px-4 py-6 pb-24 sm:px-6">
        <div
          className="w-full min-h-0"
          style={{
            flex: 1,
            height: "auto",
            minHeight: 0,
            overflowX: "hidden",
            overflowY: "auto",
            paddingBottom: 40,
          }}
        >
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
            onOpenGriddEye={() => setTab("gridd-eye")}
          />
        ) : null}

        {tab === "providers" ? (
          <ProvidersTab sortedProviders={sortedProviders} provSort={provSort} setProvSort={setProvSort} />
        ) : null}

        {tab === "gridd-eye" ? (
          <AdminGriddEyeTab
            providers={providers}
            jobs={jobs}
            filter={griddEyeFilter}
            onFilterChange={setGriddEyeFilter}
          />
        ) : null}

        {tab === "customers" ? <CustomersTab userRows={userRows.filter((u) => u.role === "customer")} /> : null}

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
            securityLogs={securityLogs}
            failedLoginRows={failedLoginRows}
            bannedUsers={userRows.filter((u) => u.banned || u.accountStatus === "banned" || u.blocked)}
            onOpenGriddEye={() => setTab("gridd-eye")}
          />
        ) : null}

        {tab === "approvals" && canAccessApprovals ? (
          <ApprovalsTab
            providers={displayProviders}
            onApprove={(uid) => void runApproveDriver(uid)}
            onReject={(p) => setRejectTarget(p)}
            onRequestDocs={(p) => setRequestDocsTarget(p)}
            onToggleDemo={(uid, enabled, name) => void toggleDriverDemo(uid, enabled, name)}
          />
        ) : null}

        {tab === "bites" ? <AdminBitesTab /> : null}
        {tab === "revenue" ? (
          <RevenueTab revenueDeep={revenueDeep} exportCsv={exportCsv} exportPrint={exportPrint} />
        ) : null}
        {tab === "vault" && showCeoOnlyVault ? <AdminBintaVaultTab /> : null}
        {tab === "pricing" ? <AdminPricingTab /> : null}
        {tab === "discounts" ? <AdminDiscountsTab /> : null}
        {tab === "price-iq" && canAccessApprovals ? <AdminPriceIqTab /> : null}

        {tab === "reports" ? <AdminPorchReportsTab /> : null}

        {tab === "dm-reports" ? <AdminDmReportsTab /> : null}

        {tab === "live-feed" ? <AdminLiveFeedTab /> : null}

        {tab === "platform-dms" ? <AdminPlatformDmsTab /> : null}

        {tab === "demo" ? (
          <AdminDemoTab providers={displayProviders} onOpenProvider={() => setTab("providers")} />
        ) : null}

        {tab === "partner" ? <AdminComingSoonTab tabName="Partner dashboard" /> : null}
        </div>
      </main>

      {requestDocsTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div
            className="w-full max-w-md rounded-2xl border p-6"
            style={{ background: CARD, borderColor: BORDER }}
          >
            <h3 className="text-lg font-semibold text-zinc-100">Request more documents</h3>
            <p className="mt-1 text-sm text-zinc-500">{requestDocsTarget.name}</p>
            <textarea
              value={requestDocsNote}
              onChange={(e) => setRequestDocsNote(e.target.value)}
              rows={5}
              className="mt-4 w-full rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-sm text-zinc-200"
              placeholder="What should the driver upload or fix?"
            />
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-zinc-700 py-2 text-sm text-zinc-400"
                onClick={() => {
                  setRequestDocsTarget(null);
                  setRequestDocsNote("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitRequestDocs()}
                className="flex-1 rounded-xl bg-[#3B82F6] py-2 text-sm font-bold text-white"
              >
                Send request
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                  if (!jz) return isProviderLiveOnPlatform(p);
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

function CustomersTab({ userRows }: { userRows: (User & { uid: string })[] }) {
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");

  const submitNote = async () => {
    if (!noteFor || !noteBody.trim()) return;
    try {
      await addCeoCustomerNote(noteFor, noteBody);
      setNoteFor(null);
      setNoteBody("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-zinc-100">Customers</h2>
      <p className="text-sm text-zinc-500">{userRows.length} customer accounts (loaded from Firestore).</p>
      {userRows.length === 0 ? (
        <EmptyState icon="👤" message={"No users yet.\nShare GRIDD to get started."} />
      ) : null}
      <div className="space-y-3">
        {userRows.map((u) => (
          <div key={u.uid} className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
            <div className="font-semibold text-zinc-100">{u.name ?? u.email ?? u.uid}</div>
            <div className="text-xs text-zinc-500">{u.email ?? u.uid}</div>
            {u.accountStatus ? (
              <div className="mt-1 text-xs text-amber-400">Status: {u.accountStatus}</div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-amber-500/40 px-2 py-1 text-xs text-amber-400"
                onClick={() => {
                  const r = window.prompt("Hold reason (internal note)");
                  if (r === null) return;
                  void setCustomerAccountHold(u.uid, true, r);
                }}
              >
                ⏸️ Hold
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
                onClick={() => void setCustomerAccountHold(u.uid, false)}
              >
                Release hold
              </button>
              <button
                type="button"
                className="rounded-lg border border-orange-500/40 px-2 py-1 text-xs text-orange-400"
                onClick={() => {
                  const r = window.prompt("Suspension reason");
                  if (r === null) return;
                  void suspendCustomerAccount(u.uid, 3 * 24 * 60 * 60 * 1000, r);
                }}
              >
                🔴 Suspend 3d
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-400"
                onClick={() => {
                  const r = window.prompt('Type CONFIRM to ban, then reason (e.g. "CONFIRM|fraud")');
                  if (!r || !r.startsWith("CONFIRM")) return;
                  const reason = r.replace(/^CONFIRM\|?/, "").trim() || "Banned by CEO";
                  void banCustomerAccount(u.uid, reason);
                }}
              >
                ⛔ Ban
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
                onClick={() => setNoteFor(u.uid)}
              >
                📝 Note
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
                onClick={() => alert("Refund: connect Stripe dashboard or finance workflow.")}
              >
                💰 Refund
              </button>
            </div>
          </div>
        ))}
      </div>
      {noteFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-2xl border p-6" style={{ background: CARD, borderColor: BORDER }}>
            <h3 className="text-lg font-semibold text-zinc-100">Internal note</h3>
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-sm text-zinc-200"
              placeholder="Private note (not visible to customer)"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-zinc-700 py-2 text-sm text-zinc-400"
                onClick={() => {
                  setNoteFor(null);
                  setNoteBody("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl py-2 text-sm font-bold text-black"
                style={{ background: GREEN }}
                onClick={() => void submitNote()}
              >
                Save
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

function formatStepTime(iso: string | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function JobLifecycleTimeline({ j }: { j: Job }) {
  const steps: { label: string; at?: string }[] = [
    { label: "Booked", at: typeof j.createdAt === "string" ? j.createdAt : undefined },
    { label: "Driver accepted", at: j.acceptedAt },
    {
      label: "In progress",
      at: ["active", "assigned", "en_route", "arrived", "in_progress"].includes(j.status) ? j.acceptedAt : undefined,
    },
    { label: "Completed", at: j.completedAt },
    { label: "Rated", at: j.reviewSubmittedAt },
  ];
  return (
    <ul className="mt-2 space-y-1 border-t border-zinc-800 pt-2 text-[11px] text-zinc-500">
      {steps.map((s) => (
        <li key={s.label} className="flex justify-between gap-2">
          <span>
            {s.at ? "●" : "○"} {s.label}
          </span>
          <span className="shrink-0 font-mono text-zinc-600">{formatStepTime(s.at)}</span>
        </li>
      ))}
    </ul>
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
  onOpenGriddEye,
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
  onOpenGriddEye: () => void;
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
        {filteredJobs.length === 0 ? (
          <EmptyState icon="📦" message={"No jobs yet.\nFirst booking coming soon."} />
        ) : null}
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
              <JobLifecycleTimeline j={j} />
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
              <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-800 pt-3">
                <button
                  type="button"
                  onClick={onOpenGriddEye}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                >
                  👁️ Map
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const n = window.prompt("Adjust total charged (cents)", String(j.chargedTotalCents ?? j.amountCents ?? 0));
                    if (n === null) return;
                    const c = parseInt(n, 10);
                    if (!Number.isFinite(c) || c < 0) return;
                    try {
                      await updateDoc(doc(getFirestore(app), "jobs", j.id), {
                        chargedTotalCents: c,
                        amountCents: c,
                      } as Record<string, unknown>);
                    } catch (e) {
                      alert(e instanceof Error ? e.message : "Update failed");
                    }
                  }}
                  className="rounded-lg border border-amber-500/40 px-2 py-1 text-xs text-amber-400"
                >
                  💰 Price
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = window.prompt("Cancel reason");
                    if (r === null) return;
                    try {
                      await updateDoc(doc(getFirestore(app), "jobs", j.id), {
                        status: "cancelled",
                        cancelledAt: new Date().toISOString(),
                        notes: r ? `${j.notes ?? ""}\n[CEO cancel] ${r}`.trim() : j.notes,
                      } as Record<string, unknown>);
                    } catch (e) {
                      alert(e instanceof Error ? e.message : "Cancel failed");
                    }
                  }}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
                >
                  ❌ Cancel
                </button>
                <button
                  type="button"
                  onClick={() => alert("Issue refund via Stripe Dashboard or finance workflow.")}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
                >
                  💸 Refund
                </button>
                <button
                  type="button"
                  onClick={() => setAssignJob(j)}
                  className="rounded-lg border border-[#3B82F6]/40 px-2 py-1 text-xs text-[#3B82F6]"
                >
                  🔄 Reassign
                </button>
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

function driverAccountBadge(p: Provider): { label: string; cls: string } {
  if (p.banned || p.accountStatus === "banned") return { label: "⛔ Banned", cls: "text-red-400" };
  if (p.accountStatus === "on_hold") return { label: "🟠 On Hold", cls: "text-amber-400" };
  if (p.accountStatus === "suspended") return { label: "🔴 Suspended", cls: "text-red-300" };
  if (p.demoMode || p.accountStatus === "demo") return { label: "🔵 Demo", cls: "text-sky-400" };
  if (p.accountStatus === "approved" && p.approvedByCEO)
    return { label: "🟢 Active", cls: "text-emerald-400" };
  if (
    p.documentsSubmitted &&
    (p.accountStatus === "pending_review" || p.accountStatus === "pending" || !p.accountStatus)
  )
    return { label: "🟡 Pending", cls: "text-yellow-400" };
  return { label: "🟡 Pending", cls: "text-yellow-500/90" };
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
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");

  const submitDriverNote = async () => {
    if (!noteFor || !noteBody.trim()) return;
    try {
      await addCeoDriverNote(noteFor, noteBody);
      setNoteFor(null);
      setNoteBody("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  };

  const total = sortedProviders.length;
  const activeNow = sortedProviders.filter(
    (p) => canGoOnline(p) && isProviderAvailableForMatching(p),
  ).length;
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
              provSort === id ? "border-[#3dff7a]/40 text-[#3dff7a]" : "border-zinc-800 text-zinc-500",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {sortedProviders.length === 0 ? (
          <EmptyState icon="🚛" message={"No providers yet.\nApprove applications here."} />
        ) : null}
        {sortedProviders.map((p) => {
          const initial = (p.name ?? "?").slice(0, 1).toUpperCase();
          const tier = p.driverTier ?? "starter";
          const st = p.status ?? "offline";
          const acct = driverAccountBadge(p);
          const licOk = p.documents?.licenseVerified === true;
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
                    <span className={`rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold ${acct.cls}`}>
                      {acct.label}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Presence:{" "}
                    {st === "on_the_gridd" || st === "active" || st === "idle" ? (
                      <span style={{ color: GREEN }}>● {st}</span>
                    ) : (
                      <span className="text-zinc-500">○ {st}</span>
                    )}
                  </div>
                  <div className="mt-2 font-mono text-sm text-zinc-300">
                    ★ {(p.rating ?? 0).toFixed(1)} · Jobs: {p.completedJobCount ?? 0} · Earned:{" "}
                    {money(p.lifetimeEarningsCents ?? 0)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(p.serviceIds ?? SERVICE_IDS).slice(0, 12).map((sid) => (
                      <span key={sid} className="text-lg" title={DRIVER_SERVICE_META[sid]?.label}>
                        {DRIVER_SERVICE_META[sid]?.icon ?? "·"}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    ZIP: {p.zip ?? "—"}
                    {licOk ? <span className="ml-2 text-emerald-400">✓ License verified</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!p.verified ? (
                      <button
                        type="button"
                        onClick={() => void verifyProvider(p.uid)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-black"
                        style={{ background: `${GREEN}33`, color: GREEN }}
                      >
                        ✅ Verify
                      </button>
                    ) : null}
                    {!licOk ? (
                      <button
                        type="button"
                        onClick={() => void verifyDriverLicense(p.uid)}
                        className="rounded-lg border border-emerald-500/40 px-2 py-1 text-xs text-emerald-400"
                      >
                        ✅ License OK
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        const r = window.prompt("Hold reason (internal) — driver cannot go online.");
                        if (r === null) return;
                        void setDriverHold(p.uid, r);
                      }}
                      className="rounded-lg border border-amber-500/40 px-2 py-1 text-xs text-amber-400"
                    >
                      ⏸️ Hold
                    </button>
                    <button
                      type="button"
                      onClick={() => void releaseDriverHold(p.uid)}
                      className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
                    >
                      ▶️ Release hold
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const r = window.prompt("Suspension reason");
                        if (r === null) return;
                        void suspendDriverAccount(p.uid, 24 * 60 * 60 * 1000, r);
                      }}
                      className="rounded-lg border border-orange-500/40 px-2 py-1 text-xs text-orange-400"
                    >
                      🔴 Suspend 1d
                    </button>
                    <button
                      type="button"
                      onClick={() => void suspendUser(p.uid, 24)}
                      className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
                    >
                      🔒 Legacy 24h
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const r = window.prompt('Ban permanently — type CONFIRM then |reason e.g. CONFIRM|fraud');
                        if (!r?.startsWith("CONFIRM")) return;
                        void banDriverAccount(p.uid, r.replace(/^CONFIRM\|?/, "").trim() || "Banned");
                      }}
                      className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-400"
                    >
                      ⛔ Ban
                    </button>
                    <button
                      type="button"
                      onClick={() => void blockUser(p.uid)}
                      className="rounded-lg border border-red-900/50 px-2 py-1 text-xs text-red-300"
                    >
                      Block (legacy)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteFor(p.uid)}
                      className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
                    >
                      📝 Note
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {noteFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-2xl border p-6" style={{ background: CARD, borderColor: BORDER }}>
            <h3 className="text-lg font-semibold text-zinc-100">Internal driver note</h3>
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-sm text-zinc-200"
              placeholder="Private — not visible to driver"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-zinc-700 py-2 text-sm text-zinc-400"
                onClick={() => {
                  setNoteFor(null);
                  setNoteBody("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl py-2 text-sm font-bold text-black"
                style={{ background: GREEN }}
                onClick={() => void submitDriverNote()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
              <Link
                href={`/chat/${msgJobId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-[#00FF88]/40 px-2 py-1 text-xs text-[#00FF88] hover:bg-[#00FF88]/10"
              >
                💬 Full chat
              </Link>
            </div>
            <div className="max-h-[45vh] flex-1 space-y-2 overflow-y-auto">
              {messages.map((m) => {
                const isCust = m.senderRole === "customer";
                const isCeoMsg = m.senderRole === "ceo" || m.senderRole === "admin";
                return (
                  <div
                    key={m.id}
                    className={[
                      "flex max-w-[90%] flex-col rounded-2xl px-3 py-2 text-sm",
                      isCeoMsg
                        ? "mx-auto bg-zinc-800 text-zinc-200"
                        : isCust
                          ? "mr-auto border border-blue-500/30 bg-blue-950/40 text-blue-100"
                          : "ml-auto border border-[#00FF88]/30 bg-[#00FF88]/10 text-[#00FF88]",
                    ].join(" ")}
                  >
                    <div className="text-[10px] uppercase text-zinc-500">{m.senderRole}</div>
                    {m.attachmentUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.attachmentUrl}
                        alt=""
                        className="mb-2 max-h-40 w-full rounded-lg object-cover"
                      />
                    ) : null}
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
                placeholder="Message as GRIDD CEO…"
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
  securityLogs,
  failedLoginRows,
  bannedUsers,
  onOpenGriddEye,
}: {
  alerts: FireAlert[];
  syntheticAlerts: { id: string; severity: AlertSeverity; title: string; body: string; uid?: string; signals: string[] }[];
  threatLevel: "clear" | "elevated" | "critical";
  dismissAlert: (id: string) => void | Promise<void>;
  jobs: Job[];
  securityLogs: { id: string; uid?: string; email?: string; kind?: string; ip?: string; userAgent?: string; createdAt?: unknown }[];
  failedLoginRows: { id: string; email?: string; ip?: string; userAgent?: string; createdAt?: unknown }[];
  bannedUsers: (User & { uid: string })[];
  onOpenGriddEye: () => void;
}) {
  const blocked = bannedUsers.length;
  const eventsPerMin = Math.min(99, Math.max(1, Math.floor(jobs.length / 10)));

  const fmtSecTime = (raw: unknown) => {
    if (raw instanceof Timestamp) return raw.toDate().toLocaleString();
    if (typeof raw === "object" && raw !== null && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function") {
      try {
        return (raw as Timestamp).toDate().toLocaleString();
      } catch {
        return "—";
      }
    }
    return "—";
  };

  const revokeRemoteSession = async (targetUid: string) => {
    if (!window.confirm(`Force logout for ${targetUid}? They must sign in again.`)) return;
    const token = await firebaseAuth?.currentUser?.getIdToken();
    if (!token) {
      alert("Not signed in");
      return;
    }
    const res = await fetch("/api/admin/revoke-session", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ targetUid }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      alert(data.error ?? "Revoke failed");
      return;
    }
    alert("Sessions revoked.");
  };

  const uniqueSessionUids = [...new Set(securityLogs.map((s) => s.uid).filter(Boolean))] as string[];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-100">Security</h2>
        <p className="text-sm text-zinc-500">Real-time monitoring · GRIDD Network</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs font-mono">
          <span className="text-red-400">{alerts.filter((a) => normalizeAlertSeverity(a.severity) === "critical").length} critical</span>
          <span className="text-amber-400">{alerts.filter((a) => normalizeAlertSeverity(a.severity) === "high").length} high</span>
          <span className="text-zinc-400">{blocked} banned (users)</span>
          <span className="text-zinc-400">{eventsPerMin} events/min</span>
          <button
            type="button"
            onClick={onOpenGriddEye}
            className="rounded-full border border-zinc-700 px-2 py-0.5 text-zinc-400 hover:border-[#3dff7a]"
          >
            👁️ Open live map
          </button>
        </div>
      </div>

      <div
        className={[
          "h-3 w-full rounded-full",
          threatLevel === "critical"
            ? "animate-pulse bg-red-600"
            : threatLevel === "elevated"
              ? "bg-amber-500"
              : "bg-[#3dff7a]",
        ].join(" ")}
      />
      <p className="text-xs text-zinc-500">
        {threatLevel === "clear" ? "ALL CLEAR" : threatLevel === "elevated" ? "ELEVATED" : "CRITICAL"}
      </p>

      <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="text-sm font-semibold text-zinc-200">Recent logins &amp; session sync</h3>
        <p className="mt-1 text-xs text-zinc-500">From /api/session/sync and auth activity (server-logged).</p>
        <div className="mt-3 max-h-60 overflow-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-2 pr-2">Time</th>
                <th className="py-2 pr-2">UID</th>
                <th className="py-2 pr-2">Email</th>
                <th className="py-2 pr-2">IP</th>
                <th className="py-2">Device</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {securityLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-zinc-500">
                    No rows yet. Events appear after users hit session sync.
                  </td>
                </tr>
              ) : (
                securityLogs.slice(0, 40).map((s) => (
                  <tr key={s.id} className="border-t border-zinc-800/80">
                    <td className="py-2 align-top font-mono">{fmtSecTime(s.createdAt)}</td>
                    <td className="max-w-[120px] truncate py-2 align-top font-mono text-[10px]">{s.uid ?? "—"}</td>
                    <td className="py-2 align-top">{s.email ?? "—"}</td>
                    <td className="py-2 align-top font-mono">{s.ip ?? "—"}</td>
                    <td className="py-2 align-top text-zinc-500">{(s.userAgent ?? "").slice(0, 80)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="text-sm font-semibold text-zinc-200">Failed login attempts</h3>
        <div className="mt-3 max-h-48 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-2 pr-2">Time</th>
                <th className="py-2 pr-2">Email</th>
                <th className="py-2 pr-2">IP</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {failedLoginRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-zinc-500">
                    No failed-login rows (or index still building).
                  </td>
                </tr>
              ) : (
                failedLoginRows.slice(0, 30).map((f) => (
                  <tr key={f.id} className="border-t border-zinc-800/80">
                    <td className="py-2 font-mono">{fmtSecTime(f.createdAt)}</td>
                    <td className="py-2">{f.email ?? "—"}</td>
                    <td className="py-2 font-mono">{f.ip ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="text-sm font-semibold text-zinc-200">Banned accounts (user docs)</h3>
        <ul className="mt-2 space-y-2 text-sm text-zinc-400">
          {bannedUsers.length === 0 ? (
            <li>None loaded.</li>
          ) : (
            bannedUsers.slice(0, 40).map((u) => (
              <li key={u.uid} className="flex flex-wrap justify-between gap-2 border-b border-zinc-800/60 py-1">
                <span>{u.name ?? u.email ?? u.uid}</span>
                <span className="font-mono text-xs text-red-400">{u.uid}</span>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="text-sm font-semibold text-zinc-200">Force logout (refresh token revoke)</h3>
        <p className="mt-1 text-xs text-zinc-500">Uses Firebase Admin · targets must sign in again.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {uniqueSessionUids.slice(0, 12).map((uid) => (
            <button
              key={uid}
              type="button"
              onClick={() => void revokeRemoteSession(uid)}
              className="rounded-lg border border-red-500/40 px-2 py-1 font-mono text-[11px] text-red-300"
            >
              Revoke {uid.slice(0, 6)}…
            </button>
          ))}
          {uniqueSessionUids.length === 0 ? (
            <span className="text-xs text-zinc-500">No recent UIDs in security log.</span>
          ) : null}
        </div>
      </div>

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
                      onClick={() => void suspendUser(item.uid!, 24)}
                      className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                    >
                      ⏸ Suspend 24h
                    </button>
                    <button
                      type="button"
                      onClick={() => void blockUser(item.uid!)}
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
                      onClick={() => void suspendUser(a.uid!, 24)}
                      className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                    >
                      ⏸ Suspend 24h
                    </button>
                    <button
                      type="button"
                      onClick={() => void blockUser(a.uid!)}
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

function docLinkRow(href: string | undefined, label: string) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#3B82F6] hover:underline"
    >
      {label} — View
    </a>
  );
}

function demoDaysLabel(raw: unknown): string {
  if (!raw) return "—";
  let d: Date | null = null;
  if (typeof raw === "string") {
    const t = new Date(raw).getTime();
    if (Number.isFinite(t)) d = new Date(t);
  } else if (
    typeof raw === "object" &&
    raw !== null &&
    "toDate" in raw &&
    typeof (raw as { toDate: () => Date }).toDate === "function"
  ) {
    d = (raw as { toDate: () => Date }).toDate();
  }
  if (!d) return "—";
  const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / (24 * 3600 * 1000)));
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function driverDocumentChecklist(docs: Provider["documents"] | undefined) {
  const d = docs;
  return [
    { key: "dl", label: "Driver's License", ok: !!(d?.licenseFront && d?.licenseBack) },
    { key: "pi", label: "Personal Auto Insurance", ok: !!d?.insurance },
    { key: "ca", label: "Commercial Auto", ok: !!d?.commercialAuto },
    { key: "vr", label: "Vehicle Registration", ok: !!d?.registration },
    { key: "sf", label: "Selfie", ok: !!d?.selfie },
    { key: "bg", label: "Background Consent", ok: !!d?.backgroundConsent },
  ];
}

function DriverDocChecklist({ docs }: { docs: Provider["documents"] | undefined }) {
  return (
    <div className="mt-4 space-y-1.5 rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Document checklist</p>
      {driverDocumentChecklist(docs).map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-2 text-zinc-300">
          <span>{row.label}</span>
          <span
            className={row.ok ? "shrink-0 text-[#00FF88]" : "shrink-0 text-amber-400/90"}
            title={row.ok ? "On file" : "Missing or incomplete"}
          >
            {row.ok ? "✅ verified" : "⬜ PENDING"}
          </span>
        </div>
      ))}
    </div>
  );
}

function CeoInsuranceNotesForDriver({ p }: { p: Provider }) {
  const db = useMemo(() => getFirestore(app), []);
  const [expiryNote, setExpiryNote] = useState(p.ceoInsuranceExpiryNote ?? "");
  const [policyNote, setPolicyNote] = useState(p.ceoPolicyNumberNote ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setExpiryNote(p.ceoInsuranceExpiryNote ?? "");
    setPolicyNote(p.ceoPolicyNumberNote ?? "");
  }, [p.uid, p.ceoInsuranceExpiryNote, p.ceoPolicyNumberNote]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await updateDoc(doc(db, "providers", p.uid), {
        ceoInsuranceExpiryNote: expiryNote.trim() || deleteField(),
        ceoPolicyNumberNote: policyNote.trim() || deleteField(),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">CEO notes (insurance)</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-zinc-500">
          Insurance expiry: MM/DD/YYYY
          <input
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-200"
            value={expiryNote}
            onChange={(e) => setExpiryNote(e.target.value)}
            placeholder="e.g. 12/31/2026"
            autoComplete="off"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          Policy number: ____________
          <input
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-200"
            value={policyNote}
            onChange={(e) => setPolicyNote(e.target.value)}
            placeholder="From declarations page"
            autoComplete="off"
          />
        </label>
      </div>
      {err ? <p className="mt-1 text-xs text-red-400">{err}</p> : null}
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="mt-2 rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800/80 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save notes"}
      </button>
    </div>
  );
}

function ApprovalsTab({
  providers,
  onApprove,
  onReject,
  onRequestDocs,
  onToggleDemo,
}: {
  providers: Provider[];
  onApprove: (uid: string) => void;
  onReject: (p: Provider) => void;
  onRequestDocs: (p: Provider) => void;
  onToggleDemo: (uid: string, enabled: boolean, driverName?: string) => void | Promise<void>;
}) {
  const [sub, setSub] = useState<
    "pending" | "approved" | "rejected" | "more" | "online" | "demo"
  >("pending");
  const [demoBusy, setDemoBusy] = useState<string | null>(null);

  async function setDemo(uid: string, next: boolean, driverName?: string) {
    setDemoBusy(uid);
    try {
      await onToggleDemo(uid, next, driverName);
    } finally {
      setDemoBusy(null);
    }
  }

  const pendingReview = useMemo(
    () =>
      providers.filter((p) => {
        if (p.documentsSubmitted !== true) return false;
        const s = p.accountStatus;
        if (s === "pending_review" || s === "pending") return true;
        if (p.verificationStatus === "pending" && s !== "approved" && s !== "rejected") return true;
        return false;
      }),
    [providers],
  );

  const approvedDrivers = useMemo(
    () => providers.filter((p) => p.accountStatus === "approved" && p.approvedByCEO === true),
    [providers],
  );

  const rejectedDrivers = useMemo(
    () => providers.filter((p) => p.accountStatus === "rejected"),
    [providers],
  );

  const moreInfoDrivers = useMemo(
    () => providers.filter((p) => p.accountStatus === "more_info_needed"),
    [providers],
  );

  const onlineDrivers = useMemo(
    () => providers.filter((p) => canGoOnline(p) && isProviderAvailableForMatching(p)),
    [providers],
  );

  const demoDriversSorted = useMemo(
    () =>
      providers
        .filter((p) => p.demoMode === true)
        .slice()
        .sort((a, b) => demoJobsUsedCount(b) - demoJobsUsedCount(a) || a.name.localeCompare(b.name)),
    [providers],
  );

  const noDocsPipeline = useMemo(
    () =>
      providers.filter(
        (p) =>
          p.accountStatus !== "rejected" &&
          !(p.accountStatus === "approved" && p.approvedByCEO === true) &&
          p.documentsSubmitted !== true,
      ),
    [providers],
  );

  function statusLabel(p: Provider): string {
    if (p.activeJob) return "busy";
    const s = p.status ?? "offline";
    if (s === "busy") return "busy";
    if (s === "on_the_gridd" || s === "active" || s === "idle") return "online";
    if (s === "off_gridd") return "offline";
    return "offline";
  }

  const tabBtn = (id: typeof sub, label: string, count: number) => (
    <button
      type="button"
      onClick={() => setSub(id)}
      className={[
        "rounded-xl border px-3 py-2 text-xs font-semibold sm:text-sm",
        sub === id ? "border-[#00FF88]/50 bg-[#00FF88]/10 text-[#00FF88]" : "border-zinc-700 text-zinc-400",
      ].join(" ")}
    >
      {label} ({count})
    </button>
  );

  function renderDocGrid(docs: Provider["documents"]) {
    if (!docs) return <p className="text-sm text-zinc-500">No documents on file.</p>;
    return (
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {docLinkRow(docs.licenseFront, "🚗 License — Front")}
        {docLinkRow(docs.licenseBack, "🚗 License — Back")}
        {docLinkRow(docs.insurance, "🛡️ Personal auto insurance")}
        {docLinkRow(docs.commercialAuto, "🏢 Commercial auto / endorsement")}
        {docLinkRow(docs.registration, "📋 Vehicle registration")}
        {docLinkRow(docs.selfie, "🤳 Selfie / verification")}
        {docLinkRow(docs.backgroundConsent, "📄 Background consent")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-100">Driver approvals</h2>
          <p className="text-sm text-zinc-500">
            CEO-only actions. Review documents, approve, reject, or request more files.
          </p>
        </div>
        <div className="flex max-w-full flex-wrap gap-2">
          {tabBtn("pending", "⏳ Pending", pendingReview.length)}
          {tabBtn("approved", "✅ Approved", approvedDrivers.length)}
          {tabBtn("rejected", "❌ Rejected", rejectedDrivers.length)}
          {tabBtn("more", "🔄 More info", moreInfoDrivers.length)}
          {tabBtn("online", "🟢 Online now", onlineDrivers.length)}
          {tabBtn("demo", "🎮 Demo drivers", demoDriversSorted.length)}
        </div>
      </div>

      {sub === "demo" ? (
        <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: BORDER }}>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Jobs used</th>
                <th className="px-4 py-3">Earnings (locked)</th>
                <th className="px-4 py-3">Since demo</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {demoDriversSorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No drivers in demo mode. Enable 🎮 Demo Mode from Pending or pre-doc pipeline.
                  </td>
                </tr>
              ) : (
                demoDriversSorted.map((p) => (
                  <tr key={p.uid} className="border-b border-zinc-800/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-200">{p.name}</div>
                      <div className="text-xs text-zinc-500">{p.email ?? p.uid}</div>
                      <div className="mt-1 text-[11px] font-semibold text-orange-400">
                        🎮 DEMO ({demoJobsUsedCount(p)}/{demoJobLimit(p)})
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {demoJobsUsedCount(p)} / {demoJobLimit(p)}
                    </td>
                    <td className="px-4 py-3 font-mono text-amber-300">
                      {money(p.lifetimeEarningsCents ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{demoDaysLabel(p.demoActivatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          disabled={demoBusy === p.uid}
                          onClick={() => void onApprove(p.uid)}
                          className="rounded-lg bg-[#00FF88] px-3 py-1.5 text-xs font-bold text-black"
                        >
                          Convert to full
                        </button>
                        <button
                          type="button"
                          disabled={demoBusy === p.uid}
                          onClick={() => void setDemo(p.uid, false, p.name)}
                          className="rounded-lg border border-red-500/50 px-3 py-1.5 text-xs font-semibold text-red-400"
                        >
                          End demo
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {sub === "online" ? (
        <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: BORDER }}>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Active job</th>
                <th className="px-4 py-3">City</th>
              </tr>
            </thead>
            <tbody>
              {onlineDrivers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                    No drivers are online (approved + toggled on).
                  </td>
                </tr>
              ) : (
                onlineDrivers.map((p) => (
                  <tr key={p.uid} className="border-b border-zinc-800/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-200">{p.name}</div>
                      <div className="text-xs text-zinc-500">{p.email ?? p.uid}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-xs font-bold",
                          statusLabel(p) === "busy"
                            ? "bg-amber-500/20 text-amber-400"
                            : statusLabel(p) === "online"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-zinc-700 text-zinc-300",
                        ].join(" ")}
                      >
                        {statusLabel(p)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                      {p.activeJob ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{p.city ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {sub === "approved" ? (
        <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: BORDER }}>
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Approved</th>
                <th className="px-4 py-3">City</th>
              </tr>
            </thead>
            <tbody>
              {approvedDrivers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                    No CEO-approved drivers yet.
                  </td>
                </tr>
              ) : (
                approvedDrivers.map((p) => (
                  <tr key={p.uid} className="border-b border-zinc-800/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-200">{p.name}</div>
                      <div className="text-xs text-zinc-500">{p.email ?? p.uid}</div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{submittedStr(p)}</td>
                    <td className="px-4 py-3 text-zinc-400">{p.city ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {sub === "rejected" ? (
        <div className="space-y-4">
          {rejectedDrivers.length === 0 ? (
            <p className="text-sm text-zinc-500">No rejected applications.</p>
          ) : (
            rejectedDrivers.map((p) => (
              <div
                key={p.uid}
                className="rounded-2xl border p-5"
                style={{ background: CARD, borderColor: BORDER }}
              >
                <div className="text-lg font-semibold text-zinc-100">{p.name}</div>
                <div className="text-sm text-zinc-500">{p.email ?? "—"}</div>
                <p className="mt-2 text-sm text-red-300">
                  {p.rejectionReason?.trim() || "No reason recorded."}
                </p>
              </div>
            ))
          )}
        </div>
      ) : null}

      {sub === "more" ? (
        <div className="space-y-4">
          {moreInfoDrivers.length === 0 ? (
            <p className="text-sm text-zinc-500">No drivers waiting on additional documents.</p>
          ) : (
            moreInfoDrivers.map((p) => (
              <div
                key={p.uid}
                className="rounded-2xl border p-5"
                style={{ background: CARD, borderColor: BORDER }}
              >
                <div className="text-lg font-semibold text-zinc-100">{p.name}</div>
                <div className="text-sm text-zinc-500">{p.email ?? "—"}</div>
                <p className="mt-2 text-sm text-amber-200">
                  {p.requestNote?.trim() || "Awaiting re-upload."}
                </p>
                {renderDocGrid(p.documents)}
                <DriverDocChecklist docs={p.documents} />
                <CeoInsuranceNotesForDriver p={p} />
              </div>
            ))
          )}
        </div>
      ) : null}

      {sub === "pending" && pendingReview.length === 0 ? (
        <p className="text-sm text-zinc-500">No applications in pending review.</p>
      ) : null}

      {sub === "pending" ? (
        <div className="space-y-4">
          {pendingReview.map((p) => {
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
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-800 text-2xl">
                      👤
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-semibold text-zinc-100">{p.name}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {p.demoMode ? (
                        <span className="rounded-full border border-orange-500/50 bg-orange-950/40 px-2.5 py-0.5 text-[11px] font-bold text-orange-300">
                          🎮 DEMO ({demoJobsUsedCount(p)}/{demoJobLimit(p)} jobs used)
                        </span>
                      ) : null}
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span>🎮 Demo Mode</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={p.demoMode === true}
                          onClick={() => void setDemo(p.uid, !p.demoMode, p.name)}
                          className={[
                            "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
                            p.demoMode ? "border-[#00FF88] bg-[#00FF88]/35" : "border-zinc-600 bg-zinc-800",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                              p.demoMode ? "left-6" : "left-1",
                            ].join(" ")}
                          />
                        </button>
                      </div>
                    </div>
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

                {renderDocGrid(docs)}
                <DriverDocChecklist docs={docs} />
                <CeoInsuranceNotesForDriver p={p} />

                <div className="mt-3 font-mono text-xs text-zinc-500">
                  License: {docs?.licenseNumber ?? "—"} · Exp {docs?.licenseExpiry ?? "—"} ·{" "}
                  {docs?.licenseState ?? ""}
                </div>
                <div className="font-mono text-xs text-zinc-500">
                  Personal insurance: {docs?.insuranceProvider ?? "—"} · Exp {docs?.insuranceExpiry ?? "—"}
                </div>
                <div className="font-mono text-xs text-zinc-500">
                  Commercial: exp {docs?.commercialAutoExpiry ?? "—"} · Reg exp {docs?.registrationExpiry ?? "—"}
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
                  <button
                    type="button"
                    onClick={() => onRequestDocs(p)}
                    className="rounded-xl border border-[#3B82F6]/50 px-4 py-2 text-sm font-semibold text-[#3B82F6]"
                  >
                    🔄 REQUEST MORE DOCS
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {sub === "pending" && noDocsPipeline.length > 0 ? (
        <div className="mt-8 rounded-2xl border border-zinc-800 p-5" style={{ background: CARD }}>
          <h3 className="text-sm font-semibold text-zinc-300">Pre-doc pipeline (demo eligible)</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Drivers who haven&apos;t submitted documents yet — grant demo to let them try GRIDD before upload.
          </p>
          <ul className="mt-4 space-y-3">
            {noDocsPipeline.map((p) => (
              <li
                key={p.uid}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2"
              >
                <div>
                  <div className="font-medium text-zinc-200">{p.name}</div>
                  <div className="text-xs text-zinc-500">{p.email ?? p.uid}</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>🎮 Demo</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={p.demoMode === true}
                    onClick={() => void setDemo(p.uid, !p.demoMode, p.name)}
                    className={[
                      "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
                      p.demoMode ? "border-[#00FF88] bg-[#00FF88]/35" : "border-zinc-600 bg-zinc-800",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                        p.demoMode ? "left-6" : "left-1",
                      ].join(" ")}
                    />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
    hourlyFeesToday: number[];
    maxHourlyFee: number;
    platformShareWeek70: number;
    platformShareWeek30: number;
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Your 70% (week est.)</div>
          <div className="mt-1 font-mono text-2xl text-zinc-100">{money(r.platformShareWeek70)}</div>
        </div>
        <div className="rounded-xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Partner 30% (week est.)</div>
          <div className="mt-1 font-mono text-2xl text-zinc-100">{money(r.platformShareWeek30)}</div>
        </div>
      </div>

      <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="text-sm font-semibold text-zinc-200">Hourly platform fees (today, completed)</h3>
        <div className="mt-4 flex h-32 items-end gap-0.5 overflow-x-auto pb-1">
          {r.hourlyFeesToday.map((v, h) => (
            <div key={h} className="flex min-w-[18px] flex-1 flex-col items-center gap-1">
              <div
                className="w-full max-w-[28px] rounded-t-md bg-gradient-to-t from-[#3dff7a]/25 to-[#3dff7a]"
                style={{
                  height: `${Math.max(6, (v / Math.max(1, r.maxHourlyFee)) * 100)}%`,
                  minHeight: 6,
                }}
              />
              <span className="text-[9px] text-zinc-600">{h}</span>
            </div>
          ))}
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
