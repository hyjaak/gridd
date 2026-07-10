import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getJob } from "@/lib/db";
import { saveNotificationAndPush } from "@/lib/notify-internal";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/** Notify the other party (customer ↔ provider) when a chat message is sent. */
export async function POST(req: Request, context: { params: Promise<{ jobId: string }> }) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const { jobId } = await context.params;
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { text?: string } | null;
  const preview = String(body?.text ?? "").slice(0, 160);

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  const uid = decoded.uid;
  const isCustomer = job.customerUid === uid;
  const prov = job.providerUid ?? job.providerId;
  const isProvider = prov === uid;

  if (!isCustomer && !isProvider) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const recipientUid = isCustomer ? prov : job.customerUid;
  if (!recipientUid) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    await saveNotificationAndPush({
      userId: recipientUid,
      event: "chat_message",
      title: "New message",
      body: preview || "You have a new message on your job.",
      icon: "💬",
      color: "#FF6B00",
    });
  } catch {
    /* optional */
  }

  return NextResponse.json({ ok: true });
}
