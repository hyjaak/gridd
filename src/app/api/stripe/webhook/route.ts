import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getJob, incrementUserPoints, updateJob } from "@/lib/db";
import { saveNotificationAndPush } from "@/lib/notify-internal";
import { getStripe } from "@/lib/stripe-server";

export const runtime = "nodejs";

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
    const jobId = pi.metadata?.jobId;
    if (jobId) {
      await updateJob(jobId, { paymentStatus: "confirmed" });

      const job = await getJob(jobId);
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
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
