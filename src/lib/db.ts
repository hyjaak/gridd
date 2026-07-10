import type { DocumentReference } from "firebase-admin/firestore";
import type { DriverTier, Job, Provider, User, UserRole } from "@/types";
import { filterProvidersForPublicList } from "@/lib/provider-eligibility-server";
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

/** Server-side: `admins` CEO allowlist, then `users`, then `providers` → driver. */
export async function getUserRole(uid: string): Promise<UserRole | null> {
  const db = requireAdminDb();
  const adminSnap = await db.collection("admins").doc(uid).get();
  if (adminSnap.exists) {
    const d = adminSnap.data() as { role?: string; isCEO?: boolean; approved?: boolean };
    if (d.approved !== false && (d.role === "ceo" || d.isCEO === true)) {
      return "ceo";
    }
  }
  const userSnap = await db.collection("users").doc(uid).get();
  if (userSnap.exists) {
    const r = userSnap.data()?.role as string | undefined;
    if (r === "admin") return "ceo";
    if (r === "ceo" || r === "customer" || r === "driver") return r as UserRole;
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

export async function getProvider(uid: string): Promise<(Provider & { uid: string }) | null> {
  const db = requireAdminDb();
  const snap = await db.collection("providers").doc(uid).get();
  if (!snap.exists) return null;
  return { uid: snap.id, ...(snap.data() as Omit<Provider, "uid">) };
}

export async function listActiveProvidersTop3(): Promise<Provider[]> {
  const db = requireAdminDb();
  const snap = await db
    .collection("providers")
    .orderBy("rating", "desc")
    .limit(24)
    .get();
  const rows = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Provider, "uid">) }));
  return filterProvidersForPublicList(rows).slice(0, 3);
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
    const rows = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Provider, "uid">) }));
    return filterProvidersForPublicList(rows);
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

  if (snap) {
    const rows = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Provider, "uid">) }));
    return filterProvidersForPublicList(rows);
  }
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
  const inc = {
    walletBalanceCents: admin.firestore.FieldValue.increment(deltaCents),
  };
  const userRef = db.collection("users").doc(uid);
  const provRef = db.collection("providers").doc(uid);
  const provSnap = await provRef.get();
  const batch = db.batch();
  batch.set(userRef, inc, { merge: true });
  if (provSnap.exists) {
    batch.set(provRef, inc, { merge: true });
  }
  await batch.commit();
}

/** Peer-to-peer GRIDD wallet transfer (users + providers docs kept in sync when both exist). */
export async function transferWalletBetweenUsers(opts: {
  fromUid: string;
  toUid: string;
  amountCents: number;
  fromLabel: string;
  toLabel: string;
}) {
  const db = requireAdminDb();
  const { fromUid, toUid, amountCents, fromLabel, toLabel } = opts;
  if (amountCents < 1) throw new Error("Invalid amount");
  if (fromUid === toUid) throw new Error("Cannot send to yourself");

  await db.runTransaction(async (tx) => {
    const fromUserRef = db.collection("users").doc(fromUid);
    const fromSnap = await tx.get(fromUserRef);
    if (!fromSnap.exists) throw new Error("Sender profile not found");
    const bal = (fromSnap.data()?.walletBalanceCents ?? 0) as number;
    if (bal < amountCents) throw new Error("Insufficient balance");

    const toUserRef = db.collection("users").doc(toUid);
    const toProvRef = db.collection("providers").doc(toUid);
    const toUserSnap = await tx.get(toUserRef);
    const toProvSnap = await tx.get(toProvRef);
    if (!toUserSnap.exists && !toProvSnap.exists) throw new Error("Recipient not found");

    const incNeg = { walletBalanceCents: admin.firestore.FieldValue.increment(-amountCents) };
    const incPos = { walletBalanceCents: admin.firestore.FieldValue.increment(amountCents) };

    tx.update(fromUserRef, incNeg);
    const fromProvRef = db.collection("providers").doc(fromUid);
    const fromProvSnap = await tx.get(fromProvRef);
    if (fromProvSnap.exists) {
      tx.update(fromProvRef, incNeg);
    }

    if (toUserSnap.exists) {
      tx.update(toUserRef, incPos);
    }
    if (toProvSnap.exists) {
      tx.update(toProvRef, incPos);
    }
  });

  const db2 = requireAdminDb();
  const now = new Date().toISOString();
  await db2.collection("walletTx").add({
    uid: fromUid,
    amountCents: amountCents,
    kind: "debit",
    category: "transfer_out",
    label: fromLabel,
    peerUid: toUid,
    createdAt: now,
    icon: "📤",
  });
  await db2.collection("walletTx").add({
    uid: toUid,
    amountCents: amountCents,
    kind: "credit",
    category: "transfer_in",
    label: toLabel,
    peerUid: fromUid,
    createdAt: now,
    icon: "📥",
  });
}

/** After Stripe transfer to Connect account — debit platform-side wallet ledger. */
export async function debitUserWalletForCashout(uid: string, amountCents: number) {
  const db = requireAdminDb();
  const inc = {
    walletBalanceCents: admin.firestore.FieldValue.increment(-amountCents),
  };
  const userRef = db.collection("users").doc(uid);
  const provRef = db.collection("providers").doc(uid);
  const provSnap = await provRef.get();
  const batch = db.batch();
  batch.set(userRef, inc, { merge: true });
  if (provSnap.exists) {
    batch.set(provRef, inc, { merge: true });
  }
  await batch.commit();
}

export async function addWalletTxCashout(opts: { uid: string; amountCents: number; stripeTransferId: string }) {
  const db = requireAdminDb();
  await db.collection("walletTx").add({
    uid: opts.uid,
    amountCents: opts.amountCents,
    kind: "debit",
    category: "cashout",
    label: "Cash out",
    createdAt: new Date().toISOString(),
    icon: "💸",
    stripeTransferId: opts.stripeTransferId,
  });
}

/** Ledger row for wallet UI — written from Stripe webhook (admin). */
export async function addWalletTxCredit(opts: {
  uid: string;
  amountCents: number;
  label: string;
  stripePaymentIntentId: string;
}) {
  const db = requireAdminDb();
  await db.collection("walletTx").add({
    uid: opts.uid,
    amountCents: opts.amountCents,
    kind: "credit",
    category: "payment",
    label: opts.label,
    createdAt: new Date().toISOString(),
    icon: "⚡",
    stripePaymentIntentId: opts.stripePaymentIntentId,
  });
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

/** After job completion — free driver for the next gig */
export async function clearProviderActiveJob(uid: string) {
  const db = requireAdminDb();
  await db.collection("providers").doc(uid).set(
    {
      activeJob: null,
      status: "on_the_gridd",
      isOnline: true,
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

/** Delete a Porch post and subcollections (comments, votes). Chunks batches (500 ops). */
export async function deletePorchPostCascadeAdmin(postId: string): Promise<void> {
  const db = requireAdminDb();
  const postRef = db.collection("porch").doc(postId);
  const commentsSnap = await postRef.collection("comments").get();
  const votesSnap = await postRef.collection("votes").get();
  const toDelete: DocumentReference[] = [
    ...commentsSnap.docs.map((d) => d.ref),
    ...votesSnap.docs.map((d) => d.ref),
    postRef,
  ];
  const chunk = 450;
  for (let i = 0; i < toDelete.length; i += chunk) {
    const batch = db.batch();
    for (const ref of toDelete.slice(i, i + chunk)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

