"use client";

import type { UserRole } from "@/types";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { getUserRole } from "@/lib/userRole";
import { clearClientSessionCookies, setClientSessionCookies } from "@/lib/session-cookies";
export { useAuth } from "@/hooks/useAuth";
export { getUserRole } from "@/lib/userRole";

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

export async function syncSession(): Promise<SyncSessionResult> {
  const token = await auth.currentUser?.getIdToken(true);
  if (!token) {
    return { ok: false, error: "Not signed in" };
  }
  const res = await fetch("/api/session/sync", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!res) {
    return { ok: false, error: "Session sync temporarily unavailable. Please try again." };
  }
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

async function loadProfileForAuth(uid: string): Promise<{
  profile: ProfileDoc | null;
  role: UserRole | null;
}> {
  const role = await getUserRole(uid);
  if (!role) return { profile: null, role: null };

  if (role === "driver") {
    const provSnap = await getDoc(doc(db, "providers", uid));
    if (!provSnap.exists()) return { profile: null, role: null };
    const d = provSnap.data();
    const profile: ProfileDoc = {
      uid,
      email: d?.email as string | undefined,
      phone: d?.phone as string | undefined,
      name: d?.name as string | undefined,
      role: "driver",
      agreementsSigned: (d?.agreementsSigned as string[]) ?? [],
      createdAt: d?.createdAt,
      serviceArea: d?.serviceArea as string | undefined,
    };
    return { profile, role };
  }

  const userSnap = await getDoc(doc(db, "users", uid));
  if (!userSnap.exists()) return { profile: null, role: null };
  return { profile: userSnap.data() as ProfileDoc, role };
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
  serviceArea?: string,
) {
  if (role === "admin") {
    throw new Error("Invalid role for signup.");
  }

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });

  if (role === "customer") {
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      name,
      email,
      phone: phone ?? null,
      role: "customer",
      points: 0,
      tier: "Member",
      favorites: [],
      totalSpent: 0,
      jobCount: 0,
      walletBalance: 0,
      agreementsSigned: [],
      createdAt: serverTimestamp(),
    });
  } else {
    await setDoc(doc(db, "providers", cred.user.uid), {
      uid: cred.user.uid,
      name,
      email,
      phone: phone ?? null,
      role: "driver",
      status: "offline",
      rating: 0,
      totalRatings: 0,
      jobCount: 0,
      totalEarned: 0,
      tier: "Bronze",
      bonusPct: 0,
      verified: false,
      verificationStatus: "awaiting_documents",
      services: [],
      serviceIds: [],
      equityShares: 0,
      agreementsSigned: [],
      createdAt: serverTimestamp(),
      ...(serviceArea?.trim() ? { serviceArea: serviceArea.trim() } : {}),
    });
  }

  setClientSessionCookies(cred.user.uid, role, false);
  const synced = await syncSession();
  if (!synced.ok) {
    console.warn("[auth] signUp syncSession:", synced.error);
  }

  if (role === "customer") {
    await sendEmailVerification(cred.user, {
      url: "https://gridd.click/login",
      handleCodeInApp: false,
    });
    try {
      await fetch("/api/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
    } catch {
      /* Resend optional */
    }
    window.location.assign(`/verify-email?email=${encodeURIComponent(email)}`);
    return;
  }

  window.location.assign("/signup/driver-docs");
}

async function assertNotBlockedOrSuspended(uid: string) {
  const uSnap = await getDoc(doc(db, "users", uid));
  const pSnap = await getDoc(doc(db, "providers", uid));
  const u = uSnap.exists() ? (uSnap.data() as { blocked?: boolean; suspendedUntil?: string }) : null;
  const p = pSnap.exists() ? (pSnap.data() as { blocked?: boolean; suspendedUntil?: string }) : null;
  if (u?.blocked || p?.blocked) {
    await firebaseSignOut(auth);
    clearClientSessionCookies();
    throw new Error("Account suspended. Contact support.");
  }
  const until = u?.suspendedUntil ?? p?.suspendedUntil;
  if (until && new Date(until).getTime() > Date.now()) {
    await firebaseSignOut(auth);
    clearClientSessionCookies();
    throw new Error("Account temporarily suspended. Try again later.");
  }
}

function isPasswordProvider(user: FirebaseUser): boolean {
  return user.providerData.some((p) => p.providerId === "password");
}

