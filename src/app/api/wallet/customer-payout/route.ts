import { NextResponse } from "next/server";
import { verifyBearerDecoded } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";
import { addWalletTxCashout, debitUserWalletForCashout, incrementUserWallet } from "@/lib/db";
import { getStripe } from "@/lib/stripe-server";

const MIN_CENTS = 500;

/**
 * POST { amountCents } — transfer from platform balance to user's connected Stripe account, debit GRIDD wallet.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!stripe || !adminDb) {
    return NextResponse.json({ ok: false, error: "Payments not configured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as { amountCents?: number } | null;
  const amountCents = typeof body?.amountCents === "number" ? body.amountCents : NaN;
  const uid = decoded.uid;

  if (!Number.isFinite(amountCents) || amountCents < MIN_CENTS) {
    return NextResponse.json({ ok: false, error: `Minimum cash out is $${MIN_CENTS / 100}` }, { status: 400 });
  }

  const userRef = adminDb.collection("users").doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
  }

  const data = snap.data() as {
    walletBalanceCents?: number;
    stripeConnectId?: string;
    blocked?: boolean;
  };
  if (data.blocked === true) {
    return NextResponse.json({ ok: false, error: "Account restricted" }, { status: 403 });
  }

  const balance = typeof data.walletBalanceCents === "number" ? data.walletBalanceCents : 0;
  if (balance < amountCents) {
    return NextResponse.json({ ok: false, error: "Insufficient wallet balance" }, { status: 400 });
  }

  const destination = data.stripeConnectId;
  if (!destination) {
    return NextResponse.json({ ok: false, error: "Connect a bank first" }, { status: 400 });
  }

  const acct = await stripe.accounts.retrieve(destination);
  if (acct.details_submitted !== true && !acct.payouts_enabled) {
    return NextResponse.json(
      { ok: false, error: "Finish bank onboarding before cashing out" },
      { status: 400 },
    );
  }

  try {
    await debitUserWalletForCashout(uid, amountCents);
    try {
      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: "usd",
        destination,
        metadata: { uid, purpose: "wallet_cashout" },
      });
      await addWalletTxCashout({ uid, amountCents, stripeTransferId: transfer.id });
      return NextResponse.json({ ok: true, transferId: transfer.id });
    } catch (e) {
      await incrementUserWallet(uid, amountCents);
      throw e;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cash out failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
