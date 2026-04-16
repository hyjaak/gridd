"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CardCvcElement,
  CardExpiryElement,
  CardNumberElement,
  Elements,
  PaymentRequestButtonElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { PaymentRequest, PaymentRequestPaymentMethodEvent } from "@stripe/stripe-js";
import { doc, getDoc, getFirestore } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import { firebaseAuth } from "@/lib/firebase";
import type { Job } from "@/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const TIPS = [0, 500, 1000, 1500, 2000] as const;

function money(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

const cardStyle = {
  style: {
    base: {
      color: "#eeeeee",
      fontFamily: "system-ui, sans-serif",
      fontSize: "16px",
      "::placeholder": { color: "#555555" },
    },
    invalid: { color: "#f87171" },
  },
};

type PayMode = "card" | "wallet";

function InnerPay({
  totalCents,
  clientSecret,
  onSuccess,
}: {
  totalCents: number;
  clientSecret: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [payMode, setPayMode] = useState<PayMode>("card");

  useEffect(() => {
    if (!stripe || !clientSecret) return;
    let cancelled = false;
    const pr = stripe.paymentRequest({
      country: "US",
      currency: "usd",
      total: { label: "GRIDD job", amount: totalCents },
      requestPayerName: true,
      requestPayerEmail: true,
    });
    void pr.canMakePayment().then((result) => {
      if (!cancelled && result) setPaymentRequest(pr);
    });
    return () => {
      cancelled = true;
    };
  }, [stripe, clientSecret, totalCents]);

  useEffect(() => {
    if (!stripe || !paymentRequest || !clientSecret) return;
    const handler = async (ev: PaymentRequestPaymentMethodEvent) => {
      const { error: err } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: ev.paymentMethod.id,
      });
      if (err) {
        ev.complete("fail");
        setError(err.message ?? "Payment failed");
        return;
      }
      ev.complete("success");
      onSuccess();
    };
    paymentRequest.on("paymentmethod", handler);
    return () => {
      paymentRequest.off("paymentmethod", handler);
    };
  }, [stripe, paymentRequest, clientSecret, onSuccess]);

  async function payCard() {
    if (!stripe || !elements) return;
    const num = elements.getElement(CardNumberElement);
    if (!num) return;
    setBusy(true);
    setError(null);
    const { error: err } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: num },
    });
    setBusy(false);
    if (err) {
      setError(err.message ?? "Payment failed");
      return;
    }
    onSuccess();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPayMode("card")}
          className={[
            "rounded-full border px-4 py-2 text-sm",
            payMode === "card" ? "border-[#00FF88] text-[#00FF88]" : "border-[var(--border)] text-[var(--sub)]",
          ].join(" ")}
        >
          Card
        </button>
        <button
          type="button"
          onClick={() => setPayMode("wallet")}
          className={[
            "rounded-full border px-4 py-2 text-sm",
            payMode === "wallet" ? "border-[#00FF88] text-[#00FF88]" : "border-[var(--border)] text-[var(--sub)]",
          ].join(" ")}
        >
          Apple Pay / Google Pay
        </button>
        <span className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--sub)]">
          Samsung Pay (where supported)
        </span>
      </div>

      {payMode === "wallet" && paymentRequest ? (
        <div className="rounded-xl border border-[var(--border)] bg-[#0a0a0a] p-3">
          <PaymentRequestButtonElement options={{ paymentRequest }} className="h-12 w-full" />
        </div>
      ) : payMode === "wallet" ? (
        <p className="text-sm text-[var(--sub)]">Wallet pay isn’t available on this device or browser.</p>
      ) : null}

      {payMode === "card" ? (
        <div className="space-y-3">
          <div>
            <div className="text-xs text-[var(--sub)]">Card number</div>
            <div className="mt-1 rounded-xl border border-[var(--border)] bg-[#0a0a0a] px-3 py-3">
              <CardNumberElement options={cardStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-[var(--sub)]">Expiry</div>
              <div className="mt-1 rounded-xl border border-[var(--border)] bg-[#0a0a0a] px-3 py-3">
                <CardExpiryElement options={cardStyle} />
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--sub)]">CVC</div>
              <div className="mt-1 rounded-xl border border-[var(--border)] bg-[#0a0a0a] px-3 py-3">
                <CardCvcElement options={cardStyle} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="text-sm text-red-400">{error}</div> : null}

      {payMode === "card" ? (
        <Button className="w-full" disabled={busy || !stripe} onClick={() => void payCard()}>
          Pay {money(totalCents)} securely
        </Button>
      ) : null}

      <div className="flex items-center justify-center gap-2 border-t border-[var(--border)] pt-4 text-xs text-[var(--sub)]">
        <span aria-hidden>🔒</span>
        <span>Secured by Stripe</span>
      </div>
    </div>
  );
}

