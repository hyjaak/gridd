import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getJob, getProvider } from "@/lib/db";
import { canGoOnline } from "@/lib/driver-gate";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/**
 * Server-side job accept — enforces CEO + documents gate (cannot bypass from client).
 */
export async function POST(_req: Request, context: { params: Promise<{ jobId: string }> }) {
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

  const provider = await getProvider(decoded.uid);
  if (!provider || !canGoOnline(provider)) {
    return NextResponse.json(
      { ok: false, error: "Complete verification and CEO approval before accepting jobs." },
      { status: 403 },
    );
  }

  if (provider.activeJob) {
    return NextResponse.json(
      { ok: false, error: "Complete your current gig before grabbing another 💪" },
      { status: 400 },
    );
  }

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  if (!["pending", "requested"].includes(job.status)) {
    return NextResponse.json({ ok: false, error: "Job is no longer available." }, { status: 400 });
  }

  const name =
    (provider.name as string | undefined) ??
    (decoded as { name?: string }).name ??
    "Driver";

  const now = new Date().toISOString();
  const batch = adminDb.batch();
  batch.set(
    adminDb.collection("jobs").doc(jobId),
    {
      providerId: decoded.uid,
      providerUid: decoded.uid,
      providerName: name,
      status: "active",
      acceptedAt: now,
    },
    { merge: true },
  );
  batch.set(
    adminDb.collection("providers").doc(decoded.uid),
    {
      activeJob: jobId,
      status: "busy",
    },
    { merge: true },
  );
  await batch.commit();

  return NextResponse.json({ ok: true });
}
