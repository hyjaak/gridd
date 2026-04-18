"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  collection,
  getFirestore,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuth, type GriddProfile } from "@/hooks/useAuth";
import { CustomerNav } from "@/components/CustomerNav";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import type { Provider } from "@/types";
import type { Job } from "@/types";
import { firebaseApp } from "@/lib/firebase";

type GridItem = {
  id: string;
  icon: string;
  border: string;
  label: string;
};

const ROWS: GridItem[][] = [
  [
    { id: "haul", icon: "🚛", border: "#FF6B00", label: "Haul" },
    { id: "send", icon: "📦", border: "#3B82F6", label: "Send" },
    { id: "ride", icon: "🚗", border: "#8B5CF6", label: "Ride" },
    { id: "help", icon: "💪", border: "#F59E0B", label: "Help" },
  ],
  [
    { id: "cuts", icon: "🌳", border: "#22c55e", label: "Cuts" },
    { id: "lawn", icon: "🌿", border: "#16a34a", label: "Lawn" },
    { id: "pressure", icon: "💧", border: "#06B6D4", label: "Wash" },
    { id: "snow", icon: "❄️", border: "#93C5FD", label: "Snow" },
  ],
  [
    { id: "gutter", icon: "🏠", border: "#A78BFA", label: "Gutter" },
    { id: "fence", icon: "🔧", border: "#D97706", label: "Fence" },
    { id: "protect", icon: "🛡️", border: "#EC4899", label: "Protect" },
  ],
];

const SERVICE_ICONS: Record<string, string> = {
  haul: "🚛",
  send: "📦",
  ride: "🚗",
  help: "💪",
  cuts: "🌳",
  lawn: "🌿",
  pressure: "💧",
  snow: "❄️",
  gutter: "🏠",
  fence: "🔧",
  protect: "🛡️",
};

