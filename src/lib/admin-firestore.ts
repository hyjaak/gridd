"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  deleteField,
} from "firebase/firestore";
import { db, firebaseAuth } from "@/lib/firebase";
import { sanitizeForFirestore } from "@/lib/sanitizeFirestore";

function requireUid(): string {
  const uid = firebaseAuth?.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

/** Approve driver — mirrors former /api/admin/drivers/approve */
export async function approveDriverApplication(driverId: string): Promise<void> {
  const ceoUid = requireUid();
  await updateDoc(doc(db, "providers", driverId), {
    verified: true,
    verificationStatus: "approved",
    accountStatus: "approved",
    approvedByCEO: true,
    approvedAt: serverTimestamp(),
    approvedBy: ceoUid,
    isOnline: false,
    reviewedAt: serverTimestamp(),
    reviewedBy: ceoUid,
    status: "offline",
    demoMode: false,
    demoJobsUsed: deleteField(),
    demoJobsLimit: deleteField(),
    demoActivatedAt: deleteField(),
    demoActivatedBy: deleteField(),
  });
  await addDoc(
    collection(db, "adminActions"),
    sanitizeForFirestore({
      type: "driver_approved",
      driverId,
      by: ceoUid,
      at: serverTimestamp(),
    }),
  );
  try {
    const token = await firebaseAuth?.currentUser?.getIdToken();
    if (token) {
      await fetch("/api/email/driver-approved", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid: driverId }),
      });
    }
  } catch {
    /* non-fatal */
  }
}

export async function rejectDriverApplication(driverId: string, reason: string): Promise<void> {
  const ceoUid = requireUid();
  await updateDoc(doc(db, "providers", driverId), {
    verificationStatus: "rejected",
    accountStatus: "rejected",
    approvedByCEO: false,
    isOnline: false,
    status: "offline",
    rejectionReason: reason,
    rejectedAt: serverTimestamp(),
    reviewedAt: serverTimestamp(),
    reviewedBy: ceoUid,
  });
}

export async function requestDriverDocs(driverId: string, note: string): Promise<void> {
  const ceoUid = requireUid();
  await updateDoc(doc(db, "providers", driverId), {
    accountStatus: "more_info_needed",
    requestNote: note,
    documentsSubmitted: false,
    reviewedAt: serverTimestamp(),
    reviewedBy: ceoUid,
  });
}

export async function verifyProvider(driverId: string): Promise<void> {
  requireUid();
  await updateDoc(doc(db, "providers", driverId), { verified: true });
}

export async function suspendUser(targetUid: string, hours: number): Promise<void> {
  requireUid();
  const h = typeof hours === "number" && hours > 0 ? hours : 24;
  const until = new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
  const patch = sanitizeForFirestore({ suspendedUntil: until });
  await setDoc(doc(db, "users", targetUid), patch, { merge: true });
  await setDoc(doc(db, "providers", targetUid), patch, { merge: true });
}

export async function blockUser(targetUid: string): Promise<void> {
  requireUid();
  const batch = writeBatch(db);
  batch.set(doc(db, "users", targetUid), sanitizeForFirestore({ blocked: true }), { merge: true });
  batch.set(doc(db, "providers", targetUid), sanitizeForFirestore({ blocked: true }), { merge: true });
  await batch.commit();
}

export async function assignJobToProvider(jobId: string, providerUid: string): Promise<void> {
  requireUid();
  const provSnap = await getDoc(doc(db, "providers", providerUid));
  const name =
    (provSnap.data()?.name as string | undefined) ??
    (provSnap.data()?.email as string | undefined)?.split("@")[0] ??
    "Driver";
  await updateDoc(doc(db, "jobs", jobId), {
    providerUid,
    providerId: providerUid,
    providerName: name,
    status: "active",
    acceptedAt: new Date().toISOString(),
  } as Record<string, unknown>);
}

