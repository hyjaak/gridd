"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { updateProfile } from "firebase/auth";
import { collection, doc, getFirestore, limit, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { Star } from "lucide-react";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useGriddWalletData } from "@/hooks/useGriddWalletData";
import { DriverNav } from "@/components/DriverNav";
import { DriverProfileWalletCard } from "@/components/profile/DriverProfileWalletCard";
import { DriverWalletProfileExtras } from "@/components/profile/DriverWalletProfileExtras";
import { LoadGriddSheet } from "@/components/wallet/LoadGriddSheet";
import { logOut } from "@/lib/auth";
import { canGoOnline, demoWalletRestricted } from "@/lib/driver-gate";
import { DRIVER_SERVICE_META } from "@/lib/driver-service-meta";
import { buildReferralCode } from "@/lib/referral-code";
import {
  driverTierColor,
  driverTierDisplay,
  jobsRemainingForNextTier,
  tierProgressPct,
} from "@/lib/profile-helpers";
import { money as moneyJob, payoutBaseCentsFromTotal } from "@/lib/job-tracking";
import type { DriverTier } from "@/types";
import type { Job } from "@/types";
import type { Provider } from "@/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const BG = "#060606";
const CARD = "#0a0a0a";
const BORDER = "#1a1a1a";
const ACCENT = "#FF6B00";
const GREEN = "#00FF88";

const SERVICE_IDS = Object.keys(DRIVER_SERVICE_META);

function payoutForJob(job: Job): number {
  if (typeof job.providerPayoutCents === "number") return job.providerPayoutCents;
  const total = job.chargedTotalCents ?? job.amountCents ?? 0;
  return payoutBaseCentsFromTotal(total);
}

function MenuSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{title}</p>
      <Card className="overflow-hidden border p-0" style={{ background: CARD, borderColor: BORDER }}>
        {children}
      </Card>
    </div>
  );
}

function MenuRow({
  href,
  icon,
  label,
  right,
}: {
  href: string;
  icon: string;
  label: string;
  right?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b border-zinc-800/80 px-4 py-3.5 text-sm text-zinc-200 transition hover:bg-white/[0.03] last:border-b-0"
    >
      <span className="text-lg">{icon}</span>
      <span className="min-w-0 flex-1">{label}</span>
      {right ? <span className="shrink-0 text-xs text-zinc-500">{right}</span> : null}
      <span className="text-zinc-600">›</span>
    </Link>
  );
}

