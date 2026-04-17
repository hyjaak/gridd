"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { updateProfile } from "firebase/auth";
import {
  arrayRemove,
  collection,
  doc,
  getDoc,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { CustomerNav } from "@/components/CustomerNav";
import { logOut } from "@/lib/auth";
import { money } from "@/lib/job-tracking";
import {
  customerTierLabel,
  customerTierProgressPct,
  pointsToNextTier,
} from "@/lib/profile-helpers";
import type { Job } from "@/types";
import type { Provider } from "@/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const BG = "#060606";
const CARD = "#0a0a0a";
const BORDER = "#1a1a1a";
const ACCENT = "#3B82F6";
function walletCentsFromProfile(p: { walletBalanceCents?: number; walletBalance?: number } | null) {
  if (!p) return 0;
  if (typeof p.walletBalanceCents === "number") return p.walletBalanceCents;
  if (typeof p.walletBalance === "number") return Math.round(p.walletBalance * 100);
  return 0;
}

function tierStyle(label: ReturnType<typeof customerTierLabel>): { bg: string; fg: string } {
  switch (label) {
    case "Platinum":
      return { bg: "#FFB80022", fg: "#FFB800" };
    case "VIP":
      return { bg: "#a855f722", fg: "#c084fc" };
    case "Regular":
      return { bg: "#3B82F622", fg: ACCENT };
    default:
      return { bg: "#71717a22", fg: "#a1a1aa" };
  }
}

export function CustomerProfile() {
  const { user, profile } = useAuth();
  const db = useMemo(() => (firebaseApp ? getFirestore(firebaseApp) : null), []);

  const points = profile?.points ?? 0;
  const tierLabel = customerTierLabel(points);
  const { need, label: nextTierName } = pointsToNextTier(points);
  const tierPct = customerTierProgressPct(points);
  const ts = tierStyle(tierLabel);

  const [nameEdit, setNameEdit] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [phoneEdit, setPhoneEdit] = useState("");
  const [addrEdit, setAddrEdit] = useState("");
  const [personalOpen, setPersonalOpen] = useState(false);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [favRows, setFavRows] = useState<Provider[]>([]);

  useEffect(() => {
    setNameEdit(profile?.name ?? "");
    setPhoneEdit(profile?.phone ?? "");
    setAddrEdit(profile?.homeAddress ?? "");
  }, [profile?.name, profile?.phone, profile?.homeAddress]);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) {
      setJobs([]);
      return;
    }
    const fs = getFirestore(firebaseApp);
    const q = query(collection(fs, "jobs"), where("customerUid", "==", user.uid), limit(25));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Job, "id">) }))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setJobs(rows as Job[]);
      },
      () => setJobs([]),
    );
    return () => unsub();
  }, [user?.uid]);

  const favorites = profile?.favorites ?? [];

  useEffect(() => {
    if (!db || favorites.length === 0) {
      setFavRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const snaps = await Promise.all(favorites.map((id) => getDoc(doc(db, "providers", id))));
      if (cancelled) return;
      const rows = snaps
        .filter((s) => s.exists())
        .map((s) => ({ uid: s.id, ...(s.data() as Omit<Provider, "uid">) }));
      setFavRows(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, favorites.join("|")]);

  const saveName = async () => {
    if (!user || !db || !nameEdit.trim()) return;
    await updateDoc(doc(db, "users", user.uid), { name: nameEdit.trim() });
    if (firebaseAuth.currentUser) {
      await updateProfile(firebaseAuth.currentUser, { displayName: nameEdit.trim() });
    }
    setEditingName(false);
  };

  const savePersonal = async () => {
    if (!user || !db) return;
    await updateDoc(doc(db, "users", user.uid), {
      phone: phoneEdit.trim() || null,
      homeAddress: addrEdit.trim() || null,
    });
    setPersonalOpen(false);
  };

  const removeFavorite = async (providerUid: string) => {
    if (!user || !db) return;
    await updateDoc(doc(db, "users", user.uid), { favorites: arrayRemove(providerUid) });
  };

  const setCustomerField = useCallback(
    async (patch: Record<string, boolean>) => {
      if (!user || !db) return;
      await updateDoc(doc(db, "users", user.uid), patch);
    },
    [db, user],
  );

  const redeem = async (cost: number, walletCreditCents: number, label: string) => {
    if (!user || !db) return;
    if (points < cost) {
      alert(`Need ${cost} Ditch Points. You have ${points}.`);
      return;
    }
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "users", user.uid);
        const snap = await tx.get(ref);
        const cur = (snap.data()?.points as number | undefined) ?? 0;
        if (cur < cost) throw new Error("points");
        tx.update(ref, {
          points: increment(-cost),
          walletBalanceCents: increment(walletCreditCents),
        });
      });
      alert(`Redeemed: ${label}`);
    } catch {
      alert("Could not redeem — try again.");
    }
  };

  const memberSince = profile?.memberSince
    ? new Date(profile.memberSince).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : "—";

  const initial = (profile?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase();
  const totalSaved = profile?.totalSavedCents ?? 0;
  const jobsBooked = profile?.jobCount ?? 0;

  return (
    <main className="min-h-screen pb-36" style={{ background: BG }}>
      <div className="mx-auto max-w-2xl px-4 pb-8 pt-8 sm:px-6">
        <section className="flex flex-col items-center text-center">
          <div
            className="flex h-28 w-28 items-center justify-center rounded-full text-4xl font-black text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, #1e3a8a)` }}
          >
            {initial}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {editingName ? (
              <>
                <Input
                  className="max-w-xs text-center"
                  value={nameEdit}
                  onChange={(e) => setNameEdit(e.target.value)}
                />
                <Button type="button" onClick={() => void saveName()}>
                  Save
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditingName(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-zinc-100">{profile?.name ?? "Member"}</h1>
                <button
                  type="button"
                  className="text-xs font-semibold text-[#3B82F6] hover:underline"
                  onClick={() => setEditingName(true)}
                >
                  Edit
                </button>
              </>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-500">{profile?.email ?? user?.email}</p>
          <p className="mt-1 text-xs text-zinc-600">Member since {memberSince}</p>
          <span
            className="mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold"
            style={{ background: ts.bg, color: ts.fg, border: `1px solid ${ts.fg}44` }}
          >
            {tierLabel}
          </span>
        </section>

        <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Total saved", money(totalSaved)],
            ["Jobs booked", String(jobsBooked)],
            ["Ditch Points", String(points)],
            ["Tier", tierLabel],
          ].map(([k, v]) => (
            <Card key={k} className="border p-4" style={{ background: CARD, borderColor: BORDER }}>
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">{k}</div>
              <div className="mt-1 font-mono text-sm font-semibold text-zinc-100">{v}</div>
            </Card>
          ))}
        </section>

        <Card className="mt-6 border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <h2 className="text-sm font-semibold text-zinc-200">Points &amp; rewards</h2>
          <p className="mt-1 font-mono text-2xl font-bold" style={{ color: ACCENT }}>
            {points.toLocaleString()} pts
          </p>
          {need > 0 ? (
            <p className="mt-1 text-xs text-zinc-500">
              {need} pts to {nextTierName}
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-500">Top tier — thanks for riding with GRIDD.</p>
          )}
          <div className="mt-3 h-2 w-full rounded-full bg-zinc-800">
            <div className="h-2 rounded-full transition-all" style={{ width: `${tierPct}%`, background: ACCENT }} />
          </div>
          <ul className="mt-4 space-y-1 text-xs text-zinc-500">
            <li>500 pts → $5 off (wallet credit)</li>
            <li>1000 pts → $10 off (wallet credit)</li>
            <li>2000 pts → free small haul (wallet credit)</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void redeem(500, 500, "$5 off")}>
              Redeem 500
            </Button>
            <Button type="button" variant="secondary" onClick={() => void redeem(1000, 1000, "$10 off")}>
              Redeem 1000
            </Button>
            <Button type="button" variant="secondary" onClick={() => void redeem(2000, 2000, "Small haul credit")}>
              Redeem 2000
            </Button>
          </div>
        </Card>

        <Card className="mt-6 border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <h2 className="text-sm font-semibold" style={{ color: ACCENT }}>
            Saved providers
          </h2>
          {favRows.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No favorites yet — tap the heart on a provider after a job.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {favRows.map((p) => (
                <li
                  key={p.uid}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2"
                >
                  <div>
                    <div className="font-medium text-zinc-200">{p.name}</div>
                    <div className="text-xs text-zinc-500">
                      {p.city} · ★{(p.rating ?? 5).toFixed(1)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/book?service=haul`}
                      className="rounded-lg bg-[#00FF88] px-3 py-1.5 text-xs font-bold text-black"
                    >
                      Book again
                    </Link>
                    <button
                      type="button"
                      className="text-xs text-red-400 hover:underline"
                      onClick={() => void removeFavorite(p.uid)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="mt-6 border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-200">Recent jobs</h2>
            <Link href="/history" className="text-xs font-semibold text-[#3B82F6] hover:underline">
              View all history
            </Link>
          </div>
          {jobs.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No jobs yet — book from Home.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {jobs.slice(0, 5).map((j) => (
                <li
                  key={j.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 py-2 text-sm last:border-0"
                >
                  <div>
                    <div className="text-zinc-200">{j.serviceName}</div>
                    <div className="text-xs text-zinc-500">
                      {new Date(j.createdAt).toLocaleDateString()} · {j.status}
                    </div>
                  </div>
                  <Link
                    href={`/book?service=${encodeURIComponent(j.serviceId)}`}
                    className="rounded-lg border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    Rebook
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="mt-6 border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <h2 className="text-sm font-semibold text-zinc-200">Payment methods</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Cards on file: managed securely at checkout (Stripe). Wallet:{" "}
            <span className="font-mono text-zinc-300">{money(walletCentsFromProfile(profile))}</span>
          </p>
          <div className="mt-4 space-y-3 text-sm">
            {(
              [
                ["payApple", "Apple Pay", profile?.payApple === true],
                ["payGoogle", "Google Pay", profile?.payGoogle === true],
                ["paySamsung", "Samsung Pay", profile?.paySamsung === true],
              ] as const
            ).map(([key, label, on]) => (
              <label key={key} className="flex items-center justify-between gap-4">
                <span className="text-zinc-400">{label}</span>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => void setCustomerField({ [key]: e.target.checked })}
                  className="h-4 w-4 accent-[#3B82F6]"
                />
              </label>
            ))}
          </div>
        </Card>

        <Card className="mt-6 border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <h2 className="text-sm font-semibold text-zinc-200">Settings</h2>

          <button
            type="button"
            className="mt-3 w-full rounded-xl border border-zinc-700 py-2 text-left text-sm text-zinc-300"
            onClick={() => setPersonalOpen(true)}
          >
            Personal info (name, phone, home address)
          </button>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Notifications</h3>
          <div className="mt-2 space-y-3 text-sm">
            {(
              [
                ["notifJobUpdates", "Job updates", profile?.notifJobUpdates !== false],
                ["notifPromos", "Promos & tips", profile?.notifPromos === true],
                ["notifPorch", "Porch & community", profile?.notifPorch !== false],
                ["notifSms", "SMS alerts", profile?.notifSms === true],
              ] as const
            ).map(([key, label, on]) => (
              <label key={key} className="flex items-center justify-between gap-4">
                <span className="text-zinc-400">{label}</span>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => void setCustomerField({ [key]: e.target.checked })}
                  className="h-4 w-4 accent-[#00FF88]"
                />
              </label>
            ))}
          </div>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Account &amp; security</h3>
          <div className="mt-2 space-y-2 text-sm text-zinc-500">
            <p>Email: {profile?.email ?? user?.email}</p>
            <Link href="/login" className="block text-[#3B82F6] hover:underline">
              Reset password
            </Link>
            <p className="text-xs">Active sessions — manage via password reset for now.</p>
            <p className="text-xs">Delete account — contact support@gridd.click</p>
          </div>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Wallet</h3>
          <div className="mt-2 space-y-3 text-sm">
            <Link href="/wallet" className="inline-block text-[#3B82F6] hover:underline">
              Open wallet &amp; bank
            </Link>
            <label className="flex items-center justify-between gap-4">
              <span className="text-zinc-400">Auto cash-out</span>
              <input
                type="checkbox"
                checked={profile?.walletAutoCashout === true}
                onChange={(e) => void setCustomerField({ walletAutoCashout: e.target.checked })}
                className="h-4 w-4 accent-[#00FF88]"
              />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span className="text-zinc-400">Interest alerts</span>
              <input
                type="checkbox"
                checked={profile?.walletInterestAlerts === true}
                onChange={(e) => void setCustomerField({ walletInterestAlerts: e.target.checked })}
                className="h-4 w-4 accent-[#00FF88]"
              />
            </label>
          </div>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Legal</h3>
          <div className="mt-2 flex flex-col gap-2 text-sm">
            <Link href="/agreements" className="text-[#3B82F6] hover:underline">
              Agreements, Terms &amp; Privacy
            </Link>
          </div>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Help</h3>
          <a href="mailto:support@gridd.click" className="text-sm text-[#3B82F6] hover:underline">
            support@gridd.click
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

      {personalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-md border p-6" style={{ background: CARD, borderColor: BORDER }}>
            <h3 className="font-semibold text-zinc-100">Personal info</h3>
            <label className="mt-4 block text-xs text-zinc-500">Phone</label>
            <Input className="mt-1" value={phoneEdit} onChange={(e) => setPhoneEdit(e.target.value)} />
            <label className="mt-3 block text-xs text-zinc-500">Home address</label>
            <Input className="mt-1" value={addrEdit} onChange={(e) => setAddrEdit(e.target.value)} />
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setPersonalOpen(false)}>
                Cancel
              </Button>
              <Button type="button" className="flex-1" onClick={() => void savePersonal()}>
                Save
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      <CustomerNav />
    </main>
  );
}