/** Resend Firebase verification email (must be signed in as that user). */
export async function sendVerificationEmailToCurrentUser() {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in");
  await sendEmailVerification(u, {
    url: "https://gridd.click/login",
    handleCodeInApp: false,
  });
}

export async function logIn(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await assertNotBlockedOrSuspended(cred.user.uid);
  await cred.user.reload();
  if (isPasswordProvider(cred.user) && !cred.user.emailVerified) {
    await firebaseSignOut(auth);
    clearClientSessionCookies();
    window.location.assign(`/verify-email?email=${encodeURIComponent(email)}`);
    return;
  }

  const { profile, role } = await loadProfileForAuth(cred.user.uid);

  if (!role || !profile) {
    window.location.assign("/agreements");
    return;
  }

  const signed = profile.agreementsSigned ?? [];
  const agrOk = hasAllRequired(role, signed);

  if (role === "driver") {
    const provSnap = await getDoc(doc(db, "providers", cred.user.uid));
    const vs = (provSnap.data() as { verificationStatus?: string } | undefined)?.verificationStatus;
    if (vs === "awaiting_documents") {
      setClientSessionCookies(cred.user.uid, role, false);
      const synced = await syncSession();
      if (!synced.ok) console.warn("[auth] logIn syncSession:", synced.error);
      window.location.assign("/signup/driver-docs");
      return;
    }
    if (vs === "pending") {
      setClientSessionCookies(cred.user.uid, role, false);
      const synced = await syncSession();
      if (!synced.ok) console.warn("[auth] logIn syncSession:", synced.error);
      window.location.assign("/driver-pending");
      return;
    }
    if (vs === "rejected") {
      setClientSessionCookies(cred.user.uid, role, false);
      const synced = await syncSession();
      if (!synced.ok) console.warn("[auth] logIn syncSession:", synced.error);
      window.location.assign("/driver-rejected");
      return;
    }
  }

  setClientSessionCookies(cred.user.uid, role, agrOk);
  const synced = await syncSession();
  if (!synced.ok) {
    console.warn("[auth] logIn syncSession:", synced.error);
  }

  if (!agrOk) {
    window.location.assign("/agreements");
    return;
  }
  window.location.assign(routeForRole(role));
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
  await assertNotBlockedOrSuspended(cred.user.uid);
  await cred.user.reload();
  if (!cred.user.emailVerified) {
    await firebaseSignOut(auth);
    clearClientSessionCookies();
    window.location.assign(
      `/verify-email?email=${encodeURIComponent(cred.user.email ?? "")}`,
    );
    return;
  }
  const { profile, role } = await loadProfileForAuth(cred.user.uid);
  if (!role || !profile) {
    window.location.assign("/agreements");
    return;
  }
  const signed = profile.agreementsSigned ?? [];
  const agrOk = hasAllRequired(role, signed);

  if (role === "driver") {
    const provSnap = await getDoc(doc(db, "providers", cred.user.uid));
    const vs = (provSnap.data() as { verificationStatus?: string } | undefined)?.verificationStatus;
    if (vs === "awaiting_documents") {
      setClientSessionCookies(cred.user.uid, role, false);
      const synced = await syncSession();
      if (!synced.ok) console.warn("[auth] googleSignIn syncSession:", synced.error);
      window.location.assign("/signup/driver-docs");
      return;
    }
    if (vs === "pending") {
      setClientSessionCookies(cred.user.uid, role, false);
      const synced = await syncSession();
      if (!synced.ok) console.warn("[auth] googleSignIn syncSession:", synced.error);
      window.location.assign("/driver-pending");
      return;
    }
    if (vs === "rejected") {
      setClientSessionCookies(cred.user.uid, role, false);
      const synced = await syncSession();
      if (!synced.ok) console.warn("[auth] googleSignIn syncSession:", synced.error);
      window.location.assign("/driver-rejected");
      return;
    }
  }

  setClientSessionCookies(cred.user.uid, role, agrOk);
  const synced = await syncSession();
  if (!synced.ok) {
    console.warn("[auth] googleSignIn syncSession:", synced.error);
  }

  if (!agrOk) {
    window.location.assign("/agreements");
    return;
  }
  window.location.assign(routeForRole(role));
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
    const { profile, role } = await loadProfileForAuth(u.uid);
    callback({ user: u, profile, role });
  });
}
