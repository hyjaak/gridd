"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
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

function InnerPay({
  jobId,
  totalCents,
  onSuccess,
}: {
  jobId: string;
  totalCents: number;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = useCallback(async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error: err } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${origin}/track/${jobId}`,
      },
      redirect: "if_required",
    });
    setBusy(false);
    if (err) {
      setError(err.message ?? "Payment failed");
      return;
    }
    onSuccess();
  }, [stripe, elements, jobId, onSuccess]);

  return (
    <div className="space-y-4">
      <p className="text-center text-xs leading-relaxed text-[var(--sub)]">
        <span className="font-medium text-[var(--text)]">Pay your way:</span> card,{" "}
        <span className="text-[var(--text)]">Apple Pay</span>, <span className="text-[var(--text)]">Google Pay</span>
        , and <span className="text-[var(--text)]">Samsung Pay</span> (Samsung Internet / compatible devices) appear
        below when Stripe and your browser support them.
      </p>
      <PaymentElement
        options={{
          layout: { type: "accordion", defaultCollapsed: false },
          defaultValues: {
            billingDetails: { email: firebaseAuth?.currentUser?.email ?? undefined },
          },
        }}
      />
      {error ? <div className="text-sm text-red-400">{error}</div> : null}
      <Button className="w-full min-h-[52px] text-base font-bold" disabled={busy || !stripe} onClick={() => void handlePay()}>
        {busy ? "Processing…" : `Pay ${money(totalCents)} securely`}
      </Button>
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

  if (job.paymentStatus === "confirmed") {
    return (
      <Card className="p-6">
        <p className="text-sm text-[var(--text)]">This job is already paid.</p>
        <Button className="mt-4 w-full" onClick={() => router.push(`/track/${jobId}`)}>
          View job
        </Button>
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
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "night",
                variables: {
                  colorPrimary: "#00ff88",
                  borderRadius: "12px",
                },
              },
            }}
          >
            <InnerPay jobId={jobId} totalCents={totalCents} onSuccess={onPaid} />
          </Elements>
        </div>
      )}
    </Card>
  );
}
