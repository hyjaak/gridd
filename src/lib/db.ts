import type { DriverTier, Job, Provider, User, UserRole } from "@/types";
import admin, { adminDb } from "@/lib/firebase-admin";

function requireAdminDb() {
  if (!adminDb) throw new Error("Firebase Admin not configured.");
  return adminDb;
}

export async function getUser(uid: string): Promise<User | null> {
  const db = requireAdminDb();
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? (snap.data() as User) : null;
}

/** Server-side: `users` first (customer/admin/legacy driver), then `providers` → driver. */
export async function getUserRole(uid: string): Promise<UserRole | null> {
  const db = requireAdminDb();
  const userSnap = await db.collection("users").doc(uid).get();
  if (userSnap.exists) {
    const r = userSnap.data()?.role as UserRole | undefined;
    if (r === "admin" || r === "customer" || r === "driver") return r;
    return "customer";
  }
  const provSnap = await db.collection("providers").doc(uid).get();
  if (provSnap.exists) return "driver";
  return null;
}

export async function createUserProfile({
  uid,
  email,
  name,
  phone,
  role,
}: {
  uid: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  role: UserRole;
}) {
  const db = requireAdminDb();
  const createdAt = new Date().toISOString();
  const base: User = {
    uid,
    email: email ?? undefined,
    name: name ?? undefined,
    phone: phone ?? undefined,
    role,
    agreementsSigned: [],
    createdAt,
  };

  await db.collection("users").doc(uid).set(base, { merge: true });
  return base;
}

export const LEGAL_DOCS = [
  "terms",
  "privacy",
  "zerotolerance",
  "provider_agreement",
  "community",
  "payments",
  "safety",
] as const;

export type LegalDocId = (typeof LEGAL_DOCS)[number];

export function requiredDocsForRole(role: UserRole) {
  const base: LegalDocId[] = ["terms", "privacy", "zerotolerance"];
  const required: LegalDocId[] =
    role === "driver" ? [...base, "provider_agreement"] : base;
  return required;
}

export async function getAgreementsSigned(uid: string, role: UserRole) {
  const db = requireAdminDb();
  const coll = role === "driver" ? "providers" : "users";
  const snap = await db.collection(coll).doc(uid).get();
  const data = snap.data() as { agreementsSigned?: string[] } | undefined;
  return (data?.agreementsSigned ?? []) as string[];
}

export async function signAgreement(uid: string, role: UserRole, docId: LegalDocId) {
  const db = requireAdminDb();
  const coll = role === "driver" ? "providers" : "users";
  await db
    .collection(coll)
    .doc(uid)
    .set(
      {
        agreementsSigned: admin.firestore.FieldValue.arrayUnion(docId),
      },
      { merge: true },
    );
}

export async function hasRequiredAgreements(uid: string, role: UserRole) {
  const signed = await getAgreementsSigned(uid, role);
  const required = requiredDocsForRole(role);
  const ok = required.every((d) => signed.includes(d));
  return { ok, signed, required };
}

export async function listJobs(): Promise<Job[]> {
  const db = requireAdminDb();
  const snap = await db.collection("jobs").limit(50).get();
  return snap.docs.map((d) => d.data() as Job);
}

export async function listProviders(): Promise<Provider[]> {
  const db = requireAdminDb();
  const snap = await db.collection("providers").limit(50).get();
  return snap.docs.map((d) => d.data() as Provider);
}

export async function listProvidersAdmin(limit = 500): Promise<Provider[]> {
  const db = requireAdminDb();
  const snap = await db.collection("providers").limit(limit).get();
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Provider, "uid">) }));
}

export async function listActiveProvidersTop3(): Promise<Provider[]> {
  const db = requireAdminDb();
  const snap = await db
    .collection("providers")
    .orderBy("rating", "desc")
    .limit(3)
    .get();
  return snap.docs.map((d) => d.data() as Provider);
}

