import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import {
  getDriverTier,
  getJob,
  incrementUserPoints,
  platformFeeCentsFromTotal,
  payoutBaseCentsFromTotal,
  tierBonusCents,
  updateJob,
  updateProviderStats,
} from "@/lib/db";
import { saveNotificationAndPush } from "@/lib/notify-internal";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function providerId(job: { providerUid?: string; providerId?: string }) {
  return job.providerUid ?? job.providerId;
}

/**
 * Driver marks job complete — platform fee stored server-side, provider stats updated.
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

  const pid = providerId(job);
  if (!pid || pid !== decoded.uid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (job.status !== "in_progress") {
    return NextResponse.json(
      { ok: false, error: "Job must be in progress to complete" },
      { status: 400 },
    );
  }

  const gross = job.amountCents ?? job.chargedTotalCents ?? 0;
  const platformFee = platformFeeCentsFromTotal(gross);
  const payoutBase = job.providerPayoutCents ?? payoutBaseCentsFromTotal(gross);
  const tier = await getDriverTier(decoded.uid);
  const tierBonus = tierBonusCents(tier);
  const totalPayoutCents = payoutBase + tierBonus;

  const completedAt = new Date().toISOString();
  await updateJob(jobId, {
    status: "completed",
    completedAt,
    platformFeeCents: platformFee,
    payoutStatus: job.payoutStatus === "paid" ? job.payoutStatus : "pending",
  });

  await updateProviderStats(decoded.uid, totalPayoutCents).catch(() => {});
  await incrementUserPoints(job.customerUid, 50).catch(() => {});

  try {
    await saveNotificationAndPush({
      userId: job.customerUid,
      event: "job_complete",
      title: "Job complete",
      body: `${job.serviceName} is done — leave a review on The Porch.`,
      icon: "✅",
      color: "#00FF88",
    });
  } catch {
    /* optional */
  }

  return NextResponse.json({
    ok: true,
    completedAt,
    payoutCents: payoutBase,
    tierBonusCents: tierBonus,
    totalPayoutCents,
  });
}
