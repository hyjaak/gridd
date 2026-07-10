"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendPasswordResetEmail, signOut, updateProfile } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
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
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { firebaseApp, firebaseAuth, storage as firebaseStorage } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { CustomerNav } from "@/components/CustomerNav";
import { logOut } from "@/lib/auth";
import { money, useGriddWalletData } from "@/hooks/useGriddWalletData";
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
import { AddressInput } from "@/components/AddressInput";
import { ProfileWalletCard } from "@/components/profile/ProfileWalletCard";
import { buildReferralCode } from "@/lib/referral-code";
import { UBER_BOOKING_ENABLED } from "@/lib/uberBookingFeature";

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
  const router = useRouter();
  const search = useSearchParams();
  const db = useMemo(() => (firebaseApp ? getFirestore(firebaseApp) : null), []);

  const [toast, setToast] = useState<string | null>(null);
  const [personalSaving, setPersonalSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [referralInput, setReferralInput] = useState("");
  const [referralBusy, setReferralBusy] = useState(false);
  const [uberStatus, setUberStatus] = useState<{ connected: boolean; busy: boolean }>({
    connected: false,
    busy: true,
  });

  const showToast = useCallback((msg: string) => setToast(msg), []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const p = search?.get("uber");
    if (p && String(p).includes("connected")) {
      showToast("Uber account connected.");
      if (typeof window !== "undefined") {
        const u = new URL(window.location.href);
        u.searchParams.delete("uber");
        window.history.replaceState({}, "", u.pathname + u.search);
      }
    }
  }, [search, showToast]);

  useEffect(() => {
    let c = false;
    if (!firebaseAuth?.currentUser) {
      setUberStatus({ connected: false, busy: false });
      return;
    }
    void (async () => {
      try {
        const token = await firebaseAuth.currentUser!.getIdToken();
        const r = await fetch("/api/uber/connection", { headers: { Authorization: `Bearer ${token}` } });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; connected?: boolean };
        if (!c) setUberStatus({ connected: !!j.connected, busy: false });
      } catch {
        if (!c) setUberStatus({ connected: false, busy: false });
      }
    })();
    return () => {
      c = true;
    };
  }, [user?.uid]);

  const connectUber = async () => {
    if (!firebaseAuth?.currentUser) return;
    setUberStatus((s) => ({ ...s, busy: true }));
    try {
      const token = await firebaseAuth.currentUser.getIdToken();
      const res = await fetch("/api/uber/auth-url", { headers: { Authorization: `Bearer ${token}` } });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !j.ok || !j.url) {
        showToast(j.error ?? "Uber is not configured (missing client ID).");
        return;
      }
      window.location.href = j.url;
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not start Uber login");
    } finally {
      setUberStatus((s) => ({ ...s, busy: false }));
    }
  };

  const disconnectUber = async () => {
    if (!firebaseAuth?.currentUser) return;
    setUberStatus((s) => ({ ...s, busy: true }));
    try {
      const token = await firebaseAuth.currentUser.getIdToken();
      const res = await fetch("/api/uber/connection", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && j.ok) {
        setUberStatus({ connected: false, busy: false });
        showToast("Uber disconnected");
      } else {
        showToast("Could not disconnect");
      }
    } finally {
      setUberStatus((s) => ({ ...s, busy: false }));
    }
  };

  useEffect(() => {
    if (!user?.uid || !db || !profile || profile.referralCode) return;
    const code = buildReferralCode(profile.name, user.email ?? undefined);
    void updateDoc(doc(db, "users", user.uid), { referralCode: code }).catch(() => null);
  }, [user?.uid, db, profile?.referralCode, profile?.name, user?.email]);

  const applyReferral = async () => {
    const code = referralInput.trim().toUpperCase();
    if (!code || !firebaseAuth?.currentUser) return;
    setReferralBusy(true);
    try {
      const token = await firebaseAuth.currentUser.getIdToken();
      const res = await fetch("/api/referrals/apply", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        showToast(j.error ?? "Could not apply code");
        return;
      }
      showToast("Referral saved.");
      setReferralInput("");
    } finally {
      setReferralBusy(false);
    }
  };

  const walletData = useGriddWalletData();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const onPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.uid || !db || !firebaseStorage || !firebaseAuth?.currentUser) return;
    if (file.size > 15 * 1024 * 1024) {
      showToast("File too large (max 15MB)");
      return;
    }
    try {
      setPhotoBusy(true);
      const path = `customers/${user.uid}/profile_${Date.now()}.jpg`;
      const r = ref(firebaseStorage, path);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      await updateDoc(doc(db, "users", user.uid), { photoUrl: url, updatedAt: serverTimestamp() });
      await updateProfile(firebaseAuth.currentUser, { photoURL: url });
      showToast("✅ Photo updated");
    } catch (err) {
      console.error(err);
      showToast("❌ Upload failed");
    } finally {
      setPhotoBusy(false);
      e.target.value = "";
    }
  };

  const points = profile?.points ?? 0;
  const tierLabel = customerTierLabel(points);
  const { need, label: nextTierName } = pointsToNextTier(points);
  const tierPct = customerTierProgressPct(points);
  const ts = tierStyle(tierLabel);

  const [personalName, setPersonalName] = useState("");
  const [phoneEdit, setPhoneEdit] = useState("");
  const [addrEdit, setAddrEdit] = useState("");
  const [addrGeo, setAddrGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [personalOpen, setPersonalOpen] = useState(false);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [favRows, setFavRows] = useState<Provider[]>([]);

  useEffect(() => {
    setPersonalName(profile?.name ?? "");
    setPhoneEdit(profile?.phone ?? "");
    setAddrEdit(profile?.homeAddress ?? "");
    const g = profile?.homeAddressGeo;
    setAddrGeo(g && typeof g.lat === "number" && typeof g.lng === "number" ? g : null);
  }, [profile?.name, profile?.phone, profile?.homeAddress, profile?.homeAddressGeo]);

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

  const savePersonal = async () => {
    if (!user || !db || !firebaseAuth?.currentUser) return;
    try {
      setPersonalSaving(true);
      await updateDoc(doc(db, "users", user.uid), {
        name: personalName.trim() || "",
        displayName: personalName.trim() || "",
        phone: phoneEdit.trim() || "",
        homeAddress: addrEdit.trim() || "",
        homeAddressGeo: addrGeo,
        homeAddressCoords: addrGeo,
        updatedAt: serverTimestamp(),
      });
      await updateProfile(firebaseAuth.currentUser, {
        displayName: personalName.trim() || undefined,
      });
      showToast("✅ Saved!");
      setPersonalOpen(false);
    } catch (e) {
      console.error(e);
      showToast("❌ Save failed — try again");
    } finally {
      setPersonalSaving(false);
    }
  };

  const togglePayment = async (method: "applePay" | "googlePay", value: boolean) => {
    if (!user || !db) return;
    try {
      await updateDoc(doc(db, "users", user.uid), {
        [`paymentMethods.${method}`]: value,
        updatedAt: serverTimestamp(),
      });
      showToast("Saved ✓");
    } catch (e) {
      console.error(e);
      showToast("❌ Could not save");
    }
  };

  const toggleNotification = async (key: "jobUpdates" | "promos" | "porch" | "sms", value: boolean) => {
    if (!user || !db) return;
    try {
      await updateDoc(doc(db, "users", user.uid), {
        [`notificationPrefs.${key}`]: value,
        updatedAt: serverTimestamp(),
      });
      showToast("Saved ✓");
    } catch (e) {
      console.error(e);
      showToast("❌ Could not save");
    }
  };

  const handleResetPassword = async () => {
    const email = user?.email ?? profile?.email;
    if (!email || !firebaseAuth) {
      showToast("❌ No email on file");
      return;
    }
    try {
      await sendPasswordResetEmail(firebaseAuth, email);
      showToast(`📧 Password reset email sent to ${email}`);
    } catch (e) {
      console.error(e);
      showToast("❌ Error — try again");
    }
  };

  const deleteAccountForever = async () => {
    if (!firebaseAuth?.currentUser) return;
    try {
      setDeleteBusy(true);
      const token = await firebaseAuth.currentUser.getIdToken();
      const res = await fetch("/api/users/delete-account", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not delete account");
      await signOut(firebaseAuth);
      router.replace("/signup");
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : "Delete failed — try again");
    } finally {
      setDeleteBusy(false);
      setDeleteOpen(false);
    }
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
  const jobsBooked = profile?.jobCount ?? jobs.length;
  const ratingDisplay = typeof profile?.rating === "number" ? profile.rating.toFixed(1) : "—";
  const photoUrl = profile?.photoUrl ?? user?.photoURL ?? null;

  function menuButton(label: string, icon: string, onClick: () => void) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-left text-sm text-zinc-200 hover:bg-zinc-900/60"
      >
        <span>
          {icon} {label}
        </span>
        <span className="text-zinc-600">→</span>
      </button>
    );
  }

  function menuLink(label: string, icon: string, href: string) {
    return (
      <Link
        href={href}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-900/60"
      >
        <span>
          {icon} {label}
        </span>
        <span className="text-zinc-600">→</span>
      </Link>
    );
  }

  return (
    <main className="min-h-screen pb-36" style={{ background: BG }}>
      <div className="mx-auto max-w-2xl px-4 pb-8 pt-8 sm:px-6">
        {/* User card */}
        <section className="flex flex-col items-center text-center">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onPhotoChange(e)}
          />
          <button
            type="button"
            disabled={photoBusy}
            onClick={() => photoInputRef.current?.click()}
            className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full text-4xl font-black text-white shadow-lg ring-2 ring-zinc-700 transition hover:ring-[#00FF88]/50 disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, #1e3a8a)` }}
            aria-label="Change profile photo"
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initial
            )}
            {photoBusy ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs">…</span>
            ) : null}
          </button>
          <h1 className="mt-4 text-2xl font-bold text-zinc-100">{profile?.name ?? "Member"}</h1>
          <p className="mt-1 text-sm text-zinc-500">{profile?.email ?? user?.email}</p>
          <p className="mt-1 text-xs text-zinc-600">Member since {memberSince}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full border border-zinc-600 px-3 py-1 text-xs font-bold text-zinc-300">Customer</span>
            <span
              className="inline-block rounded-full px-3 py-1 text-xs font-bold"
              style={{ background: ts.bg, color: ts.fg, border: `1px solid ${ts.fg}44` }}
            >
              {tierLabel}
            </span>
            {typeof profile?.griddScore === "number" ? (
              <span className="inline-block rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
                GRIDD Score™ {profile.griddScore}
                {profile.griddTier ? ` · ${profile.griddTier}` : ""}
              </span>
            ) : null}
          </div>
        </section>

        {/* Wallet */}
        <div className="mt-8">
          <ProfileWalletCard balanceCents={walletData.balanceCents} />
        </div>

        {UBER_BOOKING_ENABLED ? (
          <div id="uber-connect" className="mt-6">
            <Card
              className="border border-zinc-800 p-4"
              style={{ background: CARD, borderColor: BORDER }}
            >
              <div className="text-sm font-semibold text-zinc-100">🚗 Uber network</div>
              <p className="mt-1 text-xs text-zinc-500">
                Connect once to request rides on Uber&apos;s driver network from GRIDD, with real ETAs and live
                tracking.
              </p>
              {uberStatus.busy && !uberStatus.connected ? (
                <p className="mt-3 text-xs text-zinc-500">Checking connection…</p>
              ) : uberStatus.connected ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-[#3dff7a]">Connected</span>
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-xs"
                    disabled={uberStatus.busy}
                    onClick={() => void disconnectUber()}
                  >
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  className="mt-3 w-full"
                  disabled={uberStatus.busy}
                  onClick={() => void connectUber()}
                >
                  Connect Uber account
                </Button>
              )}
            </Card>
          </div>
        ) : null}

        {/* Quick stats */}
        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-3">
            <div className="text-lg">📦</div>
            <div className="font-mono text-sm font-semibold text-zinc-100">{jobsBooked}</div>
            <div className="text-[10px] text-zinc-500">Jobs</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-3">
            <div className="text-lg">⭐</div>
            <div className="font-mono text-sm font-semibold text-zinc-100">{ratingDisplay}</div>
            <div className="text-[10px] text-zinc-500">Rating</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-3">
            <div className="text-lg">💰</div>
            <div className="font-mono text-sm font-semibold text-[#00FF88]">{money(walletData.balanceCents)}</div>
            <div className="text-[10px] text-zinc-500">Wallet</div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-left">
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Refer friends</div>
          <p className="mt-1 break-all font-mono text-sm text-[#00FF88]">{profile?.referralCode ?? "—"}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            $10 off their first booking · you earn $5 credit when they complete their first job.
          </p>
          {!profile?.referredByUid ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                value={referralInput}
                onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                placeholder="GRIDD-NAME-1234"
                className="flex-1"
              />
              <Button type="button" disabled={referralBusy} onClick={() => void applyReferral()}>
                Apply code
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">You used a friend&apos;s referral code.</p>
          )}
        </div>

        {/* Account */}
        <h2 className="mb-2 mt-8 text-xs font-bold uppercase tracking-wider text-zinc-500">Account</h2>
        <div className="space-y-2">
          {menuButton("Personal info", "👤", () => {
            setPersonalName(profile?.name ?? "");
            setPhoneEdit(profile?.phone ?? "");
            setAddrEdit(profile?.homeAddress ?? "");
            const g = profile?.homeAddressGeo;
            setAddrGeo(g && typeof g.lat === "number" && typeof g.lng === "number" ? g : null);
            setPersonalOpen(true);
          })}
          {menuButton("Notifications", "🔔", () => setNotificationsOpen(true))}
          {menuButton("Payment methods", "💳", () => setPaymentOpen(true))}
          {menuButton("Reset password", "🔑", () => void handleResetPassword())}
        </div>

        {/* Activity */}
        <h2 className="mb-2 mt-8 text-xs font-bold uppercase tracking-wider text-zinc-500">Activity</h2>
        <div className="space-y-2">
          {menuLink("Job history", "📋", "/history")}
          {menuLink("My reviews", "⭐", "/history")}
        </div>

        {/* Support */}
        <h2 className="mb-2 mt-8 text-xs font-bold uppercase tracking-wider text-zinc-500">Support</h2>
        <div className="space-y-2">
          {menuLink("Community guidelines", "🪑", "/rules")}
          {menuLink("How GRIDD works", "⚡", "/how-it-works")}
          {menuLink("Trust & safety", "🛡️", "/trust")}
          <a
            href="mailto:support@gridd.click?subject=GRIDD%20Help"
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-900/60"
          >
            <span>❓ Help &amp; FAQ</span>
            <span className="text-zinc-600">→</span>
          </a>
          <a
            href="mailto:support@gridd.click?subject=GRIDD%20Feedback"
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-900/60"
          >
            <span>📝 Send feedback</span>
            <span className="text-zinc-600">→</span>
          </a>
          {menuLink("Terms & Privacy", "📄", "/terms")}
        </div>

        {/* Points & saved (compact) */}
        <Card id="rewards" className="mt-8 border p-5" style={{ background: CARD, borderColor: BORDER }}>
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
          <p className="mt-3 text-xs text-zinc-500">Total saved on hauls: {money(totalSaved)}</p>
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

        {/* Danger */}
        <h2 className="mb-2 mt-8 text-xs font-bold uppercase tracking-wider text-red-500/80">Danger zone</h2>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void logOut()}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-700 bg-zinc-900/30 px-4 py-3 text-left text-sm text-zinc-200 hover:bg-zinc-900/60"
          >
            <span>🚪 Sign out</span>
            <span className="text-zinc-600">→</span>
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-left text-sm font-semibold text-red-400 hover:bg-red-950/35"
          >
            <span>❌ Delete account</span>
            <span className="text-red-600/80">→</span>
          </button>
        </div>
      </div>

      {notificationsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-md border p-6" style={{ background: CARD, borderColor: BORDER }}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-zinc-100">🔔 Notifications</h3>
              <button type="button" className="text-sm text-zinc-500" onClick={() => setNotificationsOpen(false)}>
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              {(
                [
                  ["jobUpdates", "Job updates", profile?.notifJobUpdates !== false],
                  ["promos", "Promos & tips", profile?.notifPromos === true],
                  ["porch", "Porch & community", profile?.notifPorch !== false],
                  ["sms", "SMS alerts", profile?.notifSms === true],
                ] as const
              ).map(([key, label, on]) => (
                <label key={key} className="flex items-center justify-between gap-4">
                  <span className="text-zinc-400">{label}</span>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => void toggleNotification(key, e.target.checked)}
                    className="h-4 w-4 accent-[#00FF88]"
                  />
                </label>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {paymentOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-md border p-6" style={{ background: CARD, borderColor: BORDER }}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-zinc-100">💳 Payment methods</h3>
              <button type="button" className="text-sm text-zinc-500" onClick={() => setPaymentOpen(false)}>
                Close
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Wallet balance: <span className="font-mono text-zinc-300">{money(walletCentsFromProfile(profile))}</span>
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <label className="flex items-center justify-between gap-4">
                <span className="text-zinc-400">🍎 Apple Pay</span>
                <input
                  type="checkbox"
                  checked={profile?.payApple === true}
                  onChange={(e) => void togglePayment("applePay", e.target.checked)}
                  className="h-4 w-4 accent-[#3B82F6]"
                />
              </label>
              <label className="flex items-center justify-between gap-4">
                <span className="text-zinc-400">🤖 Google Pay</span>
                <input
                  type="checkbox"
                  checked={profile?.payGoogle === true}
                  onChange={(e) => void togglePayment("googlePay", e.target.checked)}
                  className="h-4 w-4 accent-[#3B82F6]"
                />
              </label>
              <Link
                href="/wallet"
                onClick={() => setPaymentOpen(false)}
                className="flex items-center justify-between gap-4 rounded-xl border border-zinc-700/80 px-3 py-2.5 text-zinc-300 hover:bg-zinc-900/60"
              >
                <span>💳 Add card (Stripe)</span>
                <span className="text-xs font-semibold text-[#3B82F6]">→</span>
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
          </Card>
        </div>
      ) : null}

      {personalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
          <Card
            className="flex w-full max-w-md flex-col overflow-visible border p-0"
            style={{ background: CARD, borderColor: BORDER }}
          >
            <div className="px-6 pb-4 pt-6">
              <h3 className="font-semibold text-zinc-100">Personal info</h3>
              <label className="mt-4 block text-xs text-zinc-500">Name</label>
              <Input
                className="mt-1"
                value={personalName}
                onChange={(e) => setPersonalName(e.target.value)}
                autoComplete="name"
              />
              <label className="mt-3 block text-xs text-zinc-500">Phone</label>
              <Input
                className="mt-1"
                value={phoneEdit}
                onChange={(e) => setPhoneEdit(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
              />
              <label className="mt-3 block text-xs text-zinc-500">Home address</label>
              <div className="relative z-[120] mt-1">
                <AddressInput
                  value={addrEdit}
                  onChange={setAddrEdit}
                  onResolved={(info) => {
                    setAddrGeo(info ? { lat: info.lat, lng: info.lng } : null);
                  }}
                  placeholder="Search for your street address…"
                  showCurrentLocationButton
                />
              </div>
            </div>
            <div
              className="flex shrink-0 gap-2 border-t"
              style={{
                background: "#111",
                borderColor: BORDER,
                padding: "12px 20px",
              }}
            >
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={personalSaving}
                onClick={() => setPersonalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={personalSaving}
                onClick={() => void savePersonal()}
              >
                {personalSaving ? (
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black"
                      aria-hidden
                    />
                    Saving…
                  </span>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {deleteOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
          <Card className="w-full max-w-md border p-6" style={{ background: CARD, borderColor: BORDER }}>
            <h3 className="text-lg font-bold text-zinc-100">⚠️ Delete account</h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              This permanently deletes:
            </p>
            <ul className="mt-2 list-inside list-disc text-sm text-zinc-500">
              <li>Your profile</li>
              <li>Your booking history</li>
              <li>Your wallet balance</li>
              <li>All your data</li>
            </ul>
            <p className="mt-3 text-sm font-semibold text-red-400/90">This cannot be undone.</p>
            <div className="mt-6 flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 bg-red-600 text-white hover:opacity-90"
                disabled={deleteBusy}
                onClick={() => void deleteAccountForever()}
              >
                {deleteBusy ? "Deleting…" : "Delete forever"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-[80] max-w-sm -translate-x-1/2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-center text-sm text-zinc-100 shadow-lg">
          {toast}
        </div>
      ) : null}

      <CustomerNav />
    </main>
  );
}
