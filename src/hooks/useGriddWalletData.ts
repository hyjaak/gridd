"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { WalletTx } from "@/types";

export function money(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export type WalletPrefs = {
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

export function useGriddWalletData() {
  const { user, profile } = useAuth();
  const [tx, setTx] = useState<WalletTx[]>([]);
  const [prefs, setPrefs] = useState<WalletPrefs | null>(null);
  const [flipped, setFlipped] = useState(false);

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

  return {
    balanceCents,
    points,
    tierName,
    nextTier,
    progressToNext,
    tx,
    prefs,
    flipped,
    setFlipped,
    toggleWalletFlag,
    profileName: profile?.name,
  };
}

export type GriddWalletData = ReturnType<typeof useGriddWalletData>;
