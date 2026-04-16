import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getJob, updateJob } from "@/lib/db";
import type { JobStatus } from "@/types";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

const ALLOW_CANCEL: JobStatus[] = ["pending", "requested"];

/**
 * Customer cancels only while the job is still awaiting assignment (pending / legacy requested).
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!adminAuth) {
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

  if (!ALLOW_CANCEL.includes(job.status)) {
    return NextResponse.json(
      { ok: false, error: "This job can no longer be cancelled from the app." },
      { status: 400 },
    );
  }

  const cancelledAt = new Date().toISOString();
  await updateJob(jobId, { status: "cancelled", cancelledAt });

  return NextResponse.json({ ok: true, cancelledAt });
}