export async function sendAdminJobChatMessage(jobId: string, text: string): Promise<void> {
  const adminUid = requireUid();
  const trimmed = text.trim();
  if (!trimmed) return;
  await addDoc(
    collection(db, "chats", jobId, "messages"),
    sanitizeForFirestore({
      text: trimmed,
      senderId: adminUid,
      senderName: "GRIDD",
      role: "user",
      senderRole: "ceo",
      createdAt: serverTimestamp(),
      read: false,
      jobId,
      senderUid: adminUid,
      smsSent: false,
      readByUids: [adminUid],
    }),
  );
  await updateDoc(doc(db, "jobs", jobId), {
    lastMessage: trimmed,
    lastMessageAt: serverTimestamp(),
  });
}

export async function dismissAlertDoc(alertId: string): Promise<void> {
  requireUid();
  await deleteDoc(doc(db, "alerts", alertId));
}

export async function dismissDmReport(reportId: string): Promise<void> {
  const ceoUid = requireUid();
  await updateDoc(doc(db, "dmReports", reportId), {
    status: "dismissed",
    dismissedAt: serverTimestamp(),
    dismissedBy: ceoUid,
  });
}

export async function dismissPorchReport(reportId: string): Promise<void> {
  const ceoUid = requireUid();
  await updateDoc(doc(db, "reports", reportId), {
    status: "dismissed",
    dismissedAt: serverTimestamp(),
    dismissedBy: ceoUid,
  });
}

/** Delete porch post + comments + votes (chunked batches). */
export async function removePorchPostCascadeClient(postId: string): Promise<void> {
  requireUid();
  const postRef = doc(db, "porch", postId);
  const commentsSnap = await getDocs(collection(db, "porch", postId, "comments"));
  const votesSnap = await getDocs(collection(db, "porch", postId, "votes"));
  const refs = [...commentsSnap.docs.map((d) => d.ref), ...votesSnap.docs.map((d) => d.ref), postRef];
  const chunk = 450;
  for (let i = 0; i < refs.length; i += chunk) {
    const batch = writeBatch(db);
    for (const r of refs.slice(i, i + chunk)) {
      batch.delete(r);
    }
    await batch.commit();
  }
  const reportSnap = await getDocs(
    query(collection(db, "reports"), where("postId", "==", postId), limit(100)),
  );
  const reportRefs = reportSnap.docs.map((d) => d.ref);
  for (let i = 0; i < reportRefs.length; i += chunk) {
    const batch = writeBatch(db);
    for (const r of reportRefs.slice(i, i + chunk)) {
      batch.delete(r);
    }
    await batch.commit();
  }
}

export async function markCeoAlertRead(alertId: string): Promise<void> {
  requireUid();
  await updateDoc(doc(db, "ceoAlerts", alertId), {
    read: true,
    readAt: serverTimestamp(),
  } as Record<string, unknown>);
}

export async function addCeoDriverNote(driverId: string, text: string): Promise<void> {
  const ceoUid = requireUid();
  const trimmed = text.trim();
  if (!trimmed) return;
  await addDoc(
    collection(db, "providers", driverId, "ceoNotes"),
    sanitizeForFirestore({
      text: trimmed,
      addedBy: ceoUid,
      addedAt: serverTimestamp(),
    }),
  );
}

export async function verifyDriverLicense(driverId: string): Promise<void> {
  requireUid();
  await updateDoc(doc(db, "providers", driverId), {
    "documents.licenseVerified": true,
  } as Record<string, unknown>);
}

export async function setDriverHold(driverId: string, reason: string): Promise<void> {
  const ceoUid = requireUid();
  await updateDoc(doc(db, "providers", driverId), {
    accountStatus: "on_hold",
    holdReason: reason.trim(),
    isOnline: false,
    status: "offline",
    reviewedAt: serverTimestamp(),
    reviewedBy: ceoUid,
  } as Record<string, unknown>);
}