export function CheckoutForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [tipCents, setTipCents] = useState(0);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (!firebaseApp) return;
    const db = getFirestore(firebaseApp);
    let cancelled = false;
    void (async () => {
      const snap = await getDoc(doc(db, "jobs", jobId));
      if (cancelled) return;
      setJob(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Job, "id">) } as Job) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const baseCents = job?.amountCents ?? 0;
  const totalCents = baseCents + tipCents;

  const summary = useMemo(() => {
    if (!job) return null;
    return (
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-[var(--text)]">
          <span>{job.serviceName}</span>
          <span>{money(baseCents)}</span>
        </div>
        <div className="flex justify-between text-[var(--sub)]">
          <span>Tip</span>
          <span>{money(tipCents)}</span>
        </div>
        <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-semibold text-[#00FF88]">
          <span>Total</span>
          <span>{money(totalCents)}</span>
        </div>
      </div>
    );
  }, [job, baseCents, tipCents, totalCents]);

  const prepareIntent = useCallback(async () => {
    if (!job || !firebaseAuth?.currentUser) return;
    setPreparing(true);
    setIntentError(null);
    const token = await firebaseAuth.currentUser.getIdToken();
    const res = await fetch("/api/stripe/intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: totalCents,
        jobId,
        customerId: firebaseAuth.currentUser.uid,
      }),
    });
    const json = (await res.json().catch(() => null)) as { clientSecret?: string; error?: string };
    setPreparing(false);
    if (!res.ok || !json.clientSecret) {
      setIntentError(json.error ?? "Could not start payment");
      return;
    }
    setClientSecret(json.clientSecret);
  }, [job, jobId, totalCents]);

  const onPaid = useCallback(() => {
    router.push(`/track/${jobId}`);
  }, [router, jobId]);

  if (job === undefined) {
    return (
      <Card className="p-6">
        <div className="h-8 animate-pulse rounded bg-white/5" />
      </Card>
    );
  }

  if (!job) {
    return (
      <Card className="p-6">
        <p className="text-sm text-[var(--sub)]">Job not found.</p>
      </Card>
    );
  }

  if (!stripePromise) {
    return (
      <Card className="p-6">
        <p className="text-sm text-[var(--sub)]">Stripe is not configured (missing publishable key).</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="text-xs uppercase tracking-widest text-[var(--sub)]">Checkout</div>
      <h2 className="mt-2 text-lg font-semibold text-[var(--text)]">Job summary</h2>
      <div className="mt-4 text-sm text-[var(--sub)]">
        {job.serviceName} · {job.city}
      </div>

      <div className="mt-6">{summary}</div>

      <div className="mt-6">
        <div className="text-sm font-semibold text-[var(--text)]">Tip your driver</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {TIPS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTipCents(t);
                setClientSecret(null);
              }}
              className={[
                "rounded-full border px-4 py-2 text-sm",
                tipCents === t ? "border-[#00FF88] text-[#00FF88]" : "border-[var(--border)] text-[var(--sub)]",
              ].join(" ")}
            >
              {t === 0 ? "$0" : money(t)}
            </button>
          ))}
        </div>
      </div>

      {!clientSecret ? (
        <div className="mt-8 space-y-3">
          {intentError ? <div className="text-sm text-red-400">{intentError}</div> : null}
          <Button className="w-full" disabled={preparing} onClick={() => void prepareIntent()}>
            {preparing ? "Preparing…" : `Pay ${money(totalCents)} securely`}
          </Button>
          <div className="flex items-center justify-center gap-2 text-xs text-[var(--sub)]">
            <span aria-hidden>🔒</span>
            <span>Secured by Stripe</span>
          </div>
        </div>
      ) : (
        <div className="mt-8">
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <InnerPay totalCents={totalCents} clientSecret={clientSecret} onSuccess={onPaid} />
          </Elements>
        </div>
      )}
    </Card>
  );
}
