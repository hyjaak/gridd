"use client";

import { useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getFirestore, onSnapshot, Timestamp } from "firebase/firestore";
import type { ProviderDocuments, UserRole } from "@/types";
import type { DriverTier } from "@/types";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";
import { getUserRole } from "@/lib/userRole";

function fmtCreated(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "string") return raw;
  if (raw instanceof Timestamp) return raw.toDate().toISOString();
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    try {
      return (raw as Timestamp).toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export type GriddProfile = {
  uid: string;
  email?: string;
  phone?: string;
  name?: string;
  role: UserRole;
  agreementsSigned?: string[];
  points?: number;
  walletBalanceCents?: number;
  walletBalance?: number;
  jobCount?: number;
  tier?: string;
  ditchTier?: string;
  zip?: string;
  serviceArea?: string;
  /** ISO member since */
  memberSince?: string;
  /** Customer */
  favorites?: string[];
  totalSpent?: number;
  /** Estimated promos / rewards savings (cents), optional */
  totalSavedCents?: number;
  homeAddress?: string;
  notifJobUpdates?: boolean;
  notifPromos?: boolean;
  notifPorch?: boolean;
  notifSms?: boolean;
  payApple?: boolean;
  payGoogle?: boolean;
  paySamsung?: boolean;
  walletAutoCashout?: boolean;
  walletInterestAlerts?: boolean;
  /** Driver */
  rating?: number;
  providerStatus?: string;
  lifetimeEarningsCents?: number;
  completedJobCount?: number;
  equityShares?: number;
  photoUrl?: string;
  documents?: ProviderDocuments;
  stripeConnectId?: string;
  bankConnected?: boolean;
  serviceIds?: string[];
  driverTier?: DriverTier;
  notifPush?: boolean;
  notifSmsDriver?: boolean;
  notifEmailDriver?: boolean;
  maxDistanceMiles?: number;
  /** One-time product tour completed */
  onboardingComplete?: boolean;
};

export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<GriddProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseAuth || !firebaseApp) {
      setLoading(false);
      return;
    }

    const fs = getFirestore(firebaseApp);
    let profileUnsub: (() => void) | undefined;

    const unsub = onAuthStateChanged(firebaseAuth, (u) => {
      profileUnsub?.();
      profileUnsub = undefined;
      setUser(u);
      if (!u) {
        setProfile(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      void (async () => {
        const r = await getUserRole(u.uid);
        setRole(r);
        if (!r) {
          setProfile(null);
          setLoading(false);
          return;
        }

        const collectionName = r === "driver" ? "providers" : "users";
        const docRef = doc(fs, collectionName, u.uid);
        profileUnsub = onSnapshot(
          docRef,
          (snap) => {
            if (!snap.exists()) {
              setProfile(null);
              setLoading(false);
              return;
            }
            const data = snap.data();
            const mapped: GriddProfile = {
              uid: u.uid,
              email: data.email as string | undefined,
              phone: data.phone as string | undefined,
              name: data.name as string | undefined,
              role: r === "driver" ? "driver" : ((data.role as UserRole) ?? "customer"),
              agreementsSigned: data.agreementsSigned as string[] | undefined,
              points: data.points as number | undefined,
              walletBalance: data.walletBalance as number | undefined,
              walletBalanceCents: data.walletBalanceCents as number | undefined,
              jobCount: data.jobCount as number | undefined,
              tier: (data.tier as string | undefined) ?? (data.ditchTier as string | undefined),
              ditchTier: data.ditchTier as string | undefined,
              zip: data.zip as string | undefined,
              serviceArea: data.serviceArea as string | undefined,
              memberSince: fmtCreated(data.createdAt),
              favorites: data.favorites as string[] | undefined,
              totalSpent: data.totalSpent as number | undefined,
              totalSavedCents: data.totalSavedCents as number | undefined,
              homeAddress: data.homeAddress as string | undefined,
              notifJobUpdates: data.notifJobUpdates as boolean | undefined,
              notifPromos: data.notifPromos as boolean | undefined,
              notifPorch: data.notifPorch as boolean | undefined,
              notifSms: data.notifSms as boolean | undefined,
              payApple: data.payApple as boolean | undefined,
              payGoogle: data.payGoogle as boolean | undefined,
              paySamsung: data.paySamsung as boolean | undefined,
              walletAutoCashout: data.walletAutoCashout as boolean | undefined,
              walletInterestAlerts: data.walletInterestAlerts as boolean | undefined,
              rating: typeof data.rating === "number" ? data.rating : undefined,
              providerStatus: data.status as string | undefined,
              lifetimeEarningsCents: data.lifetimeEarningsCents as number | undefined,
              completedJobCount: data.completedJobCount as number | undefined,
              equityShares: data.equityShares as number | undefined,
              photoUrl: data.photoUrl as string | undefined,
              documents: data.documents as ProviderDocuments | undefined,
              stripeConnectId: data.stripeConnectId as string | undefined,
              bankConnected: data.bankConnected as boolean | undefined,
              serviceIds: data.serviceIds as string[] | undefined,
              driverTier: data.driverTier as DriverTier | undefined,
              notifPush: data.notifPush as boolean | undefined,
              notifSmsDriver: data.notifSmsDriver as boolean | undefined,
              notifEmailDriver: data.notifEmailDriver as boolean | undefined,
              maxDistanceMiles:
                typeof data.maxDistanceMiles === "number"
                  ? data.maxDistanceMiles
                  : (data.documents as ProviderDocuments | undefined)?.maxDistanceMiles,
              onboardingComplete: data.onboardingComplete === true,
            };
            setProfile(mapped);
            setLoading(false);
          },
          () => {
            setProfile(null);
            setLoading(false);
          },
        );
      })();
    });

    return () => {
      profileUnsub?.();
      unsub();
    };
  }, []);

  const isCustomer = role === "customer";
  const isDriver = role === "driver";
  const isAdmin = role === "admin";

  return { user, profile, role, loading, isCustomer, isDriver, isAdmin };
}
