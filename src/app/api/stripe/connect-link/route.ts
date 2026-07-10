import { NextResponse } from "next/server";
import { verifyBearerDecoded } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";
import { getStripe } from "@/lib/stripe-server";

/**
 * POST — create Stripe Connect Express account (if needed) and return Account Link URL for bank onboarding.
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

  const body = (await req.json().catch(() => null)) as { returnPath?: string } | null;
  const returnPath = typeof body?.returnPath === "string" && body.returnPath.startsWith("/") ? body.returnPath : "/wallet";

  const uid = decoded.uid;
  const userRef = adminDb.collection("users").doc(uid);
  const snap = await userRef.get();
  const email = decoded.email ?? (snap.data() as { email?: string } | undefined)?.email;

  let accountId = (snap.data() as { stripeConnectId?: string } | undefined)?.stripeConnectId;

  try {
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: email ?? undefined,
        capabilities: {
          transfers: { requested: true },
        },
        metadata: { uid },
      });
      accountId = account.id;
      await userRef.set({ stripeConnectId: accountId }, { merge: true });
    }

    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      (typeof process.env.VERCEL_URL === "string" ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}${returnPath}?connect=refresh`,
      return_url: `${origin}${returnPath}?connect=return`,
      type: "account_onboarding",
    });

    return NextResponse.json({ ok: true, url: link.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not start bank connection";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
