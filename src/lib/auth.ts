"use client";

import type { Provider, UserRole } from "@/types";
import { getDriverAccess } from "@/lib/driver-gate";
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
import { logActivityEvent } from "@/lib/activity-feed";
import { sanitizeForFirestore } from "@/lib/sanitizeFirestore";
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
  if (role === "ceo") return "/admin/dashboard";
  if (role === "driver") return "/driver/jobs";
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

  if (role === "ceo") {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (userSnap.exists()) {
      return { profile: userSnap.data() as ProfileDoc, role: "ceo" };
    }
    const profile: ProfileDoc = {
      uid,
      role: "ceo",
      agreementsSigned: [],
      createdAt: new Date().toISOString(),
    };
    return { profile, role: "ceo" };
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
  if (role === "ceo") {
    throw new Error("Invalid role for signup.");
  }

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });

  if (role === "customer") {
    await setDoc(
      doc(db, "users", cred.user.uid),
      sanitizeForFirestore({
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
      }),
    );
  } else {
    await setDoc(
      doc(db, "providers", cred.user.uid),
      sanitizeForFirestore({
        uid: cred.user.uid,
        name,
        email,
        phone: phone ?? null,
        role: "driver",
        status: "offline",
        isOnline: false,
        documentsSubmitted: false,
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
        driverFlowVersion: 2,
        driverWizardStep: 2,
        ...(serviceArea?.trim() ? { serviceArea: serviceArea.trim() } : {}),
      }),
    );
  }

  try {
    await logActivityEvent({
      type: "user_signup",
      userId: cred.user.uid,
      userName: name,
      description: `New ${role} account`,
      metadata: { email, role },
    });
  } catch {
    /* best-effort */
  }

  setClientSessionCookies(cred.user.uid, role, false);
  const synced = await syncSession();
  if (!synced.ok) {
    console.warn("[auth] signUp syncSession:", synced.error);
  }

  if (role === "customer") {
    const continueUrl =
      typeof window !== "undefined" ? `${window.location.origin}/` : "https://gridd.click/";
    await sendEmailVerification(cred.user, {
      url: continueUrl,
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
  const continueUrl =
    typeof window !== "undefined" ? `${window.location.origin}/` : "https://gridd.click/";
  await sendEmailVerification(u, {
    url: continueUrl,
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
    window.location.assign("/terms");
    return;
  }

  const signed = profile.agreementsSigned ?? [];
  const agrOk = hasAllRequired(role, signed);

  if (role === "driver") {
    const provSnap = await getDoc(doc(db, "providers", cred.user.uid));
    const prov: Provider | null = provSnap.exists()
      ? { uid: cred.user.uid, ...(provSnap.data() as Omit<Provider, "uid">) }
      : null;
    const access = getDriverAccess(prov);
    if (access === "rejected") {
      setClientSessionCookies(cred.user.uid, role, false);
      const synced = await syncSession();
      if (!synced.ok) console.warn("[auth] logIn syncSession:", synced.error);
      window.location.assign("/driver-rejected");
      return;
    }
    if (access === "upload") {
      setClientSessionCookies(cred.user.uid, role, false);
      const synced = await syncSession();
      if (!synced.ok) console.warn("[auth] logIn syncSession:", synced.error);
      window.location.assign("/driver/documents");
      return;
    }
    if (access === "pending") {
      setClientSessionCookies(cred.user.uid, role, false);
      const synced = await syncSession();
      if (!synced.ok) console.warn("[auth] logIn syncSession:", synced.error);
      window.location.assign("/driver-pending");
      return;
    }
  }

  setClientSessionCookies(cred.user.uid, role, agrOk);
  const synced = await syncSession();
  if (!synced.ok) {
    console.warn("[auth] logIn syncSession:", synced.error);
  }

  if (!agrOk) {
    window.location.assign("/terms");
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

export type GoogleSignInOptions = {
  /**
   * @deprecated Unused — every new Google account must pick Customer vs Provider (landing modal).
   * Kept so callers type-check; ignored inside `googleSignIn`.
   */
  defaultRoleForNewUser?: "customer" | "driver";
};

/** Thrown when Google auth succeeded but the user must pick customer vs driver (sign-in modal). */
export class GoogleNeedsRoleChoiceError extends Error {
  override name = "GoogleNeedsRoleChoice";
  constructor() {
    super("Choose customer or driver to finish Google sign-up.");
  }
}

/** Create `users/{uid}` or `providers/{uid}` for Google sign-up if neither doc exists yet. */
export async function ensureGoogleUserProfileIfMissing(
  user: FirebaseUser,
  role: "customer" | "driver",
): Promise<void> {
  await createGoogleUserProfile(user, role);
}

async function createGoogleUserProfile(user: FirebaseUser, role: "customer" | "driver"): Promise<void> {
  const uid = user.uid;
  const name = user.displayName?.trim() || user.email?.split("@")[0] || "User";
  const email = user.email ?? "";

  // Single write — `merge: true` makes it idempotent so we don't need a pre-read.
  if (role === "customer") {
    await setDoc(
      doc(db, "users", uid),
      sanitizeForFirestore({
        uid,
        name,
        email,
        phone: null,
        role: "customer",
        points: 0,
        tier: "Member",
        favorites: [],
        totalSpent: 0,
        jobCount: 0,
        walletBalance: 0,
        agreementsSigned: [],
        createdAt: serverTimestamp(),
      }),
      { merge: true },
    );
  } else {
    await setDoc(
      doc(db, "providers", uid),
      sanitizeForFirestore({
        uid,
        name,
        email,
        phone: null,
        role: "driver",
        status: "offline",
        isOnline: false,
        documentsSubmitted: false,
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
        driverFlowVersion: 2,
        driverWizardStep: 2,
      }),
      { merge: true },
    );
  }

  // Best-effort, non-blocking analytics.
  void logActivityEvent({
    type: "user_signup",
    userId: uid,
    userName: name,
    description: `New ${role} account (Google)`,
    metadata: { email, role },
  }).catch(() => {});
}

/**
 * Fast path for brand-new Google sign-ups. We know there's no existing profile
 * (caller guarantees it via `GoogleNeedsRoleChoiceError`), so we skip the
 * expensive read-back in `finalizeGoogleSignIn` and route immediately.
 */
function finalizeNewGoogleUser(uid: string, role: "customer" | "driver"): void {
  // Optimistic cookies — agreements are not yet signed for a brand-new account.
  setClientSessionCookies(uid, role, false);
  // Server cookie sync runs in the background; the destination route will
  // re-validate via AuthProvider's onSnapshot listener.
  void syncSession().catch((e) => console.warn("[auth] finalizeNewGoogleUser syncSession:", e));
  const next = role === "driver" ? "/driver/documents" : "/terms";
  window.location.assign(next);
}

async function finalizeGoogleSignIn(uid: string): Promise<void> {
  const { profile, role } = await loadProfileForAuth(uid);
  if (!role || !profile) {
    window.location.assign("/terms");
    return;
  }
  const signed = profile.agreementsSigned ?? [];
  const agrOk = hasAllRequired(role, signed);

  if (role === "driver") {
    const provSnap = await getDoc(doc(db, "providers", uid));
    const prov: Provider | null = provSnap.exists()
      ? { uid, ...(provSnap.data() as Omit<Provider, "uid">) }
      : null;
    const access = getDriverAccess(prov);
    if (access === "rejected") {
      setClientSessionCookies(uid, role, false);
      const synced = await syncSession();
      if (!synced.ok) console.warn("[auth] googleSignIn syncSession:", synced.error);
      window.location.assign("/driver-rejected");
      return;
    }
    if (access === "upload") {
      setClientSessionCookies(uid, role, false);
      const synced = await syncSession();
      if (!synced.ok) console.warn("[auth] googleSignIn syncSession:", synced.error);
      window.location.assign("/driver/documents");
      return;
    }
    if (access === "pending") {
      setClientSessionCookies(uid, role, false);
      const synced = await syncSession();
      if (!synced.ok) console.warn("[auth] googleSignIn syncSession:", synced.error);
      window.location.assign("/driver-pending");
      return;
    }
  }

  setClientSessionCookies(uid, role, agrOk);
  const synced = await syncSession();
  if (!synced.ok) {
    console.warn("[auth] googleSignIn syncSession:", synced.error);
  }

  if (!agrOk) {
    window.location.assign("/terms");
    return;
  }
  window.location.assign(routeForRole(role));
}

/**
 * After `googleSignIn` throws `GoogleNeedsRoleChoiceError`, call this with the chosen role.
 * Requires an active Firebase session from the Google popup.
 */
export async function completeGoogleSignUpAs(role: "customer" | "driver"): Promise<void> {
  const u = auth.currentUser;
  if (!u) throw new Error("Sign in with Google first.");
  await assertNotBlockedOrSuspended(u.uid);
  // Email verification was already enforced inside `googleSignIn` before the
  // role picker was shown, so we don't re-check here.

  // Await the single profile write so the destination page (/terms or
  // /driver/documents) reads a consistent Firestore state. Without this,
  // /terms can't tell customer vs driver and ends up writing agreements
  // into the wrong collection.
  await createGoogleUserProfile(u, role);

  finalizeNewGoogleUser(u.uid, role);
}

export async function googleSignIn(_options?: GoogleSignInOptions): Promise<void> {
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

  const role = await getUserRole(cred.user.uid);
  // New Google accounts must pick Customer vs Provider in the UI (see landing fullscreen picker).
  if (!role) {
    throw new GoogleNeedsRoleChoiceError();
  }

  await finalizeGoogleSignIn(cred.user.uid);
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
