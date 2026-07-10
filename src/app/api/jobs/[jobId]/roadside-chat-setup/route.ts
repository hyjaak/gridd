import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { previewChatJobId, PROVIDER_WELCOME_TEXT } from "@/lib/roadside-chat";
import { getJob } from "@/lib/db";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/**
 * After a job is created from booking: migrate preview chat (chats/preview_{uid}/messages)
 * into chats/{jobId}/messages, seed the provider welcome if needed, and update job metadata.
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const { jobId } = await context.params;
  const token = bearerToken(_req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  if (job.customerUid !== decoded.uid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const previewId = previewChatJobId(decoded.uid);
  const previewCol = adminDb.collection("chats").doc(previewId).collection("messages");
  const targetCol = adminDb.collection("chats").doc(jobId).collection("messages");

  const previewSnap = await previewCol.get().catch(() => null);
  const previewDocs = (previewSnap?.docs ?? []).slice().sort((a, b) => {
    const da = a.data().createdAt;
    const db = b.data().createdAt;
    const ta =
      typeof da?.toMillis === "function"
        ? da.toMillis()
        : typeof da?._seconds === "number"
          ? da._seconds * 1000
          : 0;
    const tb =
      typeof db?.toMillis === "function"
        ? db.toMillis()
        : typeof db?._seconds === "number"
          ? db._seconds * 1000
          : 0;
    return ta - tb;
  });

  const batch = adminDb.batch();
  let migrated = 0;

  for (const doc of previewDocs) {
    const data = doc.data();
    const newRef = targetCol.doc();
    batch.set(newRef, {
      text: String(data.text ?? ""),
      senderId: String(data.senderId ?? ""),
      senderName: String(data.senderName ?? "User"),
      role: data.role === "provider" ? "provider" : "user",
      createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
      read: data.read === true,
    });
    migrated += 1;
  }

  const existingTarget = await targetCol.limit(50).get();
  const hasProvider = existingTarget.docs.some((d) => d.data().role === "provider");

  if (!hasProvider && job.providerUid) {
    const welcomeRef = targetCol.doc();
    batch.set(welcomeRef, {
      text: PROVIDER_WELCOME_TEXT,
      senderId: job.providerUid,
      senderName: String(job.providerName ?? "Provider"),
      role: "provider",
      createdAt: FieldValue.serverTimestamp(),
      read: false,
    });
  }

  const jobRef = adminDb.collection("jobs").doc(jobId);
  batch.set(
    jobRef,
    {
      lastMessage: PROVIDER_WELCOME_TEXT,
      lastMessageAt: FieldValue.serverTimestamp(),
      unreadCount: 0,
    },
    { merge: true },
  );

  await batch.commit();

  if (migrated > 0 && previewSnap) {
    const delBatch = adminDb.batch();
    for (const doc of previewSnap.docs) {
      delBatch.delete(doc.ref);
    }
    await delBatch.commit().catch(() => null);
  }

  return NextResponse.json({ ok: true, migrated, seededProvider: !hasProvider && !!job.providerUid });
}
