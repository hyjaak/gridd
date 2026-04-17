"use client";

import type { UserRole } from "@/types";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { clearClientSessionCookies, setClientSessionCookies } from "@/lib/session-cookies";
export { useAuth } from "@/hooks/useAuth";

export type SyncSessionResult =
  | { ok: true; role: UserRole; agreementsOk: boolean }
  | { ok: false; error: string };

type ProfileDoc = {
  uid: string;
  email?: string;
  phone?: string;
  name?: string;
  role: UserRole;
  agreementsSigned: string[];
  createdAt: unknown;
  /** Driver primary service area */
  serviceArea?: string;
};

const REQUIRED_BASE = ["terms", "privacy", "zerotolerance"] as const;
const REQUIRED_DRIVER = [...REQUIRED_BASE, "provider_agreement"] as const;

function requiredDocs(role: UserRole) {
  return role === "driver" ? [...REQUIRED_DRIVER] : [...REQUIRED_BASE];
}

function routeForRole(role: UserRole) {
  if (role === "admin") return "/admin/dashboard";
  if (role === "driver") return "/jobs";
  return "/home";
}

/**
 * Sets httpOnly session cookies from the Firebase ID token. Must succeed before
 * navigating to protected routes, or middleware will send users back to login.
 */
export async function syncSession(): Promise<SyncSessionResult> {
  const token = await auth.currentUser?.getIdToken(true);
  if (!token) {
    return { ok: false, error: "Not signed in" };
  }
  const res = await fetch("/api/session/sync", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    role?: UserRole;
    agreementsOk?: boolean;
  };
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error: data.error ?? `Session sync failed (${res.status})`,
    };
  }
  const role = data.role ?? "customer";
  const agreementsOk = !!data.agreementsOk;
  const uid = auth.currentUser?.uid;
  if (uid) {
    setClientSessionCookies(uid, role, agreementsOk);
  }
  return {
    ok: true,
    role,
    agreementsOk,
  };
}

async function loadProfile(uid: string): Promise<ProfileDoc | null> {
  const userSnap = await getDoc(doc(db, "users", uid));
  if (userSnap.exists()) return userSnap.data() as ProfileDoc;
  return null;
}

function hasAllRequired(role: UserRole, agreementsSigned: string[]) {
  const required = requiredDocs(role);
  return required.every((d) => agreementsSigned.includes(d));
}

export async function signUp(
  email: string,
  password: string,
  name: string,
  role: UserRole,
  phone?: string,
  /** Driver service area (full address or ZIP) — optional */
  serviceArea?: string,
) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });

  const profile: ProfileDoc = {
    uid: cred.user.uid,
    email,
    phone,
    name,
    role,
    agreementsSigned: [],
    createdAt: serverTimestamp(),
    ...(role === "driver" && serviceArea?.trim()
      ? { serviceArea: serviceArea.trim() }
      : {}),
  };

  await setDoc(doc(db, "users", cred.user.uid), profile, { merge: true });

  setClientSessionCookies(cred.user.uid, role, false);
  const synced = await syncSession();
  if (!synced.ok) {
    console.warn("[auth] signUp syncSession:", synced.error);
  }
  window.location.assign("/agreements");
}

export async function logIn(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const profile = await loadProfile(cred.user.uid);

  // No Firestore profile yet — send to onboarding (public route; cookies optional).
  if (!profile) {
    window.location.assign("/agreements");
    return;
  }

  const signed = profile.agreementsSigned ?? [];
  const agrOk = hasAllRequired(profile.role, signed);
  setClientSessionCookies(cred.user.uid, profile.role, agrOk);

  const synced = await syncSession();
  if (!synced.ok) {
    console.warn("[auth] logIn syncSession:", synced.error);
  }

  if (!agrOk) {
    window.location.assign("/agreements");
    return;
  }
  window.location.assign(routeForRole(profile.role));
}

export async function logOut() {
  clearClientSessionCookies();
  await firebaseSignOut(auth);
  await fetch("/api/session/logout", { method: "POST" }).catch(() => null);
  window.location.assign("/");
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export async function googleSignIn() {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  const profile = await loadProfile(cred.user.uid);
  if (!profile) {
    window.location.assign("/agreements");
    return;
  }
  const signed = profile.agreementsSigned ?? [];
  const agrOk = hasAllRequired(profile.role, signed);
  setClientSessionCookies(cred.user.uid, profile.role, agrOk);

  const synced = await syncSession();
  if (!synced.ok) {
    console.warn("[auth] googleSignIn syncSession:", synced.error);
  }

  if (!agrOk) {
    window.location.assign("/agreements");
    return;
  }
  window.location.assign(routeForRole(profile.role));
}

export function onAuthChange(
  callback: (args: {
    user: FirebaseUser | null;
    profile: ProfileDoc | null;
    role: UserRole | null;
  }) => void,
) {
  return onAuthStateChanged(auth, async (u) => {
    if (!u) {
      callback({ user: null, profile: null, role: null });
      return;
    }
    const profile = await loadProfile(u.uid);
    callback({ user: u, profile, role: profile?.role ?? null });
  });
}

