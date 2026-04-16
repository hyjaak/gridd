"use client";

import { useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";
import type { UserRole } from "@/types";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";

export type GriddProfile = {
  uid: string;
  email?: string;
  phone?: string;
  name?: string;
  role: UserRole;
  agreementsSigned?: string[];
  points?: number;
  walletBalanceCents?: number;
  /** Alias / dollars field some docs use */
  walletBalance?: number;
  jobCount?: number;
  tier?: string;
  ditchTier?: string;
  zip?: string;
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

    const db = getFirestore(firebaseApp);
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

      const pref = doc(db, "users", u.uid);
      profileUnsub = onSnapshot(
        pref,
        (snap) => {
          const data = snap.exists() ? (snap.data() as GriddProfile) : null;
          setProfile(data);
          setRole((data?.role ?? null) as UserRole | null);
          setLoading(false);
        },
        () => {
          setProfile(null);
          setRole(null);
          setLoading(false);
        },
      );
    });
    return () => {
      profileUnsub?.();
      unsub();
    };
  }, []);

  return { user, profile, role, loading };
}

