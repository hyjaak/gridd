import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { addWalletTxCredit, getJob, incrementUserPoints, incrementUserWallet, updateJob } from "@/lib/db";
import { createCeoAlertServer } from "@/lib/ceo-alerts-server";
import { notifyNearbyProvidersForJob } from "@/lib/notify-nearby-providers";
import { saveNotificationAndPush } from "@/lib/notify-internal";
import { getStripe } from "@/lib/stripe-server";
import { syncPaidJobToShipday } from "@/lib/shipday.server";

export const runtime = "nodejs";

/** Browsers and uptime tools often GET webhook URLs — avoid 405 spam in Vercel logs. */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      detail: "Stripe webhooks use POST with a Stripe-Signature header. Configure this URL in Stripe for POST delivery.",
    },
    { status: 200 },
  );
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ ok: false, error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const purpose = pi.metadata?.purpose;

    if (purpose === "wallet_load" && pi.metadata?.uid) {
      const uid = pi.metadata.uid;
      const amount = typeof pi.amount === "number" ? pi.amount : 0;
      if (amount > 0) {
        await incrementUserWallet(uid, amount);
        await addWalletTxCredit({
          uid,
          amountCents: amount,
          label: "Load GRIDD",
          stripePaymentIntentId: pi.id,
        });
      }
      return NextResponse.json({ received: true });
    }

    const jobId = pi.metadata?.jobId;
    if (jobId) {
      const jobBefore = await getJob(jobId);
      if (jobBefore?.paymentStatus === "confirmed") {
        return NextResponse.json({ received: true });
      }

      await updateJob(jobId, { paymentStatus: "confirmed" });

      const job = (await getJob(jobId)) ?? jobBefore;
      if (job) {
        const points = Math.max(1, Math.floor((pi.amount ?? 0) / 100));
        await incrementUserPoints(job.customerUid, points);

        if (job.providerUid) {
          await saveNotificationAndPush({
            userId: job.providerUid,
            event: "payment_confirm",
            title: "Payment confirmed",
            body: `Job ${job.serviceName} is paid and ready.`,
            icon: "💳",
            color: "#00FF88",
          });
        } else {
          void notifyNearbyProvidersForJob(jobId).catch(() => null);
        }
      }

      void syncPaidJobToShipday(jobId).catch(() => null);
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const jobId = pi.metadata?.jobId;
    const uid = pi.metadata?.uid;
    const cents = typeof pi.amount === "number" ? pi.amount : 0;
    await createCeoAlertServer({
      type: "payment_failed",
      message: `💳 Payment failed${jobId ? ` job ${jobId}` : ""}${uid ? ` user ${uid}` : ""} — $${(cents / 100).toFixed(2)}`,
      metadata: {
        jobId: jobId ?? null,
        customerUid: uid ?? null,
        paymentIntentId: pi.id,
      },
      priority: "high",
    });
    if (jobId) {
      await updateJob(jobId, { paymentStatus: "failed" }).catch(() => null);
    }
  }

  return NextResponse.json({ received: true });
}
