import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { createCeoAlertServer } from "@/lib/ceo-alerts-server";

export const runtime = "nodejs";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/** Called by customer app after creating a job — verifies ownership, emits CEO feed + medium alert. */
export async function POST(req: Request) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { jobId?: string } | null;
  const jobId = body?.jobId?.trim();
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "jobId required" }, { status: 400 });
  }

  const jobSnap = await adminDb.collection("jobs").doc(jobId).get();
  if (!jobSnap.exists) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }
  const job = jobSnap.data() as { customerUid?: string; serviceName?: string; amountCents?: number };
  if (job.customerUid !== decoded.uid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const priceUsd = typeof job.amountCents === "number" ? (job.amountCents / 100).toFixed(2) : "?";
  await createCeoAlertServer({
    type: "new_job_booked",
    message: `📦 New job booked: ${job.serviceName ?? "Service"} — $${priceUsd} — ${jobId}`,
    metadata: { jobId, customerUid: decoded.uid },
    priority: "medium",
    skipPush: true,
  });

  return NextResponse.json({ ok: true });
}
