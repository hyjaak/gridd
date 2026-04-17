"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { WalletTx } from "@/types";
import { NotificationBell } from "@/components/NotificationBell";
import { CustomerNav } from "@/components/CustomerNav";
import { BackButton } from "@/components/BackButton";
import { getUserRole } from "@/lib/userRole";

function money(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

type WalletPrefs = {
  applePayAdded?: boolean;
  googlePayAdded?: boolean;
  samsungPayAdded?: boolean;
  virtualCardLast4?: string;
  cardholderName?: string;
  cardExpiry?: string;
  cardCvv?: string;
};

const TIER_THRESHOLDS = [
  { name: "Bronze", min: 0 },
  { name: "Silver", min: 500 },
  { name: "Gold", min: 1500 },
  { name: "Platinum", min: 3000 },
];

export default function CustomerWalletPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [tx, setTx] = useState<WalletTx[]>([]);
  const [prefs, setPrefs] = useState<WalletPrefs | null>(null);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = user;
      if (!u) return;
      const r = await getUserRole(u.uid);
      if (cancelled) return;
      if (r === "driver") router.replace("/jobs");
      else if (r === "admin") router.replace("/admin/dashboard");
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  const balanceCents = profile?.walletBalanceCents ?? 0;
  const points = profile?.points ?? 0;
  const tierName =
    (profile as { ditchTier?: string } | null)?.ditchTier ??
    TIER_THRESHOLDS.slice()
      .reverse()
      .find((t) => points >= t.min)?.name ??
    "Bronze";

  const nextTier = useMemo(() => {
    const order = TIER_THRESHOLDS.map((t) => t.name);
    const idx = order.indexOf(tierName);
    const next = TIER_THRESHOLDS[idx + 1];
    if (!next) return null;
    return { name: next.name, min: next.min };
  }, [tierName]);

  const progressToNext = useMemo(() => {
    if (!nextTier) return 100;
    const prevMin = TIER_THRESHOLDS.find((t) => t.name === tierName)?.min ?? 0;
    const span = nextTier.min - prevMin;
    if (span <= 0) return 100;
    const p = ((points - prevMin) / span) * 100;
    return Math.max(0, Math.min(100, p));
  }, [points, tierName, nextTier]);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) return;
    const db = getFirestore(firebaseApp);
    let cancelled = false;
    void (async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (cancelled) return;
      setPrefs((snap.data() as WalletPrefs) ?? {});
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) return;
    const db = getFirestore(firebaseApp);
    const q = query(
      collection(db, "walletTx"),
      where("uid", "==", user.uid),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: WalletTx[] = snap.docs.map((d) => {
          const data = d.data() as Omit<WalletTx, "id">;
          return { id: d.id, ...data };
        });
        setTx(rows);
      },
      () => setTx([]),
    );
    return () => unsub();
  }, [user?.uid]);

  async function toggleWalletFlag(field: keyof WalletPrefs) {
    if (!firebaseApp || !user?.uid) return;
    const db = getFirestore(firebaseApp);
    const ref = doc(db, "users", user.uid);
    const next = !(prefs?.[field] as boolean);
    await setDoc(ref, { [field]: next }, { merge: true });
    setPrefs((p) => ({ ...p, [field]: next }));
  }

  const last4 = prefs?.virtualCardLast4 ?? "4242";
  const holder = prefs?.cardholderName ?? profile?.name ?? "Cardholder";
  const expiry = prefs?.cardExpiry ?? "12/28";
  const cvv = prefs?.cardCvv ?? "•••";

  return (
    <main className="min-h-full bg-[#060606]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[#060606]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-6 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <BackButton href="/home" inline />
            <Link href="/home" className="truncate text-lg font-semibold tracking-tight text-[#00FF88]">
              GRIDD
            </Link>
          </div>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 pb-24 pt-8">
        <section className="text-center">
          <div className="text-5xl font-bold tracking-tight text-[#00FF88]">{money(balanceCents)}</div>
          <div className="mt-2 text-sm text-[var(--sub)]">+ 2% annual interest</div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button variant="secondary" onClick={() => {}}>
              Send 📤
            </Button>
            <Button variant="secondary" onClick={() => {}}>
              Cash Out 💸
            </Button>
            <Button variant="secondary" onClick={() => {}}>
              Add to Card 💳
            </Button>
          </div>
        </section>

        <section className="mt-10">
          <div className="text-sm font-semibold text-[var(--text)]">Virtual Card</div>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="mt-3 w-full max-w-md perspective-[1000px] text-left outline-none"
            style={{ perspective: "1000px" }}
          >
            <div
              className="relative min-h-[200px] w-full transition-transform duration-500"
              style={{
                transformStyle: "preserve-3d",
                transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
              }}
            >
              <div
                className="absolute inset-0 rounded-2xl border border-white/10 bg-gradient-to-br from-[#FF6B00] via-[#1a0a00] to-black p-6 text-white shadow-xl"
                style={{ backfaceVisibility: "hidden" }}
              >
                <div className="text-xs font-semibold tracking-widest text-white/80">GRIDD</div>
                <div className="mt-10 font-mono text-lg tracking-[0.2em]">
                  4747 •••• •••• {last4}
                </div>
                <div className="mt-6 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] uppercase text-white/60">Cardholder</div>
                    <div className="text-sm font-medium">{holder}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-white/60">Expires</div>
                    <div className="text-sm font-medium">{expiry}</div>
                  </div>
                  <div className="rounded bg-white px-2 py-1 text-xs font-black italic text-black">VISA</div>
                </div>
              </div>
              <div
                className="absolute inset-0 rounded-2xl border border-white/10 bg-gradient-to-br from-black via-[#0a0a0a] to-[#1a1a1a] p-6 shadow-xl"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              >
                <div className="mt-8 h-10 w-full bg-black/80" />
                <div className="mt-4 flex justify-end">
                  <div className="rounded bg-white/90 px-4 py-2 font-mono text-lg text-black">{cvv}</div>
                </div>
                <div className="mt-6 text-xs text-white/60">Tap to flip</div>
              </div>
            </div>
          </button>
        </section>

        <section className="mt-10">
          <div className="text-sm font-semibold text-[var(--text)]">Digital Wallets</div>
          <div className="mt-3 space-y-3">
            {[
              { key: "applePayAdded" as const, label: "Apple Pay 🍎" },
              { key: "googlePayAdded" as const, label: "Google Pay 🌐" },
              { key: "samsungPayAdded" as const, label: "Samsung Pay 📱" },
            ].map((w) => (
              <Card key={w.key} className="flex items-center justify-between p-4">
                <span className="text-sm text-[var(--text)]">{w.label}</span>
                {prefs?.[w.key] ? (
                  <span className="text-sm text-[#00FF88]">Ready ✓</span>
                ) : (
                  <Button variant="secondary" className="text-xs" onClick={() => void toggleWalletFlag(w.key)}>
                    Add
                  </Button>
                )}
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <div className="text-sm font-semibold text-[var(--text)]">Transaction History</div>
          <div className="mt-3 space-y-2">
            {tx.length === 0 ? (
              <Card className="p-4">
                <p className="text-sm text-[var(--sub)]">No wallet transactions yet.</p>
              </Card>
            ) : (
              tx.map((row) => (
                <Card key={row.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{row.icon ?? "💳"}</span>
                    <div>
                      <div className="text-sm font-medium text-[var(--text)]">{row.label}</div>
                      <div className="text-xs text-[var(--sub)]">
                        {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                      </div>
                    </div>
                  </div>
                  <div
                    className={[
                      "text-sm font-semibold tabular-nums",
                      row.kind === "credit" ? "text-[#00FF88]" : "text-[var(--text)]",
                    ].join(" ")}
                  >
                    {row.kind === "credit" ? "+" : "−"}
                    {money(Math.abs(row.amountCents))}
                  </div>
                </Card>
              ))
            )}
          </div>
        </section>

        <section className="mt-10">
          <div className="text-sm font-semibold text-[var(--text)]">Ditch Points</div>
          <Card className="mt-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-[var(--sub)]">Balance</div>
                <div className="text-2xl font-semibold text-[#FFB800]">{points.toLocaleString()} pts</div>
              </div>
              <span className="rounded-full border border-[#FFB800] px-3 py-1 text-xs font-semibold text-[#FFB800]">
                {tierName}
              </span>
            </div>
            {nextTier ? (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-[var(--sub)]">
                  <span>Progress to {nextTier.name}</span>
                  <span>
                    {points} / {nextTier.min}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#00FF88] transition-all"
                    style={{ width: `${progressToNext}%` }}
                  />
                </div>
              </div>
            ) : null}
            <div className="mt-6 space-y-2 text-sm text-[var(--sub)]">
              <div className="font-medium text-[var(--text)]">Rewards ladder</div>
              <div>500 pts → $5 off your next haul</div>
              <div>1000 pts → $10 off</div>
              <div>2000 pts → free standard haul</div>
            </div>
          </Card>
        </section>
      </div>

      <CustomerNav />
    </main>
  );
}
