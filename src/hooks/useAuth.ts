"use client";

import { useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";
import type { UserRole } from "@/types";
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
