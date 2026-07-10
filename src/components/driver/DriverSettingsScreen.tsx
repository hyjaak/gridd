"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { sendPasswordResetEmail, signOut, updateProfile } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  AlertTriangle,
  Bell,
  Calendar,
  CalendarClock,
  Car,
  ClipboardList,
  Coins,
  FileText,
  Gamepad2,
  Gift,
  HelpCircle,
  Info,
  Landmark,
  Lock,
  Mail,
  MapPin,
  Megaphone,
  MessageSquare,
  Moon,
  Newspaper,
  Phone,
  Ruler,
  Send,
  Star,
  User,
  Wrench,
} from "lucide-react";
import { firebaseApp, firebaseAuth, firebaseStorage } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { logOut } from "@/lib/auth";
import { DriverNav } from "@/components/DriverNav";
import { BackButton } from "@/components/BackButton";
import { DRIVER_SERVICE_META } from "@/lib/driver-service-meta";
import type { LucideIcon } from "lucide-react";
import type { Job } from "@/types";
import { money } from "@/lib/job-tracking";

const BG = "#0a0a0a";
const ROW_BG = "#111";
const ICON = "#ff6b00";
const DIVIDER = "#1a1a1a";
const SECTION = "#555";
const CHEVRON = "#444";
const SWITCH_ON = "#3dff7a";

const SERVICE_IDS = Object.keys(DRIVER_SERVICE_META);

function SectionHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={[
        "px-5 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.1em]",
        className,
      ].join(" ")}
      style={{ color: SECTION }}
    >
      {children}
    </h2>
  );
}

function NavRow({
  icon: Icon,
  label,
  href,
  onClick,
  right,
}: {
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
  right?: string;
}) {
  const inner = (
    <>
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} style={{ color: ICON }} />
      <span className="min-w-0 flex-1 text-left text-[14px] leading-snug" style={{ color: "#fff" }}>
        {label}
      </span>
      {right ? (
        <span className="shrink-0 pr-1 text-[13px] text-zinc-500">{right}</span>
      ) : null}
      <span className="shrink-0 text-[1.15rem] font-light leading-none" style={{ color: CHEVRON }}>
        ›
      </span>
    </>
  );
  const cls =
    "flex w-full items-center gap-3 px-5 py-[14px] transition-colors active:bg-white/[0.04]";
  const border = { borderBottom: `1px solid ${DIVIDER}`, background: ROW_BG };
  if (href?.startsWith("http://") || href?.startsWith("https://")) {
    return (
      <a href={href} className={cls} style={border} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  if (href?.startsWith("#")) {
    return (
      <a href={href} className={cls} style={border}>
        {inner}
      </a>
    );
  }
  if (href?.startsWith("mailto:") || href?.startsWith("tel:")) {
    return (
      <a href={href} className={cls} style={border}>
        {inner}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls} style={border}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} style={border} onClick={onClick}>
      {inner}
    </button>
  );
}

function SettingsSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40"
      style={{ background: checked ? SWITCH_ON : "#333" }}
    >
      <span
        className={[
          "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "left-6" : "left-1",
        ].join(" ")}
      />
    </button>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onChange,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex cursor-pointer items-center gap-3 px-5 py-[14px]"
      style={{ borderBottom: `1px solid ${DIVIDER}`, background: ROW_BG }}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} style={{ color: ICON }} />
      <span className="flex-1 text-[14px]" style={{ color: "#fff" }}>
        {label}
      </span>
      <SettingsSwitch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function DriverSettingsScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const db = firebaseApp ? getFirestore(firebaseApp) : null;
  const uid = user?.uid;

  const [distMiles, setDistMiles] = useState(25);
  const [payoutPref, setPayoutPref] = useState<"weekly_wednesday" | "instant">("weekly_wednesday");
  const [taxOpen, setTaxOpen] = useState(false);
  const [saveHint, setSaveHint] = useState(false);
  const [pastJobs, setPastJobs] = useState<Job[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);

  const [notifJobAlerts, setNotifJobAlerts] = useState(true);
  const [notifChat, setNotifChat] = useState(true);
  const [notifPayment, setNotifPayment] = useState(true);
  const [notifAnnouncements, setNotifAnnouncements] = useState(true);
  const [dndEnabled, setDndEnabled] = useState(false);
  const [dndStart, setDndStart] = useState("22:00");
  const [dndEnd, setDndEnd] = useState("07:00");

  useEffect(() => {
    setDistMiles(profile?.maxDistanceMiles ?? 25);
    setPayoutPref(profile?.payoutPreference ?? "weekly_wednesday");
    setNotifJobAlerts(profile?.notifJobAlerts !== false);
    setNotifChat(profile?.notifChat !== false);
    setNotifPayment(profile?.notifPayment !== false);
    setNotifAnnouncements(profile?.notifAnnouncements !== false);
    setDndEnabled(profile?.dndEnabled === true);
    setDndStart(profile?.dndStart ?? "22:00");
    setDndEnd(profile?.dndEnd ?? "07:00");
    setDisplayName(profile?.name?.trim() || user?.displayName || "");
  }, [profile, user?.displayName]);

  useEffect(() => {
    if (!db || !uid) return;
    const q = query(collection(db, "jobs"), where("providerUid", "==", uid), limit(80));
    void getDocs(q)
      .then((snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Job, "id">) }));
        const done = rows.filter((j) => j.status === "completed");
        done.sort((a, b) => String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? "")));
        setPastJobs(done.slice(0, 40));
      })
      .catch(() => setPastJobs([]));
  }, [db, uid]);

  const patch = useCallback(
    async (data: Record<string, unknown>) => {
      if (!db || !uid) return;
      await updateDoc(doc(db, "providers", uid), data);
      setSaveHint(true);
      window.setTimeout(() => setSaveHint(false), 1600);
    },
    [db, uid],
  );

  const saveDisplayName = useCallback(async () => {
    const n = displayName.trim();
    if (!n || !firebaseAuth?.currentUser) return;
    try {
      await updateProfile(firebaseAuth.currentUser, { displayName: n });
      await patch({ name: n });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not save name");
    }
  }, [displayName, patch]);

  const onPhotoChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f || !uid || !firebaseStorage) return;
      if (f.size > 15 * 1024 * 1024) {
        window.alert("File too large (max 15MB)");
        return;
      }
      setPhotoBusy(true);
      try {
        const path = `drivers/${uid}/profile_${Date.now()}.jpg`;
        const r = ref(firebaseStorage, path);
        await uploadBytes(r, f);
        const url = await getDownloadURL(r);
        await patch({ photoUrl: url });
        if (firebaseAuth?.currentUser) {
          await updateProfile(firebaseAuth.currentUser, { photoURL: url });
        }
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setPhotoBusy(false);
        e.target.value = "";
      }
    },
    [uid, patch],
  );

  const sendPwReset = useCallback(async () => {
    const email = user?.email;
    if (!email || !firebaseAuth) {
      window.alert("No email on file.");
      return;
    }
    try {
      await sendPasswordResetEmail(firebaseAuth, email);
      window.alert("Check your email for a password reset link.");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not send email.");
    }
  }, [user?.email]);

  const deleteAccount = useCallback(async () => {
    if (!window.confirm("Delete your driver account permanently? This cannot be undone.")) return;
    if (!window.confirm("Final confirmation: all data will be removed. Continue?")) return;
    try {
      const token = await firebaseAuth?.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/drivers/delete-account", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not delete account");
      if (firebaseAuth) await signOut(firebaseAuth);
      router.replace("/?modal=login");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Delete failed — contact support.");
    }
  }, [router]);

  const toggleService = useCallback(
    async (id: string) => {
      if (!db || !uid) return;
      const cur = new Set(profile?.serviceIds ?? SERVICE_IDS);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      await updateDoc(doc(db, "providers", uid), { serviceIds: Array.from(cur) });
    },
    [db, uid, profile?.serviceIds],
  );

  const saveDistance = useCallback(
    async (miles: number) => {
      await patch({ maxDistanceMiles: miles });
    },
    [patch],
  );

  const email = user?.email ?? profile?.email ?? "—";
  const phone =
    user?.phoneNumber ?? profile?.phone ?? (user as { phoneNumber?: string | null })?.phoneNumber ?? "—";
  const zip = profile?.zip ?? profile?.documents?.serviceZip ?? "—";
  const demoActive = profile?.demoMode === true;
  const demoUsed = profile?.demoJobsUsed ?? 0;
  const demoLimit = profile?.demoJobsLimit ?? 3;

  return (
    <main className="min-h-screen pb-36" style={{ background: BG }}>
      {saveHint ? (
        <div
          className="fixed bottom-24 left-1/2 z-[90] -translate-x-1/2 rounded-full border border-[#00FF88]/30 bg-[#0f1a12] px-4 py-2 text-xs font-semibold text-[#00FF88] shadow-lg"
          role="status"
        >
          Saved ✓
        </div>
      ) : null}
      <header
        className="sticky top-0 z-20 border-b px-4 py-4"
        style={{ borderColor: DIVIDER, background: BG }}
      >
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <BackButton href="/profile" inline />
          <h1 className="text-lg font-semibold text-white">Settings</h1>
        </div>
      </header>

      <div className="mx-auto max-w-lg">
        <SectionHeader className="pt-4 sm:pt-6">Earnings &amp; payouts</SectionHeader>
        <nav>
          <NavRow
            icon={Landmark}
            label="Payout method"
            href="/driver/earnings"
            right={profile?.bankConnected || profile?.stripeConnectId ? "Connected" : "Add bank"}
          />
          <NavRow
            icon={CalendarClock}
            label="Payout schedule"
            href="#payout-schedule"
            right={payoutPref === "weekly_wednesday" ? "Wed · auto" : "Instant · ⚡"}
          />
          <NavRow icon={Coins} label="Earnings history" href="#earnings-history" />
          <NavRow icon={FileText} label="Tax documents (1099)" onClick={() => setTaxOpen(true)} />
        </nav>

        <SectionHeader>My jobs</SectionHeader>
        <nav>
          <NavRow icon={ClipboardList} label="Gig history" href="/driver/jobs" />
          <NavRow
            icon={Star}
            label="My rating & reviews"
            href="/profile"
            right={typeof profile?.rating === "number" ? `${profile.rating.toFixed(1)} ★` : undefined}
          />
          <NavRow icon={Calendar} label="My schedule" href="/active" />
          <NavRow icon={MapPin} label="Service area & ZIP codes" href="#service-area" />
          <NavRow icon={Wrench} label="Services I offer" href="#services-offer" />
          <NavRow icon={Ruler} label="Max distance (miles)" href="#service-area" right={`${distMiles} mi`} />
        </nav>

        <SectionHeader>Account</SectionHeader>
        <div className="border-b px-5 py-3" style={{ borderColor: DIVIDER, background: ROW_BG }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: SECTION }}>
            Display name
          </p>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={() => void saveDisplayName()}
            className="mt-2 w-full rounded-lg border border-[#1a1a1a] bg-black/50 px-3 py-2 text-[14px] text-white outline-none focus:border-[#ff6b00]/50"
            placeholder="Your name"
          />
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-[13px] text-[#ff6b00]">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={photoBusy}
              onChange={(e) => void onPhotoChange(e)}
            />
            {photoBusy ? "Uploading…" : "Change profile photo"}
          </label>
        </div>
        <nav>
          <NavRow icon={User} label="Profile (full)" href="/profile" />
          <NavRow
            icon={Phone}
            label="Phone number"
            href={
              phone !== "—"
                ? `tel:${String(phone).replace(/[^\d+]/g, "")}`
                : undefined
            }
            onClick={
              phone === "—"
                ? () => window.alert("No phone on file. Contact support to add or update your number.")
                : undefined
            }
            right={phone !== "—" ? phone : undefined}
          />
          <NavRow icon={Mail} label="Email" right={email.length > 28 ? `${email.slice(0, 24)}…` : email} href="/profile" />
          <NavRow icon={Lock} label="Change password (email link)" onClick={() => void sendPwReset()} />
          <NavRow icon={FileText} label="My documents (view submitted)" href="/signup/driver-docs" />
          <NavRow icon={Car} label="Vehicle info" href="/signup/driver-docs" />
          {demoActive ? (
            <NavRow
              icon={Gamepad2}
              label="Demo mode status"
              href="#demo-mode"
              right={`Active · ${demoUsed}/${demoLimit}`}
            />
          ) : null}
        </nav>

        <div id="earnings-history" className="scroll-mt-24 mx-4 mt-4 rounded-xl border px-4 py-3" style={{ borderColor: DIVIDER, background: ROW_BG }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Earnings history</p>
          <p className="mt-1 text-[11px] text-zinc-600">Completed jobs (newest first)</p>
          <ul className="mt-3 max-h-52 space-y-2 overflow-y-auto text-sm">
            {pastJobs.length === 0 ? (
              <li className="text-zinc-500">No completed jobs yet.</li>
            ) : (
              pastJobs.map((j) => (
                <li key={j.id} className="flex justify-between gap-2 border-b border-zinc-800/80 py-1 text-zinc-200">
                  <span className="truncate">{j.serviceName ?? "Job"}</span>
                  <span className="shrink-0 font-mono text-[#00FF88]">
                    {money(j.providerPayoutCents ?? j.amountCents ?? 0)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        {demoActive ? (
          <div
            id="demo-mode"
            className="scroll-mt-24 mx-4 mt-2 rounded-xl border px-4 py-3"
            style={{ borderColor: DIVIDER, background: "#111" }}
          >
            <div className="flex items-center gap-2 text-[15px] font-medium text-white">
              <Gamepad2 className="h-5 w-5 shrink-0" style={{ color: ICON }} />
              Demo mode is on
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              Trial jobs: {demoUsed} / {demoLimit} used. Full access after CEO approval.
            </p>
          </div>
        ) : null}

        <div id="payout-schedule" className="scroll-mt-24 px-4 pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Payout schedule</h3>
          <p className="mt-1 text-xs text-zinc-600">Automatic every Wednesday, or instant cashout — your choice.</p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setPayoutPref("weekly_wednesday");
                void patch({ payoutPreference: "weekly_wednesday" });
              }}
              className={[
                "rounded-xl border px-4 py-3 text-left text-sm transition",
                payoutPref === "weekly_wednesday" ? "border-[#ff6b00] bg-[#ff6b00]/10 text-white" : "border-[#1e1e1e] text-zinc-400",
              ].join(" ")}
            >
              <span className="font-semibold text-[#ff6b00]">Every Wednesday</span>
              <span className="mt-0.5 block text-xs text-zinc-500">Standard payout run (like other platforms).</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPayoutPref("instant");
                void patch({ payoutPreference: "instant" });
              }}
              className={[
                "rounded-xl border px-4 py-3 text-left text-sm transition",
                payoutPref === "instant" ? "border-[#00FF88] bg-[#00FF88]/10 text-white" : "border-[#1e1e1e] text-zinc-400",
              ].join(" ")}
            >
              <span className="font-semibold text-[#00FF88]">Instant cashout ⚡</span>
              <span className="mt-0.5 block text-xs text-zinc-500">GRIDD advantage — move money when you need it (fees may apply).</span>
            </button>
          </div>
        </div>

        <div id="service-area" className="scroll-mt-24 px-4 pt-8">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Service area &amp; distance</h3>
          <p className="mt-2 text-sm text-zinc-400">
            ZIP: <span className="font-mono text-white">{zip}</span>
          </p>
          <p className="mt-1 text-[11px] text-zinc-600">Update your home base ZIP during onboarding / document flow.</p>
          <label className="mt-4 flex flex-col gap-2 text-xs text-zinc-500">
            <span>Max distance ({distMiles} mi)</span>
            <input
              type="range"
              min={5}
              max={100}
              value={distMiles}
              onChange={(e) => setDistMiles(Number(e.target.value))}
              onMouseUp={(e) => void saveDistance(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => void saveDistance(Number((e.target as HTMLInputElement).value))}
              className="w-full accent-[#ff6b00]"
            />
          </label>
        </div>

        <div id="services-offer" className="px-4 pt-8">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Services I offer</h3>
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
                    on ? "border-[#ff6b00] bg-[#ff6b00]/15 text-white" : "border-[#1e1e1e] text-zinc-500",
                  ].join(" ")}
                >
                  {m.icon} {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div id="notifications" className="scroll-mt-24">
          <SectionHeader>Notifications</SectionHeader>
          <div>
          <ToggleRow
            icon={Bell}
            label="New job alerts"
            checked={notifJobAlerts}
            onChange={(v) => {
              setNotifJobAlerts(v);
              void patch({ notifJobAlerts: v });
            }}
          />
          <ToggleRow
            icon={MessageSquare}
            label="Chat messages"
            checked={notifChat}
            onChange={(v) => {
              setNotifChat(v);
              void patch({ notifChat: v });
            }}
          />
          <ToggleRow
            icon={Coins}
            label="Payment received"
            checked={notifPayment}
            onChange={(v) => {
              setNotifPayment(v);
              void patch({ notifPayment: v });
            }}
          />
          <ToggleRow
            icon={Megaphone}
            label="GRIDD announcements"
            checked={notifAnnouncements}
            onChange={(v) => {
              setNotifAnnouncements(v);
              void patch({ notifAnnouncements: v });
            }}
          />
          <div id="dnd" className="scroll-mt-24">
            <ToggleRow
              icon={Moon}
              label="Do Not Disturb hours"
              checked={dndEnabled}
              onChange={(v) => {
                setDndEnabled(v);
                void patch({ dndEnabled: v });
              }}
            />
          </div>
        </div>
        </div>
        {dndEnabled ? (
          <div className="border-b px-4 py-4" style={{ borderColor: DIVIDER }}>
            <p className="mb-3 text-[11px] text-zinc-600">Quiet hours (local time)</p>
            <div className="flex items-center gap-3">
              <label className="flex flex-1 flex-col gap-1 text-[10px] uppercase text-zinc-500">
                From
                <input
                  type="time"
                  value={dndStart}
                  onChange={(e) => {
                    setDndStart(e.target.value);
                    void patch({ dndStart: e.target.value });
                  }}
                  className="rounded-lg border border-[#1e1e1e] bg-black/40 px-2 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-[10px] uppercase text-zinc-500">
                To
                <input
                  type="time"
                  value={dndEnd}
                  onChange={(e) => {
                    setDndEnd(e.target.value);
                    void patch({ dndEnd: e.target.value });
                  }}
                  className="rounded-lg border border-[#1e1e1e] bg-black/40 px-2 py-2 text-sm text-white"
                />
              </label>
            </div>
          </div>
        ) : null}

        <SectionHeader>Support &amp; info</SectionHeader>
        <nav>
          <NavRow icon={HelpCircle} label="How-tos & guides" href="https://gridd.click" />
          <NavRow icon={Newspaper} label="What&apos;s new / updates" href="/" />
          <NavRow icon={Gift} label="Promotions & bonuses" href="/" />
          <NavRow icon={MessageSquare} label="Get help / contact support" href="mailto:drivers@gridd.click" />
          <NavRow
            icon={Send}
            label="Send feedback"
            href="mailto:feedback@gridd.click?subject=GRIDD%20Driver%20Feedback"
          />
          <NavRow icon={FileText} label="Terms & privacy policy" href="/terms" />
          <NavRow icon={Info} label="About GRIDD" href="/" />
        </nav>

        <div id="danger-zone" className="scroll-mt-24">
          <SectionHeader>Danger zone</SectionHeader>
          <nav>
            <button
              type="button"
              className="flex w-full items-center gap-3 border-b px-5 py-[14px] text-left active:bg-white/[0.04]"
              style={{ borderColor: DIVIDER, color: "#fff", background: ROW_BG }}
              onClick={() => {
                if (!window.confirm("Sign out of GRIDD on this device?")) return;
                void logOut();
              }}
            >
              <span className="text-[18px]" style={{ color: ICON }}>
                🚪
              </span>
              <span className="flex-1 text-[15px]">Sign out</span>
              <span className="text-[1.15rem] font-light leading-none" style={{ color: CHEVRON }}>
                ›
              </span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-5 py-[14px] text-left active:bg-white/[0.04]"
              style={{ borderBottom: `1px solid ${DIVIDER}`, background: ROW_BG }}
              onClick={() => void deleteAccount()}
            >
              <span className="text-[18px]" style={{ color: "#ff4444" }}>
                ❌
              </span>
              <span className="flex-1 text-[14px]" style={{ color: "#ff4444" }}>
                Delete account
              </span>
              <span className="text-[1.15rem] font-light leading-none" style={{ color: CHEVRON }}>
                ›
              </span>
            </button>
          </nav>
        </div>

        <p className="px-4 py-8 text-center text-[10px] text-zinc-600">
          GRIDD Driver · Settings
        </p>
      </div>

      {taxOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <div className="max-w-sm rounded-2xl border p-5" style={{ borderColor: DIVIDER, background: "#111" }}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <h3 className="font-semibold text-white">Tax documents (1099)</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Available after $600 earned in a calendar year. 1099 forms are issued after year-end when you meet
                  reporting thresholds. For tax questions, email{" "}
                  <a href="mailto:drivers@gridd.click" className="text-[#ff6b00] underline">
                    drivers@gridd.click
                  </a>
                  .
                </p>
              </div>
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-[#ff6b00] py-3 text-sm font-bold text-white"
              onClick={() => setTaxOpen(false)}
            >
              OK
            </button>
          </div>
        </div>
      ) : null}

      <DriverNav />
    </main>
  );
}