export function DriverProfile() {
  const { user, profile } = useAuth();
  const db = useMemo(() => (firebaseApp ? getFirestore(firebaseApp) : null), []);
  const walletData = useGriddWalletData();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [completedJobs, setCompletedJobs] = useState<Job[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [loadOpen, setLoadOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid || !db || !profile || profile.referralCode) return;
    const code = buildReferralCode(profile.name, user.email ?? undefined);
    void updateDoc(doc(db, "providers", user.uid), { referralCode: code }).catch(() => null);
  }, [user?.uid, db, profile?.referralCode, profile?.name, user?.email]);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) return;
    const dbf = getFirestore(firebaseApp);
    const unsub = onSnapshot(doc(dbf, "providers", user.uid), (snap) => {
      if (!snap.exists()) {
        setProvider(null);
        return;
      }
      setProvider({ uid: snap.id, ...(snap.data() as Omit<Provider, "uid">) });
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) return;
    const dbf = getFirestore(firebaseApp);
    const q = query(collection(dbf, "jobs"), where("providerUid", "==", user.uid), limit(400));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Job, "id">) }))
          .filter((j) => j.status === "completed") as Job[];
        setCompletedJobs(rows);
      },
      () => setCompletedJobs([]),
    );
    return () => unsub();
  }, [user?.uid]);

  const tier = (profile?.driverTier ?? "starter") as DriverTier;
  const completed = profile?.completedJobCount ?? 0;
  const { remaining, next } = jobsRemainingForNextTier(tier, completed);
  const nextLabel = next ? driverTierDisplay(next) : "max";
  const pct = tierProgressPct(tier, completed);

  const walletUnlocked = canGoOnline(provider);
  const demoLocked = provider ? demoWalletRestricted(provider) : false;
  const canUseWallet = walletUnlocked && !demoLocked;

  const earningsToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const t0 = start.getTime();
    let sum = 0;
    for (const j of completedJobs) {
      const ct = new Date(j.completedAt ?? j.createdAt).getTime();
      if (ct >= t0) sum += payoutForJob(j);
    }
    return sum;
  }, [completedJobs]);

  const earningsWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let sum = 0;
    for (const j of completedJobs) {
      const ct = new Date(j.completedAt ?? j.createdAt).getTime();
      if (ct >= weekAgo) sum += payoutForJob(j);
    }
    return sum;
  }, [completedJobs]);

  const allTimeCents = profile?.lifetimeEarningsCents ?? 0;

  const toggleService = useCallback(
    async (id: string) => {
      if (!db || !user) return;
      const cur = new Set(profile?.serviceIds ?? SERVICE_IDS);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      await updateDoc(doc(db, "providers", user.uid), { serviceIds: Array.from(cur) });
    },
    [db, user, profile?.serviceIds],
  );

  const patchNotif = useCallback(
    async (key: "notifPush" | "notifSmsDriver" | "notifEmailDriver" | "notifJobAlerts" | "notifChat" | "notifPayment", val: boolean) => {
      if (!db || !user) return;
      await updateDoc(doc(db, "providers", user.uid), { [key]: val });
    },
    [db, user],
  );

  const openEdit = () => {
    setEditName(profile?.name ?? "");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!user || !db || !editName.trim()) return;
    await updateDoc(doc(db, "providers", user.uid), { name: editName.trim() });
    if (firebaseAuth.currentUser) {
      await updateProfile(firebaseAuth.currentUser, { displayName: editName.trim() });
    }
    setEditOpen(false);
  };

  const initial = (profile?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <main className="min-h-screen pb-36" style={{ background: BG }}>
      <LoadGriddSheet
        open={loadOpen}
        onClose={() => setLoadOpen(false)}
        returnPath="/driver/profile"
        walletUnlocked={canUseWallet}
      />

      <div className="mx-auto max-w-2xl px-4 pb-8 pt-8 sm:px-6">
        {/* Driver card */}
        <section className="flex flex-col items-center text-center">
          <div
            className="flex h-28 w-28 items-center justify-center rounded-full text-4xl font-black text-black shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${GREEN}, ${ACCENT})`,
            }}
          >
            {profile?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.photoUrl} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              initial
            )}
          </div>
          <h1 className="mt-4 text-2xl font-bold text-zinc-100">{profile?.name ?? "Driver"}</h1>
          <span className="mt-2 inline-block rounded-full border border-[#00FF88]/40 bg-[#00FF88]/10 px-3 py-1 text-xs font-bold text-[#00FF88]">
            GRIDD Driver
          </span>
          <div className="mt-3 flex items-center gap-1 text-amber-400">
            <Star className="h-5 w-5 fill-current" />
            <span className="font-mono text-lg">{(profile?.rating ?? 5).toFixed(1)}</span>
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            Jobs completed: <span className="font-mono text-zinc-200">{completed}</span>
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button type="button" variant="secondary" onClick={openEdit}>
              Edit name
            </Button>
            <Link
              href="/driver/settings"
              className="rounded-full border border-[#1e1e1e] bg-[#0a0a0a] px-4 py-2 text-sm font-medium text-white transition hover:border-[#ff6b00]/50"
            >
              All settings
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-center text-[11px] text-zinc-500">
            <Link href="/rules" className="text-[#ff6b00] hover:underline">
              Porch rules
            </Link>
            <span>·</span>
            <Link href="/driver-rules" className="text-[#ff6b00] hover:underline">
              Driver code
            </Link>
            <span>·</span>
            <Link href="/how-it-works" className="text-[#ff6b00] hover:underline">
              How it works
            </Link>
            <span>·</span>
            <Link href="/trust" className="text-[#ff6b00] hover:underline">
              Trust
            </Link>
          </div>
        </section>

        {/* Wallet */}
        <div id="wallet" className="mt-8 scroll-mt-24">
          <DriverProfileWalletCard
            balanceCents={walletData.balanceCents}
            walletUnlocked={walletUnlocked}
            demoWalletRestricted={demoLocked}
            onOpenLoad={() => setLoadOpen(true)}
          />
        </div>

        <DriverWalletProfileExtras
          profileName={profile?.name}
          prefs={walletData.prefs}
          walletUnlocked={walletUnlocked}
          demoWalletRestricted={demoLocked}
          onOpenLoad={() => setLoadOpen(true)}
        />

        {/* Earnings */}
        <Card className="mt-8 border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <h2 className="text-sm font-semibold text-zinc-200">💰 Earnings</h2>
          <div className="mt-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Today</span>
              <span className="font-mono text-zinc-100">{moneyJob(earningsToday)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">This week</span>
              <span className="font-mono text-zinc-100">{moneyJob(earningsWeek)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">All time</span>
              <span className="font-mono text-zinc-100">{moneyJob(allTimeCents)}</span>
            </div>
          </div>
          <Link
            href="/driver/settings/earnings-history"
            className="mt-4 block w-full rounded-xl border border-zinc-700 py-2.5 text-center text-sm font-medium text-[#00FF88] hover:bg-white/5"
          >
            View History →
          </Link>
        </Card>

        {/* Tier progress */}
        <Card className="mt-6 border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <h2 className="text-sm font-semibold text-zinc-200">Tier progress</h2>
          <p className="mt-1 text-xs text-zinc-500">
            {remaining > 0 && next
              ? `${remaining} more jobs to ${nextLabel}`
              : "You're at the top tier — keep earning."}
          </p>
          <div className="mt-3 h-2 w-full rounded-full bg-zinc-800">
            <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: ACCENT }} />
          </div>
          <span
            className="mt-3 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{
              background: `${driverTierColor(tier)}22`,
              color: driverTierColor(tier),
              border: `1px solid ${driverTierColor(tier)}55`,
            }}
          >
            {driverTierDisplay(tier)}
          </span>
        </Card>

        {/* Services quick toggle */}
        <Card className="mt-6 border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <h2 className="text-sm font-semibold text-zinc-200">Services I offer</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {SERVICE_IDS.map((id) => {
              const on = (profile?.serviceIds ?? SERVICE_IDS).includes(id);
              const m = DRIVER_SERVICE_META[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => void toggleService(id)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    on ? "border-[#00FF88] bg-[#00FF88]/15 text-[#00FF88]" : "border-zinc-700 text-zinc-500",
                  ].join(" ")}
                >
                  {m.icon} {m.label}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Settings menu */}
        <MenuSection title="My account">
          <MenuRow href="/driver/settings" icon="👤" label="Personal info" />
          <MenuRow href="/signup/driver-docs" icon="🚗" label="Vehicle info" />
          <MenuRow href="/signup/driver-docs" icon="🪪" label="My documents" />
          <MenuRow href="/driver/settings#service-area" icon="📍" label="Service area" />
          <MenuRow href="/driver/settings#services-offer" icon="🔧" label="Services I offer" />
        </MenuSection>

        <MenuSection title="Payouts">
          <MenuRow href="/driver/earnings" icon="🏦" label="Payout method" />
          <MenuRow href="/driver/settings#payout-schedule" icon="📅" label="Payout schedule" />
          <MenuRow href="/driver/settings" icon="🧾" label="Tax documents" right="In settings" />
        </MenuSection>

        <MenuSection title="Notifications">
          <div className="border-b border-zinc-800/80 px-4 py-3.5">
            <label className="flex items-center justify-between gap-3 text-sm text-zinc-200">
              <span>🔔 Job alerts</span>
              <input
                type="checkbox"
                checked={profile?.notifJobAlerts !== false}
                onChange={(e) => void patchNotif("notifJobAlerts", e.target.checked)}
                className="h-5 w-5 accent-[#00FF88]"
              />
            </label>
          </div>
          <div className="border-b border-zinc-800/80 px-4 py-3.5">
            <label className="flex items-center justify-between gap-3 text-sm text-zinc-200">
              <span>💬 Messages</span>
              <input
                type="checkbox"
                checked={profile?.notifChat !== false}
                onChange={(e) => void patchNotif("notifChat", e.target.checked)}
                className="h-5 w-5 accent-[#00FF88]"
              />
            </label>
          </div>
          <div className="border-b border-zinc-800/80 px-4 py-3.5">
            <label className="flex items-center justify-between gap-3 text-sm text-zinc-200">
              <span>💸 Payments</span>
              <input
                type="checkbox"
                checked={profile?.notifPayment !== false}
                onChange={(e) => void patchNotif("notifPayment", e.target.checked)}
                className="h-5 w-5 accent-[#00FF88]"
              />
            </label>
          </div>
          <MenuRow href="/driver/settings#dnd" icon="🌙" label="Do Not Disturb" />
        </MenuSection>

        <MenuSection title="Support">
          <MenuRow href="https://gridd.click" icon="❓" label="How-Tos" />
          <MenuRow href="mailto:drivers@gridd.click" icon="💬" label="Get Help" />
          <MenuRow href="mailto:feedback@gridd.click?subject=GRIDD%20Driver%20Feedback" icon="📝" label="Send Feedback" />
          <MenuRow href="/terms" icon="📄" label="Terms & Privacy" />
        </MenuSection>

        <MenuSection title="Danger zone">
          <button
            type="button"
            className="flex w-full items-center gap-3 border-b border-zinc-800/80 px-4 py-3.5 text-left text-sm text-zinc-200 hover:bg-white/[0.03]"
            onClick={() => {
              if (!window.confirm("Sign out of GRIDD on this device?")) return;
              void logOut();
            }}
          >
            <span className="text-lg">🚪</span>
            <span className="flex-1">Sign out</span>
            <span className="text-zinc-600">›</span>
          </button>
          <Link
            href="/driver/settings#danger-zone"
            className="flex items-center gap-3 px-4 py-3.5 text-sm text-red-400 hover:bg-red-950/20"
          >
            <span className="text-lg">❌</span>
            <span className="flex-1">Delete account</span>
            <span className="text-zinc-600">›</span>
          </Link>
        </MenuSection>
      </div>

      {editOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-sm border p-6" style={{ background: CARD, borderColor: BORDER }}>
            <h3 className="font-semibold text-zinc-100">Edit name</h3>
            <Input className="mt-3" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="button" className="flex-1" onClick={() => void saveEdit()}>
                Save
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      <DriverNav />
    </main>
  );
}
