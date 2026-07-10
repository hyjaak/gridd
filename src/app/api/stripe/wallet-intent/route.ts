import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getProvider } from "@/lib/db";
import { demoWalletRestricted } from "@/lib/driver-gate";
import { getStripe } from "@/lib/stripe-server";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

const MIN_CENTS = 100; // $1
const MAX_CENTS = 500_000; // $5,000

/**
 * POST { amountCents } — one-time wallet top-up via Stripe Payment Element
 * (cards, Apple Pay, Google Pay, Link, US bank account where enabled on the Stripe account).
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

  const prov = await getProvider(decoded.uid);
  if (prov && demoWalletRestricted(prov)) {
    return NextResponse.json(
      { ok: false, error: "Wallet load is unavailable in demo mode. Submit documents for full access." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as { amountCents?: number } | null;
  const amountCents = typeof body?.amountCents === "number" ? body.amountCents : NaN;

  if (!Number.isFinite(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    return NextResponse.json(
      { ok: false, error: `Amount must be between $${MIN_CENTS / 100} and $${MAX_CENTS / 100}` },
      { status: 400 },
    );
  }

  const pi = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: {
      purpose: "wallet_load",
      uid: decoded.uid,
    },
  });

  if (!pi.client_secret) {
    return NextResponse.json({ ok: false, error: "No client secret" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    clientSecret: pi.client_secret,
    amountCents,
  });
}