/** Prefer providers in the same ZIP when the field exists; otherwise top-rated. */
export async function listProvidersNearZip(zip: string | undefined): Promise<Provider[]> {
  const z = zip?.trim();
  if (!z) return listActiveProvidersTop3();
  const db = requireAdminDb();
  const snap = await db
    .collection("providers")
    .where("zip", "==", z)
    .limit(12)
    .get()
    .catch(() => null);
  if (snap && !snap.empty) {
    return snap.docs.map((d) => d.data() as Provider);
  }
  return listActiveProvidersTop3();
}

export async function listProvidersForServiceTop3(serviceId: string): Promise<Provider[]> {
  const db = requireAdminDb();
  // Prefer providers tagged with serviceIds; fall back to top-rated if field isn't present.
  const snap = await db
    .collection("providers")
    .where("serviceIds", "array-contains", serviceId)
    .orderBy("rating", "desc")
    .limit(3)
    .get()
    .catch(() => null);

  if (snap) return snap.docs.map((d) => d.data() as Provider);
  return await listActiveProvidersTop3();
}

export async function listRecentJobsForCustomer(uid: string): Promise<Job[]> {
  const db = requireAdminDb();
  const snap = await db
    .collection("jobs")
    .where("customerUid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(3)
    .get();
  return snap.docs.map((d) => d.data() as Job);
}

export async function listRecentJobsForAdmin(limit = 100): Promise<Job[]> {
  const db = requireAdminDb();
  const snap = await db
    .collection("jobs")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get()
    .catch(async () => {
      const fallback = await db.collection("jobs").limit(limit).get();
      return fallback;
    });
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Job, "id">) }));
  rows.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return tb - ta;
  });
  return rows;
}

export async function getJob(jobId: string): Promise<Job | null> {
  const db = requireAdminDb();
  const snap = await db.collection("jobs").doc(jobId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<Job, "id">) };
}

export async function updateJob(jobId: string, patch: Partial<Job>) {
  const db = requireAdminDb();
  await db.collection("jobs").doc(jobId).set(patch, { merge: true });
}

/** Platform fee (15%) in cents — server-only, never send to clients. */
export function platformFeeCentsFromTotal(totalCents: number) {
  return Math.round(totalCents * 0.15);
}

export function payoutBaseCentsFromTotal(totalCents: number) {
  return Math.round(totalCents * 0.85);
}

export function tierBonusCents(tier: DriverTier | undefined): number {
  switch (tier) {
    case "gold":
      return 500;
    case "silver":
      return 250;
    case "bronze":
      return 100;
    default:
      return 0;
  }
}

export async function getDriverTier(uid: string): Promise<DriverTier | undefined> {
  const db = requireAdminDb();
  const prov = await db.collection("providers").doc(uid).get();
  if (prov.exists) return (prov.data() as Provider).driverTier;
  const user = await db.collection("users").doc(uid).get();
  if (user.exists) return (user.data() as { driverTier?: DriverTier }).driverTier;
  return undefined;
}

export async function incrementUserPoints(uid: string, delta: number) {
  const db = requireAdminDb();
  await db.collection("users").doc(uid).set(
    {
      points: admin.firestore.FieldValue.increment(delta),
    },
    { merge: true },
  );
}

export async function incrementUserWallet(uid: string, deltaCents: number) {
  const db = requireAdminDb();
  await db.collection("users").doc(uid).set(
    {
      walletBalanceCents: admin.firestore.FieldValue.increment(deltaCents),
    },
    { merge: true },
  );
}

/** After a completed job — increment provider stats (payout credited) */
export async function updateProviderStats(uid: string, payoutCents: number) {
  const db = requireAdminDb();
  await db.collection("providers").doc(uid).set(
    {
      completedJobCount: admin.firestore.FieldValue.increment(1),
      lifetimeEarningsCents: admin.firestore.FieldValue.increment(payoutCents),
    },
    { merge: true },
  );
}

export async function blockUserEverywhere(uid: string) {
  const db = requireAdminDb();
  const batch = db.batch();
  batch.set(db.collection("users").doc(uid), { blocked: true }, { merge: true });
  batch.set(db.collection("providers").doc(uid), { blocked: true }, { merge: true });
  await batch.commit();
}

