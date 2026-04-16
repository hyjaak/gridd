import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import {
  getDriverTier,
  getJob,
  getUser,
  payoutBaseCentsFromTotal,
  tierBonusCents,
  updateJob,
} from "@/lib/db";
import { getStripe } from "@/lib/stripe-server";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/**
 * POST { jobId, driverStripeId, amount }
 * amount = total collected (cents). Payout = 85% + tier bonus (never expose fee split in response).
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe || !adminAuth) {
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

  const user = await getUser(decoded.uid);
  const role = user?.role;

  const body = (await req.json().catch(() => null)) as {
    jobId?: string;
    driverStripeId?: string;
    amount?: number;
  } | null;

  const jobId = typeof body?.jobId === "string" ? body.jobId : "";
  const driverStripeId = typeof body?.driverStripeId === "string" ? body.driverStripeId : "";
  const amount = typeof body?.amount === "number" ? body.amount : NaN;

  if (!jobId || !driverStripeId || !Number.isFinite(amount) || amount < 1) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const job = await getJob(jobId);
  if (!job?.providerUid) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  if (role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const tier = await getDriverTier(job.providerUid);
  const basePayout = payoutBaseCentsFromTotal(amount);
  const bonus = tierBonusCents(tier);
  const transferTotal = basePayout + bonus;

  const transfer = await stripe.transfers.create({
    amount: transferTotal,
    currency: "usd",
    destination: driverStripeId,
    metadata: { jobId },
  });

  await updateJob(jobId, { payoutStatus: "paid" });

  return NextResponse.json({
    ok: true,
    transferId: transfer.id,
  });
}
