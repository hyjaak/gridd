"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { updateProfile } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { Star } from "lucide-react";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { DriverNav } from "@/components/DriverNav";
import { logOut } from "@/lib/auth";
import { money } from "@/lib/job-tracking";
import { DRIVER_SERVICE_META } from "@/lib/driver-service-meta";
import {
  driverTierColor,
  driverTierDisplay,
  jobsRemainingForNextTier,
  tierProgressPct,
} from "@/lib/profile-helpers";
import type { DriverTier } from "@/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const BG = "#060606";
const CARD = "#0a0a0a";
const BORDER = "#1a1a1a";
const ACCENT = "#FF6B00";
const GREEN = "#00FF88";

const SERVICE_IDS = Object.keys(DRIVER_SERVICE_META);

function nextFridayLabel(): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntilFri = (5 - day + 7) % 7 || 7;
  const fri = new Date(d);
  fri.setDate(d.getDate() + daysUntilFri);
  return fri.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function DriverProfile() {
  const { user, profile } = useAuth();
  const db = useMemo(() => (firebaseApp ? getFirestore(firebaseApp) : null), []);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");

  const tier = (profile?.driverTier ?? "starter") as DriverTier;
  const completed = profile?.completedJobCount ?? 0;
  const { remaining, next } = jobsRemainingForNextTier(tier, completed);
  const nextLabel = next ? driverTierDisplay(next) : "max";
  const pct = tierProgressPct(tier, completed);
  const docs = profile?.documents;
  const vehicleLine = docs
    ? `${docs.vehicleYear ?? ""} ${docs.vehicleMake ?? ""} ${docs.vehicleModel ?? ""} ${docs.vehicleColor ?? ""}`.trim()
    : "—";
  const plate = docs?.licensePlate && docs?.plateState ? `${docs.plateState} ${docs.licensePlate}` : "—";

  const bankOk = Boolean(profile?.stripeConnectId || profile?.bankConnected);
  const weekEst = profile?.lifetimeEarningsCents
    ? Math.round((profile.lifetimeEarningsCents / 100) * 0.05)
    : 0;

  const licenseOk = Boolean(docs?.licenseExpiry);
  const insSoon = useMemo(() => {
    if (!docs?.insuranceExpiry) return false;
    const t = new Date(docs.insuranceExpiry).getTime();
    return t < Date.now() + 30 * 24 * 60 * 60 * 1000;
  }, [docs?.insuranceExpiry]);

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

  const setNotif = useCallback(
    async (key: "notifPush" | "notifSmsDriver" | "notifEmailDriver", val: boolean) => {
      if (!db || !user) return;
      await updateDoc(doc(db, "providers", user.uid), { [key]: val });
    },
    [db, user],
  );

  const saveDistance = useCallback(
    async (miles: number) => {
      if (!db || !user) return;
      await updateDoc(doc(db, "providers", user.uid), { maxDistanceMiles: miles });
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

  const [distMiles, setDistMiles] = useState(25);
  useEffect(() => {
    setDistMiles(profile?.maxDistanceMiles ?? 25);
  }, [profile?.maxDistanceMiles]);

  const statusLabel = useMemo(() => {
    const x = (profile?.providerStatus ?? "offline").toLowerCase();
    if (x === "active") return "Online";
    if (x === "idle") return "Idle";
    return "Offline";
  }, [profile?.providerStatus]);

  return (
    <main className="min-h-screen pb-36" style={{ background: BG }}>
      <div className="mx-auto max-w-2xl px-4 pb-8 pt-8 sm:px-6">
        {/* Header */}
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
          <p className="text-sm text-zinc-500">{profile?.email ?? user?.email}</p>
          <div className="mt-2 flex items-center gap-1 text-amber-400">
            <Star className="h-5 w-5 fill-current" />
            <span className="font-mono text-lg">{(profile?.rating ?? 5).toFixed(1)}</span>
          </div>
          <span
            className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold"
            style={{
              background: `${driverTierColor(tier)}22`,
              color: driverTierColor(tier),
              border: `1px solid ${driverTierColor(tier)}55`,
            }}
          >
            {driverTierDisplay(tier)}
          </span>
          <p className="mt-2 text-sm text-zinc-500">
            Status:{" "}
            <span
              style={{
                color: statusLabel === "Offline" ? "#888" : statusLabel === "Idle" ? ACCENT : GREEN,
              }}
            >
              {statusLabel}
            </span>
          </p>
          <Button type="button" variant="secondary" className="mt-4" onClick={openEdit}>
            Edit Profile
          </Button>
        </section>

        {/* Stats */}
        <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Total earned", money(profile?.lifetimeEarningsCents ?? 0)],
            ["Jobs done", String(completed)],
            ["Rating", (profile?.rating ?? 5).toFixed(1)],
            ["Equity", `${profile?.equityShares ?? 0} shares`],
          ].map(([k, v]) => (
            <Card key={k} className="border p-4" style={{ background: CARD, borderColor: BORDER }}>
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">{k}</div>
              <div className="mt-1 font-mono text-sm font-semibold text-zinc-100">{v}</div>
            </Card>
          ))}
        </section>

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
          <p className="mt-3 text-xs text-zinc-500">
            Next perks: higher match priority, bonus multipliers, and priority support at {nextLabel}.
          </p>
        </Card>

        {/* Vehicle & services */}
        <Card className="mt-6 border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: ACCENT }}>
                My vehicle
              </h2>
              <p className="mt-1 text-sm text-zinc-300">{vehicleLine || "Add in driver signup"}</p>
              <p className="font-mono text-xs text-zinc-500">{plate}</p>
            </div>
            <Link href="/signup/driver-docs" className="text-xs font-semibold text-[#3B82F6] hover:underline">
              Edit
            </Link>
          </div>
          <h3 className="mt-6 text-sm font-semibold text-zinc-200">My services</h3>
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

        {/* Documents */}
        <Card className="mt-6 border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <h2 className="text-sm font-semibold text-zinc-200">Documents</h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-400">
            <li className="flex justify-between">
              Driver&apos;s License
              <span className={licenseOk ? "text-[#00FF88]" : "text-amber-400"}>
                {licenseOk ? "On file" : "Needs update"}
              </span>
            </li>
            <li className="flex justify-between">
              Insurance
              <span className={insSoon ? "text-amber-400" : "text-[#00FF88]"}>
                {insSoon ? "Expires soon" : "Verified"}
              </span>
            </li>
            <li className="flex justify-between">
              Profile photo
              <Link href="/signup/driver-docs" className="text-[#3B82F6] hover:underline">
                Change photo
              </Link>
            </li>
          </ul>
          <Link
            href="/signup/driver-docs"
            className="mt-4 block w-full rounded-xl border border-zinc-700 py-2 text-center text-sm text-zinc-300"
          >
            Upload new documents
          </Link>
        </Card>

        {/* Payout */}
        <Card className="mt-6 border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <h2 className="text-sm font-semibold text-zinc-200">Payouts</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Bank:{" "}
            <span className={bankOk ? "text-[#00FF88]" : "text-amber-400"}>{bankOk ? "Connected" : "Not connected"}</span>
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Next estimated payout ({nextFridayLabel()}):{" "}
            <span className="font-mono text-zinc-300">~{money(weekEst * 100)}</span> (varies by jobs)
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/driver/earnings"
              className="rounded-xl bg-[#00FF88] px-4 py-2 text-sm font-bold text-black"
            >
              {bankOk ? "View / change bank" : "Connect bank (Stripe)"}
            </Link>
            <Link href="/driver/earnings" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300">
              Payout history
            </Link>
          </div>
        </Card>

        {/* Settings */}
        <Card className="mt-6 border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <h2 className="text-sm font-semibold text-zinc-200">Notifications</h2>
          <div className="mt-3 space-y-3 text-sm">
            {(
              [
                ["notifPush", "Push notifications", profile?.notifPush !== false],
                ["notifSmsDriver", "SMS", profile?.notifSmsDriver === true],
                ["notifEmailDriver", "Email", profile?.notifEmailDriver !== false],
              ] as const
            ).map(([key, label, def]) => (
              <label key={key} className="flex items-center justify-between gap-4">
                <span className="text-zinc-400">{label}</span>
                <input
                  type="checkbox"
                  checked={def}
                  onChange={(e) => void setNotif(key, e.target.checked)}
                  className="h-4 w-4 accent-[#00FF88]"
                />
              </label>
            ))}
          </div>

          <h3 className="mt-6 text-sm font-semibold text-zinc-200">Service area</h3>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <span className="text-xs text-zinc-500">ZIP {profile?.zip ?? docs?.serviceZip ?? "—"}</span>
            <label className="flex flex-1 items-center gap-2 text-xs text-zinc-500">
              Max miles ({distMiles})
              <input
                type="range"
                min={5}
                max={100}
                value={distMiles}
                onChange={(e) => setDistMiles(Number(e.target.value))}
                onMouseUp={(e) => void saveDistance(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => void saveDistance(Number((e.target as HTMLInputElement).value))}
                className="flex-1 accent-[#00FF88]"
              />
            </label>
          </div>

          <h3 className="mt-6 text-sm font-semibold text-zinc-200">Account &amp; security</h3>
          <div className="mt-2 space-y-2 text-sm">
            <button type="button" className="block w-full text-left text-[#3B82F6] hover:underline">
              Change email (contact support)
            </button>
            <Link href="/login" className="block text-[#3B82F6] hover:underline">
              Reset password via email
            </Link>
            <p className="text-xs text-zinc-600">Two-factor authentication — coming soon</p>
            <p className="text-xs text-zinc-600">Delete account — contact drivers@gridd.click</p>
          </div>

          <h3 className="mt-6 text-sm font-semibold text-zinc-200">Legal</h3>
          <Link href="/agreements" className="mt-1 block text-sm text-[#3B82F6] hover:underline">
            View signed agreements
          </Link>

          <h3 className="mt-6 text-sm font-semibold text-zinc-200">Help</h3>
          <a href="mailto:drivers@gridd.click" className="text-sm text-[#3B82F6] hover:underline">
            drivers@gridd.click
          </a>

          <button
            type="button"
            onClick={() => void logOut()}
            className="mt-8 w-full rounded-xl border border-red-500/50 bg-red-950/30 py-3 text-sm font-bold text-red-400"
          >
            Sign out
          </button>
        </Card>
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
