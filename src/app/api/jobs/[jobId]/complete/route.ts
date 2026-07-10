import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  clearProviderActiveJob,
  getDriverTier,
  getJob,
  getProvider,
  incrementUserPoints,
  incrementUserWallet,
  platformFeeCentsFromTotal,
  payoutBaseCentsFromTotal,
  tierBonusCents,
  updateJob,
  updateProviderStats,
} from "@/lib/db";
import { recordBintaVaultDepositForCompletedJob } from "@/lib/binta-vault-server";
import { demoJobLimit, demoJobsUsedCount, isFullyApprovedDriver } from "@/lib/driver-gate";
import { saveNotificationAndPush } from "@/lib/notify-internal";
import { applyGriddScoreDelta, recordGriddScoreLedgerOnce } from "@/lib/gridd-score-server";

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

  let priorCompletedForCustomer = 0;
  if (adminDb) {
    const prior = await adminDb
      .collection("jobs")
      .where("customerUid", "==", job.customerUid)
      .where("status", "==", "completed")
      .get();
    priorCompletedForCustomer = prior.size;
  }

  await updateJob(jobId, {
    status: "completed",
    completedAt,
    platformFeeCents: platformFee,
    payoutStatus: job.payoutStatus === "paid" ? job.payoutStatus : "pending",
  });

  if (adminDb) {
    void recordBintaVaultDepositForCompletedJob(adminDb, jobId, job, platformFee);
  }

  await updateProviderStats(decoded.uid, totalPayoutCents).catch(() => {});

  if (adminDb) {
    const custRef = adminDb.collection("users").doc(job.customerUid);
    const custSnap = await custRef.get();
    const firstBonus = priorCompletedForCustomer === 0 ? 50 : 0;
    await applyGriddScoreDelta({
      uid: decoded.uid,
      collection: "providers",
      delta: 20,
      reason: "job_completed_driver",
    }).catch(() => {});
    await applyGriddScoreDelta({
      uid: job.customerUid,
      collection: "users",
      delta: 10 + firstBonus,
      reason: firstBonus > 0 ? "first_booking_and_job" : "job_completed_customer",
    }).catch(() => {});

    const provAfter = await getProvider(decoded.uid);
    const earnDollars = (provAfter?.lifetimeEarningsCents ?? 0) / 100;
    if (earnDollars >= 500) {
      const f = await recordGriddScoreLedgerOnce(`${decoded.uid}_earn_500`);
      if (f) {
        await applyGriddScoreDelta({
          uid: decoded.uid,
          collection: "providers",
          delta: 50,
          reason: "earnings_500",
        }).catch(() => {});
      }
    }
    if (earnDollars >= 1000) {
      const f = await recordGriddScoreLedgerOnce(`${decoded.uid}_earn_1000`);
      if (f) {
        await applyGriddScoreDelta({
          uid: decoded.uid,
          collection: "providers",
          delta: 100,
          reason: "earnings_1000",
        }).catch(() => {});
      }
    }

    if (priorCompletedForCustomer === 0) {
      const cu = custSnap.data() as { referredByUid?: string } | undefined;
      const refUid = cu?.referredByUid;
      if (refUid && refUid !== job.customerUid) {
        await incrementUserWallet(refUid, 500).catch(() => {});
        const refQ = await adminDb
          .collection("referrals")
          .where("referredUserId", "==", job.customerUid)
          .where("status", "==", "pending")
          .limit(5)
          .get();
        for (const d of refQ.docs) {
          await d.ref.set({ status: "completed", rewardPaid: true, completedAt }, { merge: true });
        }
      }
    }
  }

  await clearProviderActiveJob(decoded.uid).catch(() => {});
  await incrementUserPoints(job.customerUid, 50).catch(() => {});

  if (adminDb) {
    const prov = await getProvider(decoded.uid);
    if (prov?.demoMode && !isFullyApprovedDriver(prov)) {
      const nextUsed = demoJobsUsedCount(prov) + 1;
      const limit = demoJobLimit(prov);
      const patch: Record<string, unknown> = {
        demoJobsUsed: FieldValue.increment(1),
      };
      if (nextUsed >= limit) {
        patch.isOnline = false;
        patch.status = "off_gridd";
      }
      await adminDb.collection("providers").doc(decoded.uid).update(patch).catch(() => {});
    }
  }

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
