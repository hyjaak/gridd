import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { listRecentJobsForCustomer } from "@/lib/db";
import type { Job, JobStatus, ServiceTier } from "@/types";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function GET(req: Request) {
  const token = bearerToken(req);
  if (!token || !adminAuth) {
    return NextResponse.json({ ok: true, resource: "jobs", items: [] });
  }

  const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: true, resource: "jobs", items: [] });
  }

  const items = await listRecentJobsForCustomer(decoded.uid).catch(() => []);
  return NextResponse.json({ ok: true, resource: "jobs", items });
}

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

  const body = (await req.json().catch(() => null)) as {
    serviceId?: string;
    serviceName?: string;
    city?: string;
    zip?: string;
    amountCents?: number;
    tier?: ServiceTier;
    status?: JobStatus;
    providerUid?: string;
    notes?: string;
  } | null;

  const serviceId = body?.serviceId?.trim() ?? "";
  const serviceName = body?.serviceName?.trim() ?? "";
  const city = body?.city?.trim() ?? "";
  const amountCents = typeof body?.amountCents === "number" ? body.amountCents : NaN;

  if (!serviceId || !serviceName || !city || !Number.isFinite(amountCents) || amountCents < 50) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const id = adminDb.collection("jobs").doc().id;
  const tier: ServiceTier = body?.tier ?? "standard";
  const status: JobStatus = body?.status ?? "pending";

  const job: Job = {
    id,
    customerUid: decoded.uid,
    serviceId,
    serviceName,
    tier,
    status,
    city,
    createdAt: new Date().toISOString(),
    amountCents,
    providerUid: body?.providerUid,
    paymentStatus: "pending",
    payoutStatus: "none",
    zip: body?.zip,
  };

  const extra: Record<string, unknown> = {};
  if (body?.notes) extra.notes = body.notes;

  await adminDb
    .collection("jobs")
    .doc(id)
    .set({ ...job, ...extra });

  return NextResponse.json({ ok: true, jobId: id, job });
}
