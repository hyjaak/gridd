import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getJob, updateJob } from "@/lib/db";
import { getStripe } from "@/lib/stripe-server";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/**
 * POST { amount, jobId, customerId }
 * amount = total cents (job + tip). Platform fee is computed server-side only.
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

  const body = (await req.json().catch(() => null)) as {
    amount?: number;
    jobId?: string;
    customerId?: string;
  } | null;

  const amount = typeof body?.amount === "number" ? body.amount : NaN;
  const jobId = typeof body?.jobId === "string" ? body.jobId : "";
  const customerId = typeof body?.customerId === "string" ? body.customerId : "";

  if (!jobId || !customerId || !Number.isFinite(amount) || amount < 50) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  if (decoded.uid !== customerId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const job = await getJob(jobId);
  if (!job || job.customerUid !== customerId) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  const base = typeof job.amountCents === "number" ? job.amountCents : 0;
  if (amount < base) {
    return NextResponse.json({ ok: false, error: "Amount mismatch" }, { status: 400 });
  }

  const pi = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: {
      jobId,
      customerUid: customerId,
    },
  });

  await updateJob(jobId, {
    stripePaymentIntentId: pi.id,
    paymentStatus: "pending",
    chargedTotalCents: amount,
    tipCents: Math.max(0, amount - base),
  });

  return NextResponse.json({
    ok: true,
    clientSecret: pi.client_secret,
  });
}