export async function releaseDriverHold(driverId: string): Promise<void> {
  const ceoUid = requireUid();
  const snap = await getDoc(doc(db, "providers", driverId));
  const d = snap.data() as {
    approvedByCEO?: boolean;
    documentsSubmitted?: boolean;
    verificationStatus?: string;
  } | null;
  const nextStatus =
    d?.approvedByCEO === true && d?.verificationStatus !== "rejected"
      ? "approved"
      : d?.documentsSubmitted
        ? "pending_review"
        : "pending";
  await updateDoc(doc(db, "providers", driverId), {
    accountStatus: nextStatus,
    holdReason: deleteField(),
    reviewedAt: serverTimestamp(),
    reviewedBy: ceoUid,
  } as Record<string, unknown>);
}

export async function suspendDriverAccount(driverId: string, durationMs: number, reason: string): Promise<void> {
  const ceoUid = requireUid();
  const ms = typeof durationMs === "number" && durationMs > 0 ? durationMs : 24 * 60 * 60 * 1000;
  const until = new Date(Date.now() + ms).toISOString();
  const patch = sanitizeForFirestore({
    accountStatus: "suspended" as const,
    suspendedUntil: until,
    suspensionReason: reason.trim(),
    isOnline: false,
    status: "offline",
    reviewedAt: serverTimestamp(),
    reviewedBy: ceoUid,
  });
  await updateDoc(doc(db, "providers", driverId), patch);
  await setDoc(doc(db, "users", driverId), sanitizeForFirestore({ suspendedUntil: until }), { merge: true });
}

export async function banDriverAccount(driverId: string, reason: string): Promise<void> {
  const ceoUid = requireUid();
  const batch = writeBatch(db);
  batch.set(
    doc(db, "users", driverId),
    sanitizeForFirestore({
      blocked: true,
      banned: true,
      banReason: reason.trim(),
      bannedAt: serverTimestamp(),
      bannedBy: ceoUid,
    }),
    { merge: true },
  );
  batch.set(
    doc(db, "providers", driverId),
    sanitizeForFirestore({
      blocked: true,
      banned: true,
      accountStatus: "banned" as const,
      banReason: reason.trim(),
      bannedAt: serverTimestamp(),
      bannedBy: ceoUid,
      isOnline: false,
      status: "offline",
    }),
    { merge: true },
  );
  await batch.commit();
}

export async function setCustomerAccountHold(targetUid: string, onHold: boolean, reason?: string): Promise<void> {
  const ceoUid = requireUid();
  if (onHold) {
    await setDoc(
      doc(db, "users", targetUid),
      sanitizeForFirestore({
        accountStatus: "on_hold" as const,
        holdReason: (reason ?? "").trim(),
        reviewedAt: serverTimestamp(),
        reviewedBy: ceoUid,
      }),
      { merge: true },
    );
  } else {
    await updateDoc(doc(db, "users", targetUid), {
      accountStatus: deleteField(),
      holdReason: deleteField(),
    } as Record<string, unknown>);
  }
}

export async function suspendCustomerAccount(targetUid: string, durationMs: number, reason: string): Promise<void> {
  requireUid();
  const ms = typeof durationMs === "number" && durationMs > 0 ? durationMs : 24 * 60 * 60 * 1000;
  const until = new Date(Date.now() + ms).toISOString();
  await setDoc(
    doc(db, "users", targetUid),
    sanitizeForFirestore({
      accountStatus: "suspended" as const,
      suspendedUntil: until,
      suspensionReason: reason.trim(),
    }),
    { merge: true },
  );
}

export async function banCustomerAccount(targetUid: string, reason: string): Promise<void> {
  const ceoUid = requireUid();
  await setDoc(
    doc(db, "users", targetUid),
    sanitizeForFirestore({
      blocked: true,
      banned: true,
      accountStatus: "banned" as const,
      banReason: reason.trim(),
      bannedAt: serverTimestamp(),
      bannedBy: ceoUid,
    }),
    { merge: true },
  );
}

export async function addCeoCustomerNote(targetUid: string, text: string): Promise<void> {
  const ceoUid = requireUid();
  const trimmed = text.trim();
  if (!trimmed) return;
  await addDoc(
    collection(db, "users", targetUid, "ceoNotes"),
    sanitizeForFirestore({
      text: trimmed,
      addedBy: ceoUid,
      addedAt: serverTimestamp(),
    }),
  );
}
