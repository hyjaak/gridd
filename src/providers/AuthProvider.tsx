"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getFirestore, onSnapshot, Timestamp } from "firebase/firestore";
import type { ProviderDocuments, UserRole } from "@/types";
import type { DriverTier } from "@/types";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";
import { getUserRole } from "@/lib/userRole";

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
  memberSince?: string;
  favorites?: string[];
  totalSpent?: number;
  totalSavedCents?: number;
  homeAddress?: string;
  /** Resolved from Places / geocoding — not shown in UI */
  homeAddressGeo?: { lat: number; lng: number };
  /** Nested prefs (preferred); flat `notif*` fields still supported */
  notificationPrefs?: {
    jobUpdates?: boolean;
    promos?: boolean;
    porch?: boolean;
    sms?: boolean;
  };
  paymentMethods?: {
    applePay?: boolean;
    googlePay?: boolean;
  };
  notifJobUpdates?: boolean;
  notifPromos?: boolean;
  notifPorch?: boolean;
  notifSms?: boolean;
  payApple?: boolean;
  payGoogle?: boolean;
  paySamsung?: boolean;
  walletAutoCashout?: boolean;
  walletInterestAlerts?: boolean;
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
  onboardingComplete?: boolean;
  /** CEO-granted demo trial */
  demoMode?: boolean;
  demoJobsUsed?: number;
  demoJobsLimit?: number;
  /** Driver settings (Firestore on `providers`) */
  payoutPreference?: "weekly_wednesday" | "instant";
  notifJobAlerts?: boolean;
  notifChat?: boolean;
  notifPayment?: boolean;
  notifAnnouncements?: boolean;
  dndEnabled?: boolean;
  dndStart?: string;
  dndEnd?: string;
  /** Account moderation (users collection) */
  accountStatus?: "active" | "on_hold" | "suspended" | "banned";
  blocked?: boolean;
  banned?: boolean;
  suspendedUntil?: string;
  griddScore?: number;
  griddTier?: string;
  referralCode?: string;
  referredByUid?: string;
  city?: string;
};

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