function money(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function walletCentsFromProfile(p: GriddProfile | null | undefined) {
  if (!p) return 0;
  if (typeof p.walletBalanceCents === "number") return p.walletBalanceCents;
  if (typeof p.walletBalance === "number") return Math.round(p.walletBalance * 100);
  return 0;
}

function Skeleton({ className }: { className: string }) {
  return (
    <div className={["animate-pulse rounded-2xl bg-white/5", className].join(" ")} />
  );
}

const CUSTOMER_ONLY = ["customer"] as const;

export default function CustomerHomePage() {
  const router = useRouter();
  const { loading: gateLoading, ok, profile } = useRequireAuth([...CUSTOMER_ONLY]);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (gateLoading || !ok || !profile) return;
    if (profile.onboardingComplete !== true) {
      router.replace("/onboarding");
    }
  }, [gateLoading, ok, profile, router]);
  const firstName = (profile?.name ?? "").trim().split(/\s+/)[0] || "there";
  const points = profile?.points ?? 0;
  const walletBalanceCents = walletCentsFromProfile(profile);
  const jobCount = profile?.jobCount ?? 0;
  const tierLabel = profile?.tier ?? profile?.ditchTier ?? "—";

  const [providers, setProviders] = useState<Provider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  useEffect(() => {
    if (!firebaseApp) {
      setProviders([]);
      setProvidersLoading(false);
      return;
    }
    setProvidersLoading(true);
    const db = getFirestore(firebaseApp);
    const q = query(collection(db, "providers"), limit(80));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ uid: d.id, ...(d.data() as Omit<Provider, "uid">) }))
          .filter((p) => {
            const st = p.status;
            if (st === undefined || st === null) return true;
            return st === "active" || st === "idle";
          })
          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        setProviders(rows.slice(0, 3));
        setProvidersLoading(false);
      },
      () => setProvidersLoading(false),
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) {
      setJobs([]);
      setJobsLoading(false);
      return;
    }
    const db = getFirestore(firebaseApp);
    const q = query(collection(db, "jobs"), where("customerUid", "==", user.uid), limit(25));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Job, "id">) }))
          .sort((a, b) => {
            const ta = new Date(a.createdAt).getTime();
            const tb = new Date(b.createdAt).getTime();
            return tb - ta;
          });
        setJobs(rows as Job[]);
        setJobsLoading(false);
      },
      () => setJobsLoading(false),
    );
    return () => unsub();
  }, [user?.uid]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  if (gateLoading || !ok) {
    return <LoadingScreen />;
  }

  return (
    <main className="min-h-full bg-[#060606]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[#060606]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/home" className="text-lg font-semibold tracking-tight text-[#00FF88]">
            GRIDD
          </Link>
          <div className="flex items-center gap-3">
            <LogoutButton />
            <NotificationBell />
            <div
              className="rounded-full border border-white/10 bg-[#0a0a0a] px-4 py-2 text-sm font-semibold text-[#FFB800]"
              title="Wallet balance"
            >
              {authLoading ? "…" : money(walletBalanceCents)}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 pb-36 pt-6 sm:px-6 sm:pb-40">
        <section className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[#0a0a0a] p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_20%_-10%,rgba(255,107,0,0.35),transparent_55%),radial-gradient(700px_circle_at_80%_0%,rgba(0,255,136,0.12),transparent_50%)]" />
          <div className="relative">
            <div className="text-sm text-[var(--sub)]">
              {greeting},{" "}
              <span className="font-medium text-[var(--text)]">{firstName}</span>
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text)]">
              What do you need today?
            </div>
            <div className="mt-2 text-sm text-[var(--sub)]">
              {providersLoading ? (
                <span>Checking active providers…</span>
              ) : (
                <span>{providers.length} top providers near you</span>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 space-y-4">
          {ROWS.map((row, ri) => (
            <div
              key={ri}
              className={[
                "grid gap-4",
                row.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3",
              ].join(" ")}
            >
              {row.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => router.push(`/book?service=${encodeURIComponent(s.id)}`)}
                  className="text-left"
                >
                  <div
                    className="flex min-h-[120px] flex-col items-center justify-center rounded-2xl border-2 bg-[#0a0a0a] p-4 transition-colors hover:border-[#00FF88]/80"
                    style={{ borderColor: s.border }}
                  >
                    <span className="text-4xl leading-none">{s.icon}</span>
                    <span className="mt-3 text-sm font-semibold text-[var(--text)]">{s.label}</span>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </section>

        {/* GRIDD Rescue — Emergency Services */}
        <div
          style={{
            margin: "20px 0",
            background: "linear-gradient(135deg, #1a0000, #0a0a0a)",
            border: "1px solid #ef444433",
            borderRadius: 16,
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#ef4444",
                boxShadow: "0 0 8px #ef4444",
                animation: "gridd-rescue-blink 1s ease infinite",
              }}
            />
            <span
              style={{
                color: "#ef4444",
                fontWeight: 800,
                fontSize: 13,
                letterSpacing: 1,
              }}
            >
              GRIDD RESCUE
            </span>
            <span style={{ color: "#555", fontSize: 11 }}>Emergency services</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button
              type="button"
              onClick={() => router.push("/book?service=roadside")}
              style={{
                background: "#0a0000",
                border: "1px solid #ef444444",
                borderRadius: 12,
                padding: 14,
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 6 }}>🛞</div>
              <div style={{ color: "#ef4444", fontWeight: 700, fontSize: 12 }}>Roadside</div>
              <div style={{ color: "#555", fontSize: 10, marginTop: 2 }}>Flat tire, jump start, lockout</div>
            </button>

            <button
              type="button"
              onClick={() => router.push("/book?service=evcharge")}
              style={{
                background: "#000a1a",
                border: "1px solid #3B82F644",
                borderRadius: 12,
                padding: 14,
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 6 }}>⚡</div>
              <div style={{ color: "#3B82F6", fontWeight: 700, fontSize: 12 }}>EV Charge</div>
              <div style={{ color: "#555", fontSize: 10, marginTop: 2 }}>Tesla, Ford, Rivian & more</div>
            </button>
          </div>
        </div>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4" style={{ borderColor: "#FF6B00" }}>
            <div className="text-xs text-[var(--sub)]">Wallet</div>
            <div className="mt-1 text-lg font-semibold text-[#FFB800]">
              {authLoading ? "…" : money(walletBalanceCents)}
            </div>
          </Card>
          <Card className="p-4" style={{ borderColor: "#00FF88" }}>
            <div className="text-xs text-[var(--sub)]">Jobs</div>
            <div className="mt-1 text-lg font-semibold text-[#00FF88]">
              {authLoading || jobsLoading ? "…" : jobCount}
            </div>
          </Card>
          <Card className="p-4" style={{ borderColor: "#FFB800" }}>
            <div className="text-xs text-[var(--sub)]">Ditch Points</div>
            <div className="mt-1 text-lg font-semibold text-[#FFB800]">
              {authLoading ? "…" : points.toLocaleString()}
            </div>
          </Card>
          <Card className="p-4" style={{ borderColor: "#22c55e" }}>
            <div className="text-xs text-[var(--sub)]">Tier</div>
            <div className="mt-1 truncate text-lg font-semibold capitalize text-[#22c55e]">
              {authLoading ? "…" : tierLabel}
            </div>
          </Card>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[var(--text)]">Active Near You</h2>
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00FF88] opacity-30" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00FF88]" />
              </span>
            </div>
            <Button variant="ghost" onClick={() => router.push("/book")}>
              Book
            </Button>
          </div>

          {providersLoading ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {providers.map((p) => (
                <Card key={p.uid} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[#0a0a0a] text-xs font-semibold text-[var(--text)]"
                        style={{
                          backgroundImage: p.photoUrl ? `url(${p.photoUrl})` : undefined,
                          backgroundSize: "cover",
                        }}
                      >
                        {!p.photoUrl ? (p.name?.slice(0, 2)?.toUpperCase() ?? "PR") : null}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--text)]">{p.name}</div>
                        <div className="mt-0.5 text-xs text-[#FFB800]">
                          {(p.rating ?? 0).toFixed(1)} <span className="text-[#FFB800]">⭐</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => router.push("/book")}
                      className="shrink-0"
                    >
                      Book
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(p.serviceIds ?? ["haul", "send", "help"]).slice(0, 6).map((sid) => (
                      <span
                        key={sid}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-white/5 px-2 py-1 text-[10px] text-[var(--sub)]"
                        title={sid}
                      >
                        <span>{SERVICE_ICONS[sid] ?? "✨"}</span>
                        <span className="uppercase tracking-wide">{sid}</span>
                      </span>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text)]">Recent Activity</h2>
            <Button variant="ghost" onClick={() => router.push("/history")}>
              View all
            </Button>
          </div>

          {jobsLoading ? (
            <div className="mt-3 space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : jobs.length === 0 ? (
            <Card className="mt-3 p-4">
              <div className="text-sm text-[var(--text)]">No jobs yet.</div>
              <div className="mt-1 text-xs text-[var(--sub)]">Book your first service to see it here.</div>
            </Card>
          ) : (
            <div className="mt-3 space-y-3">
              {jobs.slice(0, 3).map((j) => {
                const meta = SERVICE_ICONS[j.serviceId] ?? "✨";
                const amount = typeof j.amountCents === "number" ? money(j.amountCents) : "—";
                return (
                  <Card key={j.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="text-2xl">{meta}</div>
                        <div>
                          <div className="text-sm font-semibold text-[var(--text)]">{j.serviceName}</div>
                          <div className="mt-1 text-xs text-[var(--sub)]">
                            {j.createdAt ? new Date(j.createdAt).toLocaleDateString() : "—"} · {amount}
                          </div>
                        </div>
                      </div>
                      <span className="rounded-full border border-[var(--border)] bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--sub)]">
                        {j.status}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <CustomerNav />
    </main>
  );
}