export type AuthContextValue = {
  user: FirebaseUser | null;
  profile: GriddProfile | null;
  role: UserRole | null;
  loading: boolean;
  isCustomer: boolean;
  isDriver: boolean;
  isCEO: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** If profile/role resolution hangs (network, Firestore), unblock the UI after this. */
const AUTH_LOADING_TIMEOUT_MS = 5000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<GriddProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  /** Prevents loading=true flicker when Firebase emits the same session repeatedly */
  const lastSessionUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!firebaseAuth || !firebaseApp) {
      setLoading(false);
      return;
    }

    const fs = getFirestore(firebaseApp);
    let profileUnsub: (() => void) | undefined;
    let loadingTimeout: ReturnType<typeof setTimeout> | undefined;
    /**
     * Generation counter — bumped on every meaningful auth change. Async work
     * (getUserRole + onSnapshot setup) checks its captured gen against this
     * before mutating state, so a stale callback from a previous auth emission
     * cannot stomp on a fresh one. This also prevents the rapid-fire
     * subscribe/unsubscribe cycle that triggers Firestore 12's b815/ca9
     * INTERNAL ASSERTION FAILED crash.
     */
    let generation = 0;
    let activeUid: string | null = null;

    const clearLoadingTimeout = () => {
      if (loadingTimeout !== undefined) {
        clearTimeout(loadingTimeout);
        loadingTimeout = undefined;
      }
    };

    const safeUnsubProfile = () => {
      const fn = profileUnsub;
      profileUnsub = undefined;
      if (!fn) return;
      try {
        fn();
      } catch (e) {
        console.warn("[auth] profile listener unsubscribe failed (non-fatal):", e);
      }
    };

    const unsub = onAuthStateChanged(firebaseAuth, (u) => {
      const newUid = u?.uid ?? null;

      // Same user re-emitted (Firebase often fires twice on init / token refresh).
      // Don't touch the existing listener — that's what causes the SDK assertion.
      if (newUid === activeUid && profileUnsub) {
        return;
      }

      generation += 1;
      const myGen = generation;
      activeUid = newUid;

      clearLoadingTimeout();
      safeUnsubProfile();
      setUser(u);

      if (!u) {
        lastSessionUidRef.current = null;
        setProfile(null);
        setRole(null);
        setLoading(false);
        return;
      }

      loadingTimeout = setTimeout(() => {
        if (myGen !== generation) return;
        setLoading(false);
      }, AUTH_LOADING_TIMEOUT_MS);

      const sessionChanged = lastSessionUidRef.current !== u.uid;
      lastSessionUidRef.current = u.uid;
      if (sessionChanged) {
        setLoading(true);
        setProfile(null);
        setRole(null);
      }

      void (async () => {
        const uid = u.uid;
        try {
          const r = await getUserRole(uid);
          if (myGen !== generation) return;
          if (firebaseAuth.currentUser?.uid !== uid) return;

          setRole(r);
          if (!r) {
            setProfile(null);
            clearLoadingTimeout();
            setLoading(false);
            return;
          }

          const collectionName = r === "driver" ? "providers" : "users";
          const docRef = doc(fs, collectionName, uid);
          try {
            profileUnsub = onSnapshot(
              docRef,
              (snap) => {
                if (myGen !== generation) return;
                if (firebaseAuth.currentUser?.uid !== uid) return;
                clearLoadingTimeout();
                if (!snap.exists()) {
                  if (r === "ceo" && firebaseAuth.currentUser?.uid === uid) {
                    const cu = firebaseAuth.currentUser;
                    setProfile({
                      uid,
                      email: cu.email ?? undefined,
                      name: cu.displayName ?? undefined,
                      role: "ceo",
                    });
                    setLoading(false);
                    return;
                  }
                  setProfile(null);
                  setLoading(false);
                  return;
                }
                const data = snap.data();
                const np = data.notificationPrefs as
                  | { jobUpdates?: boolean; promos?: boolean; porch?: boolean; sms?: boolean }
                  | undefined;
                const pm = data.paymentMethods as { applePay?: boolean; googlePay?: boolean } | undefined;
                const coords =
                  (data.homeAddressCoords as { lat: number; lng: number } | undefined) ??
                  (data.homeAddressGeo as { lat: number; lng: number } | undefined);
                let mapped: GriddProfile;
                try {
                  mapped = {
                    uid,
                    email: data.email as string | undefined,
                    phone: data.phone as string | undefined,
                    name:
                      (data.name as string | undefined) ?? (data.displayName as string | undefined),
                    notificationPrefs: np,
                    paymentMethods: pm,
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
                    homeAddressGeo: coords,
                    notifJobUpdates: np?.jobUpdates ?? (data.notifJobUpdates as boolean | undefined),
                    notifPromos: np?.promos ?? (data.notifPromos as boolean | undefined),
                    notifPorch: np?.porch ?? (data.notifPorch as boolean | undefined),
                    notifSms: np?.sms ?? (data.notifSms as boolean | undefined),
                    payApple: pm?.applePay ?? (data.payApple as boolean | undefined),
                    payGoogle: pm?.googlePay ?? (data.payGoogle as boolean | undefined),
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
                    demoMode: data.demoMode === true,
                    demoJobsUsed: typeof data.demoJobsUsed === "number" ? data.demoJobsUsed : undefined,
                    demoJobsLimit: typeof data.demoJobsLimit === "number" ? data.demoJobsLimit : undefined,
                    payoutPreference:
                      data.payoutPreference === "instant" || data.payoutPreference === "weekly_wednesday"
                        ? data.payoutPreference
                        : undefined,
                    notifJobAlerts: data.notifJobAlerts as boolean | undefined,
                    notifChat: data.notifChat as boolean | undefined,
                    notifPayment: data.notifPayment as boolean | undefined,
                    notifAnnouncements: data.notifAnnouncements as boolean | undefined,
                    dndEnabled: data.dndEnabled === true,
                    dndStart: typeof data.dndStart === "string" ? data.dndStart : undefined,
                    dndEnd: typeof data.dndEnd === "string" ? data.dndEnd : undefined,
                    accountStatus: data.accountStatus as GriddProfile["accountStatus"],
                    blocked: data.blocked === true,
                    banned: data.banned === true,
                    suspendedUntil:
                      typeof data.suspendedUntil === "string" ? data.suspendedUntil : undefined,
                    griddScore: typeof data.griddScore === "number" ? data.griddScore : undefined,
                    griddTier: typeof data.griddTier === "string" ? data.griddTier : undefined,
                    referralCode:
                      typeof data.referralCode === "string" ? data.referralCode : undefined,
                    referredByUid:
                      typeof data.referredByUid === "string" ? data.referredByUid : undefined,
                    city: typeof data.city === "string" ? data.city : undefined,
                  };
                } catch (mapErr) {
                  console.error("Profile mapping failed:", mapErr);
                  setProfile(null);
                  setLoading(false);
                  return;
                }
                setProfile(mapped);
                setLoading(false);
              },
              (err) => {
                console.error("Profile snapshot error:", err);
                if (myGen !== generation) return;
                if (firebaseAuth.currentUser?.uid !== uid) return;
                setProfile(null);
                clearLoadingTimeout();
                setLoading(false);
              },
            );
          } catch (snapErr) {
            console.error("Profile listener setup failed:", snapErr);
            setProfile(null);
            clearLoadingTimeout();
            setLoading(false);
          }
        } catch (e) {
          console.error("Auth profile bootstrap failed:", e);
          setRole(null);
          setProfile(null);
          clearLoadingTimeout();
          setLoading(false);
        }
      })();
    });

    return () => {
      clearLoadingTimeout();
      profileUnsub?.();
      unsub();
    };
  }, []);

  const isCustomer = role === "customer";
  const isDriver = role === "driver";
  const isCEO = role === "ceo";

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      role,
      loading,
      isCustomer,
      isDriver,
      isCEO,
    }),
    [user, profile, role, loading, isCustomer, isDriver, isCEO],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
